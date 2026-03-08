/**
 * ================================================
 * reading-module-controller.js
 * 리딩 모듈 컨트롤러 (V3)
 * ================================================
 * 
 * 역할: 7개 세트(35문제)를 순서대로 진행시키는 지휘자
 * 
 * 흐름:
 *   대시보드 "실전풀이" → startReadingModule(moduleNumber)
 *   → 7개 세트 순서 진행 (Next/Back 자유 이동)
 *   → Submit 또는 시간초과 → 전체 채점 → DB 저장
 *   → 대시보드 복귀
 * 
 * 세트 순서 (총 35문제):
 *   FB세트1(Q1-10) → FB세트2(Q11-20) → Daily1세트1(Q21-22)
 *   → Daily1세트2(Q23-24) → Daily2세트1(Q25-27)
 *   → Daily2세트2(Q28-30) → Academic(Q31-35)
 * 
 * 참조: v3-flow-spec.md §1-1 ~ §1-4, v3-design-spec.md §2
 */

// ============================================================
// 전역 상태
// ============================================================

window.currentReadingModule = null;

// ============================================================
// 1. 진입점 — startReadingModule
// ============================================================

/**
 * 리딩 모듈 시작 (대시보드에서 호출됨)
 * @param {number} moduleNumber - 모듈 번호 (1, 2, ...)
 */
async function startReadingModule(moduleNumber) {
    console.log(`\n📚 ============================`);
    console.log(`📚 리딩 Module ${moduleNumber} 시작`);
    console.log(`📚 ============================\n`);

    // 세트 번호 매핑 (Module 1: sets [1,2], Module 2: sets [3,4])
    const sets = {
        fillblanks: [moduleNumber * 2 - 1, moduleNumber * 2],
        daily1:     [moduleNumber * 2 - 1, moduleNumber * 2],
        daily2:     [moduleNumber * 2 - 1, moduleNumber * 2],
        academic:   [moduleNumber]
    };

    // 7개 세트 시퀀스 정의
    const sequence = [
        { type: 'fillblanks', setNum: sets.fillblanks[0], questionsPerSet: 10, label: '빈칸채우기 세트1' },
        { type: 'fillblanks', setNum: sets.fillblanks[1], questionsPerSet: 10, label: '빈칸채우기 세트2' },
        { type: 'daily1',     setNum: sets.daily1[0],     questionsPerSet: 2,  label: '일상지문1 세트1' },
        { type: 'daily1',     setNum: sets.daily1[1],     questionsPerSet: 2,  label: '일상지문1 세트2' },
        { type: 'daily2',     setNum: sets.daily2[0],     questionsPerSet: 3,  label: '일상지문2 세트1' },
        { type: 'daily2',     setNum: sets.daily2[1],     questionsPerSet: 3,  label: '일상지문2 세트2' },
        { type: 'academic',   setNum: sets.academic[0],   questionsPerSet: 5,  label: '학술지문' }
    ];

    // 모듈 상태 객체 생성
    window.currentReadingModule = {
        moduleNum: moduleNumber,
        sequence: sequence,
        components: [],       // 7개 컴포넌트 인스턴스
        currentIndex: 0,      // 현재 세트 인덱스 (0~6)
        totalQuestions: 35,
        answers: {},          // 세트별 채점 결과
        timer: null,
        isRetake: false       // 다시풀기 여부
    };

    // 다시풀기 여부 확인 (대시보드 상태에서 가져옴)
    var state = window._taskDashboardState;
    if (state) {
        var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : window.currentUser;
        if (user && user.id && user.id !== 'dev-user-001') {
            try {
                var existing = await getStudyResultV3(
                    user.id, 'reading', moduleNumber,
                    state.week, state.day
                );
                if (existing && existing.initial_record != null) {
                    window.currentReadingModule.isRetake = true;
                    console.log('🔄 다시풀기 모드');
                }
            } catch (e) {
                console.warn('⚠️ 다시풀기 확인 실패 (무시하고 진행):', e);
            }
        }
    }

    // 7개 컴포넌트 한꺼번에 생성
    _createAllComponents();

    // 타이머 시작 (20분)
    _startTimer();

    // 첫 세트 시작
    await _goToSet(0);
}

