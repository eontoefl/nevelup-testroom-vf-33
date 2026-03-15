/**
 * announcement-component.js
 * 리스닝 - 공지사항 듣고 응답 고르기 컴포넌트
 * 
 * - 세트당 2문제
 * - 인트로 화면 (이미지 + 나레이션 + 공지사항 오디오)
 * - 문제 화면 (작은 이미지 + 질문 2개)
 * - 답안 채점 및 결과 반환
 * 
 * 의존성: announcement-loader.js (loadAnnouncementData)
 */

class AnnouncementComponent {
    constructor(setNumber, config = {}) {
        console.log(`[AnnouncementComponent] 생성 - setNumber: ${setNumber}`);
        
        this.setNumber = setNumber;
        this.onComplete = config.onComplete || null;
        this.onError = config.onError || null;
        this.onTimerStart = config.onTimerStart || null;
        
        // 내부 상태
        this.currentQuestion = 0;
        this.answers = {};
        this.showingIntro = true;
        this.setData = null;
        this.currentImage = null;
        
        // 오디오 플레이어
        this.audioPlayer = null;
        this.isAudioPlaying = false;
        this._destroyed = false;
        this._questionTimedOut = false;
        
        // 성별별 이미지
        this.FEMALE_IMAGES = [
            'https://eontoefl.github.io/toefl-audio/listening/response/image/response_imageF1.jpg',
            'https://eontoefl.github.io/toefl-audio/listening/response/image/response_imageF2.jpg',
            'https://eontoefl.github.io/toefl-audio/listening/response/image/response_imageF3.jpg',
            'https://eontoefl.github.io/toefl-audio/listening/response/image/response_imageF4.jpg',
            'https://eontoefl.github.io/toefl-audio/listening/response/image/response_imageF5.jpg'
        ];
        
        this.MALE_IMAGES = [
            'https://eontoefl.github.io/toefl-audio/listening/response/image/response_imageM1.jpg',
            'https://eontoefl.github.io/toefl-audio/listening/response/image/response_imageM2.jpg',
            'https://eontoefl.github.io/toefl-audio/listening/response/image/response_imageM3.jpg',
            'https://eontoefl.github.io/toefl-audio/listening/response/image/response_imageM4.jpg',
            'https://eontoefl.github.io/toefl-audio/listening/response/image/response_imageM5.jpg'
        ];
    }
    
    /**
     * 컴포넌트 초기화
     */
    async init() {
        console.log('[AnnouncementComponent] 초기화 시작');
        
        try {
            // 1. 데이터 로드 (외부 로더 사용)
            const allData = await loadAnnouncementData();
            
            if (!allData || !allData.sets || allData.sets.length === 0) {
                throw new Error('데이터를 불러올 수 없습니다');
            }
            
            // 2. 세트 찾기
            const setIndex = this.findSetIndex(allData.sets);
            if (setIndex === -1) {
                throw new Error(`세트를 찾을 수 없습니다: ${this.setNumber}`);
            }
            
            this.setData = allData.sets[setIndex];
            console.log('[AnnouncementComponent] 세트 데이터 로드 완료:', this.setData);
            
            // 3. 인트로 화면 표시
            this.showIntro();
            
        } catch (error) {
            console.error('[AnnouncementComponent] 초기화 실패:', error);
            alert('공지사항 듣기 데이터를 불러오는데 실패했습니다.');
        }
    }
    
    /**
     * 세트 인덱스 찾기
     */
    findSetIndex(sets) {
        let targetSetId;
        if (typeof this.setNumber === 'string' && this.setNumber.includes('_set_')) {
            targetSetId = this.setNumber;
        } else {
            targetSetId = `announcement_set_${String(this.setNumber).padStart(4, '0')}`;
        }
        
        console.log(`[AnnouncementComponent] 세트 검색 - ID: ${targetSetId}`);
        
        const index = sets.findIndex(set => set.setId === targetSetId);
        console.log(`[AnnouncementComponent] 세트 인덱스: ${index}`);
        return index;
    }
    
