/**
 * ================================================
 * listening-module-controller.js
 * 리스닝 모듈 컨트롤러 (V3)
 * ================================================
 * 
 * 역할: 9개 세트(32문제)를 순서대로 진행시키는 지휘자
 * 
 * 흐름:
 *   대시보드 "실전풀이" → startListeningModule(moduleNumber)
 *   → 9개 세트 순서 진행 (순방향만, Back 없음)
 *   → Submit 또는 마지막 문제 완료 → 전체 채점 → DB 저장
 *   → 대시보드 복귀
 * 
 * 세트 순서 (총 32문제):
 *   Response(Q1-12) → Conver세트1(Q13-14) → Conver세트2(Q15-16)
 *   → Conver세트3(Q17-18) → Announce세트1(Q19-20) → Announce세트2(Q21-22)
 *   → Announce세트3(Q23-24) → Lecture세트1(Q25-28) → Lecture세트2(Q29-32)
 * 
 * 리딩과의 핵심 차이:
 *   - Back 버튼 없음 (순방향만)
 *   - 전체 타이머 없음 (문제별 타이머는 컴포넌트 내부에서 처리)
 *   - Review Panel은 열람 전용 (클릭해도 이동 안 함)
 * 
 * 참조: v3-flow-spec.md §2-1 ~ §2-6, v3-design-spec.md §2
 */

// ============================================================
// 전역 상태
// ============================================================

window.currentListeningModule = null;

// ============================================================
// 1. 진입점 — startListeningModule
// ============================================================

/**
 * 리스닝 모듈 시작 (대시보드에서 호출됨)
 * @param {number} moduleNumber - 모듈 번호 (1, 2, ...)
 */
async function startListeningModule(moduleNumber) {
    console.log(`\n🎧 ============================`);
    console.log(`🎧 리스닝 Module ${moduleNumber} 시작`);
    console.log(`🎧 ============================\n`);

    // 세트 번호 매핑 (module-definitions.js 규칙 기반)
    // Response: 모듈당 1세트 (Module 1 → set 1, Module 2 → set 2)
    // Conver: 모듈당 3세트 (Module 1 → sets [1,2,3], Module 2 → sets [4,5,6])
    // Announcement: 모듈당 3세트 (Module 1 → sets [1,2,3], Module 2 → sets [4,5,6])
    // Lecture: 모듈당 2세트 (Module 1 → sets [1,2], Module 2 → sets [3,4])
    const responseStart = moduleNumber;
    const converStart = (moduleNumber - 1) * 3 + 1;
    const announceStart = (moduleNumber - 1) * 3 + 1;
    const lectureStart = (moduleNumber - 1) * 2 + 1;

    // 9개 세트 시퀀스 정의
    const sequence = [
        { type: 'response',     setNum: responseStart,       questionsPerSet: 12, label: '응답고르기' },
        { type: 'conver',       setNum: converStart,         questionsPerSet: 2,  label: '대화 세트1' },
        { type: 'conver',       setNum: converStart + 1,     questionsPerSet: 2,  label: '대화 세트2' },
        { type: 'conver',       setNum: converStart + 2,     questionsPerSet: 2,  label: '대화 세트3' },
        { type: 'announcement', setNum: announceStart,       questionsPerSet: 2,  label: '공지사항 세트1' },
        { type: 'announcement', setNum: announceStart + 1,   questionsPerSet: 2,  label: '공지사항 세트2' },
        { type: 'announcement', setNum: announceStart + 2,   questionsPerSet: 2,  label: '공지사항 세트3' },
        { type: 'lecture',      setNum: lectureStart,        questionsPerSet: 4,  label: '렉쳐 세트1' },
        { type: 'lecture',      setNum: lectureStart + 1,    questionsPerSet: 4,  label: '렉쳐 세트2' }
    ];

    // 모듈 상태 객체 생성
    window.currentListeningModule = {
        moduleNum: moduleNumber,
        sequence: sequence,
        components: [],       // 9개 컴포넌트 인스턴스
        currentIndex: 0,      // 현재 세트 인덱스 (0~8)
        totalQuestions: 32,
        answers: {},          // 세트별 채점 결과
        isRetake: false       // 다시풀기 여부
    };

    // 다시풀기 여부 확인
    var state = window._taskDashboardState;
    if (state) {
        var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : window.currentUser;
        if (user && user.id && user.id !== 'dev-user-001') {
            try {
                var existing = await getStudyResultV3(
                    user.id, 'listening', moduleNumber,
                    state.week, state.day
                );
                if (existing && existing.initial_record != null) {
                    window.currentListeningModule.isRetake = true;
                    console.log('🔄 다시풀기 모드');
                }
            } catch (e) {
                console.warn('⚠️ 다시풀기 확인 실패 (무시하고 진행):', e);
            }
        }
    }

    // 9개 컴포넌트 한꺼번에 생성
    _createAllListeningComponents();

    // 첫 세트 시작
    await _goToListeningSet(0);
}

