// Writing - 이메일작성 로직 (어댑터)
// EmailComponent를 사용하는 어댑터
// v=012

console.log('✅ writing-email-logic.js 로드 시작 (EmailComponent 어댑터)');

// 컴포넌트 인스턴스 (전역에서 접근 가능하도록)
window.currentEmailComponent = null;

async function initEmailComponent(setId, onCompleteCallback) {
    console.log(`📦 [모듈] initEmailComponent - setId: ${setId}`);
    
    // ★ 기존 타이머가 있으면 먼저 정리
    if (window._emailTimerInterval) {
        clearInterval(window._emailTimerInterval);
        window._emailTimerInterval = null;
        console.log('🧹 [Email] 기존 타이머 정리');
    }
    
    window.currentEmailComponent = new EmailComponent(setId, {
        onComplete: (results) => {
            console.log(`✅ [모듈] Email Component 완료`);
            // ★ 타이머 정리
            if (window._emailTimerInterval) {
                clearInterval(window._emailTimerInterval);
                window._emailTimerInterval = null;
            }
            if (onCompleteCallback) onCompleteCallback(results);
        },
        onError: (error) => console.error(`❌ [모듈] Email Component 오류:`, error)
    });
    
    try {
        await window.currentEmailComponent.init();
    } catch (e) {
        console.error('❌ [Email] init 실패:', e);
    }
    
    // ★ 2차 작성 (시간제한 없음) 모드: 타이머 숨기기
    if (window.writingFlowNoTimer) {
        console.log('⏰ [Email] 2차 작성 모드 - 타이머 숨김');
        const timerEl = document.getElementById('emailTimer');
        if (timerEl) timerEl.style.display = 'none';
    } else {
        // ★ 1차 작성: 타이머 시작 (7분 = 420초)
        console.log('⏱️ [Email] 타이머 시작 조건 충족 (writingFlowNoTimer:', window.writingFlowNoTimer, ')');
        startEmailTimer(420);
    }
}

/**
 * 이메일 타이머 시작
 */
function startEmailTimer(totalSeconds) {
    // ★ 기존 타이머 중복 방지
    if (window._emailTimerInterval) {
        clearInterval(window._emailTimerInterval);
        window._emailTimerInterval = null;
    }
    
    let remaining = totalSeconds;
    
    function updateDisplay() {
        // ★ 매번 요소를 다시 찾아 DOM 갱신에 안전
        const timerEl = document.getElementById('emailTimer');
        if (!timerEl) {
            console.warn('⚠️ [Email] emailTimer 요소를 찾을 수 없음');
            return;
        }
        timerEl.style.display = '';  // 보이도록 강제
        const min = Math.floor(remaining / 60);
        const sec = remaining % 60;
        timerEl.textContent = `${min}:${String(sec).padStart(2, '0')}`;
    }
    
    updateDisplay();
    
    window._emailTimerInterval = setInterval(() => {
        remaining--;
        updateDisplay();
        
        if (remaining <= 0) {
            clearInterval(window._emailTimerInterval);
            window._emailTimerInterval = null;
            console.log('⏰ [Email] 시간 종료 → 자동 제출');
            submitWritingEmail();
        }
    }, 1000);
    
    console.log(`⏱️ [Email] 타이머 시작: ${totalSeconds}초 (${Math.floor(totalSeconds/60)}분 ${totalSeconds%60}초)`);
}

/**
 * 이메일작성 초기화
 * Module에서 호출됨 (화면 전환 후)
 */
async function initWritingEmail(setNumber = 1) {
    console.log(`[어댑터] initWritingEmail 호출 - setNumber: ${setNumber}`);
    
    try {
        // EmailComponent 생성
        window.currentEmailComponent = new EmailComponent(setNumber, function(resultData) {
            console.log('[어댑터] EmailComponent 완료 콜백 호출됨');
            console.log('[어댑터] resultData:', resultData);
            
            // 결과 화면 표시
            showEmailResult(resultData);
        });
        
        // 초기화
        await window.currentEmailComponent.init();
        
        // 텍스트 입력 이벤트 바인딩
        const textarea = document.getElementById('emailTextarea');
        if (textarea) {
            textarea.addEventListener('input', () => {
                window.currentEmailComponent.onTextInput();
            });
        }
        
    } catch (error) {
        console.error('[어댑터] initWritingEmail 실패:', error);
        alert('이메일 작성을 시작할 수 없습니다.');
    }
}

/**
 * 제출 (Module에서 버튼 클릭 시 호출)
 */
function submitWritingEmail() {
    console.log('[어댑터] submitWritingEmail 호출됨');
    
    if (!window.currentEmailComponent) {
        console.error('[어댑터] currentEmailComponent가 없습니다');
        return;
    }
    
    // 컴포넌트의 submit() 호출
    // ★ submit() 내부에서 this.onComplete(resultData)를 호출하므로
    //    여기서 콜백을 중복 호출하지 않음 (V2 이중 신호 제거)
    window.currentEmailComponent.submit();
}

/**
 * Cut (어댑터 함수)
 */
function cutText() {
    if (window.currentEmailComponent) {
        window.currentEmailComponent.cutText();
    }
}

/**
 * Paste (어댑터 함수)
 */
function pasteText() {
    if (window.currentEmailComponent) {
        window.currentEmailComponent.pasteText();
    }
}

/**
 * Undo (어댑터 함수)
 */
function undoText() {
    if (window.currentEmailComponent) {
        window.currentEmailComponent.undoText();
    }
}

/**
 * Redo (어댑터 함수)
 */
function redoText() {
    if (window.currentEmailComponent) {
        window.currentEmailComponent.redoText();
    }
}

/**
 * 단어수 표시/숨김 (어댑터 함수)
 */
function toggleWordCount() {
    if (window.currentEmailComponent) {
        window.currentEmailComponent.toggleWordCount();
    }
}

window.initEmailComponent = initEmailComponent;
window.initWritingEmail = initWritingEmail;

/**
 * 답안 다운로드 (어댑터 함수)
 */
function downloadEmail() {
    if (window.currentEmailComponent) {
        window.currentEmailComponent.downloadEmail();
    }
}

/**
 * 이메일 텍스트 입력 이벤트 (전역 - index.html oninput에서 호출)
 */
function onEmailTextInput() {
    if (window.currentEmailComponent) {
        window.currentEmailComponent.onTextInput();
    }
}
window.onEmailTextInput = onEmailTextInput;

console.log('✅ writing-email-logic.js 로드 완료 (EmailComponent 어댑터)');
console.log('✅ initWritingEmail 함수:', typeof initWritingEmail);
console.log('✅ submitWritingEmail 함수:', typeof submitWritingEmail);