    /**
     * 인트로 화면 표시
     */
    showIntro() {
        console.log('[AnnouncementComponent] 인트로 화면 표시');
        
        this.showingIntro = true;
        
        // 성별에 따라 이미지 선택
        const gender = this.setData.gender.toLowerCase().trim();
        const isFemale = gender === 'female' || gender === 'f';
        const images = isFemale ? this.FEMALE_IMAGES : this.MALE_IMAGES;
        const lastKey = isFemale ? '_lastFemaleImage' : '_lastMaleImage';
        if (!AnnouncementComponent[lastKey]) AnnouncementComponent[lastKey] = null;
        const last = AnnouncementComponent[lastKey];
        const candidates = (last && images.length > 1) ? images.filter(img => img !== last) : images;
        this.currentImage = candidates[Math.floor(Math.random() * candidates.length)];
        AnnouncementComponent[lastKey] = this.currentImage;
        
        // 인트로 화면에 이미지 표시
        const introImageDiv = document.getElementById('announcementIntroImage');
        if (introImageDiv) {
            introImageDiv.innerHTML = `
                <img src="${this.currentImage}" alt="Announcement" 
                     style="width: 100%; max-width: 450px; height: auto; border-radius: 16px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); object-fit: cover;"
                     onerror="console.error('❌ 공지사항 이미지 로드 실패:', this.src);"
                     onload="console.log('✅ 공지사항 이미지 로드 성공:', this.src);">
            `;
        }
        
        // 인트로 화면 표시
        document.getElementById('announcementIntroScreen').style.display = 'block';
        document.getElementById('announcementQuestionScreen').style.display = 'none';
        
        // 진행률/타이머/Next버튼 숨김
        document.getElementById('announcementProgress').style.display = 'none';
        document.getElementById('announcementTimer').style.display = 'none';
        const annTimerWrap = document.getElementById('announcementTimerWrap');
        if (annTimerWrap) annTimerWrap.style.display = 'none';
        const annNextBtn = document.getElementById('announcementNextBtn');
        if (annNextBtn) annNextBtn.style.display = 'none';
        const annSubmitBtn = document.getElementById('announcementSubmitBtn');
        if (annSubmitBtn) annSubmitBtn.style.display = 'none';
        
        // [듣기 시작] 버튼 표시
        this._showPlayButton();
    }
    
    /**
     * [듣기 시작] 버튼 표시
     */
    _showPlayButton() {
        const introScreen = document.getElementById('announcementIntroScreen');
        const imageContainer = document.getElementById('announcementIntroImage');
        if (!introScreen || !imageContainer) return;
        
        const existingBtn = document.getElementById('announcementListenBtn');
        if (existingBtn) existingBtn.remove();
        
        const btn = document.createElement('button');
        btn.id = 'announcementListenBtn';
        btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="vertical-align:middle;margin-right:10px;"><path d="M3 9v6h4l5 5V4L7 9H3z" fill="white"/><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" fill="white"/><path d="M19 12c0-3.17-1.82-5.9-4.5-7.22v2.16A5.98 5.98 0 0 1 18 12c0 2.48-1.35 4.64-3.5 5.06v2.16C17.18 17.9 19 15.17 19 12z" fill="white" opacity="0.7"/></svg>듣기 시작';
        btn.onclick = () => this._onPlayButtonClick();
        introScreen.insertBefore(btn, imageContainer);
    }
    
    /**
     * [듣기 시작] 버튼 클릭
     */
    _onPlayButtonClick() {
        console.log('[AnnouncementComponent] 🔊 [듣기 시작] 버튼 클릭');
        
        const btn = document.getElementById('announcementListenBtn');
        if (btn) btn.remove();
        
        this.playNarration(() => {
            if (this._destroyed) return;
            console.log('[AnnouncementComponent] 나레이션 완료 → 공지사항 오디오 바로 재생');
            this.playMainAudio(() => {
                if (this._destroyed) return;
                console.log('[AnnouncementComponent] 공지사항 오디오 완료 → 문제 화면 전환');
                this.showQuestions();
            });
        });
    }
    