// ============================================================
// 2. 컴포넌트 생성 (9개 한꺼번에)
// ============================================================

function _createAllListeningComponents() {
    var mod = window.currentListeningModule;
    if (!mod) return;

    console.log('📦 9개 리스닝 컴포넌트 생성 시작...');

    mod.components = mod.sequence.map(function(seq, index) {
        var comp = null;

        switch (seq.type) {
            case 'response':
                comp = new ResponseComponent(seq.setNum, {
                    onComplete: function(results) {
                        _onListeningSetComplete(index, results);
                    },
                    onTimerStart: function() {
                        _startListeningQuestionTimer(index, 20);
                    }
                });
                break;
            case 'conver':
                comp = new ConverComponent(seq.setNum, {
                    onComplete: function(results) {
                        _onListeningSetComplete(index, results);
                    },
                    onTimerStart: function() {
                        _startListeningQuestionTimer(index, 20);
                    }
                });
                break;
            case 'announcement':
                comp = new AnnouncementComponent(seq.setNum, {
                    onComplete: function(results) {
                        _onListeningSetComplete(index, results);
                    },
                    onTimerStart: function() {
                        _startListeningQuestionTimer(index, 20);
                    }
                });
                break;
            case 'lecture':
                comp = new LectureComponent(seq.setNum, {
                    onComplete: function(results) {
                        _onListeningSetComplete(index, results);
                    },
                    onTimerStart: function() {
                        _startListeningQuestionTimer(index, 30);
                    }
                });
                break;
        }

        console.log(`  ✅ [${index}] ${seq.label} 생성 완료`);
        return comp;
    });

    console.log('📦 9개 리스닝 컴포넌트 생성 완료');
}

// ============================================================
// 3. 세트 이동
// ============================================================

/**
 * 특정 세트로 이동 (init 호출)
 * @param {number} setIndex - 0~8
 */
async function _goToListeningSet(setIndex) {
    var mod = window.currentListeningModule;
    if (!mod) return;

    if (setIndex < 0 || setIndex >= mod.sequence.length) {
        console.warn('⚠️ 유효하지 않은 세트 인덱스:', setIndex);
        return;
    }

    mod.currentIndex = setIndex;
    var seq = mod.sequence[setIndex];
    var comp = mod.components[setIndex];

    console.log(`\n▶️ [${setIndex + 1}/9] ${seq.label} 이동`);

    // 화면 전환 — 유형별 screen 표시
    var screenMap = {
        'response':     'listeningResponseScreen',
        'conver':       'listeningConverScreen',
        'announcement': 'listeningAnnouncementScreen',
        'lecture':      'listeningLectureScreen'
    };
    var screenId = screenMap[seq.type];
    if (screenId && typeof showScreen === 'function') {
        showScreen(screenId);
    }

    // 컴포넌트 초기화 (데이터 로드 + 문제 표시)
    await comp.init();

    // 문제 번호 표시 업데이트
    _updateListeningProgress();

    // 버튼 상태 업데이트
    _updateListeningButtons();
}

/**
 * 세트 완료 콜백 (submit 후 호출됨)
 */
