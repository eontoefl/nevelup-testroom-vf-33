/**
 * ArrangeComponent.js
 * 라이팅 - 단어배열 (Build a Sentence) 컴포넌트
 * v=003
 * 
 * 특징:
 * - 대화형 UI (두 사람 프로필 + 문장)
 * - 드래그 & 드롭으로 빈칸 채우기
 * - 남녀 랜덤 조합 (남남/여여 불가)
 * - 첫 번째 빈칸 자동 대문자 변환
 */

class ArrangeComponent {
    constructor(setNumber) {
        console.log(`[ArrangeComponent] 생성 - setNumber: ${setNumber}`);
        
        this.setNumber = setNumber;
        
        // 내부 상태
        this.currentQuestion = 0;
        this.answers = {}; // 문제별 답안 저장
        this.setData = null;
        this.profilePairs = {}; // 문제별 프로필 이미지 저장
        this.draggedWord = null; // 현재 드래그 중인 단어
        
        
        // 프로필 이미지 (여자 7개, 남자 7개) — 목록은 arrange-core.js 한 곳에 있다
        this.FEMALE_IMAGES = ArrangeCore.FEMALE_IMAGES;
        this.MALE_IMAGES = ArrangeCore.MALE_IMAGES;
    }
    
    /**
     * 컴포넌트 초기화
     */
    async init() {
        console.log('[ArrangeComponent] 초기화 시작');
        
        try {
            // 1. 데이터 로드 (외부 로더 사용)
            const allData = await window.loadArrangeData();
            if (!allData || !allData.sets || allData.sets.length === 0) {
                throw new Error('데이터를 불러올 수 없습니다');
            }
            
            // 2. 세트 찾기
            const setId = `arrange_set_${String(this.setNumber).padStart(4, '0')}`;
            console.log(`[ArrangeComponent] 세트 검색 - ID: ${setId}`);
            
            const setIndex = allData.sets.findIndex(set => set.setId === setId);
            if (setIndex === -1) {
                throw new Error(`세트를 찾을 수 없습니다: ${setId}`);
            }
            
            this.setData = allData.sets[setIndex];
            console.log('[ArrangeComponent] 세트 데이터 로드 완료:', this.setData);
            
            // 3. 첫 번째 문제 로드
            this.loadQuestion(0);
            
        } catch (error) {
            console.error('[ArrangeComponent] 초기화 실패:', error);
            alert('단어배열 데이터를 불러오는데 실패했습니다.');
        }
    }
    
    /**
     * 세트 인덱스 찾기
     */

    
    /**
     * 랜덤 남녀 조합 생성 (남남/여여 불가, 직전 이미지 제외)
     */
    getRandomGenderPair() {
        // 직전 이미지 추적과 조합 규칙은 arrange-core.js (트레이닝과 같이 씀)
        return ArrangeCore.randomGenderPair();
    }
    
    /**
     * 문제 로드
     */
    loadQuestion(questionIndex) {
        console.log(`[ArrangeComponent] 문제 ${questionIndex + 1} 로드`);
        
        this.currentQuestion = questionIndex;
        const question = this.setData.questions[questionIndex];
        
        // 문제별 프로필 이미지 조합 가져오기 (없으면 새로 생성)
        const questionKey = `${this.setData.setId}_q${question.questionNum}`;
        if (!this.profilePairs[questionKey]) {
            this.profilePairs[questionKey] = this.getRandomGenderPair();
            console.log(`[ArrangeComponent] 새 프로필 조합 생성: ${questionKey}`);
        }
        
        // 문제 렌더링
        this.renderQuestion(question);
        
        console.log(`[ArrangeComponent] 문제 ${questionIndex + 1} 로드 완료`);
    }
    
    /**
     * 이전 문제로 이동 (Prev 버튼에서 호출)
     */
    prevQuestion() {
        const prevIndex = this.currentQuestion - 1;
        if (prevIndex < 0) return;
        
        this.loadQuestion(prevIndex);
    }
    
    /**
     * 문제 렌더링
     */
    renderQuestion(question) {
        const container = document.getElementById('arrangeQuestionContent');
        
        // 저장된 답안 불러오기
        const questionKey = `${this.setData.setId}_q${question.questionNum}`;
        const savedAnswer = this.answers[questionKey];
        
        // 프로필 이미지 조합
        const genderPair = this.profilePairs[questionKey];
        
        // 화면 HTML은 arrange-core.js가 만든다 (예전과 글자 하나까지 같은 HTML)
        container.innerHTML = ArrangeCore.buildQuestionHtml(question, savedAnswer, genderPair, 'window.currentArrangeComponent');
    }
    
    /**
     * 드래그 시작
     */
    dragStart(event) {
        this.draggedWord = event.target.dataset.word;
        event.dataTransfer.effectAllowed = 'move';
        console.log(`[ArrangeComponent] 드래그 시작: ${this.draggedWord}`);
    }
    
