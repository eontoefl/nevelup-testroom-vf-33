/**
 * ================================================
 * InterviewComponent.js v=001
 * 인터뷰 컴포넌트
 * ================================================
 * 
 * 책임:
 * - 데이터 처리: 외부 로더(interview-loader.js) 사용
 * - 인트로 화면 (3): "Interview" 나레이션
 * - 상황 설명 화면 (5): 상황 설명 + 이미지 + 오디오
 * - 질문 화면 & 비디오 재생 (10): 질문 비디오 + Nodding 비디오
 * - 녹음 기능 (7): 45초 고정, 원형 프로그레스바
 * - 로딩 화면 (2): 문제 전환 시 로딩 표시
 * - 오디오 재생 (2): HTML5 Audio + 볼륨 적용
 * - 볼륨 조절 (5): 슬라이더 (0~100%, 최대 143% 증폭)
 * - 내부 상태 변수 (5): currentSet/Question/timer/video/audio
 * - 완료 & Cleanup (2): 모든 질문 완료 처리
 * - 채점 화면 (15): 하이라이트 클릭 → 피드백 표시
 * - 유틸리티 함수 (1): formatInterviewTime
 * 
 * 총 57개 요소
 */

class InterviewComponent {
    constructor() {
        // 데이터 저장 (외부 로더에서 로드)
        this.speakingInterviewData = null;
        this._destroyed = false; // cleanup 호출 시 true로 설정
        
        // ============================================
        // 2. 녹음 기능 (7개 중 1개)
        // ============================================
        
        // 녹음 시간 (45초 고정)
        this.INTERVIEW_RESPONSE_TIME = 45;
        
        // ============================================
        // 3. 볼륨 조절 (5개 중 1개)
        // ============================================
        
        // 볼륨 레벨 (0.0~1.43, 기본 1.0 = 100%)
        this.interviewVolumeLevel = 1.0;
        
        // ============================================
        // 4. 내부 상태 변수 (5개)
        // ============================================
        
        // 현재 세트/질문 번호
        this.currentInterviewSet = 0;
        this.currentInterviewQuestion = 0;
        
        // 타이머 & 미디어
        this.interviewTimer = null;
        this.currentVideo = null;
        this.currentInterviewAudio = null;
    }
    
    /**
     * 데이터 로드 (외부 로더 사용)
     */
    async loadInterviewData() {
        console.log('📥 [Interview] 외부 로더에서 데이터 로드...');
        
        if (typeof window.loadInterviewData === 'function') {
            const result = await window.loadInterviewData();
            if (result) {
                this.speakingInterviewData = result;
                return result;
            }
        }
        
        console.error('❌ [Interview] 데이터를 불러올 수 없습니다.');
        return null;
    }
    
    // ============================================
    // 인트로 화면 함수 (3개)
    // ============================================
    
    /**
     * 인트로 화면 표시
     */
    showInterviewIntroScreen() {
        console.log('📺 인터뷰 인트로 화면 표시');
        
        document.getElementById('interviewIntroScreen').style.display = 'flex';
        document.getElementById('interviewContextScreen').style.display = 'none';
        document.getElementById('interviewQuestionScreen').style.display = 'none';
        
        // 1초 대기 후 인트로 나레이션 재생
        setTimeout(() => {
            if (this._destroyed) return;
            const introNarration = 'https://eontoefl.github.io/toefl-audio/speaking/interview/narration/interview_narration.mp3';
            
            this.playInterviewAudio(introNarration, () => {
                if (this._destroyed) return;
                console.log('✅ 인트로 나레이션 종료');
                
                // 2초 대기 후 상황 화면으로 이동
                setTimeout(() => {
                    if (this._destroyed) return;
                    document.getElementById('interviewIntroScreen').style.display = 'none';
                    this.startInterviewSequence((this.setId || 1) - 1);
                }, 2000);
            });
        }, 1000);
    }
    
    // ============================================
    // 상황 설명 화면 함수 (5개)
    // ============================================
    