function _onListeningSetComplete(setIndex, results) {
    var mod = window.currentListeningModule;
    if (!mod) return;

    var seq = mod.sequence[setIndex];
    var answerKey = seq.type + '_set' + seq.setNum;
    mod.answers[answerKey] = results;

    console.log(`✅ ${seq.label} 채점 결과 저장: ${answerKey}`);
}

// ============================================================
// 4. Next / Submit 버튼 핸들러 (글로벌 함수)
// ============================================================

/**
 * 통합 Next 핸들러 — 모든 리스닝 화면의 Next 버튼에서 호출
 * 리스닝은 순방향만 (Back 없음)
 */
function _listeningModuleNext() {
    var mod = window.currentListeningModule;
    if (!mod) return;

    // Next 누르면 현재 타이머 멈춤
    _stopListeningQuestionTimer();

    var seq = mod.sequence[mod.currentIndex];
    var comp = mod.components[mod.currentIndex];

    // 세트 내부 다음 문제 시도
    var moved = comp.nextQuestion();
    if (!moved) {
        // 세트 마지막 → 제출 후 다음 세트
        comp.submit();
        if (mod.currentIndex < mod.sequence.length - 1) {
            _goToListeningSet(mod.currentIndex + 1);
        }
    }

    _updateListeningProgress();
    _updateListeningButtons();
}

/**
 * 전체 Submit 핸들러
 * - 로딩 화면 표시로 중복 클릭 차단
 * - 채점 + DB 저장 1회만 실행
 */
function _listeningModuleSubmit() {
    var mod = window.currentListeningModule;
    if (!mod) return;

    // 타이머 멈춤
    _stopListeningQuestionTimer();

    // 로딩 화면 표시 (중복 클릭 차단)
    _showSubmitLoading();

    console.log('📤 리스닝 모듈 전체 제출');

    // 현재 세트 먼저 제출 (아직 안 했을 수 있음)
    var comp = mod.components[mod.currentIndex];
    if (comp && !mod.answers[mod.sequence[mod.currentIndex].type + '_set' + mod.sequence[mod.currentIndex].setNum]) {
        comp.submit();
    }

    // 모든 미제출 세트 일괄 제출
    mod.sequence.forEach(function(seq, i) {
        var key = seq.type + '_set' + seq.setNum;
        if (!mod.answers[key] && mod.components[i]) {
            mod.components[i].submit();
        }
    });

    _finishListeningModule();
}

// ============================================================
// 5. HTML onclick 연결용 글로벌 함수
// ============================================================

// Response Next/Submit
window.nextResponseQuestion = function() {
    if (!window.currentListeningModule) return;
    _listeningModuleNext();
};

window.submitListeningResponse = function() {
    if (!window.currentListeningModule) return;
    _listeningModuleSubmit();
};

// Conver Next/Submit
window.nextConverQuestion = function() {
    if (!window.currentListeningModule) return;
    _listeningModuleNext();
};

window.submitListeningConver = function() {
    if (!window.currentListeningModule) return;
    _listeningModuleSubmit();
};

// Announcement Next/Submit
window.nextAnnouncementQuestion = function() {
    if (!window.currentListeningModule) return;
    _listeningModuleNext();
};

window.submitListeningAnnouncement = function() {
    if (!window.currentListeningModule) return;
    _listeningModuleSubmit();
};

// Lecture Next/Submit
window.nextLectureQuestion = function() {
    if (!window.currentListeningModule) return;
    _listeningModuleNext();
};

window.submitListeningLecture = function() {
    if (!window.currentListeningModule) return;
    _listeningModuleSubmit();
};

// Review Panel
window.openListeningReviewPanel = function() {
    _openListeningReviewPanel();
};

window.closeListeningReviewPanel = function() {
    _closeReviewPanel();
};

// moduleSubmitAll 확장 — 리스닝 활성 시 위임
(function() {
    var originalModuleSubmitAll = window.moduleSubmitAll;
    window.moduleSubmitAll = function() {
        if (window.currentListeningModule) {
            _listeningModuleSubmit();
        } else if (originalModuleSubmitAll) {
            originalModuleSubmitAll();
        }
    };
})();

