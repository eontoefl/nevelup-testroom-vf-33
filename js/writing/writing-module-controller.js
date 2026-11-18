/**
 * ================================================
 * writing-module-controller.js
 * 라이팅 모듈 컨트롤러 (V3)
 * ================================================
 * 
 * 역할: Arrange(10문제) → Email(1문제) → Discussion(1문제) 총 12문제를
 *       순서대로 진행시키는 지휘자
 * 
 * 흐름:
 *   대시보드 "실전풀이" → startWritingModule(moduleNumber)
 *   → Arrange 10문제 (Next/Prev 자유 이동)
 *   → Arrange Submit → 결과 화면 → Email로 이동
 *   → Email Submit → 결과 화면 → Discussion으로 이동
 *   → Discussion Submit → 결과 화면 → DB 저장 → 대시보드 복귀
 * 
 * 시퀀스 (총 12문제):
 *   Arrange(Q1-10) → Email(Q11) → Discussion(Q12)
 * 
 * 참조: docs/writing-module-controller-spec.md
 */

// ============================================================
// 전역 상태
// ============================================================

window.currentWritingModule = null;

// ============================================================
// 1. 진입점 — startWritingModule
// ============================================================

/**
 * 라이팅 모듈 시작 (대시보드에서 호출됨)
 * @param {number} moduleNumber - 모듈 번호 (1, 2, ...)
 */
async function startWritingModule(moduleNumber) {
    console.log(`\n✍️ ============================`);
    console.log(`✍️ 라이팅 Module ${moduleNumber} 시작`);
    console.log(`✍️ ============================\n`);

    // 세트 번호 = 모듈 번호 (각 유형 1세트씩)
    var setNumber = moduleNumber;

    // 시퀀스 정의: Arrange → Email → Discussion
    var sequence = [
        { type: 'arrange',    setNum: setNumber, questionsPerSet: 10, label: '단어배열' },
        { type: 'email',      setNum: setNumber, questionsPerSet: 1,  label: '이메일 작성' },
        { type: 'discussion', setNum: setNumber, questionsPerSet: 1,  label: '토론형 작성' }
    ];

    // 모듈 상태 객체 생성
    window.currentWritingModule = {
        moduleNum: moduleNumber,
        sequence: sequence,
        components: [],       // 3개 컴포넌트 인스턴스
        currentIndex: 0,      // 현재 유형 인덱스 (0=Arrange, 1=Email, 2=Discussion)
        totalQuestions: 12,
        results: {},          // 유형별 결과
        isRetake: false       // 다시풀기 여부
    };

    // 다시풀기 여부: 과제 대시보드가 버튼을 정할 때 한 번 판단한 값을 쓴다(첫 풀이 기록 있음·마감 지남·정지 중이면 다시 풀기).
    // 판단 지점이 하나라 시작 팝업 여부와 저장 칸(initial/current)이 항상 같다.
    var state = window._taskDashboardState;
    window.currentWritingModule.isRetake = !!(state && state.isRetake);

    // 3개 컴포넌트 생성
    _createAllWritingComponents();

    // 세 파트의 문제를 먼저 받는다(리딩·리스닝과 같은 공용 함수) — 파트에 도착했는데 문제가 없고 타이머만 흐르는 일이 없음
    // (못 받으면 _loadAllComponents가 안내 팝업을 띄움 → 모듈을 만들지 않고 끝, 학생은 대시보드에 그대로)
    if (!(await _loadAllComponents(window.currentWritingModule.components))) {
        console.error('❌ 라이팅 문제를 받지 못해 시작하지 않음');
        window.currentWritingModule = null;
        return;
    }

    // 첫 유형(Arrange) 시작
    await _startWritingType(0);
}

// ============================================================
// 2. 컴포넌트 생성 (3개 한꺼번에)
// ============================================================

function _createAllWritingComponents() {
    var mod = window.currentWritingModule;
    if (!mod) return;

    console.log('📦 3개 라이팅 컴포넌트 생성 시작...');

    mod.components = mod.sequence.map(function(seq, index) {
        var comp = null;

        switch (seq.type) {
            case 'arrange':
                comp = new ArrangeComponent(seq.setNum);
                window.currentArrangeComponent = comp;
                break;
            case 'email':
                comp = new EmailComponent(seq.setNum);
                window.currentEmailComponent = comp;
                break;
            case 'discussion':
                comp = new DiscussionComponent(seq.setNum);
                window.currentDiscussionComponent = comp;
                break;
        }

        console.log(`  ✅ [${index}] ${seq.label} 생성 완료`);
        return comp;
    });

    console.log('📦 3개 라이팅 컴포넌트 생성 완료');
}

