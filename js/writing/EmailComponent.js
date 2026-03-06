/**
 * EmailComponent.js
 * 라이팅 - 이메일 작성 컴포넌트
 * v=001
 * 
 * 특징:
 * - 텍스트 직접 입력 (Textarea)
 * - 편집 도구 (Cut, Paste, Undo, Redo)
 * - 단어수 카운트 + 1000단어 제한
 * - TXT 파일 자동 다운로드
 * - 6분 타이머 (360초)
 */

class EmailComponent {
    constructor(setNumber, onComplete) {
        console.log(`[EmailComponent] 생성 - setNumber: ${setNumber}`);
        
        this.setNumber = setNumber;
        
        // onComplete 콜백 처리 (함수 또는 객체 형태 지원)
        if (typeof onComplete === 'function') {
            this.onComplete = onComplete;
        } else if (onComplete && typeof onComplete.onComplete === 'function') {
            this.onComplete = onComplete.onComplete;
            this.onError = onComplete.onError;
        } else {
            this.onComplete = null;
        }
        
        // 내부 상태
        this.currentQuestion = 0;
        this.answers = {}; // 문제별 답안 저장
        this.data = null;
        this.currentSetData = null;
        
        // Undo/Redo
        this.undoStack = [];
        this.redoStack = [];
        
        // 단어수 관리
        this.wordCountVisible = true;
        this.MAX_WORD_COUNT = 1000;
        
        // 타이머 설정
        this.TIME_LIMIT = 420; // 7분
        this._destroyed = false; // 🚪 문지기 플래그
        
    }
    
    /**
     * 컴포넌트 초기화
     */
    async init() {
        console.log('[EmailComponent] 초기화 시작');
        
        try {
            // 1. 데이터 로드 (외부 로더 사용)
            this.data = await window.loadEmailData();
            if (!this.data) {
                throw new Error('데이터를 불러올 수 없습니다');
            }
            
            // 2. 세트 찾기
            const setId = `email_set_${String(this.setNumber).padStart(4, '0')}`;
            console.log(`[EmailComponent] 세트 검색 - ID: ${setId}`);
            
            const setIndex = this.findSetIndex(setId);
            if (setIndex === -1) {
                throw new Error(`세트를 찾을 수 없습니다: ${setId}`);
            }
            
            this.currentSetData = this.data.sets[setIndex];
            console.log('[EmailComponent] 세트 데이터 로드 완료:', this.currentSetData);
            
            // 3. 해당 세트 문제 로드 (setIndex 기준)
            this.loadQuestion(setIndex);
            
            // 4. 화면 표시
            if (typeof window.showScreen === 'function') {
                window.showScreen('writingEmailScreen');
            }
            
            // 5. 이메일은 문제 1개 → Next 숨기고 Submit만 표시
            const nextBtn = document.getElementById('emailNextBtn');
            const submitBtn = document.getElementById('emailSubmitBtn');
            if (nextBtn) nextBtn.style.display = 'none';
            if (submitBtn) submitBtn.style.display = 'inline-block';
            
        } catch (error) {
            console.error('[EmailComponent] 초기화 실패:', error);
            alert('이메일 작성 데이터를 불러오는데 실패했습니다.');
        }
    }
    
    
    /**
     * 세트 인덱스 찾기
     */
    findSetIndex(setId) {
        return this.data.sets.findIndex(set => set.id === setId);
    }
    
    /**
     * 문제 로드
     */
    loadQuestion(questionIndex) {
        console.log(`[EmailComponent] 문제 ${questionIndex + 1} 로드`);
        
        this.currentQuestion = questionIndex;
        const set = this.data.sets[questionIndex];
        
        // 문제 렌더링
        this.renderQuestion(set);
        
        console.log(`[EmailComponent] 문제 ${questionIndex + 1} 로드 완료`);
    }
    
