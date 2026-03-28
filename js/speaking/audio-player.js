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

        console.log('🔊 AudioPlayer 생성 완료 (상태:', this.audioCtx.state + ')');
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
        console.log('🔓 AudioContext unlock 완료 (상태:', this.audioCtx.state + ')');
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
     * @returns {Promise<void>}
     */
    async play(url, onEnded) {
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
            // 진짜 오류 발생해도 onEnded 호출 (흐름이 멈추지 않도록)
            this.currentSource = null;
            if (onEnded) onEnded();
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
                var audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
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

        if (this.audioCtx && this.audioCtx.state !== 'closed') {
            this.audioCtx.close();
            console.log('🔇 AudioContext 닫힘');
        }

        this.audioCtx = null;
        this.currentSource = null;

        console.log('🧹 AudioPlayer 정리 완료');
    }
}

console.log('✅ [Speaking] audio-player.js 로드 완료');