// ============================================================
// 3. 유형 시작 (화면 전환 + init + 타이머 + 버튼/번호)
// ============================================================

/**
 * 특정 유형으로 이동
 * @param {number} typeIndex - 0=Arrange, 1=Email, 2=Discussion
 */
async function _startWritingType(typeIndex) {
    var mod = window.currentWritingModule;
    if (!mod) return;

    if (typeIndex < 0 || typeIndex >= mod.sequence.length) {
        console.warn('⚠️ 유효하지 않은 유형 인덱스:', typeIndex);
        return;
    }

    mod.currentIndex = typeIndex;
    var seq = mod.sequence[typeIndex];
    var comp = mod.components[typeIndex];

    console.log(`\n▶️ [${typeIndex + 1}/3] ${seq.label} 시작`);

    // 화면 전환
    var screenMap = {
        'arrange':    'writingArrangeScreen',
        'email':      'writingEmailScreen',
        'discussion': 'writingDiscussionScreen'
    };
    var screenId = screenMap[seq.type];
    if (screenId && typeof showScreen === 'function') {
        showScreen(screenId);
    }

    // 첫 화면 그리기 (문제는 모듈 시작 때 받아 둠)
    comp.show();

    // 타이머 시작
    _startWritingTimer(seq.type);

    // 버튼 상태 + 문제 번호 업데이트
    _updateWritingButtons();
    _updateWritingProgress();
}

// ============================================================
// 4. 유형별 타이머 관리
// ============================================================

var _writingTimerState = {
    interval: null,
    remaining: 0,
    currentType: null,
    expired: false
};

// 유형별 제한 시간 (초)
var WRITING_TIME_LIMITS = {
    'arrange':    410,  // 6분 50초
    'email':      420,  // 7분
    'discussion': 600   // 10분
};

// 시간초과 잠금 대상 입력칸 (유형 → 입력칸 ID)
// 이 화면 요소들은 시도마다 새로 만들어지지 않고 재사용되므로,
// 잠금 상태를 직접 켜고 끄지 말고 _syncWritingInputLock()으로만 맞춘다.
var WRITING_INPUT_IDS = {
    'email':      'emailTextarea',
    'discussion': 'discussionTextarea'
};

/**
 * 입력칸 잠금 상태를 "이번 시도의 타이머 상태"에 맞춘다
 * - 지금 푸는 유형의 입력칸이고, 이번 시도의 시간이 끝났으면 → 잠금
 * - 그 외 → 열림
 * 시도(유형 시작) / 시간 종료 / 라이팅 종료 시점에 호출한다.
 */
function _syncWritingInputLock() {
    Object.keys(WRITING_INPUT_IDS).forEach(function(type) {
        var textarea = document.getElementById(WRITING_INPUT_IDS[type]);
        if (!textarea) return;

        var locked = (_writingTimerState.currentType === type) && _writingTimerState.expired;
        textarea.disabled = locked;
        textarea.style.opacity = locked ? '0.7' : '';
    });
}

/**
 * 유형별 타이머 시작
 * (이번 시도의 타이머 상태를 먼저 초기화한 뒤 입력칸 잠금을 맞춘다)
 */
function _startWritingTimer(type) {
    _stopWritingTimer();

    _writingTimerState.currentType = type;
    _writingTimerState.expired = false;

    var seconds = WRITING_TIME_LIMITS[type];
    if (!seconds) {
        _syncWritingInputLock();
        return;
    }

    _writingTimerState.remaining = seconds;
    _updateWritingTimerDisplay();
    _syncWritingInputLock();

    console.log('⏱️ 타이머 시작:', type, seconds + '초');

    _writingTimerState.interval = setInterval(function() {
        _writingTimerState.remaining--;
        _updateWritingTimerDisplay();

        if (_writingTimerState.remaining <= 0) {
            _stopWritingTimer();
            _writingTimerState.expired = true;
            _onWritingTimerExpired();
        }
    }, 1000);
}

/**
 * 타이머 정지
 */
function _stopWritingTimer() {
    if (_writingTimerState.interval) {
        clearInterval(_writingTimerState.interval);
        _writingTimerState.interval = null;
    }
}