// ============================================================
// 6. 문제 번호 표시 업데이트
// ============================================================

function _updateListeningProgress() {
    var mod = window.currentListeningModule;
    if (!mod) return;

    var seq = mod.sequence[mod.currentIndex];
    var comp = mod.components[mod.currentIndex];

    // 이 세트 이전까지의 누적 문제 수
    var offset = 0;
    for (var i = 0; i < mod.currentIndex; i++) {
        offset += mod.sequence[i].questionsPerSet;
    }

    var qNum = offset + comp.currentQuestion + 1;
    var progressText = 'Question ' + qNum + ' of ' + mod.totalQuestions;

    // 유형별 progress 요소 ID
    var progressIds = {
        'response': 'responseProgress',
        'conver': 'converProgress',
        'announcement': 'announcementProgress',
        'lecture': 'lectureProgress'
    };

    var el = document.getElementById(progressIds[seq.type]);
    if (el) {
        el.textContent = progressText;
    }
}

// ============================================================
// 7. 버튼 상태 업데이트 (Next/Submit 표시/숨김)
// ============================================================

function _updateListeningButtons() {
    var mod = window.currentListeningModule;
    if (!mod) return;

    var seq = mod.sequence[mod.currentIndex];
    var comp = mod.components[mod.currentIndex];
    var isLastSet = (mod.currentIndex === mod.sequence.length - 1);

    // 전체 32문제 기준 마지막 문제인지 판단
    var isVeryLast = false;
    if (isLastSet) {
        // 마지막 세트의 마지막 문제인지
        isVeryLast = (comp.currentQuestion >= seq.questionsPerSet - 1);
    }

    // 유형별 버튼 요소 ID
    var buttonMap = {
        'response':     { next: 'responseNextBtn',     submit: 'responseSubmitBtn' },
        'conver':       { next: 'converNextBtn',       submit: 'converSubmitBtn' },
        'announcement': { next: 'announcementNextBtn', submit: 'announcementSubmitBtn' },
        'lecture':      { next: 'lectureNextBtn',      submit: 'lectureSubmitBtn' }
    };

    var ids = buttonMap[seq.type];
    if (!ids) return;

    var nextBtn = document.getElementById(ids.next);
    var submitBtn = document.getElementById(ids.submit);

    if (nextBtn) nextBtn.style.display = isVeryLast ? 'none' : '';
    if (submitBtn) submitBtn.style.display = isVeryLast ? '' : 'none';
}

// ============================================================
// 8. Review Panel (열람 전용)
// ============================================================

function _openListeningReviewPanel() {
    var mod = window.currentListeningModule;
    if (!mod) return;

    console.log('📋 Listening Review Panel 열기 (열람 전용)');

    var panel = document.getElementById('reviewPanel');
    var tbody = document.getElementById('reviewTableBody');
    var summary = document.getElementById('reviewSummary');

    if (!panel || !tbody) return;

    // 테이블 내용 생성
    tbody.innerHTML = '';
    var answeredCount = 0;
    var questionNum = 0;

    mod.sequence.forEach(function(seq, setIdx) {
        var comp = mod.components[setIdx];

        for (var q = 0; q < seq.questionsPerSet; q++) {
            questionNum++;
            var isAnswered = _isListeningQuestionAnswered(setIdx, q);
            if (isAnswered) answeredCount++;

            var tr = document.createElement('tr');
            tr.className = 'review-row';
            // 열람 전용: 클릭해도 이동하지 않음 (커서도 기본)
            tr.style.cursor = 'default';

            // 현재 보고 있는 문제 강조
            var isCurrent = (setIdx === mod.currentIndex && comp.currentQuestion === q);
            if (isCurrent) {
                tr.classList.add('review-current');
            }

            tr.innerHTML =
                '<td>' + questionNum + '</td>' +
                '<td>' + seq.label + '</td>' +
                '<td class="' + (isAnswered ? 'review-answered' : 'review-not-answered') + '">' +
                    (isAnswered ? 'Answered' : 'Not Answered') +
                '</td>';

            tbody.appendChild(tr);
        }
    });

    // 요약
    if (summary) {
        summary.textContent = answeredCount + ' of ' + mod.totalQuestions + ' answered';
    }

    // 패널 표시
    panel.style.display = 'block';
    panel.classList.add('active');
}

