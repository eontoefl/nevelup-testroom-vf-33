/**
 * lecture-component.js
 * 리스닝 - 렉쳐 듣고 문제 풀기 컴포넌트
 * 
 * 공지사항과 유사하지만 차이점:
 * - 문제 개수: 4개 (공지사항 2개)
 * - 타이머: 30초 (공지사항 20초)
 * - lectureTitle 필드 추가 (인트로 상단 표시)
 * 
 * 의존성: lecture-loader.js (loadLectureData)
 */

class LectureComponent {
    constructor(setNumber, config = {}) {
        console.log(`[LectureComponent] 생성 - setNumber: ${setNumber}`);
        
        this.setNumber = setNumber;
        this.onComplete = config.onComplete || null;
        this.onError = config.onError || null;
        this.onTimerStart = config.onTimerStart || null;
        
        // 내부 상태
        this.currentQuestion = 0;
        this.answers = {};
        this.showingIntro = true;
        this.data = null;
        this.currentSetData = null;
        this.currentImage = null;
        
        // 오디오 플레이어
        this.audioPlayer = null;
        this.isAudioPlaying = false;
        this._destroyed = false;
        this._questionTimedOut = false;
        
        // 성별별 교수 이미지
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
        console.log('[LectureComponent] 초기화 시작');
        
        try {
            // 1. 데이터 로드 (외부 로더 사용)
            this.data = await loadLectureData();
            
            if (!this.data || !this.data.sets || this.data.sets.length === 0) {
                throw new Error('데이터를 불러올 수 없습니다');
            }
            
            // 2. 세트 찾기
            let setId;
            if (typeof this.setNumber === 'string' && this.setNumber.includes('_set_')) {
                setId = this.setNumber;
            } else {
                setId = `lecture_set_${String(this.setNumber).padStart(4, '0')}`;
            }
            console.log(`[LectureComponent] 세트 검색 - ID: ${setId}`);
            
            const setIndex = this.findSetIndex(setId);
            if (setIndex === -1) {
                throw new Error(`세트를 찾을 수 없습니다: ${setId}`);
            }
            
            this.currentSetData = this.data.sets[setIndex];
            console.log('[LectureComponent] 세트 데이터 로드 완료:', this.currentSetData);
            
            // 3. 인트로 화면 표시
            this.showIntro();
            
        } catch (error) {
            console.error('[LectureComponent] 초기화 실패:', error);
            alert('렉쳐 듣기 데이터를 불러오는데 실패했습니다.');
        }
    }
    
    /**
     * 세트 인덱스 찾기
     */
    findSetIndex(setId) {
        let targetSetId;
        if (typeof setId === 'string' && setId.includes('_set_')) {
            targetSetId = setId;
        } else {
            targetSetId = `lecture_set_${String(setId).padStart(4, '0')}`;
        }
        
        console.log(`[LectureComponent] 세트 검색 - ID: ${targetSetId}`);
        
        const index = this.data.sets.findIndex(set => set.setId === targetSetId);
        console.log(`[LectureComponent] 세트 인덱스: ${index}`);
        return index;
    }
    
    /**
     * 인트로 화면 표시
     */
    showIntro() {
        console.log('[LectureComponent] 인트로 화면 표시');
        
        this.showingIntro = true;
        
        // 성별에 따라 교수 이미지 선택
        const gender = this.currentSetData.gender.toLowerCase().trim();
        const isFemale = gender === 'female' || gender === 'f';
        const images = isFemale ? this.FEMALE_IMAGES : this.MALE_IMAGES;
        const lastKey = isFemale ? '_lastFemaleImage' : '_lastMaleImage';
        if (!LectureComponent[lastKey]) LectureComponent[lastKey] = null;
        const last = LectureComponent[lastKey];
        const candidates = (last && images.length > 1) ? images.filter(img => img !== last) : images;
        this.currentImage = candidates[Math.floor(Math.random() * candidates.length)];
        LectureComponent[lastKey] = this.currentImage;
        
        // 인트로 타이틀 표시
        const titleElement = document.getElementById('lectureIntroTitle');
        if (titleElement) {
            titleElement.textContent = this.currentSetData.lectureTitle || 'Listen to a lecture.';
        }
        
        // 인트로 화면에 이미지 표시
        const introImageDiv = document.getElementById('lectureIntroImage');
        if (introImageDiv) {
            introImageDiv.innerHTML = `
                <img src="${this.currentImage}" alt="Lecture professor" 
                     style="width: 100%; max-width: 450px; height: auto; border-radius: 16px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); object-fit: cover;"
                     onerror="console.error('❌ 렉쳐 이미지 로드 실패:', this.src);"
                     onload="console.log('✅ 렉쳐 이미지 로드 성공:', this.src);">
            `;
        }
        
        // 인트로 화면 표시
        document.getElementById('lectureIntroScreen').style.display = 'block';
        document.getElementById('lectureQuestionScreen').style.display = 'none';
        
        // 진행률/타이머/Next버튼 숨김
        document.getElementById('lectureProgress').style.display = 'none';
        document.getElementById('lectureTimer').style.display = 'none';
        const lecTimerWrap = document.getElementById('lectureTimerWrap');
        if (lecTimerWrap) lecTimerWrap.style.display = 'none';
        const lecNextBtn = document.getElementById('lectureNextBtn');
        if (lecNextBtn) lecNextBtn.style.display = 'none';
        const lecSubmitBtn = document.getElementById('lectureSubmitBtn');
        if (lecSubmitBtn) lecSubmitBtn.style.display = 'none';
        
        // [듣기 시작] 버튼 표시
        this._showPlayButton();
    }
    