// ============================================================
// 2. 컴포넌트 생성 (7개 한꺼번에)
// ============================================================

function _createAllComponents() {
    var mod = window.currentReadingModule;
    if (!mod) return;

    console.log('📦 7개 컴포넌트 생성 시작...');

    mod.components = mod.sequence.map(function(seq, index) {
        var comp = null;

        switch (seq.type) {
            case 'fillblanks':
                comp = new FillBlanksComponent(seq.setNum, {
                    onComplete: function(results) {
                        _onSetComplete(index, results);
                    }
                });
                break;
            case 'daily1':
                comp = new Daily1Component(seq.setNum, {
                    onComplete: function(results) {
                        _onSetComplete(index, results);
                    }
                });
                break;
            case 'daily2':
                comp = new Daily2Component(seq.setNum, {
                    onComplete: function(results) {
                        _onSetComplete(index, results);
                    }
                });
                break;
            case 'academic':
                // AcademicComponent는 config를 안 받음 → 직접 할당
                comp = new AcademicComponent(seq.setNum);
                comp.onComplete = function(results) {
                    _onSetComplete(index, results);
                };
                break;
        }

        console.log(`  ✅ [${index}] ${seq.label} 생성 완료`);
        return comp;
    });

    console.log('📦 7개 컴포넌트 생성 완료');
}

// ============================================================
// 3. 세트 이동
// ============================================================

/**
 * 특정 세트로 이동 (init 호출)
 * @param {number} setIndex - 0~6
 */
async function _goToSet(setIndex) {
    var mod = window.currentReadingModule;
    if (!mod) return;

    if (setIndex < 0 || setIndex >= mod.sequence.length) {
        console.warn('⚠️ 유효하지 않은 세트 인덱스:', setIndex);
        return;
    }

    mod.currentIndex = setIndex;
    var seq = mod.sequence[setIndex];
    var comp = mod.components[setIndex];

    console.log(`\n▶️ [${setIndex + 1}/7] ${seq.label} 이동`);

    // 컴포넌트 초기화 (화면 전환 + 데이터 로드 포함)
    await comp.init();

    // 문제 번호 표시 업데이트
    _updateProgress();

    // 버튼 상태 업데이트
    _updateButtons();
}

/**
 * 세트 완료 콜백 (submit 후 호출됨)
 */
function _onSetComplete(setIndex, results) {
    var mod = window.currentReadingModule;
    if (!mod) return;

    var seq = mod.sequence[setIndex];
    var answerKey = seq.type + '_set' + seq.setNum;
    mod.answers[answerKey] = results;

    console.log(`✅ ${seq.label} 채점 결과 저장: ${answerKey}`);
}

// ============================================================
// 4. Next / Back / Submit 버튼 핸들러 (글로벌 함수)
// ============================================================

/**
 * 통합 Next 핸들러 — 모든 화면의 Next 버튼에서 호출
 */
function _readingModuleNext() {
    var mod = window.currentReadingModule;
    if (!mod) return;

    var seq = mod.sequence[mod.currentIndex];
    var comp = mod.components[mod.currentIndex];

    if (seq.type === 'fillblanks') {
        // 빈칸채우기: Next = 세트 전체 제출 → 다음 세트
        comp.submit();
        if (mod.currentIndex < mod.sequence.length - 1) {
            _goToSet(mod.currentIndex + 1);
        }
    } else {
        // Daily1/Daily2/Academic: 세트 내부 다음 문제 시도
        var moved = comp.nextQuestion();
        if (!moved) {
            // 세트 마지막 → 제출 후 다음 세트
            comp.submit();
            if (mod.currentIndex < mod.sequence.length - 1) {
                _goToSet(mod.currentIndex + 1);
            }
        }
        _updateProgress();
        _updateButtons();
    }
}

/**
 * 통합 Back 핸들러
 */