/**
 * 특정 문제가 답이 있는지 확인
 */
function _isListeningQuestionAnswered(setIndex, questionIndex) {
    var mod = window.currentListeningModule;
    if (!mod) return false;

    var comp = mod.components[setIndex];
    var seq = mod.sequence[setIndex];

    if (!comp) return false;

    // 리스닝 컴포넌트들은 answers 객체에 setId_qN 형태로 저장
    if (seq.type === 'response') {
        var key = comp.setData ? comp.setData.id + '_q' + (questionIndex + 1) : '';
        return comp.answers[key] != null;
    } else {
        // conver/announcement/lecture: setId_qN
        var setData = comp.setData || comp.currentSetData;
        if (!setData) return false;
        var key = setData.setId ? setData.setId + '_q' + (questionIndex + 1) : 
                  setData.id + '_q' + (questionIndex + 1);
        return comp.answers[key] != null;
    }
}

// ============================================================
// 9. 완료 → 채점 → DB 저장 → 대시보드 복귀
// ============================================================

async function _finishListeningModule() {
    var mod = window.currentListeningModule;
    if (!mod) return;

    console.log('\n🎉 ============================');
    console.log('🎉 리스닝 Module 완료!');
    console.log('🎉 ============================\n');

    // 전체 정답 수 계산
    var totalCorrect = 0;
    var allAnswers = [];

    mod.sequence.forEach(function(seq) {
        var key = seq.type + '_set' + seq.setNum;
        var result = mod.answers[key];
        if (result && result.answers) {
            result.answers.forEach(function(a) {
                allAnswers.push(a);
                if (a.isCorrect) totalCorrect++;
            });
        }
    });

    console.log('📊 총 정답:', totalCorrect, '/', mod.totalQuestions);

    // 레벨 계산
    var level = _calculateListeningLevel(totalCorrect);
    console.log('📊 레벨:', level);

    // V3 JSON 구조 생성
    var recordJson = {
        totalQuestions: mod.totalQuestions,
        totalCorrect: totalCorrect,
        level: level,
        sets: mod.answers,
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
                await upsertCurrentRecord(user.id, 'listening', mod.moduleNum, week, day, recordJson);
                console.log('💾 current_record 저장 완료');
            } else {
                await upsertInitialRecord(user.id, 'listening', mod.moduleNum, week, day, recordJson, {
                    initial_level: level
                });
                console.log('💾 initial_record 저장 완료');
            }

            // ✅ 저장 성공 → 모듈 데이터 초기화 + 대시보드 복귀
            _hideSubmitLoading();
            window.currentListeningModule = null;

            backToTaskDashboard();

        } catch (e) {
            // ❌ 저장 실패 → 로딩 닫고 문제 화면 유지, 답안 보존
            console.error('❌ DB 저장 실패:', e);
            _hideSubmitLoading();
            alert('저장에 실패했습니다. 인터넷 연결을 확인하고 다시 Submit 버튼을 눌러주세요.');
        }
    } else {
        console.log('📊 [개발모드] DB 저장 생략');
        _hideSubmitLoading();
        window.currentListeningModule = null;

        backToTaskDashboard();
    }
}

// ============================================================
// 10. 레벨 변환표 (Listening, 총 32문제)
// ============================================================

function _calculateListeningLevel(correctCount) {
    if (correctCount >= 30) return 6.0;
    if (correctCount >= 28) return 5.5;
    if (correctCount >= 25) return 5.0;
    if (correctCount >= 22) return 4.5;
    if (correctCount >= 19) return 4.0;
    if (correctCount >= 16) return 3.5;
    if (correctCount >= 12) return 3.0;
    if (correctCount >= 9)  return 2.5;
    if (correctCount >= 6)  return 2.0;
    if (correctCount >= 3)  return 1.5;
    return 1.0;
}

