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

    // 다시풀기 여부 확인
    var state = window._taskDashboardState;
    if (state) {
        var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : window.currentUser;
        if (user && user.id && user.id !== 'dev-user-001') {
            try {
                var existing = await getStudyResultV3(
                    user.id, 'writing', moduleNumber,
                    state.week, state.day
                );
                if (existing && existing.initial_record != null) {
                    window.currentWritingModule.isRetake = true;
                    console.log('🔄 다시풀기 모드');
                }
            } catch (e) {
                console.warn('⚠️ 다시풀기 확인 실패 (무시하고 진행):', e);
            }
        }
    }

    // 3개 컴포넌트 생성
    _createAllWritingComponents();

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

    // 컴포넌트 초기화
    await comp.init();

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

/**
 * 유형별 타이머 시작
 */
function _startWritingTimer(type) {
    _stopWritingTimer();

    var seconds = WRITING_TIME_LIMITS[type];
    if (!seconds) return;

    _writingTimerState.remaining = seconds;
    _writingTimerState.currentType = type;
    _writingTimerState.expired = false;
    _updateWritingTimerDisplay();

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
            var emailTextarea = document.getElementById('emailWritingArea');
            if (emailTextarea) {
                emailTextarea.disabled = true;
                emailTextarea.style.opacity = '0.7';
            }
            break;

        case 'discussion':
            var discTextarea = document.getElementById('discussionWritingArea');
            if (discTextarea) {
                discTextarea.disabled = true;
                discTextarea.style.opacity = '0.7';
            }
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
    var totalQuestions = comp.currentSetData ? comp.currentSetData.questions.length : 10;
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

    if (user && user.id && user.id !== 'dev-user-001' && ct) {
        var week = ct.currentWeek;
        var day = ct.currentDay;

        try {
            if (mod.isRetake) {
                await upsertCurrentRecord(user.id, 'writing', mod.moduleNum, week, day, recordJson);
                console.log('💾 current_record 저장 완료');
            } else {
                // 실전풀이: extras로 email/discussion 텍스트 별도 컬럼 저장
                var extras = {
                    writing_email_text: mod.results.email ? mod.results.email.userAnswer : '',
                    writing_discussion_text: mod.results.discussion ? mod.results.discussion.userAnswer : ''
                };
                await upsertInitialRecord(user.id, 'writing', mod.moduleNum, week, day, recordJson, extras);
                console.log('💾 initial_record 저장 완료');
            }

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

    var mod = window.currentWritingModule;
    if (!mod) {
        console.log('🧹 라이팅 모듈 없음 — 정리 불필요');
        return;
    }

    // 1. 타이머 정지
    _stopWritingTimer();
    console.log('✅ 타이머 정지 완료');

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