    /**
     * 나레이션 재생
     */
    playNarration(onEnded) {
        const narrationUrl = this.setData.narrationUrl;
        console.log('[AnnouncementComponent] 나레이션 URL:', narrationUrl);
        
        if (!narrationUrl) {
            console.warn('[AnnouncementComponent] 나레이션 URL 없음, 스킵');
            if (onEnded) onEnded();
            return;
        }
        
        this.audioPlayer = new Audio(narrationUrl);
        let _callbackFired = false;
        
        const fireCallback = (source) => {
            if (_callbackFired) { console.log(`[AnnouncementComponent] 나레이션 콜백 중복 차단 (${source})`); return; }
            _callbackFired = true;
            if (this._destroyed) return;
            if (onEnded) onEnded();
        };
        
        this.audioPlayer.onended = () => {
            console.log('[AnnouncementComponent] 나레이션 재생 완료');
            fireCallback('ended');
        };
        this.audioPlayer.onerror = (e) => {
            console.error('[AnnouncementComponent] 나레이션 재생 오류:', e);
            fireCallback('error');
        };
        this.audioPlayer.play().catch(err => {
            console.error('[AnnouncementComponent] 나레이션 재생 실패:', err);
            fireCallback('catch');
        });
    }
    
    /**
     * 공지사항 오디오 재생
     */
    playMainAudio(onEnded) {
        const audioUrl = this.setData.audioUrl;
        console.log('[AnnouncementComponent] 공지사항 오디오 URL:', audioUrl);
        
        if (!audioUrl) {
            console.warn('[AnnouncementComponent] 공지사항 오디오 URL 없음 → 바로 문제 화면');
            this._showNoAudioNotice();
            if (!this._destroyed && onEnded) onEnded();
            return;
        }
        
        if (this.audioPlayer) {
            this.audioPlayer.pause();
            this.audioPlayer = null;
        }
        
        this.audioPlayer = new Audio(audioUrl);
        this.isAudioPlaying = true;
        let _callbackFired = false;
        
        const fireCallback = (source) => {
            if (_callbackFired) { console.log(`[AnnouncementComponent] 공지사항오디오 콜백 중복 차단 (${source})`); return; }
            _callbackFired = true;
            this.isAudioPlaying = false;
            if (!this._destroyed && onEnded) onEnded();
        };
        
        this.audioPlayer.onended = () => {
            console.log('[AnnouncementComponent] 공지사항 오디오 재생 완료');
            fireCallback('ended');
        };
        this.audioPlayer.onerror = (e) => {
            console.error('[AnnouncementComponent] 공지사항 오디오 재생 실패:', e);
            this.isAudioPlaying = false;
            this._showAudioRetryUI(onEnded);
        };
        this.audioPlayer.play().catch(err => {
            console.error('[AnnouncementComponent] 공지사항 오디오 play() 실패:', err);
            this.isAudioPlaying = false;
            this._showAudioRetryUI(onEnded);
        });
    }
    
    /**
     * 오디오 재생 실패 시 [다시 재생] UI
     */
    _showAudioRetryUI(onEnded) {
        if (document.getElementById('announcementAudioRetryUI')) return;
        
        const container = document.getElementById('announcementIntroImage');
        if (!container) return;
        
        const retryDiv = document.createElement('div');
        retryDiv.id = 'announcementAudioRetryUI';
        retryDiv.style.cssText = `text-align: center; padding: 16px; margin-top: 12px; background: #fee2e2; border: 1px solid #ef4444; border-radius: 8px;`;
        retryDiv.innerHTML = `
            <p style="color: #dc2626; font-weight: 600; margin: 0 0 12px;">오디오를 불러오지 못했습니다</p>
            <button id="announcementRetryBtn" style="padding: 10px 20px; background: #4a90e2; color: white; border: none; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer;">🔄 다시 재생</button>
        `;
        container.appendChild(retryDiv);
        
        document.getElementById('announcementRetryBtn').onclick = () => {
            retryDiv.remove();
            console.log('[AnnouncementComponent] 🔄 공지사항 오디오 다시 재생 시도');
            this.playMainAudio(onEnded);
        };
    }
    