// ============================================================
// 11. 문제별 타이머 (리스닝 전용)
// ============================================================

var _listeningTimerState = {
    interval: null,
    remaining: 0
};

/**
 * 문제별 타이머 시작
 * @param {number} setIndex - 현재 세트 인덱스
 * @param {number} seconds - 제한 시간 (초)
 */
function _startListeningQuestionTimer(setIndex, seconds) {
    // 이전 타이머 반드시 멈추고 시작
    _stopListeningQuestionTimer();

    var mod = window.currentListeningModule;
    if (!mod) return;

    _listeningTimerState.remaining = seconds;
    _updateListeningTimerDisplay();

    console.log('⏱️ 문제별 타이머 시작:', seconds + '초');

    _listeningTimerState.interval = setInterval(function() {
        _listeningTimerState.remaining--;
        _updateListeningTimerDisplay();

        if (_listeningTimerState.remaining <= 0) {
            _stopListeningQuestionTimer();

            // 시간 만료 → 컴포넌트에 알림
            var comp = mod.components[mod.currentIndex];
            if (comp && typeof comp.onQuestionTimeout === 'function') {
                comp.onQuestionTimeout();
            }
            console.log('⏰ 시간 만료');
        }
    }, 1000);
}

/**
 * 타이머 멈춤
 */
function _stopListeningQuestionTimer() {
    if (_listeningTimerState.interval) {
        clearInterval(_listeningTimerState.interval);
        _listeningTimerState.interval = null;
    }
}

/**
 * 타이머 화면 표시 업데이트
 */
function _updateListeningTimerDisplay() {
    var mod = window.currentListeningModule;
    if (!mod) return;

    var sec = Math.max(0, _listeningTimerState.remaining);
    var min = Math.floor(sec / 60);
    var s = sec % 60;
    var text = min + ':' + (s < 10 ? '0' : '') + s;

    // 현재 유형에 맞는 타이머 요소 업데이트
    var timerIds = {
        'response': 'responseTimer',
        'conver': 'converTimer',
        'announcement': 'announcementTimer',
        'lecture': 'lectureTimer'
    };

    var seq = mod.sequence[mod.currentIndex];
    var el = document.getElementById(timerIds[seq.type]);
    if (el) {
        el.textContent = text;
    }
}

// ============================================================
// 12. 리스닝 모듈 정리 함수
// ============================================================

/**
 * 리스닝 모듈 전체 정리
 * - 현재 컴포넌트 cleanup (오디오 정지 + 폐쇄)
 * - 타이머 정지
 * - 모듈 상태 초기화
 */
function cleanupListeningModule() {
    console.log('🧹 [cleanupListeningModule] 리스닝 모듈 정리 시작');

    var mod = window.currentListeningModule;
    if (!mod) {
        console.log('🧹 리스닝 모듈 없음 — 정리 불필요');
        return;
    }

    // 1. 현재 컴포넌트 cleanup
    var comp = mod.components[mod.currentIndex];
    if (comp && typeof comp.cleanup === 'function') {
        comp.cleanup();
        console.log('✅ 컴포넌트 cleanup 완료');
    }

    // 2. 타이머 정지
    _stopListeningQuestionTimer();
    console.log('✅ 타이머 정지 완료');

    // 3. 모듈 상태 초기화
    window.currentListeningModule = null;
    console.log('✅ [cleanupListeningModule] 리스닝 모듈 정리 완료');
}

// ============================================================
// 13. 로딩 함수 (리딩과 공유 — submitLoadingOverlay)
// ============================================================

// _showSubmitLoading, _hideSubmitLoading은 reading-module-controller.js에서 이미 정의됨
// 리스닝에서도 동일한 오버레이 사용

// ============================================================
// 로드 확인
// ============================================================

console.log('✅ listening-module-controller.js loaded');
