/**
 * ================================================
 * audio-player.js
 * AudioContext 기반 오디오 재생 유틸리티
 * ================================================
 * 
 * 역할: iPad Safari 호환 오디오 재생 엔진
 *       기존 new Audio() 방식을 대체하여
 *       사용자 탭 1회 후 무제한 자동 재생 보장
 * 
 * 사용법:
 *   const player = new AudioPlayer();
 *   await player.unlock();                    // 사용자 탭 이벤트 안에서 호출
 *   await player.play(url, () => { ... });    // 이후 자동 재생
 *   player.stop();                            // 재생 중지
 *   player.destroy();                         // 완전 정리
 * 
 * 내부 동작:
 *   1. constructor → AudioContext 생성
 *   2. unlock()   → audioCtx.resume() (iPad 잠금 해제)
 *   3. play()     → fetch(url) → arrayBuffer → decodeAudioData → start()
 *                    네트워크 실패 시 최대 2회 재시도
 *                    stop()/destroy() 호출 시 진행 중인 fetch 즉시 취소
 *   4. stop()     → currentSource.stop() + 진행 중인 fetch 취소
 *   5. destroy()  → stop() + audioCtx.close()
 * 
 * 참조: docs/speaking-module-controller-spec.md §2
 */

class AudioPlayer {

    constructor() {
        // AudioContext 생성 (브라우저 내장 — 외부 라이브러리/비용 없음)
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        // 현재 재생 중인 소스 노드
        this.currentSource = null;

        // 현재 진행 중인 fetch를 취소하기 위한 컨트롤러
        // stop()/destroy()/새 play() 호출 시 이전 fetch를 즉시 취소
        this._abortController = null;

        // 원본 파일 바이트 캐시 (url → ArrayBuffer)
        // ※ 해석된 소리(AudioBuffer)는 원본의 ~20배 크기라 캐시하지 않는다 (iPad 메모리 보호)
        this._byteCache = new Map();
        this._BYTE_CACHE_MAX = 8;

        // 프리로드 fetch 취소용 (destroy 시 진행 중인 프리로드도 함께 중단)
        this._preloadController = new AbortController();

        console.log('🔊 AudioPlayer 생성 완료 (상태:', this.audioCtx.state + ')');
    }

    // ============================================================
    // 0. preload — 파일 바이트만 미리 받아 캐시 (대기와 준비의 병렬화)
    // ============================================================

    /**
     * 오디오 파일을 미리 받아 캐시에 저장 (해석은 재생 직전에 수행)
     * 실패는 조용히 무시 — play()가 정상 경로로 다시 받는다
     * @param {string} url
     */
    async preload(url) {
        if (!url || this._byteCache.has(url)) return;
        try {
            var response = await fetch(url, { signal: this._preloadController.signal });
            if (!response.ok) return;
            var buf = await response.arrayBuffer();
            if (!this.audioCtx) return;   // 다운로드 중 destroy됨 — 폐기
            this._cachePut(url, buf);
            console.log('📦 오디오 프리로드 완료:', url.split('/').pop());
        } catch (e) {
            // 프리로드 실패/취소는 무시 (재생 시점에 정상 경로로 재시도됨)
        }
    }

    /** 캐시 저장 (개수 제한 — 가장 오래된 것부터 제거) */
    _cachePut(url, buf) {
        if (this._byteCache.has(url)) return;
        if (this._byteCache.size >= this._BYTE_CACHE_MAX) {
            var oldest = this._byteCache.keys().next().value;
            this._byteCache.delete(oldest);
        }
        this._byteCache.set(url, buf);
    }

    // ============================================================
    // 1. unlock — iPad Safari 오디오 잠금 해제
    // ============================================================

    /**
     * AudioContext 잠금 해제
     * 반드시 사용자 탭/클릭 이벤트 핸들러 안에서 호출해야 함
     * 
     * iPad Safari 정책:
     *   - AudioContext는 생성 시 'suspended' 상태
     *   - 사용자 제스처 안에서 resume()을 호출해야 'running'으로 전환
     *   - 한번 'running'이 되면 이후 자동 재생 무제한 가능
     * 
     * @returns {Promise<void>}
     */
    async unlock() {
        if (this.audioCtx.state === 'suspended') {
            await this.audioCtx.resume();
        }

        // iOS 무음 모드 대응: 보이지 않는 무음 트랙을 <audio> 요소로 재생
        // → iOS가 이 페이지의 소리를 "미디어 재생"(유튜브와 같은 부류)으로 분류해서
        //   무음 모드에서도 Web Audio 소리가 들리게 됨
        // (사용자 제스처 안에서 호출되므로 play()가 허용됨)
        this._startSilentLoop();

        console.log('🔓 AudioContext unlock 완료 (상태:', this.audioCtx.state + ')');
    }