/**
 * 타이머 화면 표시 업데이트
 */
function _updateWritingTimerDisplay() {
    var mod = window.currentWritingModule;
    if (!mod) return;

    var sec = Math.max(0, _writingTimerState.remaining);
    var min = Math.floor(sec / 60);
    var s = sec % 60;
    var text = min + ':' + (s < 10 ? '0' : '') + s;

    var timerIds = {
        'arrange':    'arrangeTimer',
        'email':      'emailTimer',
        'discussion': 'discussionTimer'
    };

    var el = document.getElementById(timerIds[_writingTimerState.currentType]);
    if (el) {
        el.textContent = text;
        // 1분 미만: 빨간색
        if (sec < 60) {
            el.style.color = '#ef4444';
        } else {
            el.style.color = '';
        }
    }
}

/**
 * 시간 초과 시 입력 비활성화
 * (학생이 Next/Submit 눌러야 다음으로 이동 — 자동 넘김 없음)
 */
function _onWritingTimerExpired() {
    var mod = window.currentWritingModule;
    if (!mod) return;

    var seq = mod.sequence[mod.currentIndex];
    console.log('⏰ 시간 만료:', seq.label);

    switch (seq.type) {
        case 'arrange':
            // 드래그 앤 드롭 비활성화: 옵션 단어 드래그 불가
            var options = document.querySelectorAll('.arrange-option');
            options.forEach(function(opt) {
                opt.setAttribute('draggable', 'false');
                opt.style.opacity = '0.5';
                opt.style.pointerEvents = 'none';
            });
            // 빈칸 클릭(제거) 비활성화
            var blanks = document.querySelectorAll('.arrange-blank');
            blanks.forEach(function(blank) {
                blank.style.pointerEvents = 'none';
            });
            break;

        case 'email':
        case 'discussion':
            // 잠금은 타이머 상태(expired=true)에서 판단 — 직접 잠그지 않는다
            _syncWritingInputLock();
            break;
    }
}

// ============================================================
// 5. 버튼 상태 업데이트
// ============================================================

function _updateWritingButtons() {
    var mod = window.currentWritingModule;
    if (!mod) return;

    var seq = mod.sequence[mod.currentIndex];
    var comp = mod.components[mod.currentIndex];

    switch (seq.type) {
        case 'arrange':
            _setArrangeButtons(comp);
            break;
        case 'email':
            // Email: Submit만 표시 (문제 1개, Next 불필요)
            var emailNextBtn = document.getElementById('emailNextBtn');
            var emailSubmitBtn = document.getElementById('emailSubmitBtn');
            if (emailNextBtn) emailNextBtn.style.display = 'none';
            if (emailSubmitBtn) emailSubmitBtn.style.display = '';
            break;
        case 'discussion':
            // Discussion: Submit만 표시
            var discSubmitBtn = document.getElementById('discussionSubmitBtn');
            if (discSubmitBtn) discSubmitBtn.style.display = '';
            break;
    }
}

/**
 * Arrange 버튼 관리
 * - 문제 1: Prev 숨김, Next 표시, Submit 숨김
 * - 문제 2~9: Prev 표시, Next 표시, Submit 숨김
 * - 문제 10: Prev 표시, Next 숨김, Submit 표시
 */
function _setArrangeButtons(comp) {
    var prevBtn = document.getElementById('arrangePrevBtn');
    var nextBtn = document.getElementById('arrangeNextBtn');
    var submitBtn = document.getElementById('arrangeSubmitBtn');

    var isFirst = (comp.currentQuestion === 0);
    var totalQuestions = comp.setData ? comp.setData.questions.length : 10;
    var isLast = (comp.currentQuestion >= totalQuestions - 1);

    if (prevBtn) prevBtn.style.display = isFirst ? 'none' : '';
    if (nextBtn) nextBtn.style.display = isLast ? 'none' : '';
    if (submitBtn) submitBtn.style.display = isLast ? '' : 'none';
}

// ============================================================
// 6. 문제 번호 표시 업데이트
// ============================================================

