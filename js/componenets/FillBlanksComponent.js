/**
 * FillBlanksComponent - 빈칸채우기 컴포넌트
 * v015 - 2025-02-13
 * - 🔥 applyRetakeOverlay()에서 틀린 문제 input.value 초기화 제거
 * - 사용자 입력 답안 완전 보존
 * 
 * 박스 안에 포함된 요소:
 * - 데이터 로드 (Google Sheets)
 * - 지문 렌더링
 * - 답안 입력 처리
 * - 채점 및 결과 저장
 * 
 * 박스 밖 (Controller가 관리):
 * - 진행 바 (Question N of N)
 * - Next/Submit/Back 버튼
 * - 타이머 (Module 전체 타이머 사용)
 * - 다음 세트로 자동 이동
 */

class FillBlanksComponent {
    constructor(setNumber, config = {}) {
        console.log(`📦 [FillBlanksComponent] 생성 - setNumber: ${setNumber}`);
        
        // 박스 내부 변수
        this.setNumber = setNumber;
        this.data = null;
        this.currentSet = null;
        this.answers = {}; // { "blankId": "userAnswer" }
        
        // 콜백
        this.onComplete = config.onComplete || null;
        this.onError = config.onError || null;
        
        // DOM 요소 ID
        this.screenId = 'readingFillBlanksScreen';
        this.titleId = 'fillBlanksTitle';
        this.passageId = 'fillBlanksPassage';
    }
    
    /**
     * 초기화 및 데이터 로드
     */
    async init() {
        console.log(`📖 [FillBlanksComponent] 초기화 시작`);
        
        try {
            // 1. 화면 표시
            showScreen(this.screenId);
            
            // 2. 데이터 로드
            this.data = await loadFillBlanksData();
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
            console.error(`❌ [FillBlanksComponent] 초기화 실패:`, error);
            if (this.onError) {
                this.onError(error);
            }
        }
    }
    
    /**
     * 세트 번호로 인덱스 찾기
     */
    findSetIndex(setNumber) {
        // setNumber가 이미 문자열 형식(fillblank_set_0001)이면 그대로 사용
        // 숫자면 문자열로 변환
        let setId;
        if (typeof setNumber === 'string' && setNumber.startsWith('fillblank_set_')) {
            // 이미 올바른 형식
            setId = setNumber;
            console.log(`  🔍 찾는 Set ID (문자열 입력): ${setId}`);
        } else {
            // 숫자 → 문자열 변환
            setId = `fillblank_set_${String(setNumber).padStart(4, '0')}`;
            console.log(`  🔍 찾는 Set ID (숫자 입력): ${setNumber} → ${setId}`);
        }
        
        for (let i = 0; i < this.data.sets.length; i++) {
            if (this.data.sets[i].id === setId) {
                console.log(`  ✅ 인덱스 ${i}에서 발견`);
                return i;
            }
        }
        console.error(`  ❌ ${setId}를 찾을 수 없음`);
        console.error(`  📋 사용 가능한 세트:`, this.data.sets.map(s => s.id));
        return -1;
    }
    
    /**
     * UI 렌더링
     */
    render() {
        console.log(`🎨 [FillBlanksComponent] 렌더링 시작`);
        
        // 1. 제목 설정
        document.getElementById(this.titleId).textContent = this.currentSet.title;
        
        // 2. 지문 렌더링 (빈칸 포함)
        this.renderPassage();
    }
    
    /**
     * 지문 렌더링 (빈칸 포함)
     */
    renderPassage() {
        const container = document.getElementById(this.passageId);
        container.innerHTML = '';
        
        const passage = this.currentSet.passage;
        let lastIndex = 0;
        let htmlContent = '';
        
        // 빈칸 위치 정렬 (앞에서부터)
        const sortedBlanks = [...this.currentSet.blanks].sort((a, b) => a.startIndex - b.startIndex);
        
        sortedBlanks.forEach((blank, index) => {
            // 빈칸 앞 텍스트
            htmlContent += this.escapeHtml(passage.substring(lastIndex, blank.startIndex));
            
            // 전체 단어를 감싸는 wrapper (줄바꿈 방지)
            htmlContent += `<span class="blank-word-wrapper" style="white-space: nowrap; display: inline-block;">`;
            
            // 접두사 (보이는 글자)
            htmlContent += `<span class="blank-prefix">${this.escapeHtml(blank.prefix)}</span>`;
            
            // 빈칸을 개별 칸으로 렌더링
            htmlContent += `<span class="blank-container" data-blank-id="${blank.id}">`;
            for (let i = 0; i < blank.blankCount; i++) {
                const charInputId = `blank_${this.currentSet.id}_${blank.id}_${i}`;
                htmlContent += `<input 
                    type="text" 
                    class="blank-char-input" 
                    id="${charInputId}"
                    data-blank-id="${blank.id}"
                    data-char-index="${i}"
                    maxlength="1"
                    autocomplete="off"
                    spellcheck="false"
                >`;
            }
            htmlContent += `</span>`;
            
            // wrapper 닫기
            htmlContent += `</span>`;
            
            lastIndex = blank.startIndex + blank.prefix.length + blank.answer.length;
        });
        
        // 마지막 텍스트
        htmlContent += this.escapeHtml(passage.substring(lastIndex));
        
        container.innerHTML = htmlContent;
        
        // 3. 이벤트 리스너 등록
        this.attachEventListeners();
        
        // 4. 이전 답안 복원
        this.restoreAnswers();
    }
    