    /**
     * 인터뷰 시퀀스 시작
     */
    startInterviewSequence(setIndex) {
        const set = this.speakingInterviewData.sets[setIndex];
        
        if (!set) {
            console.error('세트를 찾을 수 없습니다:', setIndex);
            return;
        }
        
        this.currentInterviewSet = setIndex;
        this.currentInterviewQuestion = 0;
        
        // 첫 번째 화면 표시
        this.showInterviewContextScreen(set);
    }
    
    /**
     * 상황 설명 화면 표시
     */
    showInterviewContextScreen(set) {
        console.log('📺 상황 화면 표시');
        
        document.getElementById('interviewContextScreen').style.display = 'flex';
        document.getElementById('interviewQuestionScreen').style.display = 'none';
        
        // contextText 표시
        const contextTextEl = document.getElementById('interviewContextText');
        if (contextTextEl) {
            contextTextEl.textContent = set.contextText;
        }
        
        // contextImage 표시
        const contextImageEl = document.getElementById('interviewContextImage');
        if (contextImageEl && set.contextImage && set.contextImage !== 'PLACEHOLDER') {
            contextImageEl.src = set.contextImage;
            contextImageEl.style.display = 'block';
        }
        
        // 1초 대기 후 contextAudio 재생
        console.log('⏳ 화면 표시 후 1초 대기...');
        setTimeout(() => {
            if (this._destroyed) return;
            if (set.contextAudio && set.contextAudio !== 'PLACEHOLDER') {
                console.log('🎵 시나리오 오디오 재생');
                this.playInterviewAudio(set.contextAudio, () => {
                    if (this._destroyed) return;
                    console.log('✅ 시나리오 오디오 종료 → 문제 1로 이동');
                    // 오디오 종료 후 바로 문제 1로 이동
                    this.showInterviewQuestionScreen(set);
                });
            } else {
                // 오디오 없으면 2초 후 문제 1로 이동
                setTimeout(() => {
                    if (this._destroyed) return;
                    this.showInterviewQuestionScreen(set);
                }, 2000);
            }
        }, 1000);
    }
    
    // ============================================
    // 질문 화면 & 비디오 재생 함수 (10개)
    // ============================================
    
    /**
     * 질문 화면 표시
     */
    showInterviewQuestionScreen(set) {
        console.log('📺 질문 화면 표시');
        
        document.getElementById('interviewContextScreen').style.display = 'none';
        document.getElementById('interviewQuestionScreen').style.display = 'block';
        
        // 첫 번째 질문 재생
        this.playInterviewQuestion(set, 0);
    }
    
    /**
     * 질문 재생
     */
    playInterviewQuestion(set, questionIndex) {
        if (questionIndex >= set.videos.length) {
            console.log('✅ 모든 질문 완료 → 섹션 종료');
            this.completeSpeakingInterview();
            return;
        }
        
        this.currentInterviewQuestion = questionIndex;
        const videoData = set.videos[questionIndex];
        
        console.log(`🎤 질문 ${questionIndex + 1}/4 준비`);
        
        // Progress 업데이트
        const totalQuestions = set.videos.length;
        document.getElementById('interviewProgress').textContent = `Question ${questionIndex + 1} of ${totalQuestions}`;
        
        // 녹음 UI 숨김
        document.getElementById('interviewRecordingUI').style.display = 'none';
        document.getElementById('interviewSavingPopup').style.display = 'none';
        
        // 1초 대기 후 interviewer 영상 재생
        console.log('⏳ 화면 표시 후 1초 대기...');
        setTimeout(() => {
            if (this._destroyed) return;
            console.log(`🎵 질문 ${questionIndex + 1}/4 영상 재생 시작`);
            this.playInterviewVideo(videoData.video, () => {
                if (this._destroyed) return;
                console.log(`✅ 질문 ${questionIndex + 1} 영상 종료 → 0.7초 대기`);
                
                // 0.7초 대기 + base image 표시
                setTimeout(() => {
                    if (this._destroyed) return;
                    console.log('🎬 0.7초 대기 완료 → nodding video 재생 + 녹음 시작');
                    // Nodding video 재생 + 녹음
                    this.startInterviewRecording(set, questionIndex);
                }, 700);
            });
        }, 1000);
    }
    
