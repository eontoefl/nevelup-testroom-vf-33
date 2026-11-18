/**
 * ================================================
 * reading-module-controller.js
 * 리딩 모듈 컨트롤러 (V3)
 * ================================================
 * 
 * 역할: 회차 구성표(아래 0장)에 따라 이번 회차의 세트(35문제)를 순서대로 진행시키는 지휘자
 * 
 * 흐름:
 *   대시보드 "실전풀이" → startReadingModule(moduleNumber)
 *   → 구성표의 세트 순서대로 진행 (Next/Back 자유 이동)
 *   → Submit 또는 시간초과 → 전체 채점 → DB 저장
 *   → 대시보드 복귀
 * 
 * 회차 구성 (두 가지, 모두 35문제·18분):
 *   일상형: 빈칸 2 → 일상1 2 → 일상2 2 → 학술 1
 *   학술형: 빈칸 2 → 일상1 1 → 일상2 1 → 학술 2
 *   회차별 유형과 근거: C:\기능구현\리딩_모듈_구성개편\모듈_배정_기준.md
 * 
 * 참조: v3-flow-spec.md §1-1 ~ §1-4, v3-design-spec.md §2
 */

// ============================================================
// 전역 상태
// ============================================================

window.currentReadingModule = null;

// ============================================================
// 0. 리딩 회차 구성표 — 회차 구성·시간은 여기 한 곳에만 적는다
// ============================================================

/** 리딩 모듈 제한시간(초). 타이머와 정규코스 시작 팝업(task-router.js)이 이 값을 쓴다. */
var READING_MODULE_TIME_LIMIT_SEC = 18 * 60;

/** 유형별 고정 정보. 나오는 순서도 이 순서(빈칸 → 일상1 → 일상2 → 학술). */
var READING_SET_TYPES = [
    { type: 'fillblanks', questionsPerSet: 10, label: '빈칸채우기' },
    { type: 'daily1',     questionsPerSet: 2,  label: '일상지문1' },
    { type: 'daily2',     questionsPerSet: 3,  label: '일상지문2' },
    { type: 'academic',   questionsPerSet: 5,  label: '학술지문' }
];

/** 구성별 유형당 세트 수 (두 구성 모두 35문항) */
var READING_MODULE_KINDS = {
    daily:    { fillblanks: 2, daily1: 2, daily2: 2, academic: 1 },  // 일상형(일상 추가형)
    academic: { fillblanks: 2, daily1: 1, daily2: 1, academic: 2 }   // 학술형(아카데믹 추가형)
};

/**
 * 회차별 유형 (Module 1~42, 순서대로). 정규 Fast/Standard = Module 1~12, 연습코스 = Module 13~42.
 * 학생이 다음 구성을 예상하기 어렵게 섞어 둔 고정 목록이다. 실행할 때마다 다시 뽑지 않는다.
 * 이 목록을 바꾸면 그 뒤 모든 회차의 세트 번호가 밀린다(대표 확인 후에만 변경).
 */
var READING_MODULE_KIND_LIST = [
    // 정규 Module 1~12
    'academic', 'academic', 'daily', 'daily', 'academic', 'daily',
    'academic', 'daily', 'daily', 'academic', 'academic', 'daily',
    // 연습 Module 13~42 (Practice 1, 2, 4, 7, 8, 10, 13, 14, 16, 19, 20, 22, 25, 26, 28, 31, 32, 34, 37, 38, 40, 43, 44, 46, 49, 50, 52, 55, 56, 58)
    'academic', 'daily', 'daily', 'daily', 'academic', 'academic',
    'academic', 'daily', 'daily', 'academic', 'daily', 'academic',
    'daily', 'daily', 'daily', 'academic', 'daily', 'academic',
    'academic', 'academic', 'daily', 'daily', 'academic', 'daily',
    'academic', 'academic', 'academic', 'daily', 'academic', 'daily'
];