    /**
     * 이벤트 리스너 등록
     */
    attachEventListeners() {
        const sortedBlanks = [...this.currentSet.blanks].sort((a, b) => a.startIndex - b.startIndex);
        
        sortedBlanks.forEach(blank => {
            for (let i = 0; i < blank.blankCount; i++) {
                const charInputId = `blank_${this.currentSet.id}_${blank.id}_${i}`;
                const input = document.getElementById(charInputId);
                
                if (input) {
                    // input 이벤트
                    input.addEventListener('input', (e) => {
                        this.handleCharInput(e.target, blank.id, i, blank.blankCount);
                    });
                    
                    // keydown 이벤트
                    input.addEventListener('keydown', (e) => {
                        this.handleCharKeydown(e, blank.id, i, blank.blankCount);
                    });
                }
            }
        });
    }
    
    /**
     * 개별 문자 입력 핸들러
     */
    handleCharInput(input, blankId, charIndex, totalChars) {
        // 대문자 입력을 소문자로 변환
        input.value = input.value.toLowerCase();
        
        // 자동 너비 조절
        if (input.value.length > 0) {
            input.classList.add('filled');
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            context.font = '18px Pretendard Variable, Pretendard';
            const metrics = context.measureText(input.value);
            const textWidth = Math.ceil(metrics.width);
            input.style.width = (textWidth + 2) + 'px';
            input.style.padding = '0 1px';
        } else {
            input.classList.remove('filled');
            input.style.width = '10px';
            input.style.padding = '0';
        }
        
        // 전체 답안 업데이트
        this.updateBlankAnswer(blankId, totalChars);
        
        // 자동으로 다음 칸으로 이동
        if (input.value.length === 1 && charIndex < totalChars - 1) {
            const nextInputId = `blank_${this.currentSet.id}_${blankId}_${charIndex + 1}`;
            const nextInput = document.getElementById(nextInputId);
            if (nextInput) {
                nextInput.focus();
            }
        } else if (input.value.length === 1 && charIndex === totalChars - 1) {
            // 마지막 칸이면 다음 빈칸의 첫 번째 칸으로
            const allContainers = document.querySelectorAll('.blank-container');
            const currentContainer = input.closest('.blank-container');
            const currentIndex = Array.from(allContainers).indexOf(currentContainer);
            if (currentIndex < allContainers.length - 1) {
                const nextContainer = allContainers[currentIndex + 1];
                const firstInput = nextContainer.querySelector('.blank-char-input');
                if (firstInput) {
                    firstInput.focus();
                }
            }
        }
    }
    
    /**
     * Backspace 및 방향키 처리
     */
    handleCharKeydown(event, blankId, charIndex, totalChars) {
        const input = event.target;
        
        // 왼쪽 방향키 (←)
        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            if (charIndex > 0) {
                const prevInputId = `blank_${this.currentSet.id}_${blankId}_${charIndex - 1}`;
                const prevInput = document.getElementById(prevInputId);
                if (prevInput) {
                    prevInput.focus();
                }
            } else {
                const allContainers = document.querySelectorAll('.blank-container');
                const currentContainer = input.closest('.blank-container');
                const currentIndex = Array.from(allContainers).indexOf(currentContainer);
                if (currentIndex > 0) {
                    const prevContainer = allContainers[currentIndex - 1];
                    const allInputs = prevContainer.querySelectorAll('.blank-char-input');
                    const lastInput = allInputs[allInputs.length - 1];
                    if (lastInput) {
                        lastInput.focus();
                    }
                }
            }
        }
        
        // 오른쪽 방향키 (→)
        else if (event.key === 'ArrowRight') {
            event.preventDefault();
            if (charIndex < totalChars - 1) {
                const nextInputId = `blank_${this.currentSet.id}_${blankId}_${charIndex + 1}`;
                const nextInput = document.getElementById(nextInputId);
                if (nextInput) {
                    nextInput.focus();
                }
            } else {
                const allContainers = document.querySelectorAll('.blank-container');
                const currentContainer = input.closest('.blank-container');
                const currentIndex = Array.from(allContainers).indexOf(currentContainer);
                if (currentIndex < allContainers.length - 1) {
                    const nextContainer = allContainers[currentIndex + 1];
                    const firstInput = nextContainer.querySelector('.blank-char-input');
                    if (firstInput) {
                        firstInput.focus();
                    }
                }
            }
        }
        