    /**
     * 비디오 재생 (HTML5 Video)
     */
    playInterviewVideo(videoUrl, onEnded) {
        const videoElement = document.getElementById('interviewVideo');
        const videoPlaceholder = document.getElementById('interviewVideoPlaceholder');
        
        // PLACEHOLDER이면 플레이스홀더 표시
        if (videoUrl === 'PLACEHOLDER' || !videoUrl || videoUrl.trim() === '') {
            console.log('⏭️ 영상 없음 (PLACEHOLDER) → 플레이스홀더 표시');
            if (videoPlaceholder) videoPlaceholder.style.display = 'block';
            if (videoElement) videoElement.style.display = 'none';
            
            if (onEnded) {
                setTimeout(() => {
                    if (this._destroyed) return;
                    if (videoPlaceholder) videoPlaceholder.style.display = 'none';
                    onEnded();
                }, 2000); // 2초 표시
            }
            return;
        }
        
        console.log('🎥 비디오 재생 시작:', videoUrl);
        
        if (videoPlaceholder) videoPlaceholder.style.display = 'none';
        videoElement.src = videoUrl;
        videoElement.style.display = 'block';
        videoElement.controls = false; // 컨트롤 제거
        videoElement.removeAttribute('controls'); // 명시적으로 제거
        videoElement.volume = Math.min(this.interviewVolumeLevel, 1.0);
        console.log(`🎵 비디오 볼륨 설정: ${Math.round(this.interviewVolumeLevel * 100)}%`);
        
        videoElement.addEventListener('ended', () => {
            console.log('🔊 영상 재생 완료:', videoUrl);
            if (onEnded) onEnded();
        }, { once: true });
        
        videoElement.addEventListener('error', (e) => {
            console.error('❌ 영상 로드 실패:', videoUrl, e);
            if (onEnded) {
                setTimeout(() => { if (!this._destroyed) onEnded(); }, 1000);
            }
        }, { once: true });
        
        videoElement.play().then(() => {
            console.log('✅ 비디오 재생 시작됨');
        }).catch(err => {
            console.error('❌ 영상 재생 실패:', err);
            if (onEnded) {
                setTimeout(() => { if (!this._destroyed) onEnded(); }, 1000);
            }
        });
    }
    
    // ============================================
    // 녹음 기능 함수 (7개)
    // ============================================
    
