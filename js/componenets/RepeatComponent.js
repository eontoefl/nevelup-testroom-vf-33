/**
 * ================================================
 * RepeatComponent.js v=001
 * 따라말하기 컴포넌트
 * ================================================
 * 
 * 책임:
 * - 데이터 처리 (6): Sheet 로드/파싱/Demo 데이터
 * - 인트로 화면 (3): "Listen and repeat" 나레이션
 * - 상황 나레이션 화면 (5): 상황 설명 + 나레이션 오디오
 * - 오디오 시퀀스 (8): 7개 문제 순차 재생
 * - 녹음 기능 (9): Beep 소리 + 타이머 + 원형 프로그레스바
 * - 로딩 화면 (2): 문제 전환 시 로딩 표시
 * - 내부 상태 변수 (4): currentSet/Narration/timer/audio
 * - 완료 & Cleanup (2): 모든 오디오 완료 처리
 * - 복습 화면 (10): Script/Translation + 다시 듣기
 * - 유틸리티 함수 (1): formatTime
 * 
 * 총 47개 요소
 */

class RepeatComponent {
    constructor() {
        // ============================================
        // 1. 데이터 처리 (6개)
        // ============================================
        
        // 데이터 저장
        this.speakingRepeatData = null;
        
        // ============================================
        // 2. 내부 상태 변수 (4개)
        // ============================================
        
        // 현재 세트/오디오 인덱스
        this.currentRepeatSet = 0;
        this.currentRepeatNarration = 0;
        
        // 타이머 & 오디오
        this.repeatTimer = null;
        this.currentAudio = null;
        
        // 복습 화면용
        this.currentResultNarration = 0;
        this.currentResultAudio = null;
    }
    
    // ============================================
    // 데이터 처리 함수 (6개)
    // ============================================
    
    /**
     * 데이터 로드
     */
    async loadRepeatData() {
        console.log('📥 [Repeat] 데이터 로드 시작...');
        
        // Supabase에서 로드
        const supabaseResult = await this._loadFromSupabase();
        if (supabaseResult) {
            this.speakingRepeatData = supabaseResult;
            return supabaseResult;
        }
        
        console.error('❌ [Repeat] 데이터를 불러올 수 없습니다.');
        return null;
    }
    
    // --- Supabase에서 로드 ---
    async _loadFromSupabase() {
        if (typeof USE_SUPABASE !== 'undefined' && !USE_SUPABASE) return null;
        if (typeof supabaseSelect !== 'function') return null;
        
        try {
            console.log('📥 [Repeat] Supabase에서 데이터 로드...');
            const rows = await supabaseSelect('tr_speaking_repeat', 'select=*&order=id.asc');
            
            if (!rows || rows.length === 0) {
                console.warn('⚠️ [Repeat] Supabase 데이터 없음');
                return null;
            }
            
            console.log(`✅ [Repeat] Supabase에서 ${rows.length}개 세트 로드 성공`);
            
            const sets = rows.map(row => {
                const narration = {
                    audio: row.narration_audio || '',
                    baseImage: row.narration_image || ''
                };
                
                const audios = [];
                for (let n = 1; n <= 7; n++) {
                    audios.push({
                        audio: row[`audio${n}_url`] || '',
                        image: row[`audio${n}_image`] || '',
                        script: row[`audio${n}_script`] || '',
                        translation: row[`audio${n}_translation`] || '',
                        responseTime: parseInt(row[`audio${n}_response_time`]) || 10
                    });
                }
                
                return {
                    id: row.id,
                    contextText: row.context_text || '',
                    narration: narration,
                    audios: audios
                };
            });
            
            return { type: 'speaking_repeat', sets };
            
        } catch (error) {
            console.error('❌ [Repeat] Supabase 로드 실패:', error);
            return null;
        }
    }
    
    // ============================================
    // 인트로 화면 함수 (3개)
    // ============================================
    