    /**
     * 무음 루프 시작 (iOS 무음 모드에서도 소리가 나게 하는 표준 기법)
     * 0.5초짜리 무음 WAV를 런타임 생성해 반복 재생 — 파일/네트워크 불필요
     */
    _startSilentLoop() {
        try {
            if (!this._silentLoopEl) {
                var rate = 8000;
                var samples = rate / 2;   // 0.5초
                var buf = new ArrayBuffer(44 + samples);
                var v = new DataView(buf);
                var writeStr = function(offset, str) {
                    for (var i = 0; i < str.length; i++) v.setUint8(offset + i, str.charCodeAt(i));
                };
                writeStr(0, 'RIFF');
                v.setUint32(4, 36 + samples, true);
                writeStr(8, 'WAVE');
                writeStr(12, 'fmt ');
                v.setUint32(16, 16, true);      // fmt 청크 크기
                v.setUint16(20, 1, true);       // PCM
                v.setUint16(22, 1, true);       // 모노
                v.setUint32(24, rate, true);    // 샘플레이트
                v.setUint32(28, rate, true);    // 바이트레이트
                v.setUint16(32, 1, true);       // 블록 정렬
                v.setUint16(34, 8, true);       // 8비트
                writeStr(36, 'data');
                v.setUint32(40, samples, true);
                for (var s = 0; s < samples; s++) v.setUint8(44 + s, 128);  // 무음(중앙값)

                var el = document.createElement('audio');
                el.src = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
                el.loop = true;
                el.setAttribute('playsinline', '');
                this._silentLoopEl = el;
            }
            var p = this._silentLoopEl.play();
            if (p && p.catch) p.catch(function() { /* 차단돼도 무해 — 무음모드 대응만 못할 뿐 */ });
        } catch (e) {
            // 실패해도 재생 자체에는 영향 없음
        }
    }

    // ============================================================
    // 2. play — 오디오 재생
    // ============================================================