    /**
     * 녹음 시작
     */
    startInterviewRecording(set, questionIndex) {
        console.log(`🔴 녹음 시작: ${this.INTERVIEW_RESPONSE_TIME}초`);
        
        // ★ 현재 녹음 상태 저장 (admin-skip용)
        this._currentRecordingSet = set;
        this._currentRecordingQuestionIndex = questionIndex;
        
        // Nodding video 재생 (45초 동안 반복)
        const noddingVideoElement = document.getElementById('interviewVideo');
        if (noddingVideoElement && set.noddingVideo && set.noddingVideo !== 'PLACEHOLDER') {
            console.log('🎥 Nodding video 재생 (반복 모드)');
            
            noddingVideoElement.src = set.noddingVideo;
            noddingVideoElement.loop = true; // 반복 재생
            noddingVideoElement.controls = false;
            noddingVideoElement.removeAttribute('controls');
            noddingVideoElement.volume = Math.min(this.interviewVolumeLevel, 1.0);
            console.log(`🎵 Nodding video 볼륨 설정: ${Math.round(this.interviewVolumeLevel * 100)}%`);
            
            noddingVideoElement.load();
            noddingVideoElement.play().then(() => {
                console.log('✅ Nodding video 재생 시작됨');
            }).catch(err => console.error('❌ Nodding video 재생 실패:', err));
        }
        
        // 녹음 UI 표시
        const recordingUI = document.getElementById('interviewRecordingUI');
        if (recordingUI) {
            recordingUI.style.display = 'flex';
            console.log('✅ 녹음 UI 표시됨');
        }
        
        // 카운트다운 시작
        let timeLeft = this.INTERVIEW_RESPONSE_TIME;
        const totalTime = this.INTERVIEW_RESPONSE_TIME;
        const timerElement = document.getElementById('interviewTimer');
        const progressCircle = document.getElementById('interviewProgressCircle');
        
        // 원의 둘레 계산 (반지름 20px)
        const radius = 20;
        const circumference = 2 * Math.PI * radius;
        
        if (timerElement) {
            timerElement.textContent = this.formatInterviewTime(timeLeft);
        }
        
        // 프로그레스 서클 초기화 (100% 채워진 상태에서 시작)
        if (progressCircle) {
            progressCircle.style.strokeDasharray = circumference;
            progressCircle.style.strokeDashoffset = circumference;
        }
        
        this.interviewTimer = setInterval(() => {
            timeLeft--;
            
            // 타이머 업데이트
            if (timerElement) {
                timerElement.textContent = this.formatInterviewTime(timeLeft);
            }
            
            // 프로그레스 서클 업데이트 (경과 시간에 따라 원이 채워짐)
            if (progressCircle) {
                const elapsed = totalTime - timeLeft;
                const percentage = elapsed / totalTime;
                const offset = circumference - (percentage * circumference);
                progressCircle.style.strokeDashoffset = offset;
            }
            
            if (timeLeft <= 0) {
                clearInterval(this.interviewTimer);
                this.stopInterviewRecording(set, questionIndex);
            }
        }, 1000);
    }
    
    /**
     * 녹음 중지
     */
    stopInterviewRecording(set, questionIndex) {
        console.log('⏹️ 녹음 중지');
        
        // Nodding video 중지
        const noddingVideoElement = document.getElementById('interviewVideo');
        if (noddingVideoElement) {
            noddingVideoElement.pause();
            noddingVideoElement.loop = false; // 반복 모드 해제
            console.log('🛑 Nodding video 중지');
        }
        
        // 녹음 UI 숨김
        const recordingUI = document.getElementById('interviewRecordingUI');
        if (recordingUI) {
            recordingUI.style.display = 'none';
        }
        
        // 저장 팝업 표시
        const savingPopup = document.getElementById('interviewSavingPopup');
        if (savingPopup) {
            savingPopup.style.display = 'flex';
            console.log('✅ 저장 팝업 표시됨');
        }
        
        // 5초 후 로딩 화면 표시
        setTimeout(() => {
            if (this._destroyed) return;
            if (savingPopup) {
                savingPopup.style.display = 'none';
            }
            
            // 로딩 화면 표시
            this.showInterviewLoadingScreen();
            
            // 1초 후 다음 질문
            setTimeout(() => {
                if (this._destroyed) return;
                this.hideInterviewLoadingScreen();
                this.playInterviewQuestion(set, questionIndex + 1);
            }, 1000);
        }, 5000);
    }
    
    // ============================================
    // 로딩 화면 함수 (2개)
    // ============================================
    
    /**
     * 로딩 화면 표시
     */
    showInterviewLoadingScreen() {
        console.log('🔄 로딩 화면 표시');
        
        // 질문 화면 숨기기
        document.getElementById('interviewQuestionScreen').style.display = 'none';
        
        // 로딩 화면 표시
        const loadingScreen = document.getElementById('interviewLoadingScreen');
        if (loadingScreen) {
            loadingScreen.style.display = 'flex';
        }
    }
    
    /**
     * 로딩 화면 숨김
     */
    hideInterviewLoadingScreen() {
        console.log('✅ 로딩 화면 숨김');
        
        // 로딩 화면 숨기기
        const loadingScreen = document.getElementById('interviewLoadingScreen');
        if (loadingScreen) {
            loadingScreen.style.display = 'none';
        }
        
        // 질문 화면 표시
        document.getElementById('interviewQuestionScreen').style.display = 'block';
    }
    