    /**
     * 인트로 화면 표시
     */
    showIntroScreen() {
        const timestamp = new Date().toISOString().split('T')[1].substring(0, 12);
        console.log(`📺 [showIntroScreen] 인트로 화면 표시 [${timestamp}]`);
        
        document.getElementById('repeatIntroScreen').style.display = 'flex';
        document.getElementById('repeatNarrationScreen').style.display = 'none';
        
        setTimeout(() => {
            if (this._destroyed) return;
            const introNarration = 'https://eontoefl.github.io/toefl-audio/speaking/repeat/narration/listen_and_repeat_narration.mp3';
            
            this.playAudio(introNarration, () => {
                if (this._destroyed) return;
                console.log('✅ 인트로 나레이션 종료');
                setTimeout(() => {
                    if (this._destroyed) return;
                    document.getElementById('repeatIntroScreen').style.display = 'none';
                    this.showContextNarration(this.speakingRepeatData.sets[this.currentRepeatSet]);
                }, 2000);
            });
        }, 1000);
    }
    
    // ============================================
    // 상황 나레이션 화면 함수 (5개)
    // ============================================
    
    /**
     * 상황 나레이션 화면 표시
     */
    showContextNarration(set) {
        const timestamp = new Date().toISOString().split('T')[1].substring(0, 12);
        console.log(`📺 [showContextNarration] 상황 나레이션 화면 표시 [${timestamp}]`);
        
        document.getElementById('repeatNarrationScreen').style.display = 'flex';
        
        // contextText 표시
        const contextTextElement = document.getElementById('repeatNarrationContextText');
        if (contextTextElement && set.contextText) {
            contextTextElement.textContent = set.contextText;
        }
        
        // 나레이션 이미지 표시
        const narrationImage = document.getElementById('repeatNarrationImage');
        if (narrationImage && set.narration.baseImage) {
            narrationImage.src = set.narration.baseImage;
        }
        
        // 1초 대기 후 나레이션 오디오 재생
        console.log('⏳ 화면 표시 후 1초 대기...');
        setTimeout(() => {
            if (this._destroyed) return;
            console.log('🎵 상황 나레이션 오디오 재생 시작');
            this.playAudio(set.narration.audio, () => {
                if (this._destroyed) return;
                console.log('✅ 상황 나레이션 종료 → 1초 후 첫 번째 오디오 시작');
                setTimeout(() => {
                    if (this._destroyed) return;
                    this.playAudioSequence(set, 0);
                }, 1000);
            });
        }, 1000);
    }
    
    /**
     * 나레이션 화면 표시 (이전 버전과 호환)
     */
    showNarrationScreen(set) {
        this.showContextNarration(set);
    }
    
    // ============================================
    // 오디오 시퀀스 함수 (8개)
    // ============================================
    
    /**
     * 오디오 시퀀스 재생 (7개 문제)
     */
    playAudioSequence(set, audioIndex) {
        const timestamp = new Date().toISOString().split('T')[1].substring(0, 12);
        console.log(`🔍 [playAudioSequence] 호출됨 [${timestamp}] - audioIndex: ${audioIndex}`);
        
        if (audioIndex >= set.audios.length) {
            console.log('✅ 모든 오디오 완료 → 섹션 종료');
            this.completeSpeakingRepeat();
            return;
        }
        
        const audio = set.audios[audioIndex];
        
        console.log(`🎤 오디오 ${audioIndex + 1}/7 준비`);
        
        // 문제 1~7 화면: "Listen and repeat only once." 표시
        const contextTextElement = document.getElementById('repeatNarrationContextText');
        if (contextTextElement) {
            contextTextElement.textContent = 'Listen and repeat only once.';
        }
        
        // 이미지 업데이트
        const audioImage = document.getElementById('repeatNarrationImage');
        if (audioImage && audio.image) {
            audioImage.src = audio.image;
        }
        
        // 진행 상태 표시
        const totalAudios = set.audios.length;
        document.getElementById('repeatProgress').textContent = `Question ${audioIndex + 1} of ${totalAudios}`;
        
        document.getElementById('repeatRecordingUI').style.display = 'none';
        document.getElementById('repeatSavingPopup').style.display = 'none';
        
        // 1초 대기 후 오디오 재생
        console.log('⏳ 화면 표시 후 1초 대기...');
        setTimeout(() => {
            if (this._destroyed) return;
            console.log(`🎵 오디오 ${audioIndex + 1}/7 재생 시작`);
            this.playAudio(audio.audio, () => {
                if (this._destroyed) return;
                console.log(`✅ 오디오 ${audioIndex + 1} 종료 → 3초 후 녹음 시작`);
                
                setTimeout(() => {
                    if (this._destroyed) return;
                    console.log('🎬 3초 대기 완료 → 녹음 시작');
                    this.startRepeatRecording(set, audioIndex, audio.responseTime);
                }, 3000);
            });
        }, 1000);
    }
    
