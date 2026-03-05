/**
 * ================================================
 * module-controller-v2.js
 * 모듈 실행 컨트롤러 (V2 — 불필요 코드 제거)
 * ================================================
 * 
 * 역할:
 * - 모듈 내 컴포넌트 순차 실행
 * - 전체 진행률 관리 (Question X of Y)
 * - Reading 모듈 전용 20분 타이머
 * - 모든 컴포넌트 완료 시 결과 전달
 * 
 * 사용법:
 * const controller = new ModuleController(moduleConfig);
 * controller.startModule();
 */

class ModuleController {
    constructor(moduleConfig) {
        console.log('📦 ModuleController 초기화:', moduleConfig.moduleName);
        console.log('  총 문제 수:', moduleConfig.totalQuestions);
        console.log('  컴포넌트:', moduleConfig.components);
        
        // 문제 수 합계 검증
        let calculatedTotal = 0;
        moduleConfig.components.forEach(comp => {
            calculatedTotal += comp.questionsPerSet;
            console.log(`  - ${comp.type} Set ${comp.setId}: ${comp.questionsPerSet}문제`);
        });
        console.log('  계산된 총 문제 수:', calculatedTotal);
        
        if (calculatedTotal !== moduleConfig.totalQuestions) {
            console.error(`❌ 문제 수 불일치! 설정: ${moduleConfig.totalQuestions}, 계산: ${calculatedTotal}`);
        }
        
        // 모듈 설정
        this.config = moduleConfig;
        
        // 진행 상태
        this.currentComponentIndex = 0;
        this.currentQuestionNumber = 0; // 전체 문제 번호 (1부터 시작)
        
        // 답변 저장
        this.allAnswers = [];
        this.componentResults = []; // 각 컴포넌트별 결과
        
        // 타이머
        this.startTime = null;
        this.moduleTimer = null;
        this.moduleTimeRemaining = null;
        this.questionTimer = null;          // 문제별 타이머 (Listening용)
        this.questionTimeRemaining = null;  // 남은 시간 (초)
        
        // 컴포넌트 인스턴스
        this.currentComponentInstance = null;
        
        // 완료 콜백
        this.onModuleCompleteCallback = null;
    }
    
