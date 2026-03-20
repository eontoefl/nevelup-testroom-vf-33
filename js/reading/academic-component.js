/**
 * AcademicComponent.js v=007
 * 
 * Academic Reading 컴포넌트
 * - 세트당 5문제
 * - 지문 렌더링, 문제 로드, 선택지 처리
 * - 답안 채점 및 sessionStorage 저장
 * - 타이머, 버튼 제어, 진행바는 Module Controller에서 관리
 */

class AcademicComponent {
    constructor(setNumber, config = {}) {
        console.log(`[AcademicComponent] 생성 - setNumber: ${setNumber}`);
        
        this.setNumber = setNumber;
        this.currentQuestion = 0;
        this.answers = {};
        
        this.data = null;                    // 전체 데이터
        this.currentSet = null;              // 현재 세트 데이터
        // 콜백
        this.onComplete = config.onComplete || null;
        this.onError = config.onError || null;
        
        // DOM 요소 ID
        this.screenId = 'readingAcademicScreen';
        this.mainTitleId = 'academicMainTitle';
        this.passageTitleId = 'academicPassageTitle';
        this.passageContentId = 'academicPassageContent';
        this.questionId = 'academicQuestion';
        this.optionsId = 'academicOptions';
    }

    /**
     * 초기화 - 데이터 로드 및 화면 렌더링
     */
    async init() {
        console.log(`[AcademicComponent] 초기화 시작 - setNumber: ${this.setNumber}`);
        
        try {
            // 1. 화면 표시
            showScreen(this.screenId);
            
            // 2. 데이터 로드
            this.data = await loadAcademicData();
            console.log(`✅ 데이터 로드 완료: ${this.data.sets.length}개 세트`);
            
            // 3. 세트 찾기
            const setIndex = this.findSetIndex(this.setNumber);
            if (setIndex === -1) {
                throw new Error(`Set ${this.setNumber}를 찾을 수 없습니다`);
            }
            
            this.currentSet = this.data.sets[setIndex];
            console.log(`✅ Set 로드 완료: ${this.currentSet.id}`);
            
            // 4. UI 렌더링
            this.render();
            
        } catch (error) {
            console.error(`❌ [AcademicComponent] 초기화 실패:`, error);
            if (this.onError) {
                this.onError(error);
            }
        }
    }

    /**
     * 세트 번호로 인덱스 찾기
     */
    findSetIndex(setNumber) {
        let setId;
        if (typeof setNumber === 'string' && setNumber.startsWith('academic_set_')) {
            setId = setNumber;
        } else {
            setId = `academic_set_${String(setNumber).padStart(4, '0')}`;
        }
        
        for (let i = 0; i < this.data.sets.length; i++) {
            if (this.data.sets[i].id === setId) {
                console.log(`[AcademicComponent] 세트 발견: ${setId} (index ${i})`);
                return i;
            }
        }
        console.error(`[AcademicComponent] 세트를 찾을 수 없음: ${setId}`);
        return -1;
    }

    /**
     * UI 렌더링
     */
    render() {
        // 1. 메인 타이틀 설정
        const mainTitleEl = document.getElementById(this.mainTitleId);
        if (mainTitleEl) {
            mainTitleEl.textContent = this.currentSet.mainTitle;
        }
        
        // 2. 지문 렌더링
        this.renderPassage();
        
        // 3. 첫 번째 문제 로드
        this.loadQuestion(0);
    }

    /**
     * 지문 렌더링
     */
    renderPassage() {
        const passage = this.currentSet.passage;
        
        const titleEl = document.getElementById(this.passageTitleId);
        const contentEl = document.getElementById(this.passageContentId);
        
        if (!passage) {
            console.error('[AcademicComponent] 지문 데이터 없음');
            return;
        }
        
        if (titleEl) {
            titleEl.innerHTML = passage.title || '';
        }
        if (contentEl) {
            // 지문 렌더링 시 (A)~(D) 마커를 미리 span으로 감싸놓기 (기본 숨김)
            let html = passage.content || '';
            html = html.replace(/\(([A-D])\)/g, '<span class="ac-insertion-marker">($1)</span>');
            contentEl.innerHTML = html;
        }
    }

    /**
     * 지문 highlight/insertion 스타일 토글
     */
    updatePassageHighlight(question) {
        const contentEl = document.getElementById(this.passageContentId);
        if (!contentEl) return;

        const type = question.questionType || 'normal';

        // highlight 토글
        contentEl.querySelectorAll('.ac-highlight-word').forEach(el => {
            el.classList.toggle('ac-highlight-active', type === 'highlight');
        });

        // insertion 마커 표시/숨김 (renderPassage에서 이미 span으로 감싸놓음)
        contentEl.querySelectorAll('.ac-insertion-marker').forEach(el => {
            el.classList.toggle('ac-insertion-active', type === 'insertion');
        });
    }