    /**
     * 오디오 URL 없을 때 안내
     */
    _showNoAudioNotice() {
        const container = document.getElementById('announcementIntroImage');
        if (!container) return;
        
        const notice = document.createElement('div');
        notice.style.cssText = `text-align: center; padding: 12px; margin-top: 12px; background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; color: #92400e; font-weight: 600;`;
        notice.textContent = '오디오가 없습니다. 문제 화면으로 이동합니다.';
        container.appendChild(notice);
    }
    
    /**
     * 문제 화면 표시
     */
    showQuestions() {
        console.log('[AnnouncementComponent] 문제 화면으로 전환');
        
        this.showingIntro = false;
        
        document.getElementById('announcementIntroScreen').style.display = 'none';
        document.getElementById('announcementQuestionScreen').style.display = 'block';
        
        // 진행률/타이머/Next버튼 표시
        document.getElementById('announcementProgress').style.display = 'inline-block';
        document.getElementById('announcementTimer').style.display = 'inline-block';
        const annTimerWrap = document.getElementById('announcementTimerWrap');
        if (annTimerWrap) annTimerWrap.style.display = '';
        const annNextBtn = document.getElementById('announcementNextBtn');
        if (annNextBtn) annNextBtn.style.display = '';
        
        // 첫 번째 문제 로드
        this.loadQuestion(0);
        
        // 타이머 시작 요청
        if (this.onTimerStart) {
            this.onTimerStart();
        }
    }
    
    /**
     * 문제 로드
     */
    loadQuestion(questionIndex) {
        console.log(`[AnnouncementComponent] 문제 ${questionIndex + 1} 로드`);
        
        this._questionTimedOut = false;
        const oldNotice = document.getElementById('announcementTimeoutNotice');
        if (oldNotice) oldNotice.remove();
        
        this.currentQuestion = questionIndex;
        const question = this.setData.questions[questionIndex];
        
        // 작은 이미지 표시
        this.renderSmallImage();
        
        // 질문 + 선택지 표시
        this.renderQuestion(question);

        // 타이머 시작 요청 (문제 표시 = 답 고를 수 있는 상태)
        if (this.onTimerStart) {
            this.onTimerStart();
        }
    }
    
    /**
     * 작은 이미지 렌더링
     */
    renderSmallImage() {
        const smallImageDiv = document.getElementById('announcementSmallImage');
        if (smallImageDiv && this.currentImage) {
            smallImageDiv.innerHTML = `
                <img src="${this.currentImage}" alt="Announcement" 
                     style="width: 100%; height: auto; object-fit: cover; border-radius: 12px; display: block;">
            `;
        }
    }
    
    /**
     * 질문 + 선택지 렌더링
     */
    renderQuestion(question) {
        console.log('[AnnouncementComponent] 질문 렌더링');
        
        const container = document.getElementById('announcementQuestionContent');
        if (!container) return;
        
        const questionKey = `${this.setData.setId}_q${this.currentQuestion + 1}`;
        const savedAnswer = this.answers[questionKey];
        
        const self = this;
        const optionsDiv = document.createElement('div');
        optionsDiv.className = 'conver-options';
        question.options.forEach((option, index) => {
            const optionDiv = document.createElement('div');
            optionDiv.className = 'response-option' + (savedAnswer === (index + 1) ? ' selected' : '');
            optionDiv.textContent = option;
            optionDiv.onclick = () => self.selectOption(index + 1);
            optionsDiv.appendChild(optionDiv);
        });
        
        container.innerHTML = `<h3 class="conver-question">${question.questionText}</h3>`;
        container.appendChild(optionsDiv);
    }
    