        // Backspace 키
        else if (event.key === 'Backspace' && input.value === '') {
            event.preventDefault();
            if (charIndex > 0) {
                const prevInputId = `blank_${this.currentSet.id}_${blankId}_${charIndex - 1}`;
                const prevInput = document.getElementById(prevInputId);
                if (prevInput) {
                    prevInput.focus();
                    prevInput.value = '';
                    prevInput.classList.remove('filled');
                    prevInput.style.width = '10px';
                    prevInput.style.padding = '0';
                    this.updateBlankAnswer(blankId, totalChars);
                }
            }
        }
    }
    
    /**
     * 빈칸 전체 답안 업데이트
     */
    updateBlankAnswer(blankId, totalChars) {
        let answer = '';
        for (let i = 0; i < totalChars; i++) {
            const inputId = `blank_${this.currentSet.id}_${blankId}_${i}`;
            const input = document.getElementById(inputId);
            if (input) {
                answer += input.value;
            }
        }
        this.answers[blankId] = answer;
        console.log(`💾 [답안 저장] ${blankId} = "${answer}", 전체:`, this.answers);
    }
    
    /**
     * 이전 답안 복원
     */
    restoreAnswers() {
        console.log(`📥 [답안 복원 시작] this.answers:`, this.answers);
        
        const sortedBlanks = [...this.currentSet.blanks].sort((a, b) => a.startIndex - b.startIndex);
        
        sortedBlanks.forEach(blank => {
            const savedAnswer = this.answers[blank.id] || '';
            console.log(`  복원 시도: ${blank.id} = "${savedAnswer}"`);
            
            for (let i = 0; i < blank.blankCount; i++) {
                const charInputId = `blank_${this.currentSet.id}_${blank.id}_${i}`;
                const input = document.getElementById(charInputId);
                if (input && savedAnswer[i]) {
                    input.value = savedAnswer[i];
                    input.classList.add('filled');
                    console.log(`    ✅ ${charInputId} = "${savedAnswer[i]}"`);
                } else if (input) {
                    console.log(`    ⚠️ ${charInputId} 값 없음`);
                }
            }
        });
        
        console.log(`📥 [답안 복원 완료]`);
    }
    
    /**
     * 제출 (채점 및 결과 저장)
     */
    submit() {
        console.log(`📤 [FillBlanksComponent] 제출 시작`);
        
        // 1. 채점
        const results = this.gradeAnswers();
        
        // 2. sessionStorage에 저장 (이 세트만)
        sessionStorage.setItem(
            `fillblank_set_${this.setNumber}`,
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
            type: 'fillblanks',
            setId: this.currentSet.id,
            setNumber: this.setNumber,
            setTitle: this.currentSet.title,
            passage: this.currentSet.passage,
            blanks: this.currentSet.blanks, // ✅ blanks 추가!
            answers: []
        };
        
        // ✅ startIndex 순서로 정렬 (applyRetakeOverlay와 동일)
        const sortedBlanks = [...this.currentSet.blanks].sort((a, b) => a.startIndex - b.startIndex);
        
        sortedBlanks.forEach(blank => {
            const userAnswer = this.answers[blank.id] || '';
            const isCorrect = userAnswer.toLowerCase() === blank.answer.toLowerCase();
            
            setResults.answers.push({
                blankId: blank.id,
                question: `${blank.prefix}_____ (${blank.blankCount}글자)`,
                userAnswer: userAnswer,
                correctAnswer: blank.answer,
                prefix: blank.prefix,
                isCorrect: isCorrect,
                explanation: blank.explanation || '해설이 준비 중입니다.',
                commonMistakes: blank.commonMistakes || '',
                mistakesExplanation: blank.mistakesExplanation || ''
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
        console.log(`🧹 [FillBlanksComponent] 정리`);
        this.data = null;
        this.currentSet = null;
        this.answers = {};
    }
    
    /**
     * 2차 풀이 모드 초기화
     */
    async initRetakeMode(blanksIndexStart, blanksCount, firstAttemptBlanks) {
        console.log(`🔄 [FillBlanksComponent] 2차 풀이 모드 - 빈칸 ${blanksIndexStart + 1}~${blanksIndexStart + blanksCount}`);
        
        try {
            // ✅ 답안 초기화는 컨트롤러에서 제어 - 여기서는 하지 않음
            // (캐시 복원이 나중에 이루어지므로)
            
            // 1. 데이터 로드
            if (!this.data) {
                this.data = await loadFillBlanksData();
            }
            
            // 2. 세트 찾기
            const setIndex = this.findSetIndex(this.setNumber);
            if (setIndex === -1) {
                throw new Error(`세트를 찾을 수 없습니다: ${this.setNumber}`);
            }
            
            this.currentSet = this.data.sets[setIndex];
            
            // 3. 화면 표시
            showScreen(this.screenId);
            
            // 4. 일반 렌더링 먼저 실행 (1차 UI 그대로 사용)
            this.render();
            
            // 5. 2차 풀이용 오버레이 적용 (정답/오답 표시)
            this.applyRetakeOverlay(firstAttemptBlanks);
            
            // 6. 타이머와 Next 버튼 숨기기
            this.hideUnnecessaryElements();
            
        } catch (error) {
            console.error('[FillBlanksComponent] 2차 풀이 초기화 실패:', error);
            if (this.onError) {
                this.onError(error);
            }
        }
    }
    
    /**
     * 2차 풀이용 오버레이 적용 (정답/오답 표시)
     */
    applyRetakeOverlay(firstAttemptBlanks) {
        console.log(`🎨 [FillBlanksComponent] 2차 풀이 오버레이 적용`);
        console.log(`  📦 firstAttemptBlanks:`, firstAttemptBlanks);
        
        const sortedBlanks = [...this.currentSet.blanks].sort((a, b) => a.startIndex - b.startIndex);
        
        // Canvas 준비 (정답 글자 폭 측정용)
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        context.font = '18px Pretendard Variable, Pretendard';
        
        sortedBlanks.forEach((blank, index) => {
            const firstResult = firstAttemptBlanks[index];
            const wasCorrect = firstResult?.isCorrect || false;
            
            console.log(`    빈칸 ${index + 1}: id=${blank.id}, answer="${blank.answer}", 1차결과=${wasCorrect ? '✅' : '❌'}`);
            
            // 해당 빈칸의 모든 input 찾기
            const inputs = document.querySelectorAll(`input[data-blank-id="${blank.id}"]`);
            
            if (wasCorrect) {
                // 맞은 문제 - 정답을 표시하고 초록색 배경, 읽기 전용
                const correctAnswer = blank.answer; // 예: "rom"
                
                // ✅ this.answers에도 정답 저장! (RetakeController가 수집할 수 있도록)
                this.answers[blank.id] = correctAnswer;
                
                inputs.forEach((input, charIndex) => {
                    if (charIndex < correctAnswer.length) {
                        const char = correctAnswer[charIndex];
                        input.value = char; // 정답 글자 채우기
                        
                        // 1차 UI와 동일한 자동 크기 조절 (canvas.measureText 사용)
                        input.classList.add('filled');
                        const metrics = context.measureText(char);
                        const textWidth = Math.ceil(metrics.width);
                        input.style.width = (textWidth + 2) + 'px';
                        input.style.padding = '0 1px';
                    }
                    // 초록 배경만 추가 (나머지 스타일은 1차 UI 그대로)
                    input.style.backgroundColor = '#dcfce7';
                    input.style.color = '#10b981';
                    input.style.fontWeight = '500';
                    input.readOnly = true;
                    input.style.pointerEvents = 'none';
                    input.classList.add('retake-correct');
                });
            } else {
                // 틀린 문제 - 빨간색 배경만 추가, 사용자 입력 유지!
                inputs.forEach(input => {
                    // ✅ value는 그대로 유지! (사용자가 입력한 답안 보존)
                    // input.value = '';  삭제!
                    
                    // 빨간 배경만 추가, 나머지는 1차 UI 그대로
                    input.style.backgroundColor = '#fee2e2';
                    input.classList.add('retake-wrong');
                    // 1차 UI의 모든 기능 그대로 사용 (자동 크기 조절, 자동 포커스 이동 등)
                });
            }
        });
        
        console.log('[FillBlanksComponent] 2차 풀이 오버레이 적용 완료');
    }
    
    /**
     * 타이머와 불필요한 버튼 숨기기
     */
    hideUnnecessaryElements() {
        // 타이머 숨기기
        const timerEl = document.getElementById('fillBlanksTimer');
        if (timerEl) {
            timerEl.parentElement.style.display = 'none';
        }
        
        // Next/Submit 버튼 숨기기
        const submitBtn = document.getElementById('fillBlanksSubmitBtn');
        if (submitBtn) {
            submitBtn.style.display = 'none';
        }
        
        const prevBtn = document.getElementById('fillBlanksPrevBtn');
        if (prevBtn) {
            prevBtn.style.display = 'none';
        }
        
        console.log('  🚫 타이머와 버튼 숨김 완료');
    }
    
    /**
     * 2차 풀이 답안 가져오기
     */
    getAnswer(blankId) {
        return this.answers[blankId] || '';
    }
}

// 전역으로 노출 (기존 코드와 호환성)
window.FillBlanksComponent = FillBlanksComponent;