    /**
     * 드래그 종료
     */
    dragEnd(event) {
        this.draggedWord = null;
        console.log('[ArrangeComponent] 드래그 종료');
    }
    
    /**
     * 단어 드롭
     */
    dropWord(event) {
        event.preventDefault();
        
        if (!this.draggedWord) return;
        
        const blank = event.target.closest('.arrange-blank');
        if (!blank) {
            console.log('[ArrangeComponent] 빈칸이 아닌 곳에 드롭 - 무시');
            this.draggedWord = null;
            return;
        }
        
        const index = parseInt(blank.dataset.index);
        const question = this.setData.questions[this.currentQuestion];
        const questionKey = `${this.setData.setId}_q${question.questionNum}`;
        
        if (!this.answers[questionKey]) {
            this.answers[questionKey] = {};
        }
        
        // 문장 맨 앞 빈칸인지 확인 (0번 자리가 빈칸이고, 거기에 넣을 때만 대문자 변환)
        const word = ArrangeCore.placeWord(this.answers[questionKey], index, this.draggedWord);
        console.log(`[ArrangeComponent] 답안 저장: ${questionKey}[${index}] = ${word}`);
        
        // 화면 재렌더링
        this.renderQuestion(question);
        
        this.draggedWord = null;
    }
    
    /**
     * 단어 제거 (클릭)
     */
    removeWord(index) {
        const question = this.setData.questions[this.currentQuestion];
        const questionKey = `${this.setData.setId}_q${question.questionNum}`;
        
        if (ArrangeCore.removeWord(this.answers[questionKey], index)) {
            console.log(`[ArrangeComponent] 단어 제거: ${questionKey}[${index}]`);
            
            // 화면 재렌더링
            this.renderQuestion(question);
        }
    }
    
    /**
     * 다음 문제로 이동 (Next 버튼에서 호출)
     */
    nextQuestion() {
        const nextIndex = this.currentQuestion + 1;
        const totalQuestions = this.setData.questions.length;
        
        if (nextIndex >= totalQuestions) {
            console.log('[ArrangeComponent] 마지막 문제 도달');
            return false;
        }
        
        // 다음 문제 로드
        this.loadQuestion(nextIndex);
        return true;
    }
    
    /**
     * 제출 & 채점
     */
    submit() {
        console.log('[ArrangeComponent] 제출 시작');
        console.log('[ArrangeComponent] 최종 답안:', this.answers);
        
        let correct = 0;
        const total = this.setData.questions.length;
        
        const results = this.setData.questions.map((question, index) => {
            const questionKey = `${this.setData.setId}_q${question.questionNum}`;
            const userAnswer = this.answers[questionKey];
            
            // 채점은 arrange-core.js (빈칸 답을 정답 벌마다 순서대로 비교, 하나라도 일치하면 정답, 대소문자 무시)
            const graded = ArrangeCore.gradeQuestion(question, userAnswer);
            const matchedIdx = graded.matchedIdx;
            const isCorrect = graded.isCorrect;
            // 정답이면 맞힌 벌, 오답이면 1벌을 기록에 남긴다
            const shownSet = question.answerSets[isCorrect ? matchedIdx : 0];
            
            // 결과 표시용 전체 문장 조합
            const userFullAnswer = graded.userFullAnswer;
            
            console.log(`[ArrangeComponent] Q${question.questionNum} - ${isCorrect ? '정답' : '오답'}`);
            
            if (isCorrect) {
                correct++;
            }
            
            return {
                questionNum: question.questionNum,
                givenSentence: question.givenSentence,
                givenTranslation: question.givenTranslation,
                correctAnswer: shownSet.answer.join(' ') + question.endPunctuation,
                correctAnswerArray: shownSet.answer,
                correctTranslation: shownSet.translation,
                userAnswer: userFullAnswer.join(' ') + question.endPunctuation,
                explanation: shownSet.explanation,
                isCorrect: isCorrect,
                profilePair: this.profilePairs[questionKey],
                presentedWords: question.presentedWords,
                userFilledWords: userAnswer || {},
                optionWords: question.optionWords,
                endPunctuation: question.endPunctuation,
                answerSets: question.answerSets.map(set => ({ answer: set.answer })),
                matchedAnswerIndex: isCorrect ? matchedIdx : null
            };
        });
        
        const accuracy = Math.round((correct / total) * 100);
        
        // 결과 데이터 구성
        const resultData = {
            results: results,
            correct: correct,
            total: total,
            accuracy: accuracy,
            week: this.setData.week,
            day: this.setData.day
        };
        
        console.log('[ArrangeComponent] 채점 완료:', resultData);
        
        // sessionStorage에 저장
        sessionStorage.setItem('arrangeResults', JSON.stringify(resultData));
        
        return resultData;
    }
    
}

// 전역 스코프에 노출
window.ArrangeComponent = ArrangeComponent;


// 드롭 허용 헬퍼 함수 (전역 필수 - renderQuestion innerHTML의 ondragover에서 호출)
function allowDrop(event) {
    event.preventDefault();
}