function _readingModuleBack() {
    var mod = window.currentReadingModule;
    if (!mod) return;

    var seq = mod.sequence[mod.currentIndex];
    var comp = mod.components[mod.currentIndex];

    if (seq.type === 'fillblanks') {
        // 빈칸채우기: Back = 이전 세트로 (현재 답안 임시 저장)
        if (mod.currentIndex > 0) {
            _goToPrevSetLastQuestion(mod.currentIndex - 1);
        }
    } else {
        // Daily1/Daily2/Academic: 세트 내부 이전 문제 시도
        var moved = comp.previousQuestion();
        if (!moved) {
            // 세트 첫 문제 → 이전 세트의 마지막 문제로
            if (mod.currentIndex > 0) {
                _goToPrevSetLastQuestion(mod.currentIndex - 1);
            }
        }
        _updateProgress();
        _updateButtons();
    }
}

/**
 * 이전 세트로 이동하되, 해당 세트의 마지막 문제를 표시
 * - 빈칸채우기: 한 화면에 10문제이므로 init()만 호출 (첫 문제 = 마지막 문제 = 같은 화면)
 * - 나머지 유형: init() 후 loadQuestion(마지막 인덱스)로 마지막 문제 표시
 */
async function _goToPrevSetLastQuestion(setIndex) {
    var mod = window.currentReadingModule;
    if (!mod) return;

    var prevSeq = mod.sequence[setIndex];
    var prevComp = mod.components[setIndex];

    // 세트 이동 (init 호출 → 화면 전환)
    await _goToSet(setIndex);

    // 빈칸채우기가 아니면 마지막 문제로 이동
    if (prevSeq.type !== 'fillblanks' && prevComp.loadQuestion) {
        var lastIndex = prevSeq.questionsPerSet - 1;
        prevComp.loadQuestion(lastIndex);
    }

    _updateProgress();
    _updateButtons();
}

/**
 * 전체 Submit 핸들러
 */
function _readingModuleSubmit() {
    var mod = window.currentReadingModule;
    if (!mod) return;

    console.log('📤 리딩 모듈 전체 제출');

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

    _finishReadingModule();
}

// ============================================================
// 5. HTML onclick 연결용 글로벌 함수
// ============================================================

// 빈칸채우기 Next/Back
window.moduleNextFromFillBlanks = function() {
    if (!window.currentReadingModule) return;
    _readingModuleNext();
};

window.modulePrevFromFillBlanks = function() {
    if (!window.currentReadingModule) return;
    _readingModuleBack();
};

// Daily1 Next/Back
window.daily1NextQuestion = function() {
    if (!window.currentReadingModule) return;
    _readingModuleNext();
};

window.daily1PreviousQuestion = function() {
    if (!window.currentReadingModule) return;
    _readingModuleBack();
};

// Daily2 Next/Back
window.daily2NextQuestion = function() {
    if (!window.currentReadingModule) return;
    _readingModuleNext();
};

window.daily2PrevQuestion = function() {
    if (!window.currentReadingModule) return;
    _readingModuleBack();
};

// Academic Next/Back
window.academicNextQuestion = function() {
    if (!window.currentReadingModule) return;
    _readingModuleNext();
};

window.academicPrevQuestion = function() {
    if (!window.currentReadingModule) return;
    _readingModuleBack();
};

// Submit (4개 화면 공통)
window.moduleSubmitAll = function() {
    if (!window.currentReadingModule) return;
    _readingModuleSubmit();
};

// Review Panel
window.openReviewPanel = function() {
    _openReviewPanel();
};

window.closeReviewPanel = function() {
    _closeReviewPanel();
};

// ============================================================
// 6. 문제 번호 표시 업데이트
// ============================================================