/**
 * 회차 번호 → 이번 회차 세트 목록.
 *
 * 받은 세트는 학생 기록이 정본이고, 구성표는 아직 안 받은 세트를 고를 때만 쓴다.
 *  - 구성표 기본 번호는 "쓰이는 순서대로 +1": 앞 회차들이 구성표대로 쓴 유형별 세트 수 다음 번호부터.
 *  - 학생 기록(student)을 함께 주면:
 *      · 이 회차 기록이 있으면 그 기록의 세트를 그대로 낸다(다시 풀기 = 처음 받은 세트).
 *      · 없으면 기본 번호 중 이 학생이 이미 받은 세트를 건너뛰고, 안 받은 세트 중 가장 앞 번호로 채운다.
 *        안 받은 세트가 하나도 안 남으면 기본 번호를 그대로 쓴다(풀이를 막지 않음).
 *  - 유형 안에서는 항상 번호 순: 해설·대시보드가 세트를 번호 순으로 늘어놓으므로 풀이 순서와 같아야 한다.
 *  - student 없이 부르면 구성표 기본값(대시보드의 "있는 회차인가" 확인, 로그인 없는 개발 화면).
 * 목록에 없는 회차면 null (대시보드가 "문제 준비 중" 팝업을 띄움).
 *
 * @param {number} moduleNumber
 * @param {{own: string[]|null, received: string[], available: Object<string, number[]>}} [student]
 *   own = 이 회차 기록의 세트 이름(예: 'daily1_set13'), received = 리딩 전체에서 받은 세트 이름,
 *   available = 문제 표에 실제로 있는 유형별 세트 번호(작은 수부터). _readReadingStudent가 만든다.
 * @returns {{kind: string, sequence: Array<{type, setNum, questionsPerSet, label}>}|null}
 */
function getReadingModulePlan(moduleNumber, student) {
    var m = parseInt(moduleNumber, 10);
    if (!(m >= 1 && m <= READING_MODULE_KIND_LIST.length)) return null;

    // 구성표 기본값
    var used = {};
    READING_SET_TYPES.forEach(function(t) { used[t.type] = 0; });
    for (var i = 0; i < m - 1; i++) {
        var prevCounts = READING_MODULE_KINDS[READING_MODULE_KIND_LIST[i]];
        READING_SET_TYPES.forEach(function(t) { used[t.type] += prevCounts[t.type]; });
    }
    var kind = READING_MODULE_KIND_LIST[m - 1];
    var setNums = {};
    READING_SET_TYPES.forEach(function(t) {
        setNums[t.type] = [];
        for (var k = 0; k < READING_MODULE_KINDS[kind][t.type]; k++) setNums[t.type].push(used[t.type] + k + 1);
    });

    // 학생 기록 반영
    if (student) {
        var available = student.available || {};
        var own = _groupReadingSetNames(student.own);
        var ownKind = _readingKindOf(own, available);
        if (ownKind) {
            kind = ownKind;
            setNums = own;
        } else {
            var received = _groupReadingSetNames(student.received);
            READING_SET_TYPES.forEach(function(t) {
                var got = received[t.type];
                var keep = setNums[t.type].filter(function(n) { return got.indexOf(n) === -1; });
                var skipped = setNums[t.type].filter(function(n) { return got.indexOf(n) !== -1; });
                var spare = (available[t.type] || []).filter(function(n) { return got.indexOf(n) === -1 && keep.indexOf(n) === -1; });
                while (skipped.length) {
                    var back = skipped.shift();
                    keep.push(spare.length ? spare.shift() : back);
                }
                setNums[t.type] = keep.sort(function(a, b) { return a - b; });
            });
        }
    }

    var sequence = [];
    READING_SET_TYPES.forEach(function(t) {
        var nums = setNums[t.type];
        nums.forEach(function(setNum, k) {
            sequence.push({
                type: t.type,
                setNum: setNum,
                questionsPerSet: t.questionsPerSet,
                label: nums.length > 1 ? t.label + ' 세트' + (k + 1) : t.label
            });
        });
    });
    return { kind: kind, sequence: sequence };
}

/** 기록의 세트 이름 목록(['daily1_set13', ...]) → 유형별 번호 목록(작은 수부터, 중복 없이). 모르는 이름은 무시. */
function _groupReadingSetNames(names) {
    var grouped = {};
    READING_SET_TYPES.forEach(function(t) { grouped[t.type] = []; });
    (names || []).forEach(function(name) {
        var parts = /^([a-z0-9]+)_set(\d+)$/.exec(String(name));
        var list = parts && grouped[parts[1]];
        var num = parts ? parseInt(parts[2], 10) : 0;
        if (list && num > 0 && list.indexOf(num) === -1) list.push(num);
    });
    READING_SET_TYPES.forEach(function(t) { grouped[t.type].sort(function(a, b) { return a - b; }); });
    return grouped;
}

/**
 * 이 회차 기록의 세트를 그대로 다시 낼 수 있으면 그 구성 이름('daily' | 'academic'), 아니면 null.
 * 세트 수가 두 구성 중 하나와 같고(개편 전 7세트 기록 = 일상형과 같은 모양), 세트가 모두 문제 표에 있을 때만 그대로 낸다.
 */