    // ============================================
    // 오디오 재생 함수 (2개)
    // ============================================
    
    /**
     * 오디오 재생 (HTML5 Audio + 볼륨 적용)
     */
    playInterviewAudio(audioUrl, onEnded) {
        // 기존 오디오 중지
        if (this.currentInterviewAudio) {
            this.currentInterviewAudio.pause();
            this.currentInterviewAudio.currentTime = 0;
            this.currentInterviewAudio = null;
            console.log('🛑 기존 오디오 중지');
        }
        
        if (audioUrl === 'PLACEHOLDER' || !audioUrl || audioUrl.trim() === '') {
            console.log('⏭️ 오디오 없음 (PLACEHOLDER) → 즉시 다음으로');
            if (onEnded) {
                setTimeout(onEnded, 500);
            }
            return;
        }
        
        console.log('🎵 오디오 재생 시작:', audioUrl);
        
        // HTML Audio Element 생성
        this.currentInterviewAudio = new Audio(audioUrl);
        
        // 볼륨 설정
        this.currentInterviewAudio.volume = Math.min(this.interviewVolumeLevel, 1.0);
        console.log(`🎵 오디오 볼륨 설정: ${Math.round(this.interviewVolumeLevel * 100)}%`);
        
        this.currentInterviewAudio.addEventListener('ended', () => {
            console.log('🔊 오디오 재생 완료:', audioUrl);
            this.currentInterviewAudio = null;
            if (onEnded) onEnded();
        }, { once: true });
        
        this.currentInterviewAudio.addEventListener('error', (e) => {
            console.error('❌ 오디오 로드 실패:', audioUrl, e);
            this.currentInterviewAudio = null;
            if (onEnded) {
                setTimeout(onEnded, 1000);
            }
        }, { once: true });
        
        this.currentInterviewAudio.play().then(() => {
            console.log('✅ 오디오 재생 시작됨');
        }).catch(err => {
            console.error('❌ 오디오 재생 실패:', err);
            this.currentInterviewAudio = null;
            if (onEnded) {
                setTimeout(onEnded, 1000);
            }
        });
    }
    
    // ============================================
    // 볼륨 조절 함수 (5개)
    // ============================================
    
    /**
     * 볼륨 슬라이더 토글
     */
    toggleVolumeSlider() {
        const container = document.getElementById('volumeSliderContainer');
        if (!container) return;
        if (container.style.display === 'none' || container.style.display === '') {
            container.style.display = 'block';
            console.log('🎵 볼륨 슬라이더 열림');
        } else {
            container.style.display = 'none';
            console.log('🎵 볼륨 슬라이더 닫힘');
        }
    }
    
    /**
     * 볼륨 업데이트
     */
    updateInterviewVolume(value) {
        // 슬라이더 값 0~100을 실제 볼륨 0.0~1.43으로 변환
        // 슬라이더 0 → 볼륨 0.0, 슬라이더 70 → 볼륨 1.0, 슬라이더 100 → 볼륨 1.43
        const normalizedValue = value / 70; // 70 = 100% 볼륨
        this.interviewVolumeLevel = normalizedValue;
        
        console.log(`🎵 볼륨 변경: 슬라이더 ${value}% (실제 볼륨: ${this.interviewVolumeLevel.toFixed(2)})`);
        
        // 퍼센트 표시는 슬라이더 값 그대로
        const percentageDisplay = document.getElementById('volumePercentage');
        if (percentageDisplay) {
            percentageDisplay.textContent = `${value}%`;
        }
        
        // 아이콘 업데이트
        const volumeIcon = document.getElementById('volumeIcon');
        if (volumeIcon) {
            if (value == 0) {
                volumeIcon.className = 'fas fa-volume-mute';
            } else if (value < 50) {
                volumeIcon.className = 'fas fa-volume-down';
            } else {
                volumeIcon.className = 'fas fa-volume-up';
            }
        }
        
        // 현재 재생 중인 오디오에 볼륨 적용
        if (this.currentInterviewAudio) {
            this.currentInterviewAudio.volume = Math.min(this.interviewVolumeLevel, 1.0);
            console.log(`🎵 재생 중인 오디오에 볼륨 적용: 슬라이더 ${value}%`);
        }
        
        // 현재 재생 중인 비디오에 볼륨 적용
        const videoElement = document.getElementById('interviewVideo');
        if (videoElement && !videoElement.paused) {
            videoElement.volume = Math.min(this.interviewVolumeLevel, 1.0);
            console.log(`🎵 재생 중인 비디오에 볼륨 적용: 슬라이더 ${value}%`);
        }
    }
    