    /**
     * [듣기 시작] 버튼 표시
     */
    _showPlayButton() {
        const introScreen = document.getElementById('lectureIntroScreen');
        const introImage = document.getElementById('lectureIntroImage');
        if (!introScreen || !introImage) return;

        const existing = introScreen.querySelector('.listen-start-btn');
        if (existing) existing.remove();

        const btn = document.createElement('button');
        btn.className = 'listen-start-btn';
        btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="vertical-align:middle;margin-right:10px;"><path d="M3 9v6h4l5 5V4L7 9H3z" fill="white"/><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" fill="white"/><path d="M19 12c0-3.17-1.82-5.9-4.5-7.22v2.16A5.98 5.98 0 0 1 18 12c0 2.48-1.35 4.64-3.5 5.06v2.16C17.18 17.9 19 15.17 19 12z" fill="white" opacity="0.7"/></svg>듣기 시작';
        btn.onclick = () => this._onPlayButtonClick();

        introScreen.insertBefore(btn, introImage);
    }

    /**
     * 듣기 시작 버튼 클릭
     */
    _onPlayButtonClick() {
        const btn = document.querySelector('#lectureIntroScreen .listen-start-btn');
        if (btn) btn.remove();
        console.log('[LectureComponent] 듣기 시작 버튼 클릭됨');
        this.playAudioSequence();
    }

    /**
     * 오디오 시퀀스 재생
     */
    playAudioSequence() {
        console.log('[LectureComponent] 오디오 시퀀스 시작');
        
        const narrationUrl = this.currentSetData.narrationUrl;
        
        if (!narrationUrl || narrationUrl.trim() === '') {
            console.log('[LectureComponent] 나레이션 없음, 렉처 오디오만 재생');
            this.playMainAudio(() => {
                if (this._destroyed) return;
                this.showQuestions();
            });
            return;
        }
        
        this.playNarration(() => {
            if (this._destroyed) return;
            this.playMainAudio(() => {
                if (this._destroyed) return;
                this.showQuestions();
            });
        });
    }
    
    /**
     * 나레이션 재생
     */
    playNarration(onEnded) {
        const narrationUrl = this.currentSetData.narrationUrl;
        
        if (!narrationUrl) {
            if (onEnded) onEnded();
            return;
        }
        
        this.audioPlayer = new Audio(narrationUrl);
        let _callbackFired = false;
        
        const fireCallback = (source) => {
            if (_callbackFired) return;
            _callbackFired = true;
            if (this._destroyed) return;
            if (onEnded) onEnded();
        };
        
        this.audioPlayer.onended = () => { fireCallback('ended'); };
        this.audioPlayer.onerror = (e) => { fireCallback('error'); };
        this.audioPlayer.play().catch(err => { fireCallback('catch'); });
    }
    