function _readingKindOf(own, available) {
    return Object.keys(READING_MODULE_KINDS).filter(function(kindName) {
        return READING_SET_TYPES.every(function(t) {
            var nums = own[t.type];
            return nums.length === READING_MODULE_KINDS[kindName][t.type]
                && nums.every(function(n) { return (available[t.type] || []).indexOf(n) !== -1; });
        });
    })[0] || null;
}

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

    // 로딩 표시는 과제 대시보드(실전 풀이 버튼)가 켜고, 이 함수가 끝나면 끈다.

    // 이번 회차 세트 목록 (구성표 0장). 목록에 없는 회차는 대시보드 시작 전 확인에서 이미 걸러진다.
    // 학생이 받은 세트 기록을 먼저 읽어 반영한다(다시 풀기 = 처음 받은 세트, 다른 회차에서 받은 세트는 다시 안 나옴).
    const plan = getReadingModulePlan(moduleNumber, await _readReadingStudent(moduleNumber));
    const sequence = plan.sequence;
    console.log(`📚 구성: ${plan.kind === 'academic' ? '학술형' : '일상형'} (${sequence.length}세트)`);

    // 모듈 상태 객체 생성
    window.currentReadingModule = {
        moduleNum: moduleNumber,
        sequence: sequence,
        components: [],       // 세트별 컴포넌트 인스턴스
        currentIndex: 0,      // 현재 세트 인덱스
        totalQuestions: sequence.reduce(function(sum, s) { return sum + s.questionsPerSet; }, 0),
        answers: {},          // 세트별 채점 결과
        timer: null,
        isRetake: false       // 다시풀기 여부
    };

    // 다시풀기 여부: 과제 대시보드가 버튼을 정할 때 한 번 판단한 값을 쓴다(첫 풀이 기록 있음·마감 지남·정지 중이면 다시 풀기).
    // 판단 지점이 하나라 시작 팝업 여부와 저장 칸(initial/current)이 항상 같다.
    var state = window._taskDashboardState;
    window.currentReadingModule.isRetake = !!(state && state.isRetake);

    // 세트 컴포넌트 한꺼번에 생성
    _createAllComponents();

    // 모든 세트의 문제를 먼저 받는다 — 안 연 세트가 없고, 풀이 중 인터넷이 끊겨도 세트 이동은 된다
    // (못 받으면 _loadAllComponents가 로딩을 걷고 안내 팝업을 띄움 → 타이머·저장 없이 끝)
    if (!(await _loadAllComponents(window.currentReadingModule.components))) {
        console.error('❌ 리딩 문제를 받지 못해 시작하지 않음');
        window.currentReadingModule = null;
        return;
    }

    // 타이머 시작 (READING_MODULE_TIME_LIMIT_SEC) — 문제를 다 받은 뒤부터 18:00
    _startTimer();

    // 첫 세트 표시 (로딩 표시는 이 함수가 끝나면 대시보드가 끔)
    await _goToSet(0);
}

/**
 * 세트를 정하는 데 쓸 학생 정보(getReadingModulePlan의 student)를 읽는다.
 * 로그인한 학생이 아니면 null(구성표 기본값으로 시작).
 * 기록을 못 읽으면 오류를 던진다 → 대시보드(_startSectionModule)가 "문제를 불러오지 못했어요" 팝업을 띄우고 시작하지 않는다.
 * (기록 없이 시작하면 이미 받은 세트가 다시 나올 수 있다)
 * 문제 표 4개는 여기서 같이 받는다 — 로더가 보낸 요청을 캐시하므로 뒤의 세트별 load()는 같은 표를 다시 받지 않는다.
 * @param {number} moduleNumber
 */
async function _readReadingStudent(moduleNumber) {
    var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : window.currentUser;
    if (!user || !user.id || user.id === 'dev-user-001') return null;

    var tableLoaders = {
        fillblanks: loadFillBlanksData,
        daily1: loadDaily1Data,
        daily2: loadDaily2Data,
        academic: loadAcademicData
    };
    var loaded = await Promise.all([getReadingReceivedSets(user.id)].concat(
        READING_SET_TYPES.map(function(t) { return tableLoaders[t.type](); })
    ));
    var records = loaded[0];
    if (!records) throw new Error('리딩 기록을 읽지 못함');

    // 문제 표에 실제로 있는 세트 번호 (id 끝자리 숫자, 작은 수부터)
    var available = {};
    READING_SET_TYPES.forEach(function(t, idx) {
        var table = loaded[idx + 1];
        available[t.type] = ((table && table.sets) || []).map(function(set) {
            var parts = /_set_(\d+)$/.exec(String(set.id || ''));
            return parts ? parseInt(parts[1], 10) : 0;
        }).filter(function(n) { return n > 0; }).sort(function(a, b) { return a - b; });
    });

    // 이 회차 기록: 대시보드가 이 과제의 기록을 찾는 것과 같은 자리(정규 = 회차·주차·요일, 연습 = 회차·Practice 번호)
    var state = window._taskDashboardState || {};
    var ownRecord = records.filter(function(r) {
        if (Number(r.moduleNumber) !== Number(moduleNumber)) return false;
        if (state.isPractice) return r.practiceNumber != null && Number(r.practiceNumber) === Number(state.practiceNumber);
        return r.practiceNumber == null && r.week === String(state.week) && r.day === state.day;
    })[0];

    var received = [];
    records.forEach(function(r) { received = received.concat(r.first || [], r.retake || []); });

    return {
        own: ownRecord ? (ownRecord.first || ownRecord.retake) : null,
        received: received,
        available: available
    };
}