    /**
     * ================================================
     * 모듈 시작
     * ================================================
     */
    startModule() {
        console.log('🚀 모듈 시작:', this.config.moduleName);
        
        this.startTime = Date.now();
        
        // 모듈 모드 플래그 설정
        window.isModuleMode = true;
        window.moduleController = this;
        
        // 브라우저 이탈 경고 활성화
        window._beforeUnloadHandler = (e) => {
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', window._beforeUnloadHandler);
        
        // Reading 모듈인 경우 20분 타이머 시작
        if (this.config.sectionType === 'reading' && this.config.timeLimit) {
            this.startModuleTimer();
        }
        
        // 첫 번째 컴포넌트 로드
        this.loadNextComponent();
    }
    
    /**
     * ================================================
     * Reading 모듈 타이머 (20분)
     * ================================================
     */
    startModuleTimer() {
        this.moduleTimeRemaining = this.config.timeLimit;
        
        console.log(`⏱️ 모듈 타이머 시작: ${this.config.timeLimit}초 (${this.config.timeLimit / 60}분)`);
        
        // 타이머 UI 표시
        this.updateModuleTimerDisplay();
        
        this.moduleTimer = setInterval(() => {
            this.moduleTimeRemaining--;
            this.updateModuleTimerDisplay();
            
            if (this.moduleTimeRemaining <= 0) {
                console.warn('⏰ 모듈 타이머 종료! 자동 제출');
                this.stopModuleTimer();
                this.handleModuleTimeout();
            }
        }, 1000);
    }
    
    stopModuleTimer() {
        if (this.moduleTimer) {
            clearInterval(this.moduleTimer);
            this.moduleTimer = null;
        }
    }
    
    updateModuleTimerDisplay() {
        const minutes = Math.floor(this.moduleTimeRemaining / 60);
        const seconds = this.moduleTimeRemaining % 60;
        const timeText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        // 모든 가능한 타이머 요소 업데이트
        const timerElements = [
            'module-timer-display',  // 테스트 화면
            'readingTimer',          // Reading Section
            'fillBlanksTimer',       // Fill in the Blanks
            'daily1Timer',           // Daily1
            'daily2Timer',           // Daily2
            'academicTimer'          // Academic
        ];
        
        timerElements.forEach(elementId => {
            const element = document.getElementById(elementId);
            if (element) {
                element.textContent = timeText;
                
                // 5분 이하일 때 경고 표시
                if (this.moduleTimeRemaining <= 300) {
                    element.style.color = '#ff4444';
                }
            }
        });
    }
    
    handleModuleTimeout() {
        // 현재 컴포넌트 중단
        if (this.currentComponentInstance && this.currentComponentInstance.cleanup) {
            this.currentComponentInstance.cleanup();
        }
        
        // 현재까지의 답변으로 자동 제출
        this.completeModule(true); // timeout flag
    }
    
    /**
     * ================================================
     * 문제별 타이머 (Listening용)
     * ================================================
     * @param {number} seconds - 타이머 시간 (초)
     */
    startQuestionTimer(seconds) {
        if (typeof seconds !== 'number' || seconds <= 0) {
            console.error('❌ [타이머] 잘못된 시간 값:', seconds);
            return;
        }
        console.log(`⏰ 문제별 타이머 시작: ${seconds}초`);
        
        // 기존 타이머 정리
        if (this.questionTimer) {
            clearInterval(this.questionTimer);
        }
        
        this.questionTimeRemaining = seconds;
        this.updateQuestionTimerDisplay();
        
        this.questionTimer = setInterval(() => {
            this.questionTimeRemaining--;
            this.updateQuestionTimerDisplay();
            
            if (this.questionTimeRemaining <= 0) {
                clearInterval(this.questionTimer);
                this.handleQuestionTimeout();
            }
        }, 1000);
    }
    
    updateQuestionTimerDisplay() {
        if (this.questionTimeRemaining === null || this.questionTimeRemaining === undefined) {
            console.error('❌ [타이머] questionTimeRemaining이 정의되지 않음');
            return false;
        }
        
        const seconds = this.questionTimeRemaining;
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        const timeText = `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        
        // Listening 타이머 요소들 업데이트
        const timerElements = [
            'responseTimer',
            'converTimer',
            'announcementTimer',
            'lectureTimer'
        ];
        
        let updated = false;
        timerElements.forEach(elementId => {
            const element = document.getElementById(elementId);
            if (element) {
                element.textContent = timeText;
                updated = true;
                
                // 5초 이하일 때 경고 표시
                if (seconds <= 5) {
                    element.style.color = '#ff4444';
                } else {
                    element.style.color = '';
                }
            }
        });
        
        return updated;
    }
    
    handleQuestionTimeout() {
        console.log('⏰ [타이머] 시간 초과 (0초 도달) - 보기 선택 막기');
        
        // 타이머 정리
        if (this.questionTimer) {
            clearInterval(this.questionTimer);
            this.questionTimer = null;
            console.log('✅ [타이머] 정리 완료');
        }
        
        // v007: 자동 넘김/자동 제출 대신 보기 선택만 막기
        const componentInstance = this.getCurrentComponentInstance();
        
        if (!componentInstance) {
            console.error('❌ [타임아웃] 컴포넌트 인스턴스를 찾을 수 없음');
            return;
        }
        
        // 컴포넌트에 타임아웃 상태 전달 (보기 막기용)
        if (typeof componentInstance.onQuestionTimeout === 'function') {
            componentInstance.onQuestionTimeout();
        } else {
            // onQuestionTimeout이 없는 컴포넌트는 직접 보기 막기
            this._disableOptions();
        }
        
        console.log('🚫 [타임아웃] 보기 선택 차단됨 - Next 버튼으로 다음 문제 이동 가능');
    }
    
    /**
     * v007: 보기 선택지 비활성화 (타임아웃 시)
     */
    _disableOptions() {
        const optionSelectors = [
            '.response-option',
            '.conver-option',
            '.announcement-option',
            '.lecture-option'
        ];
        optionSelectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
                el.style.pointerEvents = 'none';
                el.style.opacity = '0.5';
            });
        });
    }
    
    /**
     * 현재 실행 중인 컴포넌트 인스턴스 반환
     * @returns {Object|null} 컴포넌트 인스턴스 또는 null
     */
    getCurrentComponentInstance() {
        const component = this.config.components[this.currentComponentIndex];
        if (!component) return null;
        
        // 컴포넌트 타입별로 전역 인스턴스 반환
        switch (component.type) {
            case 'fillblanks':
                return window.currentFillBlanksComponent;
            case 'daily1':
                return window.currentDaily1Component;
            case 'daily2':
                return window.currentDaily2Component;
            case 'academic':
                return window.currentAcademicComponent;
            case 'response':
                return window.currentResponseComponent;
            case 'conver':
                return window.currentConverComponent;
            case 'announcement':
                return window.currentAnnouncementComponent;
            case 'lecture':
                return window.currentLectureComponent;
            case 'arrange':
                return window.currentArrangeComponent;
            case 'email':
                return window.currentEmailComponent;
            case 'discussion':
                return window.currentDiscussionComponent;
            default:
                console.warn('⚠️ [컴포넌트] 알 수 없는 타입:', component.type);
                return null;
        }
    }
    
    /**
     * 타이머 정지 (오디오 재생 중)
     */
    stopQuestionTimer() {
        if (this.questionTimer) {
            console.log('⏸️ [타이머] 정지 - 현재 시간:', this.questionTimeRemaining);
            clearInterval(this.questionTimer);
            this.questionTimer = null;
        } else {
            console.log('⏸️ [타이머] 이미 정지됨');
        }
    }
    
    /**
     * 타이머 표시만 초기화 (오디오 재생 중)
     */
    resetQuestionTimerDisplay() {
        console.log('🔄 [타이머] 표시 리셋 → 00:20');
        this.questionTimeRemaining = 20;
        const success = this.updateQuestionTimerDisplay();
        if (!success) {
            console.warn('⚠️ [타이머] 표시 업데이트 실패 - HTML 요소 없음');
        }
    }
    
    /**
     * ================================================
     * 헤더 타이틀 업데이트 (Week N - O요일 | 아이콘 유형명)
     * ================================================
     */
    updateHeaderTitle(componentType) {
        // Week/요일 정보 가져오기 (window.currentTest 우선, sessionStorage 폴백)
        const ct = window.currentTest || {};
        const week = ct.currentWeek || 'Week 1';
        const day = ct.currentDay || '일';
        const weekDay = `${week} - ${day}요일`;
        
        // 유형별 Font Awesome 아이콘 + 한글명 매핑
        const typeMap = {
            fillblanks: { icon: 'fas fa-book-open', name: '빈칸채우기' },
            daily1: { icon: 'fas fa-book-open', name: '일상지문 1' },
            daily2: { icon: 'fas fa-book-open', name: '일상지문 2' },
            academic: { icon: 'fas fa-book-open', name: '학술지문' },
            response: { icon: 'fas fa-headphones', name: '응답고르기' },
            conver: { icon: 'fas fa-headphones', name: '대화' },
            announcement: { icon: 'fas fa-headphones', name: '공지사항' },
            lecture: { icon: 'fas fa-headphones', name: '렉쳐' },
            arrange: { icon: 'fas fa-pen', name: '단어배열' },
            email: { icon: 'fas fa-pen', name: '이메일' },
            discussion: { icon: 'fas fa-pen', name: '토론' },
            repeat: { icon: 'fas fa-microphone', name: '따라말하기' },
            interview: { icon: 'fas fa-microphone', name: '인터뷰' }
        };
        
        const typeInfo = typeMap[componentType] || { icon: 'fas fa-book', name: componentType };
        const titleText = `${weekDay} | ${typeInfo.name}`;
        
        // 헤더 타이틀 요소 매핑
        const titleElements = {
            fillblanks: 'fillBlanksHeaderTitle',
            daily1: 'daily1HeaderTitle',
            daily2: 'daily2HeaderTitle',
            academic: 'academicHeaderTitle',
            response: 'responseHeaderTitle',
            conver: 'converHeaderTitle',
            announcement: 'announcementHeaderTitle',
            lecture: 'lectureHeaderTitle',
            repeat: 'repeatHeaderTitle',
            interview: 'interviewHeaderTitle'
        };
        
        const elementId = titleElements[componentType];
        if (elementId) {
            const el = document.getElementById(elementId);
            if (el) {
                el.innerHTML = `<i class="${typeInfo.icon}"></i> ${titleText}`;
                console.log(`📋 헤더 타이틀 업데이트: ${titleText}`);
            }
        }
    }
    
    /**
     * ================================================
     * 진행률 업데이트
     * ================================================
     */
    updateProgress() {
        // 현재까지 완료한 문제 수 계산
        let completedQuestions = 0;
        for (let i = 0; i < this.currentComponentIndex; i++) {
            completedQuestions += this.config.components[i].questionsPerSet;
        }
        
        const currentComponent = this.config.components[this.currentComponentIndex];
        if (!currentComponent) return;
        
        // 현재 진행 중인 컴포넌트의 문제 번호
        const startQuestion = completedQuestions + 1;
        const endQuestion = completedQuestions + currentComponent.questionsPerSet;
        
        // 진행률 텍스트 생성
        // FillBlanks는 범위로, 나머지는 개별 문제로 표시 (기본값)
        let progressText;
        if (currentComponent.type === 'fillblanks') {
            progressText = `Questions ${startQuestion}-${endQuestion} of ${this.config.totalQuestions}`;
        } else {
            // 나머지는 첫 문제 번호로 표시 (컴포넌트에서 개별 업데이트 예정)
            progressText = `Question ${startQuestion} of ${this.config.totalQuestions}`;
        }
        
        console.log(`📊 진행률 업데이트: ${progressText}`);
        
        // 모든 가능한 진행률 요소 업데이트
        const progressElements = [
            'module-progress-text',      // 테스트 화면용
            'readingProgress',            // Reading Section
            'listeningProgress',          // Listening Section
            'fillBlanksProgress',         // Fill in the Blanks
            'daily1Progress',             // Daily1
            'daily2Progress',             // Daily2
            'academicProgress',           // Academic
            'repeatProgress',             // Speaking Repeat
            'interviewProgress'           // Speaking Interview
        ];
        
        progressElements.forEach(elementId => {
            const element = document.getElementById(elementId);
            if (element) {
                element.textContent = progressText;
            }
        });
        
        // ★ fillblanks는 loadQuestion을 호출하지 않으므로 여기서 버튼 상태 설정
        if (currentComponent.type === 'fillblanks') {
            // fillblanks는 세트 전체가 하나의 화면이므로 첫 문제 인덱스 = 0
            this.updateNavigationButtons(currentComponent.type, 0, currentComponent.questionsPerSet);
        }
    }
    
    /**
     * 컴포넌트 내부에서 현재 문제 번호 업데이트
     * @param {number} questionIndexInComponent - 컴포넌트 내 현재 문제 인덱스 (0부터 시작)
     */
    updateCurrentQuestionInComponent(questionIndexInComponent) {
        // 현재까지 완료한 문제 수 계산
        let completedQuestions = 0;
        for (let i = 0; i < this.currentComponentIndex; i++) {
            completedQuestions += this.config.components[i].questionsPerSet;
        }
        
        const currentComponent = this.config.components[this.currentComponentIndex];
        if (!currentComponent) return;
        
        // 전체 모듈 기준 현재 문제 번호
        const currentQuestionNumber = completedQuestions + questionIndexInComponent + 1;
        
        // 진행률 텍스트 생성
        let progressText;
        if (currentComponent.type === 'fillblanks') {
            // FillBlanks는 범위로 표시
            const startQuestion = completedQuestions + 1;
            const endQuestion = completedQuestions + currentComponent.questionsPerSet;
            progressText = `Questions ${startQuestion}-${endQuestion} of ${this.config.totalQuestions}`;
        } else {
            // 나머지는 개별 문제 번호
            progressText = `Question ${currentQuestionNumber} of ${this.config.totalQuestions}`;
        }
        
        console.log(`📊 문제별 진행률 업데이트: ${progressText} (컴포넌트 내 인덱스: ${questionIndexInComponent})`);
        
        // 모든 가능한 진행률 요소 업데이트
        const progressElements = [
            'module-progress-text',
            'readingProgress',
            'listeningProgress',
            'fillBlanksProgress',
            'daily1Progress',
            'daily2Progress',
            'academicProgress',
            'responseProgress',
            'converProgress',
            'announcementProgress',
            'lectureProgress'
        ];
        
        progressElements.forEach(elementId => {
            const element = document.getElementById(elementId);
            if (element) {
                element.textContent = progressText;
            }
        });
        
        // ★ Back/Next/Submit 버튼 상태 업데이트 (모듈 전체 기준)
        this.updateNavigationButtons(currentComponent.type, questionIndexInComponent, currentComponent.questionsPerSet);
    }
    
    /**
     * 모듈 전체 기준 현재 문제 번호 계산
     */
    getGlobalQuestionNumber(questionIndexInComponent) {
        let completedQuestions = 0;
        for (let i = 0; i < this.currentComponentIndex; i++) {
            completedQuestions += this.config.components[i].questionsPerSet;
        }
        return completedQuestions + questionIndexInComponent + 1;
    }
    
    /**
     * 헤더 Back/Next/Submit 버튼 상태 업데이트
     * - Back: Q1에서만 숨김, Q2부터 항상 표시
     * - Next: 마지막 문제(Q35)에서만 숨김
     * - Submit: 마지막 문제(Q35)에서만 표시
     */
    updateNavigationButtons(componentType, questionIndex, totalQuestionsInSet) {
        const globalQuestionNum = this.getGlobalQuestionNumber(questionIndex);
        const totalQuestions = this.config.totalQuestions;
        
        const isFirstGlobal = (globalQuestionNum === 1);
        const isLastGlobal = (globalQuestionNum === totalQuestions);
        
        console.log(`🔘 [Nav] 버튼 업데이트: Q${globalQuestionNum}/${totalQuestions} (${componentType} 내 idx:${questionIndex}) | Back:${!isFirstGlobal} Next:${!isLastGlobal} Submit:${isLastGlobal}`);
        
        // 모든 화면의 버튼을 업데이트 (현재 보이는 화면에만 적용됨)
        const allBtnIds = [
            { prev: 'fillBlanksPrevBtn', next: 'fillBlanksNextBtn', submit: 'fillBlanksSubmitBtn' },
            { prev: 'daily1PrevBtn', next: 'daily1NextBtn', submit: 'daily1SubmitBtn' },
            { prev: 'daily2PrevBtn', next: 'daily2NextBtn', submit: 'daily2SubmitBtn' },
            { prev: 'academicPrevBtn', next: 'academicNextBtn', submit: 'academicSubmitBtn' }
        ];
        
        allBtnIds.forEach(ids => {
            const prevBtn = document.getElementById(ids.prev);
            const nextBtn = document.getElementById(ids.next);
            const submitBtn = document.getElementById(ids.submit);
            
            if (prevBtn) prevBtn.style.display = isFirstGlobal ? 'none' : '';
            if (nextBtn) nextBtn.style.display = isLastGlobal ? 'none' : '';
            if (submitBtn) submitBtn.style.display = isLastGlobal ? '' : 'none';
        });
    }
    
    /**
     * 이전 컴포넌트로 이동 (Back 시 현재 컴포넌트 첫 문제에서 호출)
     * 
     * ★ v5: 리뷰 패널과 동일한 방식으로 통일
     *   - 기록을 자르지 않고, 백업(_answerStore)에서 처음부터 재구성
     *   - 뒤로 갔다가 다시 앞으로 진행해도 중간 기록이 유실되지 않음
     */
    goToPreviousComponent() {
        if (this.currentComponentIndex <= 0) {
            console.log('⚠️ 첫 번째 컴포넌트입니다 - 이전으로 이동 불가');
            return;
        }
        
        const prevIndex = this.currentComponentIndex - 1;
        const prevComponent = this.config.components[prevIndex];
        
        console.log(`⬅️ [Nav] 이전 컴포넌트로 이동: ${prevComponent.type} (Set ${prevComponent.setId})`);
        
        // ★ ReviewPanel과 동일한 방식: 백업에서 처음부터 재구성
        const rp = typeof ReviewPanel !== 'undefined' ? ReviewPanel : null;
        if (rp) {
            // 0. 현재 상태를 백업에 저장
            rp._syncAnswerStore(this);
            
            // 1. 이전 컴포넌트의 답안 추출 (복원용)
            const targetStore = rp._answerStore[prevIndex];
            const savedAnswers = targetStore ? JSON.parse(JSON.stringify(targetStore.answers)) : [];
            console.log(`💾 [Nav] _answerStore에서 답안 가져옴: ${savedAnswers.length}개`);
            
            // 2. componentResults / allAnswers를 처음부터 재구성 (자르지 않음)
            this.componentResults = [];
            this.allAnswers = [];
            
            for (let i = 0; i < prevIndex; i++) {
                const comp = this.config.components[i];
                const store = rp._answerStore[i];
                
                if (store && store.answers && store.answers.length > 0) {
                    this.componentResults.push({
                        componentType: comp.type,
                        setId: comp.setId,
                        answers: JSON.parse(JSON.stringify(store.answers))
                    });
                    this.allAnswers.push(...JSON.parse(JSON.stringify(store.answers)));
                    console.log(`📋 [Nav] comp[${i}] ${comp.type} 복원 완료 - 답안 ${store.answers.length}개`);
                } else {
                    this.componentResults.push({
                        componentType: comp.type,
                        setId: comp.setId,
                        answers: []
                    });
                    console.log(`📋 [Nav] comp[${i}] ${comp.type} 답안 없음 - 빈 결과 삽입`);
                }
            }
            
            console.log(`📋 [Nav] componentResults ${this.componentResults.length}개 복원, allAnswers ${this.allAnswers.length}개 복원`);
            
            // 3. 컴포넌트 인덱스 되돌리기
            this.currentComponentIndex = prevIndex;
            this.currentQuestionNumber = this.allAnswers.length;
            
            // 4. 이전 컴포넌트의 마지막 문제로 로드
            this.loadPreviousComponentAtLastQuestion(prevComponent, savedAnswers);
        } else {
            // ReviewPanel이 없는 경우 (폴백)
            console.warn('⚠️ [Nav] ReviewPanel 없음 - 기본 방식으로 이전 컴포넌트 이동');
            this.currentComponentIndex = prevIndex;
            let answersBeforePrev = 0;
            for (let i = 0; i < prevIndex; i++) {
                answersBeforePrev += this.config.components[i].questionsPerSet;
            }
            this.currentQuestionNumber = answersBeforePrev;
            this.loadPreviousComponentAtLastQuestion(prevComponent, null);
        }
    }
    
    /**
     * 이전 컴포넌트를 마지막 문제에서 시작하도록 로드
     * 
     * ★ v3: ReviewPanel.restoreAnswersToInstance() 사용
     *   - FillBlanks / Daily1 / Daily2 / Academic 모두 동일한 복원 로직
     */
    async loadPreviousComponentAtLastQuestion(prevComponent, backedUpAnswers = null) {
        const { type, setId, questionsPerSet } = prevComponent;
        const lastQuestionIndex = questionsPerSet - 1;
        
        console.log(`📝 이전 컴포넌트 로드 (마지막 문제): ${type} (Set ${setId}), 마지막 문제 인덱스: ${lastQuestionIndex}`);
        
        // 진행률 업데이트
        this.updateProgress();
        
        // 헤더 타이틀 업데이트
        this.updateHeaderTitle(type);
        
        const initOptions = {
            startQuestionNumber: this.currentQuestionNumber + 1,
            totalModuleQuestions: this.config.totalQuestions
        };
        
        // 컴포넌트별 초기화 (await로 데이터 로드 완료 대기)
        switch (type) {
            case 'fillblanks':
                this.currentComponentInstance = window.FillBlanksComponent;
                if (window.initFillBlanksComponent) {
                    await window.initFillBlanksComponent(setId, this.onComponentComplete.bind(this), initOptions);
                }
                this.updateNavigationButtons(type, 0, questionsPerSet);
                break;
            case 'daily1':
                this.currentComponentInstance = window.Daily1Component;
                if (window.initDaily1Component) {
                    await window.initDaily1Component(setId, this.onComponentComplete.bind(this), initOptions);
                }
                break;
            case 'daily2':
                this.currentComponentInstance = window.Daily2Component;
                if (window.initDaily2Component) {
                    await window.initDaily2Component(setId, this.onComponentComplete.bind(this), initOptions);
                }
                break;
            case 'academic':
                this.currentComponentInstance = window.AcademicComponent;
                if (window.initAcademicComponent) {
                    await window.initAcademicComponent(setId, this.onComponentComplete.bind(this), initOptions);
                }
                break;
        }
        
        // ★ 답안 복원: ReviewPanel.restoreAnswersToInstance() 사용
        if (backedUpAnswers && backedUpAnswers.length > 0) {
            const rp = typeof ReviewPanel !== 'undefined' ? ReviewPanel : null;
            if (rp) {
                // 약간의 딜레이로 init 완료 대기
                await new Promise(resolve => setTimeout(resolve, 200));
                rp.restoreAnswersToInstance(type, backedUpAnswers, prevComponent);
                console.log(`✅ [Nav] ${type} 답안 복원 완료 (ReviewPanel.restoreAnswersToInstance 사용)`);
            }
        }
        
        // Daily/Academic: 마지막 문제로 이동
        if (type !== 'fillblanks') {
            const instanceMap = {
                'daily1': window.currentDaily1Component,
                'daily2': window.currentDaily2Component,
                'academic': window.currentAcademicComponent
            };
            const inst = instanceMap[type];
            if (inst && lastQuestionIndex > 0 && typeof inst.loadQuestion === 'function') {
                console.log(`⬅️ ${type} 마지막 문제로 이동: index ${lastQuestionIndex}`);
                inst.loadQuestion(lastQuestionIndex);
            }
        }
        
        // ★ onComponentComplete 패치 (다음 컴포넌트 자동 복원)
        const rp2 = typeof ReviewPanel !== 'undefined' ? ReviewPanel : null;
        if (rp2) {
            rp2._patchOnComponentComplete(this);
        }
    }
    
    /**
     * 모듈 전체 Submit (마지막 문제 Q35에서 호출)
     */
    submitCurrentModule() {
        console.log('📤 [모듈] 전체 Submit 호출 - 현재 컴포넌트 제출 후 모듈 완료');
        
        const currentComponent = this.config.components[this.currentComponentIndex];
        if (!currentComponent) return;
        
        // 현재 컴포넌트 submit (각 어댑터의 전역 submit 함수 호출)
        switch (currentComponent.type) {
            case 'fillblanks':
                if (typeof submitFillBlanks === 'function') submitFillBlanks();
                break;
            case 'daily1':
                if (typeof submitDaily1 === 'function') submitDaily1();
                break;
            case 'daily2':
                if (typeof submitDaily2 === 'function') submitDaily2();
                break;
            case 'academic':
                if (typeof submitAcademic === 'function') submitAcademic();
                break;
        }
    }
    
    /**
     * ================================================
     * 다음 컴포넌트 로드
     * ================================================
     */
    loadNextComponent() {
        if (this.currentComponentIndex >= this.config.components.length) {
            // 모든 컴포넌트 완료
            this.completeModule(false);
            return;
        }
        
        // 🔴 이전 컴포넌트의 문제별 타이머 정리 (다음 컴포넌트 인트로 중 타이머 만료 방지)
        this.stopQuestionTimer();
        
        // 🔴 이전 컴포넌트 오디오 정리 (겹침 방지)
        if (this.currentComponentInstance) {
            // 🚪 문지기: _destroyed 강제 설정 (setTimeout 콜백 차단)
            this.currentComponentInstance._destroyed = true;
            console.log('🚪 [ModuleController] 이전 컴포넌트 _destroyed = true 설정');
            if (this.currentComponentInstance.cleanup) {
                console.log('🧹 [ModuleController] 이전 컴포넌트 cleanup 실행');
                this.currentComponentInstance.cleanup();
            }
        }
        
        // 🔴 전역 안전장치: 페이지 내 모든 audio/video 요소 강제 정지
        this._stopAllMediaElements();
        
        const component = this.config.components[this.currentComponentIndex];
        
        console.log(`📝 컴포넌트 로드 [${this.currentComponentIndex + 1}/${this.config.components.length}]:`, 
                    `${component.type} (Set ${component.setId})`);
        
        // 진행률 업데이트
        this.updateProgress();
        
        // 🛡️ 재시도 로직 포함 컴포넌트 초기화
        this._initComponentWithRetry(component, 0);
    }
    
    /**
     * 🛡️ 컴포넌트 초기화 + 자동 재시도 (1차 풀이용)
     */
    async _initComponentWithRetry(component, attempt) {
        const MAX_RETRIES = 2;
        
        try {
            if (attempt > 0) {
                console.log(`🔄 [ModuleController] 재시도 ${attempt}/${MAX_RETRIES}: ${component.type}`);
                this._showLoadingSpinner(component.type, attempt);
                await new Promise(r => setTimeout(r, 800));
            }
            
            await this.initComponent(component);
            this._removeLoadingOverlay();
            
        } catch (error) {
            console.error(`❌ [ModuleController] 컴포넌트 초기화 실패 (시도 ${attempt + 1}):`, error);
            
            if (attempt < MAX_RETRIES) {
                await this._initComponentWithRetry(component, attempt + 1);
            } else {
                console.error('❌ [ModuleController] 최종 로드 실패:', error);
                this._showRetryUI(component);
            }
        }
    }
    
    /**
     * 🔄 로딩 스피너 (1차 풀이용)
     */
    _showLoadingSpinner(componentType, attempt) {
        this._removeLoadingOverlay();
        const overlay = document.createElement('div');
        overlay.id = 'moduleLoadingOverlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(255,255,255,0.92);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;';
        overlay.innerHTML = `
            <div style="text-align:center;">
                <div style="width:48px;height:48px;border:4px solid #e2e8f0;border-top:4px solid #4A90D9;border-radius:50%;animation:moduleSpinAnim 0.8s linear infinite;margin:0 auto 16px;"></div>
                <p style="font-size:15px;color:#555;font-weight:600;">문제를 불러오는 중...</p>
                <p style="font-size:13px;color:#999;margin-top:4px;">재시도 ${attempt}/2</p>
            </div>
            <style>@keyframes moduleSpinAnim{to{transform:rotate(360deg)}}</style>
        `;
        document.body.appendChild(overlay);
    }
    
    /**
     * 오버레이 제거
     */
    _removeLoadingOverlay() {
        const el = document.getElementById('moduleLoadingOverlay');
        if (el) el.remove();
        const el2 = document.getElementById('moduleRetryOverlay');
        if (el2) el2.remove();
    }
    
    /**
     * ❌ 재시도 UI (1차 풀이용)
     */
    _showRetryUI(component) {
        this._removeLoadingOverlay();
        const overlay = document.createElement('div');
        overlay.id = 'moduleRetryOverlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(255,255,255,0.95);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;';
        overlay.innerHTML = `
            <div style="text-align:center;max-width:360px;padding:32px;">
                <div style="width:56px;height:56px;background:#FEF2F2;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
                    <span style="font-size:24px;">⚠️</span>
                </div>
                <h3 style="font-size:18px;font-weight:700;color:#333;margin:0 0 8px;">문제 로딩 실패</h3>
                <p style="font-size:14px;color:#666;line-height:1.5;margin:0 0 24px;">네트워크 문제로 문제를 불러오지 못했습니다.<br>다시 시도해주세요.</p>
                <button id="moduleRetryBtn" style="padding:12px 32px;background:linear-gradient(135deg,#4A90D9,#5B6ABF);color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;transition:all 0.2s;">
                    🔄 다시 시도
                </button>
                <p style="font-size:12px;color:#aaa;margin-top:12px;">${component.type} 컴포넌트</p>
            </div>
        `;
        document.body.appendChild(overlay);
        
        document.getElementById('moduleRetryBtn').addEventListener('click', () => {
            overlay.remove();
            this._initComponentWithRetry(component, 0);
        });
    }
    
    /**
     * ================================================
     * 컴포넌트 초기화
     * ================================================
     */
    async initComponent(component) {
        const { type, setId, questionsPerSet } = component;
        
        console.log(`🎯 컴포넌트 초기화: ${type} (Set ${setId}), 문제 시작: ${this.currentQuestionNumber + 1}`);
        
        // ★ 헤더 타이틀 업데이트
        this.updateHeaderTitle(type);
        
        // 컴포넌트별 초기화 함수 호출 (시작 문제 번호와 총 문제 수 전달)
        const initOptions = {
            startQuestionNumber: this.currentQuestionNumber + 1,
            totalModuleQuestions: this.config.totalQuestions
        };
        
        // 컴포넌트별 초기화 함수 호출 (데이터 로드 완료까지 대기)
        switch (type) {
            case 'fillblanks':
                this.currentComponentInstance = window.FillBlanksComponent;
                if (!window.initFillBlanksComponent) throw new Error('initFillBlanksComponent가 로드되지 않았습니다');
                await window.initFillBlanksComponent(setId, this.onComponentComplete.bind(this), initOptions);
                this.updateNavigationButtons(type, 0, questionsPerSet);
                break;
                
            case 'daily1':
                this.currentComponentInstance = window.Daily1Component;
                if (!window.initDaily1Component) throw new Error('initDaily1Component가 로드되지 않았습니다');
                await window.initDaily1Component(setId, this.onComponentComplete.bind(this), initOptions);
                break;
                
            case 'daily2':
                this.currentComponentInstance = window.Daily2Component;
                if (!window.initDaily2Component) throw new Error('initDaily2Component가 로드되지 않았습니다');
                await window.initDaily2Component(setId, this.onComponentComplete.bind(this), initOptions);
                break;
                
            case 'academic':
                this.currentComponentInstance = window.AcademicComponent;
                if (!window.initAcademicComponent) throw new Error('initAcademicComponent가 로드되지 않았습니다');
                await window.initAcademicComponent(setId, this.onComponentComplete.bind(this), initOptions);
                break;
                
            case 'response':
                if (!window.initResponseComponent) throw new Error('initResponseComponent가 로드되지 않았습니다');
                await window.initResponseComponent(setId, this.onComponentComplete.bind(this), initOptions);
                this.currentComponentInstance = window.currentResponseComponent;
                break;
                
            case 'conver':
                if (!window.initConverComponent) throw new Error('initConverComponent가 로드되지 않았습니다');
                await window.initConverComponent(setId, this.onComponentComplete.bind(this), initOptions);
                this.currentComponentInstance = window.currentConverComponent;
                break;
                
            case 'announcement':
                if (!window.initAnnouncementComponent) throw new Error('initAnnouncementComponent가 로드되지 않았습니다');
                await window.initAnnouncementComponent(setId, this.onComponentComplete.bind(this), initOptions);
                this.currentComponentInstance = window.currentAnnouncementComponent;
                break;
                
            case 'lecture':
                if (!window.initLectureComponent) throw new Error('initLectureComponent가 로드되지 않았습니다');
                await window.initLectureComponent(setId, this.onComponentComplete.bind(this), initOptions);
                this.currentComponentInstance = window.currentLectureComponent;
                break;
                
            case 'arrange':
                if (!window.initArrangeComponent) throw new Error('initArrangeComponent가 로드되지 않았습니다');
                await window.initArrangeComponent(setId, this.onComponentComplete.bind(this), initOptions);
                this.currentComponentInstance = window.currentArrangeComponent;
                break;
                
            case 'email':
                if (!window.initEmailComponent) throw new Error('initEmailComponent가 로드되지 않았습니다');
                await window.initEmailComponent(setId, this.onComponentComplete.bind(this), initOptions);
                this.currentComponentInstance = window.currentEmailComponent;
                break;
                
            case 'discussion':
                if (!window.initDiscussionComponent) throw new Error('initDiscussionComponent가 로드되지 않았습니다');
                await window.initDiscussionComponent(setId, this.onComponentComplete.bind(this), initOptions);
                this.currentComponentInstance = window.currentDiscussionComponent;
                break;
                
            case 'repeat':
                if (!window.initRepeatComponent) throw new Error('initRepeatComponent가 로드되지 않았습니다');
                await window.initRepeatComponent(setId, this.onComponentComplete.bind(this), initOptions);
                this.currentComponentInstance = window.currentRepeatComponent;
                break;
                
            case 'interview':
                if (!window.initInterviewComponent) throw new Error('initInterviewComponent가 로드되지 않았습니다');
                await window.initInterviewComponent(setId, this.onComponentComplete.bind(this), initOptions);
                this.currentComponentInstance = window.currentInterviewComponent;
                break;
                
            default:
                console.error('❌ 알 수 없는 컴포넌트 타입:', type);
                this.loadNextComponent(); // 스킵하고 다음으로
        }
    }
    
    /**
     * ================================================
     * 컴포넌트 완료 콜백
     * ================================================
     */
    onComponentComplete(componentResult) {
        console.log('✅ 컴포넌트 완료:', componentResult);
        
        const component = this.config.components[this.currentComponentIndex];
        
        // 답변 저장
        if (componentResult.answers && Array.isArray(componentResult.answers)) {
            this.allAnswers.push(...componentResult.answers);
            this.currentQuestionNumber += componentResult.answers.length;
        }
        
        // 컴포넌트별 결과 저장
        this.componentResults.push({
            componentType: component.type,
            setId: component.setId,
            ...componentResult
        });
        
        // 다음 컴포넌트로
        this.currentComponentIndex++;
        this.loadNextComponent();
    }
    
    /**
     * ================================================
     * 모듈 완료
     * ================================================
     */
    completeModule(isTimeout = false) {
        console.log('🎉 모듈 완료!', isTimeout ? '(시간 초과)' : '');
        
        // 타이머 정리
        this.stopModuleTimer();
        this.stopQuestionTimer(); // 🔴 문제별 타이머도 정리 (남은 카운트다운 방지)
        
        const endTime = Date.now();
        const totalTimeSpent = Math.floor((endTime - this.startTime) / 1000); // 초 단위
        
        // 최종 결과 객체
        const moduleResult = {
            moduleId: this.config.moduleId,
            moduleName: this.config.moduleName,
            sectionType: this.config.sectionType,
            totalQuestions: this.config.totalQuestions,
            answeredQuestions: this.currentQuestionNumber,
            answers: this.allAnswers,
            componentResults: this.componentResults,
            timeSpent: totalTimeSpent,
            isTimeout: isTimeout,
            timestamp: endTime
        };
        
        console.log('📊 모듈 결과:', moduleResult);
        
        // ★ 브라우저 이탈 경고 해제
        if (window._beforeUnloadHandler) {
            window.removeEventListener('beforeunload', window._beforeUnloadHandler);
            window._beforeUnloadHandler = null;
            console.log('🚪 beforeunload 경고 해제 (모듈 완료)');
        }
        
        // 완료 콜백 호출
        if (this.onModuleCompleteCallback) {
            this.onModuleCompleteCallback(moduleResult);
        } else {
            console.warn('⚠️ onModuleCompleteCallback이 설정되지 않았습니다.');
        }
    }
    
    /**
     * ================================================
     * 정리 (Cleanup)
     * ================================================
     */
    cleanup() {
        console.log('🧹 ModuleController cleanup');
        
        this.stopModuleTimer();
        this.stopQuestionTimer(); // 🔴 문제별 타이머도 정리 (중간 이탈 시 잔여 타이머 방지)
        
        if (this.currentComponentInstance && this.currentComponentInstance.cleanup) {
            this.currentComponentInstance.cleanup();
        }
        
        // 전역 미디어 정지
        this._stopAllMediaElements();
        
        this.currentComponentInstance = null;
        
        // ★ 브라우저 이탈 경고 해제
        if (window._beforeUnloadHandler) {
            window.removeEventListener('beforeunload', window._beforeUnloadHandler);
            window._beforeUnloadHandler = null;
            console.log('🚪 beforeunload 경고 해제 (cleanup)');
        }
        
        // 모듈 모드 플래그 해제
        window.isModuleMode = false;
        window.moduleController = null;
    }
    
    /**
     * ================================================
     * 전역 미디어 정지 안전장치
     * cleanup()을 통해 정리되지 못한 audio/video 원천 차단
     * ================================================
     */
    _stopAllMediaElements() {
        try {
            // 모든 audio 요소 정지
            document.querySelectorAll('audio').forEach(audio => {
                if (!audio.paused) {
                    audio.pause();
                    console.log('🛑 [Global] audio 요소 강제 정지');
                }
            });
            // 모든 video 요소 정지 (컨트롤 있는 것은 제외)
            document.querySelectorAll('video').forEach(video => {
                if (!video.paused && !video.controls) {
                    video.pause();
                    console.log('🛑 [Global] video 요소 강제 정지');
                }
            });
        } catch (e) {
            console.warn('⚠️ [Global] 미디어 정지 중 오류:', e);
        }
    }
    
    /**
     * ================================================
     * 완료 콜백 설정
     * ================================================
     */
    setOnComplete(callback) {
        this.onModuleCompleteCallback = callback;
    }
}

// 전역으로 노출
if (typeof window !== 'undefined') {
    window.ModuleController = ModuleController;
    
    /**
     * ================================================
     * 전역 네비게이션 어댑터 함수
     * ================================================
     * HTML 헤더 버튼에서 호출되는 함수들
     */
    
    /**
     * fillblanks 화면에서 Next 클릭
     * → 현재 세트 제출 후 다음 컴포넌트로 이동
     */
    window.moduleNextFromFillBlanks = function() {
        console.log('➡️ [Nav] fillblanks Next 클릭');
        // submitFillBlanks()는 어댑터 함수로 currentFillBlanksComponent.submit() 호출
        // submit() → onComplete 콜백 → onComponentComplete → 다음 컴포넌트 자동 로드
        if (typeof submitFillBlanks === 'function') {
            submitFillBlanks();
        }
    };
    
    /**
     * fillblanks 화면에서 Back 클릭
     * → 이전 컴포넌트로 이동 (첫 세트면 동작 안함)
     */
    window.modulePrevFromFillBlanks = function() {
        console.log('⬅️ [Nav] fillblanks Back 클릭');
        if (window.isModuleMode && window.moduleController) {
            window.moduleController.goToPreviousComponent();
        }
    };
    
    /**
     * 모듈 전체 Submit (마지막 문제 Q35에서 호출)
     */
    window.moduleSubmitAll = function() {
        console.log('📤 [Nav] 모듈 전체 Submit 클릭');
        if (window.isModuleMode && window.moduleController) {
            window.moduleController.submitCurrentModule();
        }
    };
    
}