function _updateProgress() {
    var mod = window.currentReadingModule;
    if (!mod) return;

    var seq = mod.sequence[mod.currentIndex];
    var comp = mod.components[mod.currentIndex];

    // 이 세트 이전까지의 누적 문제 수
    var offset = 0;
    for (var i = 0; i < mod.currentIndex; i++) {
        offset += mod.sequence[i].questionsPerSet;
    }

    var progressText = '';
    var progressElId = '';

    switch (seq.type) {
        case 'fillblanks':
            // 빈칸채우기: 한 페이지 10문제
            var start = offset + 1;
            var end = offset + seq.questionsPerSet;
            progressText = 'Questions ' + start + '-' + end + ' of ' + mod.totalQuestions;
            progressElId = 'fillBlanksProgress';
            break;

        case 'daily1':
            var qNum = offset + comp.currentQuestion + 1;
            progressText = 'Question ' + qNum + ' of ' + mod.totalQuestions;
            progressElId = 'daily1Progress';
            break;

        case 'daily2':
            var qNum = offset + comp.currentQuestion + 1;
            progressText = 'Question ' + qNum + ' of ' + mod.totalQuestions;
            progressElId = 'daily2Progress';
            break;

        case 'academic':
            var qNum = offset + comp.currentQuestion + 1;
            progressText = 'Question ' + qNum + ' of ' + mod.totalQuestions;
            progressElId = 'academicProgress';
            break;
    }

    var el = document.getElementById(progressElId);
    if (el) {
        el.textContent = progressText;
    }
}

// ============================================================
// 7. 버튼 상태 업데이트 (Back/Next/Submit 표시/숨김)
// ============================================================

function _updateButtons() {
    var mod = window.currentReadingModule;
    if (!mod) return;

    var seq = mod.sequence[mod.currentIndex];
    var comp = mod.components[mod.currentIndex];
    var isFirstSet = (mod.currentIndex === 0);
    var isLastSet = (mod.currentIndex === mod.sequence.length - 1);

    // 전체 35문제 기준 첫 문제 / 마지막 문제 판단
    var isVeryFirst = isFirstSet;
    var isVeryLast = false;

    switch (seq.type) {
        case 'fillblanks':
            // 빈칸채우기는 세트 단위 이동
            isVeryFirst = isFirstSet;
            isVeryLast = false; // 빈칸채우기가 마지막 세트는 아님
            _setFillBlanksButtons(isVeryFirst, isVeryLast);
            break;

        case 'daily1':
            isVeryFirst = isFirstSet && comp.isFirstQuestion();
            isVeryLast = isLastSet && comp.isLastQuestion();
            _setDaily1Buttons(isVeryFirst, isVeryLast, comp);
            break;

        case 'daily2':
            isVeryFirst = isFirstSet && comp.isFirstQuestion();
            isVeryLast = isLastSet && comp.isLastQuestion();
            _setDaily2Buttons(isVeryFirst, isVeryLast, comp);
            break;

        case 'academic':
            isVeryFirst = false; // Academic 전에 항상 세트가 있음
            isVeryLast = isLastSet && comp.isLastQuestion();
            _setAcademicButtons(isVeryFirst, isVeryLast, comp);
            break;
    }
}

function _setFillBlanksButtons(isVeryFirst, isVeryLast) {
    var prevBtn = document.getElementById('fillBlanksPrevBtn');
    var nextBtn = document.getElementById('fillBlanksNextBtn');
    var submitBtn = document.getElementById('fillBlanksSubmitBtn');

    if (prevBtn) prevBtn.style.display = isVeryFirst ? 'none' : '';
    if (nextBtn) nextBtn.style.display = isVeryLast ? 'none' : '';
    if (submitBtn) submitBtn.style.display = isVeryLast ? '' : 'none';
}

function _setDaily1Buttons(isVeryFirst, isVeryLast, comp) {
    var prevBtn = document.getElementById('daily1PrevBtn');
    var nextBtn = document.getElementById('daily1NextBtn');
    var submitBtn = document.getElementById('daily1SubmitBtn');

    if (prevBtn) prevBtn.style.display = isVeryFirst ? 'none' : '';
    if (nextBtn) nextBtn.style.display = isVeryLast ? 'none' : '';
    if (submitBtn) submitBtn.style.display = isVeryLast ? '' : 'none';
}

