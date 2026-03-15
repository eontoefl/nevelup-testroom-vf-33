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
    constructor(setNumber) {
        console.log(`[EmailComponent] 생성 - setNumber: ${setNumber}`);
        
        this.setNumber = setNumber;
        
        // 내부 상태
        this.answers = {}; // 답안 저장
        this.setData = null;
        
        // Undo/Redo
        this.undoStack = [];
        this.redoStack = [];
        
        // 단어수 관리
        this.wordCountVisible = true;
        this.MAX_WORD_COUNT = 1000;
        
        
    }
    
    /**
     * 컴포넌트 초기화
     */
    async init() {
        console.log('[EmailComponent] 초기화 시작');
        
        try {
            // 1. 데이터 로드 (외부 로더 사용)
            const allData = await window.loadEmailData();
            if (!allData || !allData.sets || allData.sets.length === 0) {
                throw new Error('데이터를 불러올 수 없습니다');
            }
            
            // 2. 세트 찾기
            const setId = `email_set_${String(this.setNumber).padStart(4, '0')}`;
            console.log(`[EmailComponent] 세트 검색 - ID: ${setId}`);
            
            const setIndex = allData.sets.findIndex(set => set.setId === setId);
            if (setIndex === -1) {
                throw new Error(`세트를 찾을 수 없습니다: ${setId}`);
            }
            
            this.setData = allData.sets[setIndex];
            console.log('[EmailComponent] 세트 데이터 로드 완료:', this.setData);
            
            // 3. 문제 렌더링
            this.renderQuestion();
            
        } catch (error) {
            console.error('[EmailComponent] 초기화 실패:', error);
            alert('이메일 작성 데이터를 불러오는데 실패했습니다.');
        }
    }
    

    
    /**
     * 문제 렌더링
     */
    renderQuestion() {
        const set = this.setData;
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
        const savedAnswer = this.answers[set.setId] || '';
        
        const textarea = document.getElementById('emailTextarea');
        if (textarea) {
            textarea.value = savedAnswer;
            
            this.updateWordCount();
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
        
        const set = this.setData;
        if (!set) {
            console.error('[EmailComponent] setData를 찾을 수 없습니다');
            this.updateWordCount();
            return;
        }
        
        // 답안 저장
        this.answers[set.setId] = textarea.value;
        
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
     * 제출 & TXT 파일 다운로드
     */
    submit() {
        console.log('[EmailComponent] 제출 시작');
        
        const set = this.setData;
        const userAnswer = document.getElementById('emailTextarea').value || '';
        const wordCount = userAnswer.trim().split(/\s+/).filter(word => word.length > 0).length;
        
        console.log('[EmailComponent] 단어수:', wordCount);
        
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
        
        return resultData;
    }
    
    /**
     * TXT 파일 다운로드 (컨트롤러가 다시풀기 시 호출)
     */
    downloadEmail() {
        const set = this.setData;
        const userAnswer = document.getElementById('emailTextarea').value || '';
        const wordCount = userAnswer.trim().split(/\s+/).filter(word => word.length > 0).length;
        
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
        const isRetake = window.currentWritingModule && window.currentWritingModule.isRetake;
        txtContent += `Writing - Email (${isRetake ? '2차 작성' : '1차 작성'})\n`;
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
        
        const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        
        const fileName = `Writing_Email_${isRetake ? '2차' : '1차'}_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}.txt`;
        link.download = fileName;
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        console.log('[EmailComponent] 파일 다운로드 완료:', fileName);
    }

}

// 전역 스코프에 노출
window.EmailComponent = EmailComponent;

// index.html에서 호출하는 편집 도구 전역 함수
function cutText() {
    if (window.currentEmailComponent) {
        window.currentEmailComponent.cutText();
    }
}

function pasteText() {
    if (window.currentEmailComponent) {
        window.currentEmailComponent.pasteText();
    }
}

function undoText() {
    if (window.currentEmailComponent) {
        window.currentEmailComponent.undoText();
    }
}

function redoText() {
    if (window.currentEmailComponent) {
        window.currentEmailComponent.redoText();
    }
}

function toggleWordCount() {
    if (window.currentEmailComponent) {
        window.currentEmailComponent.toggleWordCount();
    }
}

function onEmailTextInput() {
    if (window.currentEmailComponent) {
        window.currentEmailComponent.onTextInput();
    }
}