    /**
     * 렉처 오디오 재생
     */
    playMainAudio(onEnded) {
        const audioUrl = this.currentSetData.audioUrl;
        
        if (!audioUrl || audioUrl.trim() === '') {
            this._showNoAudioNotice();
            if (onEnded) onEnded();
            return;
        }
        
        if (this.audioPlayer) {
            this.audioPlayer.onended = null;
            this.audioPlayer.onerror = null;
            this.audioPlayer.pause();
        }
        
        this.audioPlayer = new Audio(audioUrl);
        this.isAudioPlaying = true;
        let _callbackFired = false;
        
        const fireCallback = (source) => {
            if (_callbackFired) return;
            _callbackFired = true;
            this.isAudioPlaying = false;
            if (this._destroyed) return;
            if (onEnded) onEnded();
        };
        
        this.audioPlayer.onended = () => { fireCallback('ended'); };
        this.audioPlayer.onerror = (e) => {
            this.isAudioPlaying = false;
            this._showAudioRetryUI(audioUrl, onEnded);
        };
        this.audioPlayer.play().catch(err => {
            this.isAudioPlaying = false;
            this._showAudioRetryUI(audioUrl, onEnded);
        });
    }

    /**
     * 오디오 재시도 UI
     */
    _showAudioRetryUI(audioUrl, onEnded) {
        const introImage = document.getElementById('lectureIntroImage');
        if (!introImage) return;
        if (introImage.querySelector('.audio-retry-panel')) return;

        const panel = document.createElement('div');
        panel.className = 'audio-retry-panel';
        panel.style.cssText = 'margin-top:16px;padding:16px;background:#FFF3F3;border:2px solid #E74C3C;border-radius:12px;text-align:center;';
        panel.innerHTML = `
            <p style="color:#E74C3C;font-weight:600;margin-bottom:12px;">⚠️ 오디오 로드에 실패했습니다</p>
            <button style="padding:10px 28px;font-size:16px;font-weight:600;color:#fff;background:#E74C3C;border:none;border-radius:8px;cursor:pointer;">🔄 다시 재생</button>
        `;
        panel.querySelector('button').onclick = () => {
            panel.remove();
            this.playMainAudio(onEnded);
        };
        introImage.appendChild(panel);
    }

    /**
     * 오디오 없음 안내
     */
    _showNoAudioNotice() {
        const introImage = document.getElementById('lectureIntroImage');
        if (!introImage) return;

        const notice = document.createElement('div');
        notice.style.cssText = 'margin-top:16px;padding:12px 20px;background:#FFF8E1;border:2px solid #F9A825;border-radius:10px;text-align:center;color:#F57F17;font-weight:600;';
        notice.textContent = '⚠️ 오디오가 없습니다. 문제 화면으로 전환합니다.';
        introImage.appendChild(notice);
    }
    
    /**
     * 문제 화면 표시
     */
    showQuestions() {
        console.log('[LectureComponent] 문제 화면으로 전환');
        
        this.showingIntro = false;
        
        document.getElementById('lectureIntroScreen').style.display = 'none';
        document.getElementById('lectureQuestionScreen').style.display = 'block';
        
        // 진행률/타이머/Next버튼 표시
        document.getElementById('lectureProgress').style.display = 'inline-block';
        document.getElementById('lectureTimer').style.display = 'inline-block';
        const lecTimerWrap = document.getElementById('lectureTimerWrap');
        if (lecTimerWrap) lecTimerWrap.style.display = '';
        const lecNextBtn = document.getElementById('lectureNextBtn');
        if (lecNextBtn) lecNextBtn.style.display = '';
        
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
        console.log(`[LectureComponent] 문제 ${questionIndex + 1} 로드`);
        
        this.currentQuestion = questionIndex;
        const question = this.currentSetData.questions[questionIndex];
        
        this._questionTimedOut = false;
        const oldNotice = document.querySelector('#lectureQuestionContent .timeout-notice');
        if (oldNotice) oldNotice.remove();
        
        // 작은 이미지 표시
        this.renderSmallImage();
        
        // 질문 및 선택지 표시
        const questionContentDiv = document.getElementById('lectureQuestionContent');
        if (!questionContentDiv) return;
        
        questionContentDiv.innerHTML = '';
        
        const questionKey = `${this.currentSetData.setId}_q${questionIndex + 1}`;
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
        
        questionContentDiv.innerHTML = `<h3 class="conver-question">${question.questionText}</h3>`;
        questionContentDiv.appendChild(optionsDiv);

        // 타이머 시작 요청 (문제 표시 = 답 고를 수 있는 상태)
        if (this.onTimerStart) {
            this.onTimerStart();
        }
    }

