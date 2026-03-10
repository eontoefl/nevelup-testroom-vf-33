/**
 * ================================================
 * audio-player.js
 * AudioContext 기반 오디오 재생 유틸리티 (V3)
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
 *   4. stop()     → currentSource.stop()
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
     * 
     * @param {string} url - 오디오 파일 URL (GitHub 등)
     * @param {Function} [onEnded] - 재생 완료 시 콜백
     * @returns {Promise<void>}
     */
    async play(url, onEnded) {
        // 이전 재생 중지
        this.stop();

        try {
            // 1단계: URL에서 오디오 데이터 가져오기
            var response = await fetch(url);
            if (!response.ok) {
                throw new Error('오디오 fetch 실패: ' + response.status + ' ' + url);
            }

            // 2단계: 바이너리 데이터로 변환
            var arrayBuffer = await response.arrayBuffer();

            // 3단계: AudioContext가 이해할 수 있는 형태로 디코딩
            var audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);

            // 4단계: 재생 노드 생성 → 스피커에 연결 → 시작
            var source = this.audioCtx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.audioCtx.destination);

            source.onended = function() {
                this.currentSource = null;
                if (onEnded) onEnded();
            }.bind(this);

            source.start();
            this.currentSource = source;

            console.log('▶️ 오디오 재생 시작:', url.split('/').pop());

        } catch (e) {
            console.error('❌ AudioPlayer.play 오류:', e.message);
            // 오류 발생해도 onEnded 호출 (흐름이 멈추지 않도록)
            this.currentSource = null;
            if (onEnded) onEnded();
        }
    }

    // ============================================================
    // 3. stop — 현재 재생 중지
    // ============================================================

    /**
     * 현재 재생 중인 오디오 중지
     */
    stop() {
        if (this.currentSource) {
            try {
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
     * - 재생 중지
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

console.log('✅ AudioPlayer 클래스 로드 완료 (v=001)');