function _updateWritingProgress() {
    var mod = window.currentWritingModule;
    if (!mod) return;

    var seq = mod.sequence[mod.currentIndex];
    var comp = mod.components[mod.currentIndex];
    var progressText = '';
    var progressElId = '';

    switch (seq.type) {
        case 'arrange':
            // Arrange 내부 문제 인덱스(0~9) + 1 = 전체 문제 번호(1~10)
            var qNum = comp.currentQuestion + 1;
            progressText = 'Question ' + qNum + ' of ' + mod.totalQuestions;
            progressElId = 'arrangeProgress';
            break;

        case 'email':
            progressText = 'Question 11 of ' + mod.totalQuestions;
            progressElId = 'emailProgress';
            break;

        case 'discussion':
            progressText = 'Question 12 of ' + mod.totalQuestions;
            progressElId = 'discussionProgress';
            break;
    }

    var el = document.getElementById(progressElId);
    if (el) {
        el.textContent = progressText;
    }
}

// ============================================================
// 7. HTML onclick 연결용 전역 함수
// ============================================================

// Arrange Next
window.nextArrangeQuestion = function() {
    var mod = window.currentWritingModule;
    if (!mod || mod.currentIndex !== 0) return;

    var comp = mod.components[0];
    var moved = comp.nextQuestion();
    if (moved) {
        _updateWritingButtons();
        _updateWritingProgress();
    }
};

// Arrange Prev
window.prevArrangeQuestion = function() {
    var mod = window.currentWritingModule;
    if (!mod || mod.currentIndex !== 0) return;

    var comp = mod.components[0];
    comp.prevQuestion();
    _updateWritingButtons();
    _updateWritingProgress();
};

// Arrange Submit → 바로 Email로 이동
window.submitWritingArrange = function() {
    var mod = window.currentWritingModule;
    if (!mod || mod.currentIndex !== 0) return;

    // 타이머 멈춤
    _stopWritingTimer();

    var comp = mod.components[0];
    var result = comp.submit();

    // 결과 저장
    mod.results.arrange = result;
    console.log('✅ Arrange 채점 결과 저장');

    // 바로 Email로 이동
    _startWritingType(1);
};

// Email Submit → 바로 Discussion으로 이동
window.submitWritingEmail = function() {
    var mod = window.currentWritingModule;
    if (!mod || mod.currentIndex !== 1) return;

    // 타이머 멈춤
    _stopWritingTimer();

    var comp = mod.components[1];
    var result = comp.submit();

    // 결과 저장
    mod.results.email = result;
    console.log('✅ Email 채점 결과 저장');

    // 다시풀기이면 TXT 다운로드
    if (mod.isRetake && typeof comp.downloadEmail === 'function') {
        comp.downloadEmail();
        console.log('📥 Email TXT 다운로드 (다시풀기)');
    }

    // 바로 Discussion으로 이동
    _startWritingType(2);
};

// Discussion Submit → 바로 DB 저장 + 대시보드 복귀
window.submitWritingDiscussion = function() {
    var mod = window.currentWritingModule;
    if (!mod || mod.currentIndex !== 2) return;

    // 타이머 멈춤
    _stopWritingTimer();

    var comp = mod.components[2];
    var result = comp.submit();

    // 결과 저장
    mod.results.discussion = result;
    console.log('✅ Discussion 채점 결과 저장');

    // 다시풀기이면 TXT 다운로드
    if (mod.isRetake && typeof comp.downloadDiscussion === 'function') {
        comp.downloadDiscussion();
        console.log('📥 Discussion TXT 다운로드 (다시풀기)');
    }

    // DB 저장 + 대시보드 복귀
    _finishWritingModule();
};

// ============================================================
// 8. 완료 → DB 저장 → 대시보드 복귀
// ============================================================