    /**
     * 문제 로드
     */
    loadQuestion(questionIndex) {
        this.currentQuestion = questionIndex;
        const question = this.currentSet.questions[questionIndex];
        
        if (!question) {
            console.error(`[AcademicComponent] 문제 데이터 없음 - index: ${questionIndex}`);
            return;
        }
        
        // highlight/insertion 지문 스타일 토글
        this.updatePassageHighlight(question);
        
        // 질문 텍스트 (insertion 문제: "..." 를 박스로 표시)
        const questionTextEl = document.getElementById(this.questionId);
        if (questionTextEl) {
            let qText = question.question || '';
            if ((question.questionType || 'normal') === 'insertion') {
                qText = qText.replace(/"([^"]+)"/g, '<div class="ac-insertion-sentence">"$1"</div>');
            }
            questionTextEl.innerHTML = qText;
        }
        
        // 선택지 렌더링
        this.renderOptions(question.options, questionIndex);
    }

    /**
     * 보기 렌더링
     */
    renderOptions(options, questionIndex) {
        const container = document.getElementById(this.optionsId);
        if (!container) {
            console.error('[AcademicComponent] academicOptions 컨테이너를 찾을 수 없습니다');
            return;
        }
        
        container.innerHTML = '';
        
        options.forEach((opt, idx) => {
            const label = this.getLabelFromIndex(idx);
            const text = typeof opt === 'object' ? opt.text : opt;
            
            const optionDiv = document.createElement('div');
            optionDiv.className = 'answer-option';
            optionDiv.dataset.value = String(idx + 1);
            optionDiv.textContent = `${label}) ${text}`;
            
            optionDiv.addEventListener('click', () => this.selectOption(idx + 1));
            
            // 이전 답안 복원
            const savedAnswer = this.answers[questionIndex];
            if (savedAnswer === idx + 1) {
                optionDiv.classList.add('selected');
            }
            
            container.appendChild(optionDiv);
        });
    }

    /**
     * 보기 선택
     */
    selectOption(value) {
        this.answers[this.currentQuestion] = value;
        
        // 선택 UI 업데이트
        const options = document.querySelectorAll(`#${this.optionsId} .answer-option`);
        options.forEach(opt => {
            if (opt.dataset.value === String(value)) {
                opt.classList.add('selected');
            } else {
                opt.classList.remove('selected');
            }
        });
    }

    /**
     * 다음 문제로 이동
     */
    nextQuestion() {
        if (this.currentQuestion < this.currentSet.questions.length - 1) {
            this.loadQuestion(this.currentQuestion + 1);
            return true;
        }
        return false;
    }
    
    /**
     * 이전 문제로 이동
     */
    previousQuestion() {
        if (this.currentQuestion > 0) {
            this.loadQuestion(this.currentQuestion - 1);
            return true;
        }
        return false;
    }
    
    /**
     * 현재 문제가 이 세트의 마지막 문제인지 확인
     */
    isLastQuestion() {
        return this.currentQuestion === this.currentSet.questions.length - 1;
    }
    
    /**
     * 현재 문제가 이 세트의 첫 문제인지 확인
     */
    isFirstQuestion() {
        return this.currentQuestion === 0;
    }

    /**
     * 제출 (채점 및 결과 저장)
     */
    submit() {
        console.log(`📤 [AcademicComponent] 제출 시작`);
        
        // 1. 채점
        const results = this.gradeAnswers();
        
        // 2. sessionStorage에 저장 (이 세트만)
        sessionStorage.setItem(
            `academic_set_${this.setNumber}`,
            JSON.stringify(results)
        );
        
        console.log(`✅ 채점 완료:`, results);
        
        // 3. 콜백 호출 (Module Controller에 전달)
        if (this.onComplete) {
            this.onComplete(results);
        }
    }
    
    /**
     * 답안 채점
     */
    gradeAnswers() {
        const setResults = {
            type: 'academic',
            setId: this.currentSet.id,
            setNumber: this.setNumber,
            mainTitle: this.currentSet.mainTitle,
            passage: this.currentSet.passage,
            answers: []
        };
        
        this.currentSet.questions.forEach((question, index) => {
            const userAnswer = this.answers[index];
            const isCorrect = userAnswer === question.correctAnswer;
            
            setResults.answers.push({
                questionNum: question.questionNum || `Q${index + 1}`,
                question: question.question,
                questionTranslation: question.questionTranslation || '',
                options: question.options || [],
                userAnswer: userAnswer,
                correctAnswer: question.correctAnswer,
                isCorrect: isCorrect
            });
        });
        
        return setResults;
    }
    
    /**
     * HTML 이스케이프
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * 인덱스 → 알파벳 라벨 변환
     */
    getLabelFromIndex(index) {
        return String.fromCharCode(65 + index);
    }
}

// 전역으로 노출
window.AcademicComponent = AcademicComponent;
console.log('[AcademicComponent] 클래스 정의 완료');