    /**
     * 외부 클릭 시 볼륨 슬라이더 닫기 (이벤트 리스너 등록용)
     */
    setupVolumeSliderCloseOnOutsideClick() {
        document.addEventListener('click', (event) => {
            const volumeControl = document.querySelector('.volume-control');
            const volumeSliderContainer = document.getElementById('volumeSliderContainer');
            
            if (volumeControl && volumeSliderContainer && 
                !volumeControl.contains(event.target) && 
                volumeSliderContainer.style.display === 'block') {
                volumeSliderContainer.style.display = 'none';
                console.log('🎵 볼륨 슬라이더 닫힘 (외부 클릭)');
            }
        });
    }
    
    // ============================================
    // 완료 & Cleanup 함수 (2개)
    // ============================================
    
    /**
     * 인터뷰 완료
     */
    completeSpeakingInterview() {
        console.log('✅ 스피킹-인터뷰 완료 → 채점화면으로 이동');
        
        // ★ 결과 데이터를 cleanup 전에 먼저 저장
        const set = this.speakingInterviewData ? this.speakingInterviewData.sets[this.currentInterviewSet] : null;
        const result = { set: set };
        
        // ★ 컴포넌트 완전 정리 (타이머, 영상, 오디오, 예약 동작, 반복 영상 모두 중단)
        this.cleanup();
        
        return result;
    }
    
    /**
     * Cleanup (타이머/오디오/비디오 정리)
     */
    cleanup() {
        console.log('🧹 [Cleanup] 스피킹-인터뷰 정리 시작');
        
        // ★ 파괴 플래그 — setTimeout 콜백에서 체크
        this._destroyed = true;
        
        // 타이머 정지
        if (this.interviewTimer) {
            clearInterval(this.interviewTimer);
            this.interviewTimer = null;
            console.log('✅ 타이머 정지');
        }
        
        // nodding video 정지
        const noddingVideo = document.getElementById('interviewNoddingVideo');
        if (noddingVideo) {
            noddingVideo.pause();
            noddingVideo.removeAttribute('src');
            noddingVideo.load();
            console.log('✅ Nodding video 정지');
        }
        
        // 비디오 정지
        if (this.currentVideo) {
            this.currentVideo.pause();
            this.currentVideo.currentTime = 0;
            this.currentVideo = null;
            console.log('✅ 비디오 정지');
        }
        
        // 오디오 정지
        if (this.currentInterviewAudio) {
            this.currentInterviewAudio.pause();
            this.currentInterviewAudio.currentTime = 0;
            this.currentInterviewAudio = null;
            console.log('✅ 오디오 정지');
        }
        
        // 팝업 숨김
        const savingPopup = document.getElementById('interviewSavingPopup');
        if (savingPopup) {
            savingPopup.style.display = 'none';
        }
        
        // 데이터 초기화
        this.speakingInterviewData = null;
        this.currentInterviewSet = 0;
        this.currentInterviewQuestion = 0;
        
        console.log('✅ [Cleanup] 스피킹-인터뷰 정리 완료');
    }
    
    // ============================================
    // 유틸리티 함수 (1개)
    // ============================================
    
    /**
     * 시간 포맷 (예: 45 → "00:45")
     */
    formatInterviewTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
}

// ============================================
// 전역 초기화
// ============================================
console.log('✅ InterviewComponent 클래스 로드 완료 (v=001)');