function _setDaily2Buttons(isVeryFirst, isVeryLast, comp) {
    var prevBtn = document.getElementById('daily2PrevBtn');
    var nextBtn = document.getElementById('daily2NextBtn');
    var submitBtn = document.getElementById('daily2SubmitBtn');

    if (prevBtn) prevBtn.style.display = isVeryFirst ? 'none' : '';
    if (nextBtn) nextBtn.style.display = isVeryLast ? 'none' : '';
    if (submitBtn) submitBtn.style.display = isVeryLast ? '' : 'none';
}

function _setAcademicButtons(isVeryFirst, isVeryLast, comp) {
    var prevBtn = document.getElementById('academicPrevBtn');
    var nextBtn = document.getElementById('academicNextBtn');
    var submitBtn = document.getElementById('academicSubmitBtn');

    if (prevBtn) prevBtn.style.display = isVeryFirst ? 'none' : '';
    if (nextBtn) nextBtn.style.display = isVeryLast ? 'none' : '';
    if (submitBtn) submitBtn.style.display = isVeryLast ? '' : 'none';
}

// ============================================================
// 8. 타이머 (20분)
// ============================================================

function _startTimer() {
    var mod = window.currentReadingModule;
    if (!mod) return;

    var timeLimit = 20 * 60; // 1200초

    mod.timer = {
        startTime: Date.now(),
        timeLimit: timeLimit,
        remainingTime: timeLimit,
        interval: null
    };

    console.log('⏱️ 20분 타이머 시작');

    mod.timer.interval = setInterval(function() {
        var elapsed = Math.floor((Date.now() - mod.timer.startTime) / 1000);
        mod.timer.remainingTime = mod.timer.timeLimit - elapsed;

        _updateTimerDisplay();

        if (mod.timer.remainingTime <= 0) {
            clearInterval(mod.timer.interval);
            console.log('⏰ 시간 종료! 자동 제출');
            _readingModuleSubmit();
        }
    }, 1000);
}

function _stopTimer() {
    var mod = window.currentReadingModule;
    if (mod && mod.timer && mod.timer.interval) {
        clearInterval(mod.timer.interval);
        console.log('⏱️ 타이머 정지');
    }
}

function _updateTimerDisplay() {
    var mod = window.currentReadingModule;
    if (!mod || !mod.timer) return;

    var remaining = Math.max(0, mod.timer.remainingTime);
    var minutes = Math.floor(remaining / 60);
    var seconds = remaining % 60;
    var timeText = minutes + ':' + String(seconds).padStart(2, '0');

    // 4개 화면의 타이머 요소 모두 업데이트
    var timerIds = ['fillBlanksTimer', 'daily1Timer', 'daily2Timer', 'academicTimer'];
    timerIds.forEach(function(id) {
        var el = document.getElementById(id);
        if (el) {
            el.textContent = timeText;
            // 1분 미만: 빨간색
            if (remaining < 60) {
                el.style.color = '#ef4444';
            } else {
                el.style.color = '';
            }
        }
    });
}

// ============================================================
// 9. Review Panel
// ============================================================