    /**
     * URL의 오디오 파일을 재생
     * 
     * 내부 흐름:
     *   fetch(url) → arrayBuffer → decodeAudioData → BufferSourceNode.start()
     *   네트워크 실패(Safari "Load failed" 등) 시 최대 2회 재시도
     * 
     * 안전장치:
     *   - 매 play() 호출마다 이전 fetch를 취소 (AbortController)
     *   - stop()/destroy() 시에도 진행 중인 fetch 즉시 취소
     *   - 취소된 경우 onEnded를 호출하지 않음 (유령 콜백 방지)
     * 
     * @param {string} url - 오디오 파일 URL (GitHub 등)
     * @param {Function} [onEnded] - 재생 완료 시 콜백
     * @param {Function} [onError] - 재생 실패 시 콜백 (미지정 시 onEnded로 진행 — 스피킹 흐름 유지용)
     * @returns {Promise<void>}
     */
    async play(url, onEnded, onError) {
        // 이전 재생 + 이전 fetch 모두 중지
        this.stop();

        // 이번 play 전용 AbortController 생성
        var abortController = new AbortController();
        this._abortController = abortController;

        try {
            // fetch + decode (실패 시 최대 2회 재시도)
            var audioBuffer = await this._fetchAndDecode(url, abortController.signal, 2);

            // fetch/decode 완료 후, 아직 이 play가 유효한지 확인
            // (도중에 stop()/destroy()/새 play()가 호출됐으면 취소됨)
            if (abortController.signal.aborted) return;

            // 재생 직전 엔진 상태 확인 — 멈춰 있으면 깨움
            // (전화/화면잠금 등으로 suspended/interrupted 상태에서 start()하면
            //  소리도 안 나고 ended도 안 오는 "침묵" 결말이 될 수 있음)
            if (this.audioCtx.state !== 'running') {
                try { await this.audioCtx.resume(); } catch (eResume) { /* 아래에서 판정 */ }
                if (abortController.signal.aborted) return;
                if (this.audioCtx.state !== 'running' && onError) {
                    // onError 지정 호출자(리스닝): 침묵 대신 실패로 응답 → 재시도 UI로 복구
                    throw new Error('오디오 엔진이 멈춰 있습니다 (' + this.audioCtx.state + ')');
                }
                // onError 미지정 호출자(스피킹): 기존 동작 유지 —
                // start()는 엔진이 재개되는 시점까지 대기했다가 재생됨
            }

            // 재생 노드 생성 → 스피커에 연결 → 시작
            var source = this.audioCtx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.audioCtx.destination);

            source.onended = function() {
                // stop()에서 onended를 null로 지워놨으면 여기 진입 안 함
                // 자연 종료(끝까지 재생)일 때만 콜백 호출
                this.currentSource = null;
                if (onEnded) onEnded();
            }.bind(this);

            source.start();
            this.currentSource = source;

            console.log('▶️ 오디오 재생 시작:', url.split('/').pop());

        } catch (e) {
            // 취소로 인한 중단은 정상 동작 — 로그만 남기고 onEnded 호출 안 함
            if (e.name === 'AbortError') {
                console.log('⏹️ 오디오 fetch 취소됨 (정상):', url.split('/').pop());
                return;
            }

            console.error('❌ AudioPlayer.play 오류:', e.message);
            this.currentSource = null;
            if (onError) {
                // onError 지정 시(리스닝): 실패를 구분해서 알림 — 1회뿐인 오디오가 무음으로 지나가지 않게
                onError(e);
            } else if (onEnded) {
                // 미지정 시(스피킹): 오류여도 onEnded로 진행 (흐름이 멈추지 않도록)
                onEnded();
            }
        }
    }

    // ============================================================
    // 2-1. _fetchAndDecode — fetch + decode (재시도 포함)
    // ============================================================

    /**
     * 오디오 URL을 fetch하고 AudioBuffer로 디코딩
     * 네트워크 실패 시 재시도 (Safari "Load failed" 대응)
     * 
     * @param {string} url - 오디오 파일 URL
     * @param {AbortSignal} signal - 취소 시그널
     * @param {number} maxRetries - 최대 재시도 횟수
     * @returns {Promise<AudioBuffer>}
     * @private
     */
    async _fetchAndDecode(url, signal, maxRetries) {
        var lastError = null;

        // 프리로드 캐시에 원본 바이트가 있으면 네트워크 생략, 해석만 수행
        // (decodeAudioData는 버퍼를 소모하므로 복사본을 넘겨 캐시를 보존)
        // 해석 실패 시(불량 바이트 — 예: 공용와이파이 로그인 페이지가 캐시된 경우)
        // 캐시를 버리고 네트워크 정상 경로로 다시 받는다
        var cachedBytes = this._byteCache.get(url);
        if (cachedBytes) {
            try {
                return await this.audioCtx.decodeAudioData(cachedBytes.slice(0));
            } catch (eDecode) {
                console.warn('🗑️ 캐시된 오디오 해석 실패 — 캐시 폐기 후 재다운로드:', url.split('/').pop());
                this._byteCache.delete(url);
            }
        }

        for (var attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                // 재시도라면 0.5초 대기 후 시도
                if (attempt > 0) {
                    console.log('🔄 오디오 재시도 (' + attempt + '/' + maxRetries + '):', url.split('/').pop());
                    await new Promise(function(resolve) { setTimeout(resolve, 500); });
                    // 대기 중 취소됐으면 즉시 중단
                    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
                }

                var response = await fetch(url, { signal: signal });
                if (!response.ok) {
                    throw new Error('오디오 fetch 실패: ' + response.status + ' ' + url);
                }

                var arrayBuffer = await response.arrayBuffer();
                var cacheCopy = arrayBuffer.slice(0);
                var audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
                // 해석에 성공한 바이트만 캐시 (불량 응답이 캐시에 남지 않도록)
                this._cachePut(url, cacheCopy);
                return audioBuffer;

            } catch (e) {
                // 취소는 재시도 없이 즉시 throw
                if (e.name === 'AbortError') throw e;

                lastError = e;

                // HTTP 4xx/5xx 에러(파일 없음 등)는 재시도해도 의미 없음
                if (e.message && e.message.indexOf('오디오 fetch 실패') === 0) throw e;

                // 네트워크 에러(Safari "Load failed" 등)만 재시도
            }
        }

        // 재시도 모두 실패
        throw lastError;
    }

    // ============================================================
    // 3. stop — 현재 재생 중지 + 진행 중인 fetch 취소
    // ============================================================

    /**
     * 현재 재생 중인 오디오 중지 + 진행 중인 fetch 취소
     */
    stop() {
        // 진행 중인 fetch 취소 (아직 가져오는 중이면 즉시 중단)
        if (this._abortController) {
            this._abortController.abort();
            this._abortController = null;
        }

        if (this.currentSource) {
            try {
                // onended를 먼저 제거 → stop()이 발생시키는 ended 이벤트에서 콜백 호출 방지
                this.currentSource.onended = null;
                this.currentSource.stop();
            } catch (e) {
                // 이미 종료된 소스에 stop() 호출 시 오류 무시
            }
            this.currentSource = null;
        }
    }

    // ============================================================
    // 4. destroy — 완전 정리 (모듈 종료 시)
    // ============================================================

    /**
     * AudioPlayer 완전 정리
     * - 재생 중지 + 진행 중인 fetch 취소
     * - AudioContext 닫기 (시스템 자원 해제)
     * 
     * 호출 시점: cleanupSpeakingModule() 에서 호출
     */
    destroy() {
        this.stop();

        // 무음 루프 정리
        if (this._silentLoopEl) {
            try {
                this._silentLoopEl.pause();
                URL.revokeObjectURL(this._silentLoopEl.src);
            } catch (e) { /* 무시 */ }
            this._silentLoopEl = null;
        }

        // 진행 중인 프리로드 다운로드 취소
        this._preloadController.abort();

        if (this.audioCtx && this.audioCtx.state !== 'closed') {
            this.audioCtx.close();
            console.log('🔇 AudioContext 닫힘');
        }

        this.audioCtx = null;
        this.currentSource = null;
        this._byteCache.clear();

        console.log('🧹 AudioPlayer 정리 완료');
    }
}

console.log('✅ [Speaking] audio-player.js 로드 완료');