/**
 * 모듈 시작 때 모든 세트의 문제 받기 (리딩·리스닝 공용, 화면은 안 바뀜)
 * 하나라도 못 받으면 "문제를 불러오지 못했어요" 팝업 → false(로딩 표시는 대시보드가 끔).
 * 학생은 대시보드에 그대로 남아 실전풀이를 다시 누른다(못 받은 표는 캐시되지 않아 다시 받음).
 * @param {Array} components - 세트별 컴포넌트(load() 보유)
 * @returns {Promise<boolean>} 모두 받으면 true
 */
async function _loadAllComponents(components) {
    var results = await Promise.all((components || []).map(function(comp) {
        return comp ? comp.load().catch(function() { return false; }) : Promise.resolve(false);
    }));
    if (results.length > 0 && results.every(function(ok) { return ok === true; })) return true;

    if (typeof _showProblemNotReadyPopup === 'function') {
        _showProblemNotReadyPopup({
            icon: '📶',
            title: '문제를 불러오지 못했어요',
            messageHtml: '인터넷 연결을 확인한 뒤 다시 눌러 주세요.'
        });
    }
    return false;
}

// ============================================================
// 2. 컴포넌트 생성 (세트 수만큼 한꺼번에)
// ============================================================

function _createAllComponents() {
    var mod = window.currentReadingModule;
    if (!mod) return;

    console.log('📦 ' + mod.sequence.length + '개 컴포넌트 생성 시작...');

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
                comp = new AcademicComponent(seq.setNum, {
                    onComplete: function(results) {
                        _onSetComplete(index, results);
                    }
                });
                break;
        }

        console.log(`  ✅ [${index}] ${seq.label} 생성 완료`);
        return comp;
    });

    console.log('📦 ' + mod.sequence.length + '개 컴포넌트 생성 완료');
}

// ============================================================
// 3. 세트 이동
// ============================================================

/**
 * 특정 세트로 이동 (init 호출)
 * @param {number} setIndex - 0 ~ (세트 수 - 1)
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

    console.log(`\n▶️ [${setIndex + 1}/${mod.sequence.length}] ${seq.label} 이동`);

    // 화면 전환 + 그리기 (문제는 시작 때 이미 받아 둠)
    comp.show();

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
async function _readingModuleNext() {
    var mod = window.currentReadingModule;
    if (!mod) return;

    var seq = mod.sequence[mod.currentIndex];
    var comp = mod.components[mod.currentIndex];

    if (seq.type === 'fillblanks') {
        // 빈칸채우기: Next = 다음 세트로 이동 (채점은 최종 제출 시 일괄 처리)
        // ※ 여기서 채점/확정하지 않음 → 나중에 돌아와 수정한 답도 반영됨
        if (mod.currentIndex < mod.sequence.length - 1) {
            await _goToSet(mod.currentIndex + 1);
        }
    } else {
        // Daily1/Daily2/Academic: 세트 내부 다음 문제 시도
        var moved = comp.nextQuestion();
        if (!moved) {
            // 세트 마지막 → 다음 세트로 이동 (채점은 최종 제출 시 일괄 처리)
            // ※ 여기서 채점/확정하지 않음 → 나중에 돌아와 수정한 답도 반영됨
            if (mod.currentIndex < mod.sequence.length - 1) {
                await _goToSet(mod.currentIndex + 1);
                return; // _goToSet 내부에서 progress/buttons 업데이트 완료
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
 * - 로딩 화면 표시로 중복 클릭 차단
 * - 채점 + DB 저장 1회만 실행
 */