    /**
     * 오디오 재생
     */
    playAudio(audioUrl, onEnded) {
        const timestamp = new Date().toISOString().split('T')[1].substring(0, 12);
        console.log(`🔍 [playAudio] 호출됨 [${timestamp}] - URL: ${audioUrl ? audioUrl.substring(audioUrl.lastIndexOf('/') + 1) : 'null'}`);
        
        if (!audioUrl || audioUrl === 'PLACEHOLDER') {
            console.log('⏭️ PLACEHOLDER 오디오, 건너뜀');
            setTimeout(() => onEnded && onEnded(), 500);
            return;
        }
        
        // 기존 오디오 완전 정리
        if (this.currentAudio) {
            console.log('🛑 기존 오디오 정지');
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0;
            this.currentAudio.onended = null;
            this.currentAudio.onerror = null;
            this.currentAudio = null;
        }
        
        this.currentAudio = new Audio(audioUrl);
        this.currentAudio.volume = 1.0;
        
        console.log('🎵 오디오 재생 시작:', audioUrl);
        
        this.currentAudio.play()
            .then(() => console.log('✅ 오디오 재생 성공'))
            .catch(err => console.error('❌ 오디오 재생 실패:', err));
        
        this.currentAudio.onended = () => {
            console.log('✅ 오디오 재생 완료');
            if (onEnded) onEnded();
        };
        
        this.currentAudio.onerror = () => {
            console.error('❌ 오디오 로드 실패:', audioUrl);
            if (onEnded) {
                setTimeout(() => onEnded(), 1000);
            }
        };
    }
    
    // ============================================
    // 녹음 기능 함수 (9개)
    // ============================================
    
