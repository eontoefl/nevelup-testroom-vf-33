/**
 * Daily1Component - 일상리딩1 컴포넌트
 * 
 * 박스 안에 포함된 요소:
 * - 지문 렌더링 (제목, 본문)
 * - 문제/보기 렌더링
 * - 답안 입력 처리
 * - 채점 및 결과 저장
 * - 결과 화면 표시
 * 
 * 박스 밖 (Controller가 관리):
 * - 진행 바 (Question N of N)
 * - Previous/Next/Submit 버튼
 * - 타이머 (Module 전체 타이머 사용)
 * - 다음 세트로 자동 이동
 */

class Daily1Component {
    constructor(setNumber, config = {}) {
        console.log(`📦 [Daily1Component] 생성 - setNumber: ${setNumber}`);
        
        // 박스 내부 변수
        this.setNumber = setNumber;          // 몇 번째 세트인지 (고정값)
        this.currentQuestion = 0;            // 세트 내부 문제 인덱스 (0, 1)
        this.data = null;                    // 전체 데이터
        this.currentSet = null;              // 현재 세트 데이터
        this.answers = {};                   // 이 세트의 답안 { 'q1': 2, 'q2': 3 }
        
        // 콜백
        this.onComplete = config.onComplete || null;
        this.onError = config.onError || null;
        
        // DOM 요소 ID
        this.screenId = 'readingDaily1Screen';
        this.mainTitleId = 'daily1MainTitle';
        this.passageTitleId = 'daily1PassageTitle';
        this.passageContentId = 'daily1PassageContent';
        this.questionId = 'daily1Question';
        this.optionsId = 'daily1Options';
    }
    
    /**
     * 초기화 및 데이터 로드
     */
    async init() {
        console.log(`📖 [Daily1Component] 초기화 시작`);
        
        try {
            // 1. 화면 표시
            showScreen(this.screenId);
            
            // 2. 데이터 로드
            this.data = await loadDaily1Data();
            console.log(`✅ 데이터 로드 완료: ${this.data.sets.length}개 세트`);
            
            // 3. 세트 찾기
            const setIndex = this.findSetIndex(this.setNumber);
            if (setIndex === -1) {
                throw new Error(`Set ${this.setNumber}를 찾을 수 없습니다`);
            }
            
            this.currentSet = this.data.sets[setIndex];
            console.log(`✅ Set 로드 완료: ${this.currentSet.id}`);
            console.log(`  - Main Title: ${this.currentSet.mainTitle}`);
            console.log(`  - 문제 개수: ${this.currentSet.questions.length}`);
            
            // 4. UI 렌더링
            this.render();
            
        } catch (error) {
            console.error(`❌ [Daily1Component] 초기화 실패:`, error);
            if (this.onError) {
                this.onError(error);
            }
        }
    }
    
    /**
     * 세트 번호로 인덱스 찾기
     */
    findSetIndex(setNumber) {
        // 🆕 setNumber가 이미 "daily1_set_0001" 형식이면 그대로 사용
        let setId;
        if (typeof setNumber === 'string' && setNumber.startsWith('daily1_set_')) {
            setId = setNumber;
            console.log(`🔍 [findSetIndex] setId 문자열 직접 사용: ${setId}`);
        } else {
            setId = `daily1_set_${String(setNumber).padStart(4, '0')}`;
            console.log(`🔍 [findSetIndex] setNumber ${setNumber} → setId: ${setId}`);
        }
        
        console.log(`🔍🔍🔍 [findSetIndex] 찾는 Set ID: ${setId}`);
        console.log(`🔍🔍🔍 [findSetIndex] data.sets 개수: ${this.data.sets.length}`);
        console.log(`🔍🔍🔍 [findSetIndex] data.sets 전체 ID 목록:`);
        this.data.sets.forEach((s, idx) => {
            console.log(`    [${idx}] ${s.id} | mainTitle: ${s.mainTitle.substring(0, 30)}`);
        });
        
        for (let i = 0; i < this.data.sets.length; i++) {
            const currentSetId = this.data.sets[i].id;
            const matches = (currentSetId === setId);
            console.log(`    비교 [${i}] "${currentSetId}" === "${setId}"? ${matches}`);
            
            if (matches) {
                console.log(`  ✅✅✅ 인덱스 ${i}에서 발견!`);
                console.log(`  📄 찾은 세트 정보:`, {
                    id: this.data.sets[i].id,
                    mainTitle: this.data.sets[i].mainTitle,
                    questions: this.data.sets[i].questions.map(q => q.question.substring(0, 50))
                });
                return i;
            }
        }
        console.error(`  ❌ ${setId}를 찾을 수 없음`);
        return -1;
    }
    