    /**
     * 문제 렌더링
     */
    renderQuestion(set) {
        // 왼쪽: 과제 설명
        const scenarioEl = document.getElementById('emailSituation');
        if (scenarioEl) scenarioEl.textContent = set.scenario || '';
        
        const taskEl = document.getElementById('emailTask');
        if (taskEl) taskEl.textContent = set.task || '';
        
        const inst1El = document.getElementById('emailInstruction1');
        if (inst1El) inst1El.textContent = set.instruction1 || '';
        
        const inst2El = document.getElementById('emailInstruction2');
        if (inst2El) inst2El.textContent = set.instruction2 || '';
        
        const inst3El = document.getElementById('emailInstruction3');
        if (inst3El) inst3El.textContent = set.instruction3 || '';
        
        // 오른쪽: 이메일 헤더
        const toEl = document.getElementById('emailTo');
        if (toEl) toEl.textContent = set.to || '';
        
        const subjectEl = document.getElementById('emailSubject');
        if (subjectEl) subjectEl.textContent = set.subject || '';
        
        // 이전 답안 불러오기
        const savedAnswer = this.answers[set.id] || '';
        
        const textarea = document.getElementById('emailTextarea');
        if (textarea) {
            textarea.value = savedAnswer;
            
            // DOM이 완전히 렌더링된 후 단어수 업데이트
            setTimeout(() => {
                if (this._destroyed) return; // 🚪 문지기 가드
                this.updateWordCount();
            }, 100);
        }
        
        // Undo/Redo 스택 초기화
        this.undoStack = [savedAnswer];
        this.redoStack = [];
    }
    
    /**
     * 텍스트 입력 이벤트
     */
    onTextInput() {
        const textarea = document.getElementById('emailTextarea');
        if (!textarea) {
            console.error('[EmailComponent] emailTextarea를 찾을 수 없습니다');
            return;
        }
        
        const set = this.data.sets[this.currentQuestion];
        if (!set) {
            console.error('[EmailComponent] set을 찾을 수 없습니다');
            this.updateWordCount();
            return;
        }
        
        // 답안 저장
        this.answers[set.id] = textarea.value;
        
        // Undo 스택에 추가
        if (this.undoStack[this.undoStack.length - 1] !== textarea.value) {
            this.undoStack.push(textarea.value);
            this.redoStack = [];
        }
        
        this.updateWordCount();
    }
    
    /**
     * 단어수 카운트
     */
    updateWordCount() {
        const textarea = document.getElementById('emailTextarea');
        if (!textarea) {
            console.error('[EmailComponent] emailTextarea를 찾을 수 없습니다');
            return;
        }
        
        const text = textarea.value.trim();
        const words = text ? text.split(/\s+/).filter(word => word.length > 0).length : 0;
        
        const wordCountElement = document.getElementById('emailWordCount');
        if (wordCountElement) {
            wordCountElement.textContent = words;
        }
        
        // 최대 단어수 체크
        if (words > this.MAX_WORD_COUNT) {
            const wordsArray = text.split(/\s+/).filter(word => word.length > 0);
            textarea.value = wordsArray.slice(0, this.MAX_WORD_COUNT).join(' ');
            this.updateWordCount();
        }
    }
    
    /**
     * Cut
     */
    cutText() {
        const textarea = document.getElementById('emailTextarea');
        const selectedText = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd);
        