function _openReviewPanel() {
    var mod = window.currentReadingModule;
    if (!mod) return;

    console.log('📋 Review Panel 열기');

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
            var isAnswered = _isQuestionAnswered(setIdx, q);
            if (isAnswered) answeredCount++;

            var tr = document.createElement('tr');
            tr.className = 'review-row';
            tr.style.cursor = 'pointer';

            // 클릭 → 해당 문제로 이동
            (function(si, qi) {
                tr.onclick = function() {
                    _jumpToQuestion(si, qi);
                    _closeReviewPanel();
                };
            })(setIdx, q);

            // 현재 보고 있는 문제 강조
            var isCurrent = (setIdx === mod.currentIndex);
            if (isCurrent) {
                if (seq.type === 'fillblanks') {
                    // 빈칸채우기: 세트 전체가 현재
                    tr.classList.add('review-current');
                } else if (comp.currentQuestion === q) {
                    tr.classList.add('review-current');
                }
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

function _closeReviewPanel() {
    var panel = document.getElementById('reviewPanel');
    if (panel) {
        panel.style.display = 'none';
        panel.classList.remove('active');
    }
}

/**
 * 특정 문제가 답이 있는지 확인
 */
function _isQuestionAnswered(setIndex, questionIndex) {
    var mod = window.currentReadingModule;
    if (!mod) return false;

    var comp = mod.components[setIndex];
    var seq = mod.sequence[setIndex];

    if (!comp) return false;

    if (seq.type === 'fillblanks') {
        // 빈칸채우기: answers 객체에서 빈칸 ID 기준으로 확인
        // questionIndex는 0~9이므로 sorted blanks 기준으로 확인
        if (comp.currentSet && comp.currentSet.blanks) {
            var sortedBlanks = comp.currentSet.blanks.slice().sort(function(a, b) {
                return a.startIndex - b.startIndex;
            });
            if (sortedBlanks[questionIndex]) {
                var answer = comp.answers[sortedBlanks[questionIndex].id] || '';
                return answer.length > 0;
            }
        }
        return false;
    } else if (seq.type === 'academic') {
        // Academic: answers[questionIndex] (0-based, 값은 'A','B' 등)
        return comp.answers[questionIndex] != null && comp.answers[questionIndex] !== '';
    } else {
        // Daily1/Daily2: answers['q1'], answers['q2'] 등 (1-based key)
        var key = 'q' + (questionIndex + 1);
        return comp.answers[key] != null;
    }
}

/**
 * Review Panel에서 특정 문제로 이동
 */
async function _jumpToQuestion(setIndex, questionIndex) {
    var mod = window.currentReadingModule;
    if (!mod) return;

    console.log('🔗 Review → 세트 ' + setIndex + ' 문제 ' + questionIndex);

    // 다른 세트면 세트 이동
    if (setIndex !== mod.currentIndex) {
        await _goToSet(setIndex);
    }

    // 세트 내부 문제 이동 (빈칸채우기는 한 페이지이므로 이동 불필요)
    var comp = mod.components[setIndex];
    var seq = mod.sequence[setIndex];

    if (seq.type !== 'fillblanks' && comp.loadQuestion) {
        comp.loadQuestion(questionIndex);
        _updateProgress();
        _updateButtons();
    }
}

// ============================================================
// 10. 완료 → 채점 → DB 저장 → 대시보드 복귀
// ============================================================

async function _finishReadingModule() {
    var mod = window.currentReadingModule;
    if (!mod) return;

    // 타이머 정지
    _stopTimer();

    console.log('\n🎉 ============================');
    console.log('🎉 리딩 Module 완료!');
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
    var level = _calculateReadingLevel(totalCorrect);
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
                await upsertCurrentRecord(user.id, 'reading', mod.moduleNum, week, day, recordJson);
                console.log('💾 current_record 저장 완료');
            } else {
                await upsertInitialRecord(user.id, 'reading', mod.moduleNum, week, day, recordJson, {
                    initial_level: level
                });
                console.log('💾 initial_record 저장 완료');
            }
        } catch (e) {
            console.error('❌ DB 저장 실패:', e);
            alert('저장 중 오류가 발생했습니다. 다시 시도해 주세요.');
        }
    } else {
        console.log('📊 [개발모드] DB 저장 생략');
    }

    // 모듈 데이터 초기화
    window.currentReadingModule = null;

    // 대시보드로 복귀
    if (typeof backToTaskDashboard === 'function') {
        backToTaskDashboard();
    } else if (typeof backToSchedule === 'function') {
        backToSchedule();
    }
}

// ============================================================
// 11. 레벨 변환표
// ============================================================

function _calculateReadingLevel(correctCount) {
    if (correctCount >= 33) return 6.0;
    if (correctCount >= 31) return 5.5;
    if (correctCount >= 28) return 5.0;
    if (correctCount >= 25) return 4.5;
    if (correctCount >= 21) return 4.0;
    if (correctCount >= 18) return 3.5;
    if (correctCount >= 14) return 3.0;
    if (correctCount >= 11) return 2.5;
    if (correctCount >= 7)  return 2.0;
    if (correctCount >= 4)  return 1.5;
    return 1.0;
}

// ============================================================
// 로드 확인
// ============================================================

console.log('✅ reading-module-controller.js loaded');