    /**
     * UI 렌더링
     */
    render() {
        console.log(`🎨 [Daily1Component] render() 호출`);
        console.log('  this.currentSet.id:', this.currentSet.id);
        console.log('  this.currentSet.mainTitle:', this.currentSet.mainTitle);
        
        // 1. 메인 타이틀 설정
        const mainTitleEl = document.getElementById(this.mainTitleId);
        console.log('  mainTitle 설정:', this.currentSet.mainTitle);
        console.log('  mainTitleEl 찾음:', mainTitleEl ? 'YES' : 'NO');
        if (mainTitleEl) {
            console.log('  변경 전:', mainTitleEl.textContent);
            mainTitleEl.textContent = this.currentSet.mainTitle;
            console.log('  변경 후:', mainTitleEl.textContent);
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
        console.log('🎨🎨🎨 [renderPassage] 호출됨!');
        console.log('  this.currentSet.id:', this.currentSet.id);
        console.log('  this.currentSet.mainTitle:', this.currentSet.mainTitle);
        console.log('  설정할 mainTitle:', this.currentSet.mainTitle);
        console.log('  Stack trace:');
        console.trace();
        
        const passage = this.currentSet.passage;
        
        // mainTitle 설정
        const mainTitleEl = document.getElementById(this.mainTitleId);
        console.log('  mainTitleEl 찾음:', mainTitleEl ? 'YES' : 'NO');
        if (mainTitleEl) {
            console.log('  변경 전 textContent:', mainTitleEl.textContent);
            mainTitleEl.textContent = this.currentSet.mainTitle;
            console.log('  변경 후 textContent:', mainTitleEl.textContent);
        }
        
        document.getElementById(this.passageTitleId).textContent = passage.title;
        // 구분자 처리 (문제풀이 화면용)
        // ## = 단락구분 (빈 줄), #||# = 줄바꿈, #|# = 이어붙이기 (공백)
        // 순서 중요: #||# → #|# → ## (긴 것부터 먼저 치환)
        const formattedContent = (passage.content || '')
            .replace(/#\|\|#/g, '\n')
            .replace(/#\|#/g, ' ')
            .replace(/##/g, '\n\n')
            .replace(/\\n/g, '\n')
            .replace(/\n/g, '<br>');
        document.getElementById(this.passageContentId).innerHTML = formattedContent;
    }
    
    /**
     * 문제 로드
     */
    loadQuestion(questionIndex) {
        this.currentQuestion = questionIndex;
        const question = this.currentSet.questions[questionIndex];
        
        console.log(`📚 [Daily1Component] 문제 로드: ${questionIndex + 1}/${this.currentSet.questions.length}`);
        
        // 1. 문제 텍스트 표시
        document.getElementById(this.questionId).textContent = question.question;
        
        // 2. 보기 렌더링
        this.renderOptions(question, questionIndex);
    }
    
    /**
     * 보기 렌더링
     */
    renderOptions(question, questionIndex) {
        const container = document.getElementById(this.optionsId);
        container.innerHTML = '';
        
        question.options.forEach((option, index) => {
            const optionDiv = document.createElement('div');
            optionDiv.className = 'answer-option';
            
            // 새 형식: {label, text, translation, explanation} vs 구 형식: 'text'
            if (typeof option === 'object' && option.label) {
                optionDiv.textContent = `${option.label}) ${option.text}`;
            } else {
                optionDiv.textContent = option;
            }
            
            optionDiv.onclick = () => this.selectOption(index + 1);
            
            // 이전 답안 복원
            const savedAnswer = this.answers[`q${questionIndex + 1}`];
            if (savedAnswer === index + 1) {
                optionDiv.classList.add('selected');
            }
            
            container.appendChild(optionDiv);
        });
    }
    
    /**
     * 보기 선택
     */
    selectOption(optionIndex) {
        const questionKey = `q${this.currentQuestion + 1}`;
        
        // 답안 저장
        this.answers[questionKey] = optionIndex;
        console.log(`✅ [Daily1Component] 답안 저장: ${questionKey} = ${optionIndex}`);
        
        // 선택 UI 업데이트
        const options = document.querySelectorAll(`#${this.optionsId} .answer-option`);
        options.forEach((opt, idx) => {
            if (idx + 1 === optionIndex) {
                opt.classList.add('selected');
            } else {
                opt.classList.remove('selected');
            }
        });
    }
    
    /**
     * 다음 문제로 이동 (세트 내부에서만)
     */
    nextQuestion() {
        if (this.currentQuestion < this.currentSet.questions.length - 1) {
            this.loadQuestion(this.currentQuestion + 1);
            return true;
        }
        return false; // 더 이상 문제 없음
    }
    
    /**
     * 이전 문제로 이동 (세트 내부에서만)
     */
    previousQuestion() {
        if (this.currentQuestion > 0) {
            this.loadQuestion(this.currentQuestion - 1);
            return true;
        }
        return false; // 첫 문제임
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
        console.log(`📤 [Daily1Component] 제출 시작`);
        
        // 1. 채점
        const results = this.gradeAnswers();
        
        // 2. sessionStorage에 저장 (이 세트만)
        sessionStorage.setItem(
            `daily1_set_${this.setNumber}`,
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
            type: 'daily1',
            setId: this.currentSet.id,
            setNumber: this.setNumber,
            mainTitle: this.currentSet.mainTitle,
            passage: this.currentSet.passage,
            answers: []
        };
        
        this.currentSet.questions.forEach((question, index) => {
            const questionKey = `q${index + 1}`;
            const userAnswer = this.answers[questionKey];
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
     * 정리 (메모리 해제)
     */
    cleanup() {
        console.log(`🧹 [Daily1Component] 정리`);
        this.data = null;
        this.currentSet = null;
        this.answers = {};
    }
    
}

// 전역으로 노출 (기존 코드와 호환성)
window.Daily1Component = Daily1Component;