    /**
     * 선택지 선택
     */
    selectOption(optionIndex) {
        if (this._questionTimedOut) {
            console.log('[AnnouncementComponent] ⏰ 시간 초과 - 선택 무시');
            return;
        }
        
        console.log(`[AnnouncementComponent] 선택지 ${optionIndex} 선택됨`);
        
        const questionKey = `${this.setData.setId}_q${this.currentQuestion + 1}`;
        this.answers[questionKey] = optionIndex;
        
        const allOptions = document.querySelectorAll('#announcementQuestionContent .response-option');
        allOptions.forEach(opt => opt.classList.remove('selected'));
        
        if (allOptions[optionIndex - 1]) {
            allOptions[optionIndex - 1].classList.add('selected');
        }
    }
    
    /**
     * 타임아웃 시 보기 선택 막기
     */
    onQuestionTimeout() {
        console.log('[AnnouncementComponent] ⏰ 시간 초과 - 보기 선택 차단');
        this._questionTimedOut = true;
        
        document.querySelectorAll('#announcementQuestionContent .response-option').forEach(el => {
            el.style.pointerEvents = 'none';
            el.style.opacity = '0.5';
        });
        
        const container = document.getElementById('announcementQuestionContent');
        if (container) {
            const notice = document.createElement('div');
            notice.id = 'announcementTimeoutNotice';
            notice.style.cssText = `text-align: center; padding: 12px; margin-top: 12px; background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; color: #92400e; font-weight: 600;`;
            notice.textContent = '⏰ 시간이 초과되었습니다. Next 버튼을 눌러주세요.';
            container.appendChild(notice);
        }
    }
    
    /**
     * 다음 문제로 이동
     */
    nextQuestion() {
        if (this.currentQuestion < this.setData.questions.length - 1) {
            this.loadQuestion(this.currentQuestion + 1);
            return true;
        }
        console.log('[AnnouncementComponent] 마지막 문제입니다');
        return false;
    }
    
    /**
     * 제출 & 채점
     */
    submit() {
        console.log('[AnnouncementComponent] 제출 시작');
        
        const results = [];
        let totalCorrect = 0;
        let totalIncorrect = 0;
        
        this.setData.questions.forEach((question, index) => {
            const questionKey = `${this.setData.setId}_q${index + 1}`;
            const userAnswer = this.answers[questionKey];
            const correctAnswer = question.correctAnswer;
            const isCorrect = userAnswer === correctAnswer;
            
            if (isCorrect) totalCorrect++;
            else totalIncorrect++;
            
            results.push({
                questionIndex: index,
                questionText: question.questionText,
                questionTrans: question.questionTrans || '',
                userAnswer: userAnswer,
                correctAnswer: correctAnswer,
                isCorrect: isCorrect,
                options: question.options,
                optionTranslations: question.optionTranslations,
                optionExplanations: question.optionExplanations
            });
        });
        
        const resultData = {
            setId: this.setData.setId,
            gender: this.setData.gender,
            imageUrl: this.currentImage,
            audioUrl: this.setData.audioUrl,
            narrationUrl: this.setData.narrationUrl,
            script: this.setData.script,
            scriptTrans: this.setData.scriptTrans || '',
            scriptHighlights: this.setData.scriptHighlights || '',
            totalCorrect: totalCorrect,
            totalIncorrect: totalIncorrect,
            totalQuestions: this.setData.questions.length,
            score: Math.round((totalCorrect / this.setData.questions.length) * 100),
            answers: results
        };
        
        console.log('[AnnouncementComponent] 채점 완료:', resultData);
        
        if (this.onComplete) {
            this.onComplete(resultData);
        }
    }
    
    /**
     * Cleanup
     */
    cleanup() {
        console.log('[AnnouncementComponent] Cleanup 시작');
        
        this._destroyed = true;
        
        if (this.audioPlayer) {
            this.audioPlayer.onended = null;
            this.audioPlayer.onerror = null;
            this.audioPlayer.pause();
            this.audioPlayer = null;
        }
        
        this.isAudioPlaying = false;
        this._questionTimedOut = false;
        this.showingIntro = true;
        this.currentImage = null;
        this.answers = {};
        
        console.log('[AnnouncementComponent] Cleanup 완료');
    }
}

// 전역 스코프에 노출
window.AnnouncementComponent = AnnouncementComponent;
console.log('[AnnouncementComponent] 클래스 정의 완료');