function _readingModuleSubmit() {
    var mod = window.currentReadingModule;
    if (!mod) return;

    // 로딩 화면 표시 (중복 클릭 차단)
    _showSubmitLoading();

    console.log('📤 리딩 모듈 전체 제출');

    // 모든 세트를 "지금 메모리에 들어있는 최신 답안" 기준으로 일괄 채점한다.
    // ※ 문제는 시작 때 모두 받아 두므로 모든 세트가 같은 길로 채점된다.
    //    한 번도 열지 않은 세트도 문제 내용과 함께 '미응답'으로 저장돼 점수·해설에 그대로 나온다.
    // ※ review/Back으로 돌아가 수정한 답도 항상 최종 결과에 반영됨.
    mod.components.forEach(function(comp) {
        // submit → onComplete → mod.answers[유형_set번호] 덮어쓰기
        if (comp) comp.submit();
    });

    _finishReadingModule();
}

/**
 * Submit 로딩 오버레이 표시
 */
function _showSubmitLoading() {
    var overlay = document.getElementById('submitLoadingOverlay');
    if (overlay) overlay.style.display = 'flex';
}

/**
 * Submit 로딩 오버레이 숨기기
 */
function _hideSubmitLoading() {
    var overlay = document.getElementById('submitLoadingOverlay');
    if (overlay) overlay.style.display = 'none';
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
    if (window.currentListeningModule) {
        _openListeningReviewPanel();
    } else {
        _openReadingReviewPanel();
    }
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

    // 모듈 전체 기준 첫 문제 / 마지막 문제 판단
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
// 8. 타이머 (READING_MODULE_TIME_LIMIT_SEC)
// ============================================================

function _startTimer() {
    var mod = window.currentReadingModule;
    if (!mod) return;

    var timeLimit = READING_MODULE_TIME_LIMIT_SEC;

    mod.timer = {
        startTime: Date.now(),
        timeLimit: timeLimit,
        remainingTime: timeLimit,
        interval: null
    };

    console.log('⏱️ ' + (timeLimit / 60) + '분 타이머 시작');

    // 시작하는 순간 바로 그린다 (1초 뒤 첫 그림을 기다리면 HTML 자리 표시나 직전 회차 남은 시간이 보임)
    _updateTimerDisplay();

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

function _openReadingReviewPanel() {
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
        // Academic: answers[questionIndex] (0-based, 값은 숫자 1,2,3,4)
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
    var state2 = window._taskDashboardState || {};
    var inPractice2 = state2.isPractice;

    if (user && user.id && user.id !== 'dev-user-001' && (ct || inPractice2)) {
        var week = inPractice2 ? null : ct.currentWeek;
        var day = inPractice2 ? null : ct.currentDay;

        try {
            // 정규·연습 공용 저장: 재시도 → 최종 실패 시 제출 로딩을 끄고 실패 팝업(SaveGuard.saveRecord)
            var saved = await SaveGuard.saveRecord({
                userId: user.id,
                sectionType: 'reading',
                moduleNumber: mod.moduleNum,
                practiceNumber: inPractice2 ? state2.practiceNumber : null,
                week: week,
                day: day,
                isRetake: mod.isRetake,
                record: recordJson,
                extras: { initial_level: level },
                taskLabel: '리딩 Module ' + mod.moduleNum,
                onDone: function() {
                    window.currentReadingModule = null;
                    backToTaskDashboard();
                }
            });
            if (!saved) return;
            console.log('💾 ' + (mod.isRetake ? 'current' : 'initial') + '_record 저장 완료');

            // ✅ 저장 성공 → 모듈 데이터 초기화 + 대시보드 복귀
            _hideSubmitLoading();
            window.currentReadingModule = null;

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
        window.currentReadingModule = null;

        backToTaskDashboard();
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
// 12. 정리 함수 (외부에서 호출 가능)
// ============================================================

/**
 * 리딩 모듈 전체 정리
 * - 타이머 정지
 * - 모듈 상태 초기화
 * 
 * 호출 시점: backToTaskDashboard()
 */
function cleanupReadingModule() {
    console.log('🧹 [cleanupReadingModule] 리딩 모듈 정리 시작');

    var mod = window.currentReadingModule;
    if (!mod) {
        console.log('🧹 리딩 모듈 없음 — 정리 불필요');
        return;
    }

    // 1. 타이머 정지
    _stopTimer();
    console.log('✅ 타이머 정지 완료');

    // 2. 모듈 상태 초기화
    window.currentReadingModule = null;
    console.log('✅ [cleanupReadingModule] 리딩 모듈 정리 완료');
}

// ============================================================
// 로드 확인
// ============================================================

console.log('✅ reading-module-controller.js loaded');