    /**
     * 타임아웃 처리
     */
    onQuestionTimeout() {
        this._questionTimedOut = true;
        console.log('[LectureComponent] ⏰ 시간 초과 - 보기 차단');

        const options = document.querySelectorAll('#lectureQuestionContent .response-option');
        options.forEach(opt => {
            opt.style.pointerEvents = 'none';
            opt.style.opacity = '0.5';
        });

        const container = document.getElementById('lectureQuestionContent');
        if (container && !container.querySelector('.timeout-notice')) {
            const notice = document.createElement('div');
            notice.className = 'timeout-notice';
            notice.style.cssText = 'margin-top:16px;padding:14px 20px;background:linear-gradient(135deg,#FFF3E0,#FFE0B2);border:2px solid #FF9800;border-radius:12px;text-align:center;font-weight:700;color:#E65100;font-size:16px;';
            notice.textContent = '⏰ 시간이 초과되었습니다. Next 버튼을 눌러주세요.';
            container.appendChild(notice);
        }
    }
    
    /**
     * 작은 이미지 렌더링
     */
    renderSmallImage() {
        const smallImageDiv = document.getElementById('lectureSmallImage');
        if (smallImageDiv && this.currentImage) {
            smallImageDiv.innerHTML = `<img src="${this.currentImage}" alt="Lecture professor" style="width: 100%; height: 100%; object-fit: cover; border-radius: 12px;">`;
        }
    }
    
    /**
     * 선택지 선택
     */
    selectOption(optionIndex) {
        if (this._questionTimedOut) return;
        
        console.log(`[LectureComponent] 선택 - Q${this.currentQuestion + 1}: ${optionIndex}`);
        
        const questionKey = `${this.currentSetData.setId}_q${this.currentQuestion + 1}`;
        this.answers[questionKey] = optionIndex;
        
        const allOptions = document.querySelectorAll('#lectureQuestionContent .response-option');
        allOptions.forEach(opt => opt.classList.remove('selected'));
        
        if (allOptions[optionIndex - 1]) {
            allOptions[optionIndex - 1].classList.add('selected');
        }
    }
    
    /**
     * 다음 문제로 이동
     */
    nextQuestion() {
        if (this.currentQuestion < this.currentSetData.questions.length - 1) {
            this.loadQuestion(this.currentQuestion + 1);
            return true;
        }
        return false;
    }
    
    /**
     * 제출 & 채점
     */
    submit() {
        console.log('[LectureComponent] 제출 시작');
        
        const results = [];
        let totalCorrect = 0;
        let totalIncorrect = 0;
        
        this.currentSetData.questions.forEach((question, index) => {
            const questionKey = `${this.currentSetData.setId}_q${index + 1}`;
            const userAnswer = this.answers[questionKey];
            const correctAnswer = question.correctAnswer;
            const isCorrect = userAnswer === correctAnswer;
            
            if (isCorrect) totalCorrect++;
            else totalIncorrect++;
            
            results.push({
                questionIndex: index,
                questionText: question.questionText,
                questionTrans: question.questionTrans,
                userAnswer: userAnswer,
                correctAnswer: correctAnswer,
                isCorrect: isCorrect,
                options: question.options,
                translations: question.translations,
                explanations: question.explanations
            });
        });
        
        const resultData = {
            setId: this.currentSetData.setId,
            gender: this.currentSetData.gender,
            lectureTitle: this.currentSetData.lectureTitle,
            imageUrl: this.currentImage,
            audioUrl: this.currentSetData.audioUrl,
            narrationUrl: this.currentSetData.narrationUrl,
            script: this.currentSetData.script,
            scriptTrans: this.currentSetData.scriptTrans,
            scriptHighlights: this.currentSetData.scriptHighlights,
            totalCorrect: totalCorrect,
            totalIncorrect: totalIncorrect,
            totalQuestions: this.currentSetData.questions.length,
            score: Math.round((totalCorrect / this.currentSetData.questions.length) * 100),
            answers: results
        };
        
        console.log('[LectureComponent] 채점 완료:', resultData);
        
        if (this.onComplete) {
            this.onComplete(resultData);
        }
    }
    
    /**
     * Cleanup
     */
    cleanup() {
        console.log('[LectureComponent] Cleanup 시작');
        
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
        
        console.log('[LectureComponent] Cleanup 완료');
    }
}

// 전역 스코프에 노출
window.LectureComponent = LectureComponent;
console.log('[LectureComponent] 클래스 정의 완료');