async function _finishWritingModule() {
    var mod = window.currentWritingModule;
    if (!mod) return;

    console.log('\n🎉 ============================');
    console.log('🎉 라이팅 Module 완료!');
    console.log('🎉 ============================\n');

    // 로딩 표시
    if (typeof _showSubmitLoading === 'function') {
        _showSubmitLoading();
    }

    // Arrange 정답 수 계산
    var arrangeResult = mod.results.arrange || {};
    var arrangeCorrect = arrangeResult.correct || 0;
    var arrangeTotal = arrangeResult.total || 10;
    var arrangeAccuracy = arrangeResult.accuracy || 0;

    console.log('📊 Arrange 정답:', arrangeCorrect, '/', arrangeTotal, '(', arrangeAccuracy + '%)');

    // V3 JSON 구조 생성
    var recordJson = {
        totalQuestions: mod.totalQuestions,
        arrange: {
            correct: arrangeCorrect,
            total: arrangeTotal,
            accuracy: arrangeAccuracy,
            results: arrangeResult.results || []
        },
        email: mod.results.email || { wordCount: 0, userAnswer: '' },
        discussion: mod.results.discussion || { wordCount: 0, userAnswer: '' },
        completedAt: new Date().toISOString()
    };

    // DB 저장
    var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : window.currentUser;
    var ct = window.currentTest;
    var state2 = window._taskDashboardState || {};
    var inPractice2 = state2.isPractice;

    if (user && user.id && user.id !== 'dev-user-001' && (ct || inPractice2)) {
        var week = inPractice2 ? null : ct.currentWeek;
        var day = inPractice2 ? null : ct.currentDay;

        try {
            // 정규·연습 공용 저장: 재시도 → 최종 실패 시 제출 로딩을 끄고 실패 팝업(SaveGuard.saveRecord)
            var saved = await SaveGuard.saveRecord({
                userId: user.id,
                sectionType: 'writing',
                moduleNumber: mod.moduleNum,
                practiceNumber: inPractice2 ? state2.practiceNumber : null,
                week: week,
                day: day,
                isRetake: mod.isRetake,
                record: recordJson,
                regularExtras: {
                    // 실전풀이 원문 2칸은 정규 표에만 있음(연습 표엔 없어 넘기면 400)
                    writing_email_text: mod.results.email ? mod.results.email.userAnswer : '',
                    writing_discussion_text: mod.results.discussion ? mod.results.discussion.userAnswer : ''
                },
                taskLabel: '라이팅 ' + mod.moduleNum,
                onDone: function() {
                    window.currentWritingModule = null;
                    backToTaskDashboard();
                }
            });
            if (!saved) return;
            console.log('💾 ' + (mod.isRetake ? 'current' : 'initial') + '_record 저장 완료');

            // ✅ 저장 성공 → 정리 + 대시보드 복귀
            if (typeof _hideSubmitLoading === 'function') {
                _hideSubmitLoading();
            }
            window.currentWritingModule = null;
            backToTaskDashboard();

        } catch (e) {
            // ❌ 저장 실패 → 로딩 닫고 화면 유지, 답안 보존
            console.error('❌ DB 저장 실패:', e);
            if (typeof _hideSubmitLoading === 'function') {
                _hideSubmitLoading();
            }
            alert('저장에 실패했습니다. 인터넷 연결을 확인하고 다시 시도해주세요.');
        }
    } else {
        console.log('📊 [개발모드] DB 저장 생략');
        console.log('📊 결과 데이터:', JSON.stringify(recordJson, null, 2));
        if (typeof _hideSubmitLoading === 'function') {
            _hideSubmitLoading();
        }
        window.currentWritingModule = null;
        backToTaskDashboard();
    }
}

// ============================================================
// 9. 정리 함수
// ============================================================

/**
 * 라이팅 모듈 전체 정리
 * - 타이머 정지
 * - 전역 컴포넌트 참조 해제
 * - 모듈 상태 초기화
 */
function cleanupWritingModule() {
    console.log('🧹 [cleanupWritingModule] 라이팅 모듈 정리 시작');

    // 1. 타이머 정지 + 이번 시도의 타이머 상태 초기화 + 입력칸 잠금 해제
    //    (정상 제출 후에는 currentWritingModule이 이미 null이므로
    //     아래 '모듈 없음' 확인보다 먼저 실행해야 잠금이 남지 않는다)
    _stopWritingTimer();
    _writingTimerState.currentType = null;
    _writingTimerState.expired = false;
    _writingTimerState.remaining = 0;
    _syncWritingInputLock();
    console.log('✅ 타이머 정지 + 입력칸 잠금 초기화 완료');

    var mod = window.currentWritingModule;
    if (!mod) {
        console.log('🧹 라이팅 모듈 없음 — 나머지 정리 불필요');
        return;
    }

    // 2. 전역 컴포넌트 참조 해제
    window.currentArrangeComponent = null;
    window.currentEmailComponent = null;
    window.currentDiscussionComponent = null;

    // 3. 모듈 상태 초기화
    window.currentWritingModule = null;
    console.log('✅ [cleanupWritingModule] 라이팅 모듈 정리 완료');
}

// ============================================================
// 로드 확인
// ============================================================

console.log('✅ writing-module-controller.js loaded');