        if (selectedText) {
            navigator.clipboard.writeText(selectedText);
            
            const newValue = textarea.value.substring(0, textarea.selectionStart) + 
                            textarea.value.substring(textarea.selectionEnd);
            textarea.value = newValue;
            
            this.onTextInput();
        }
    }
    
    /**
     * Paste
     */
    pasteText() {
        navigator.clipboard.readText().then(text => {
            const textarea = document.getElementById('emailTextarea');
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            
            const newValue = textarea.value.substring(0, start) + text + textarea.value.substring(end);
            textarea.value = newValue;
            
            textarea.selectionStart = textarea.selectionEnd = start + text.length;
            
            this.onTextInput();
        });
    }
    
    /**
     * Undo
     */
    undoText() {
        if (this.undoStack.length > 1) {
            const current = this.undoStack.pop();
            this.redoStack.push(current);
            
            const previous = this.undoStack[this.undoStack.length - 1];
            document.getElementById('emailTextarea').value = previous;
            
            this.updateWordCount();
        }
    }
    
    /**
     * Redo
     */
    redoText() {
        if (this.redoStack.length > 0) {
            const next = this.redoStack.pop();
            this.undoStack.push(next);
            
            document.getElementById('emailTextarea').value = next;
            
            this.updateWordCount();
        }
    }
    
    /**
     * 단어수 표시/숨김
     */
    toggleWordCount() {
        this.wordCountVisible = !this.wordCountVisible;
        const wordCountElement = document.getElementById('emailWordCountDisplay');
        const toggleButton = document.getElementById('toggleWordCountBtn');
        
        if (this.wordCountVisible) {
            wordCountElement.style.display = 'inline';
            toggleButton.innerHTML = '<i class="fas fa-eye-slash"></i> Hide Word Count';
        } else {
            wordCountElement.style.display = 'none';
            toggleButton.innerHTML = '<i class="fas fa-eye"></i> Show Word Count';
        }
    }
    
    /**
     * 답안 다운로드 (문제 풀이 중)
     */
    downloadEmail() {
        const set = this.data.sets[this.currentQuestion];
        const answer = this.answers[set.id] || '';
        
        const content = `To: ${set.to}\nSubject: ${set.subject}\n\n${answer}`;
        
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `email_${set.id}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    }
    
    /**
     * 제출 & TXT 파일 다운로드
     */
    submit() {
        console.log('[EmailComponent] 제출 시작');
        
        const set = this.data.sets[this.currentQuestion];
        const userAnswer = document.getElementById('emailTextarea').value || '';
        const wordCount = userAnswer.trim().split(/\s+/).filter(word => word.length > 0).length;
        
        console.log('[EmailComponent] 단어수:', wordCount);
        
        // TXT 파일 내용 생성
        const now = new Date();
        const dateStr = now.toLocaleString('ko-KR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
        
        let txtContent = `====================================\n`;
        txtContent += `Writing - Email (${window.currentAttemptNumber === 2 ? '2차 작성' : '1차 작성'})\n`;
        txtContent += `제출 일시: ${dateStr}\n`;
        txtContent += `====================================\n\n`;
        
        txtContent += `[문제]\n`;
        txtContent += `Scenario: ${set.scenario || ''}\n\n`;
        txtContent += `Task: ${set.task || ''}\n`;
        txtContent += `  • ${set.instruction1 || ''}\n`;
        txtContent += `  • ${set.instruction2 || ''}\n`;
        txtContent += `  • ${set.instruction3 || ''}\n\n`;
        
        txtContent += `To: ${set.to || ''}\n`;
        txtContent += `Subject: ${set.subject || ''}\n\n`;
        
        txtContent += `------------------------------------\n\n`;
        
        txtContent += `[내 답안]\n`;
        txtContent += `${userAnswer}\n\n`;
        
        txtContent += `------------------------------------\n\n`;
        
        txtContent += `[단어 수]\n`;
        txtContent += `${wordCount} words\n\n`;
        
        txtContent += `====================================\n`;
        
        // TXT 파일 다운로드
        const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        
        // 파일명: Writing_Email_YYYYMMDD_HHMMSS.txt
        const fileName = `Writing_Email_${window.currentAttemptNumber === 2 ? '2차' : '1차'}_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}.txt`;
        link.download = fileName;
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        console.log('[EmailComponent] 파일 다운로드 완료:', fileName);
        
        // 결과 데이터 구성
        const resultData = {
            weekDay: 'Week 1, 월요일',  // TODO: 실제 학습 일정 정보
            wordCount: wordCount,
            userAnswer: userAnswer,
            question: {
                scenario: set.scenario,
                task: set.task,
                instructions: [
                    set.instruction1,
                    set.instruction2,
                    set.instruction3
                ],
                to: set.to,
                subject: set.subject,
                sampleAnswer: set.sampleAnswer,
                bullets: set.bullets
            }
        };
        
        console.log('[EmailComponent] 채점 완료:', resultData);
        
        // 완료 콜백 호출
        if (this.onComplete) {
            this.onComplete(resultData);
        }
    }
    
    /**
     * Cleanup (🚪 문지기 - 컴포넌트 전환 시 호출)
     */
    cleanup() {
        console.log('[EmailComponent] Cleanup 시작');
        this._destroyed = true;
        this.answers = {};
        console.log('[EmailComponent] Cleanup 완료');
    }
}

// 전역 스코프에 노출
window.EmailComponent = EmailComponent;