    /**
     * 녹음 시작
     */
    startRepeatRecording(set, audioIndex, responseTime) {
        console.log(`🔴 녹음 시작: ${responseTime}초`);
        
        // ★ 현재 녹음 상태 저장 (admin-skip용)
        this._currentRecordingSet = set;
        this._currentRecordingAudioIndex = audioIndex;
        
        // beep 소리 재생 먼저 (Web Audio API 사용 - 매우 강하고 쨍한 beep)
        console.log('🔔 beep 소리 재생 시도...');
        
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 1200; // 1200Hz (더 높고 날카로운 주파수)
            oscillator.type = 'square'; // 'sine' → 'square' (더 쨍한 소리)
            
            gainNode.gain.setValueAtTime(1.0, audioContext.currentTime); // 최대 볼륨
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5); // 0.5초
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.5);
            
            console.log('✅ beep 소리 재생 성공!');
        } catch (err) {
            console.error('❌ beep 재생 실패:', err);
        }
        
        // beep 소리 후 0.5초 후에 타이머 표시
        setTimeout(() => {
            const recordingUI = document.getElementById('repeatRecordingUI');
            if (recordingUI) {
                recordingUI.style.display = 'flex';
                console.log('✅ 타이머 UI 표시 완료');
            }
            
            let timeLeft = responseTime;
            const totalTime = responseTime;
            const timerElement = document.getElementById('repeatTimer');
            const progressCircle = document.getElementById('repeatProgressCircle');
            
            // 원의 둘레 계산 (반지름 20px)
            const radius = 20;
            const circumference = 2 * Math.PI * radius;
            
            if (timerElement) {
                timerElement.textContent = this.formatTime(timeLeft);
            }
            
            // 프로그레스 서클 초기화 (100% 채워진 상태에서 시작)
            if (progressCircle) {
                progressCircle.style.strokeDasharray = circumference;
                progressCircle.style.strokeDashoffset = circumference;
            }
        
            this.repeatTimer = setInterval(() => {
                timeLeft--;
                
                // 타이머 업데이트
                if (timerElement) {
                    timerElement.textContent = this.formatTime(timeLeft);
                }
                
                // 프로그레스 서클 업데이트 (경과 시간에 따라 원이 채워짐)
                if (progressCircle) {
                    const elapsed = totalTime - timeLeft;
                    const percentage = elapsed / totalTime;
                    const offset = circumference - (percentage * circumference);
                    progressCircle.style.strokeDashoffset = offset;
                }
                
                if (timeLeft <= 0) {
                    this.stopRepeatRecording(set, audioIndex);
                }
            }, 1000);
        }, 500);
    }
    
    /**
     * 녹음 중지
     */
    stopRepeatRecording(set, audioIndex) {
        console.log('⏹️ 녹음 중지');
        
        if (this.repeatTimer) {
            clearInterval(this.repeatTimer);
            this.repeatTimer = null;
        }
        
        document.getElementById('repeatRecordingUI').style.display = 'none';
        document.getElementById('repeatSavingPopup').style.display = 'flex';
        
        setTimeout(() => {
            if (this._destroyed) return;
            document.getElementById('repeatSavingPopup').style.display = 'none';
            
            // 로딩 화면 표시
            this.showLoadingScreen();
            
            // 1초 후 다음 문제로 이동
            setTimeout(() => {
                if (this._destroyed) return;
                this.hideLoadingScreen();
                this.playAudioSequence(set, audioIndex + 1);
            }, 1000);
        }, 5000);
    }
    
    // ============================================
    // 로딩 화면 함수 (2개)
    // ============================================
    
    /**
     * 로딩 화면 표시
     */
    showLoadingScreen() {
        console.log('🔄 로딩 화면 표시');
        
        // 나레이션 화면 숨기기
        document.getElementById('repeatNarrationScreen').style.display = 'none';
        
        // 로딩 화면 표시
        const loadingScreen = document.getElementById('repeatLoadingScreen');
        if (loadingScreen) {
            loadingScreen.style.display = 'flex';
        }
    }
    
    /**
     * 로딩 화면 숨김
     */
    hideLoadingScreen() {
        console.log('✅ 로딩 화면 숨김');
        
        // 로딩 화면 숨기기
        const loadingScreen = document.getElementById('repeatLoadingScreen');
        if (loadingScreen) {
            loadingScreen.style.display = 'none';
        }
        
        // 나레이션 화면 표시
        document.getElementById('repeatNarrationScreen').style.display = 'flex';
    }
    
    // ============================================
    // 완료 & Cleanup 함수 (2개)
    // ============================================
    
    /**
     * 따라말하기 완료
     */
    completeSpeakingRepeat() {
        console.log('✅ 스피킹-따라말하기 완료 → 복습 화면으로 이동');
        
        // ★ 결과 데이터를 cleanup 전에 먼저 저장
        const set = this.speakingRepeatData ? this.speakingRepeatData.sets[this.currentRepeatSet] : null;
        const result = { set: set };
        
        // ★ 컴포넌트 완전 정리 (타이머, 오디오, 예약 동작 모두 중단)
        this.cleanup();
        
        return result;
    }
    
    /**
     * Cleanup (타이머/오디오 정리)
     */
    cleanup() {
        console.log('🧹 [Cleanup] 스피킹-따라말하기 정리 시작');
        
        this._destroyed = true;
        
        if (this.repeatTimer) {
            clearInterval(this.repeatTimer);
            this.repeatTimer = null;
            console.log('✅ 타이머 중지');
        }
        
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0;
            this.currentAudio = null;
            console.log('✅ 오디오 정지');
        }
        
        if (this.currentResultAudio) {
            this.currentResultAudio.pause();
            this.currentResultAudio = null;
            console.log('✅ 복습 화면 오디오 정지');
        }
        
        const savingPopup = document.getElementById('repeatSavingPopup');
        if (savingPopup) {
            savingPopup.style.display = 'none';
        }
        
        this.speakingRepeatData = null;
        this.currentRepeatSet = 0;
        this.currentRepeatNarration = 0;
        this.currentResultNarration = 0;
        
        console.log('✅ [Cleanup] 스피킹-따라말하기 정리 완료');
    }
    
    // ============================================
    // 복습 화면 함수 (10개)
    // ============================================
    
    /**
     * 복습 화면 표시
     */
    showRepeatResult(data) {
        console.log('🎯 [복습 화면] showRepeatResult 호출', data);
        
        if (!data || !data.set) {
            console.error('❌ 복습 데이터 없음');
            return;
        }
        
        // 데이터 설정
        const set = data.set;
        this.currentResultNarration = 0;
        
        // Context 표시
        document.getElementById('repeatResultContext').textContent = set.contextText;
        
        // 첫 번째 오디오 표시
        this.showRepeatResultNarration(set, 0);
    }
    
    /**
     * 나레이션 표시 (복습 화면)
     */
    showRepeatResultNarration(set, index) {
        console.log(`🎯 [복습 화면] 오디오 ${index + 1} 표시`);
        
        this.currentResultNarration = index;
        const audio = set.audios[index];
        
        // 진행 상태 업데이트
        document.getElementById('repeatResultProgress').textContent = 
            `Question ${index + 1} of ${set.audios.length}`;
        
        // 이미지 표시
        const illustrationImg = document.getElementById('repeatResultIllustration');
        if (audio.image && audio.image !== 'PLACEHOLDER') {
            illustrationImg.src = audio.image;
            illustrationImg.style.display = 'block';
        } else {
            illustrationImg.style.display = 'none';
        }
        
        // Script 표시
        document.getElementById('repeatResultScript').textContent = audio.script;
        
        // Translation 표시
        document.getElementById('repeatResultTranslation').textContent = audio.translation;
        
        // 다시 듣기 버튼 설정
        const listenBtn = document.getElementById('repeatResultListenBtn');
        listenBtn.onclick = () => this.playRepeatResultAudio(audio.audio);
        
        // 이전/다음 버튼 표시
        const prevBtn = document.getElementById('repeatResultPrevBtn');
        const nextBtn = document.getElementById('repeatResultNextBtn');
        
        if (index === 0) {
            prevBtn.style.display = 'none';
        } else {
            prevBtn.style.display = 'inline-block';
            prevBtn.onclick = () => this.showRepeatResultNarration(set, index - 1);
        }
        
        if (index === set.audios.length - 1) {
            nextBtn.textContent = '완료';
            nextBtn.onclick = () => this.completeRepeatResult();
        } else {
            nextBtn.textContent = '다음';
            nextBtn.onclick = () => this.showRepeatResultNarration(set, index + 1);
        }
    }
    
    /**
     * 오디오 재생 (복습 화면)
     */
    playRepeatResultAudio(audioUrl) {
        console.log('🔊 [복습 화면] 오디오 재생:', audioUrl);
        
        // 기존 오디오 정지
        if (this.currentResultAudio) {
            this.currentResultAudio.pause();
            this.currentResultAudio = null;
        }
        
        // PLACEHOLDER 또는 빈 URL이면 재생 안 함
        if (!audioUrl || audioUrl === 'PLACEHOLDER') {
            console.log('⏭️ [복습 화면] PLACEHOLDER 오디오, 건너뜀');
            return;
        }
        
        // 새 오디오 재생
        this.currentResultAudio = new Audio(audioUrl);
        this.currentResultAudio.play().catch(error => {
            console.error('❌ [복습 화면] 오디오 재생 실패:', error);
        });
    }
    
    /**
     * 복습 완료
     */
    completeRepeatResult() {
        console.log('✅ [복습 화면] 복습 완료');
        
        // 오디오 정지
        if (this.currentResultAudio) {
            this.currentResultAudio.pause();
            this.currentResultAudio = null;
        }
        
        // backToSchedule는 Module이 제공
        return true;
    }
    
    // ============================================
    // 유틸리티 함수 (1개)
    // ============================================
    
    /**
     * 시간 포맷 (예: 10 → "0:10")
     */
    formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
}

// ============================================
// 전역 초기화
// ============================================
console.log('✅ RepeatComponent 클래스 로드 완료 (v=001)');
