/**
 * explain-viewer.js
 * V3 해설 보기 화면 제어
 *
 * 역할:
 *   - task-dashboard.js의 _onExplainClick()에서 호출됨
 *   - DB(study_results_v3)에서 initial_record / current_record 조회
 *   - 기존 전용 해설 화면(result 파일들)의 show 함수를 호출하여 렌더링
 *   - 렌더링된 콘텐츠를 해설 탭(explainTabInitial / explainTabCurrent)에 삽입
 *   - 탭 전환, 뒤로가기 처리
 *
 * 의존:
 *   - supabase-client.js  (getStudyResultV3, getCurrentUser)
 *   - task-dashboard.js   (backToTaskDashboard, SECTION_ICONS, SECTION_LABELS)
 *   - 13개 result 파일    (show 함수들)
 *   - showScreen()        (screen-manager 또는 전역)
 */

// ─── 내부 상태 ───
var _explainState = null;

// ─── 섹션별 유형 → 결과 화면 매핑 ───
// type: recordJson.sets 키의 prefix (reading/listening) 또는 recordJson 직접 키 (writing/speaking)
// screenId: 전용 해설 화면의 HTML id
// showFn: 호출할 전역 함수 이름
var RESULT_TYPE_MAP = {
    reading: [
        { type: 'fillblanks', screenId: 'fillBlanksExplainScreen', showFn: 'showFillBlanksExplainScreen' },
        { type: 'daily1',     screenId: 'daily1ExplainScreen',     showFn: 'showDaily1Results' },
        { type: 'daily2',     screenId: 'daily2ExplainScreen',     showFn: 'showDaily2Results' },
        { type: 'academic',   screenId: 'academicExplainScreen',   showFn: 'showAcademicResults' }
    ],
    listening: [
        { type: 'response',     screenId: 'responseExplainScreen',     showFn: 'showResponseResults' },
        { type: 'conver',       screenId: 'converExplainScreen',       showFn: 'showConverResults' },
        { type: 'announcement', screenId: 'announcementExplainScreen', showFn: 'showAnnouncementResults' },
        { type: 'lecture',      screenId: 'lectureExplainScreen',      showFn: 'showLectureResults' }
    ],
    writing: [
        { type: 'arrange',    screenId: 'arrangeExplainScreen',    showFn: 'showArrangeResult' },
        { type: 'email',      screenId: 'emailExplainScreen',      showFn: 'showEmailResult' },
        { type: 'discussion', screenId: 'discussionExplainScreen', showFn: 'showDiscussionResult' }
    ],
    speaking: [
        { type: 'repeat',    screenId: 'repeatExplainScreen',    showFn: 'showRepeatResult' },
        { type: 'interview', screenId: 'interviewExplainScreen', showFn: 'showInterviewResult' }
    ]
};

// ============================================================
// 1. 진입점
// ============================================================

/**
 * 해설 뷰어 열기 (task-dashboard.js의 _onExplainClick에서 호출)
 *
 * @param {string} sectionType - 'reading' | 'listening' | 'writing' | 'speaking'
 * @param {number} moduleNumber - 모듈 번호
 * @param {string|number} week - 주차
 * @param {string} day - 요일
 */
async function openExplainViewer(sectionType, moduleNumber, week, day) {
    console.log(`\n📖 ============================`);
    console.log(`📖 해설 뷰어 열기: ${sectionType} M${moduleNumber} W${week} ${day}`);
    console.log(`📖 ============================\n`);

    // 상태 초기화
    _explainState = {
        sectionType: sectionType,
        moduleNumber: moduleNumber,
        week: week,
        day: day,
        dbRow: null,
        activeTab: 'initial'   // 'initial' | 'current'
    };

    // 화면 전환
    if (typeof showScreen === 'function') {
        showScreen('explainViewerScreen');
    }

    // 헤더 업데이트
    _updateExplainHeader(sectionType, moduleNumber, week, day);

    // 탭 초기화
    _resetExplainTabs();

    // 로딩 표시
    _showExplainLoading();

    // DB 조회
    try {
        var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : window.currentUser;
        if (!user || !user.id) {
            console.error('❌ [해설] 로그인 정보 없음');
            _showExplainError('로그인 정보를 찾을 수 없습니다.');
            return;
        }

        var row = await getStudyResultV3(user.id, sectionType, moduleNumber, week, day);
        if (!row) {
            console.log('📖 [해설] 결과 없음 (아직 풀이하지 않음)');
            _showExplainError('아직 풀이한 기록이 없습니다.');
            return;
        }

        _explainState.dbRow = row;
        console.log('📖 [해설] DB 레코드 조회 성공:', row.id);

        // 실전풀이 탭 렌더링
        if (row.initial_record) {
            _renderExplainTab('initial', row.initial_record);
        } else {
            _showTabMessage('initial', '실전풀이 기록이 없습니다.');
        }

        // 다시풀기 탭 (있는 경우만)
        if (row.current_record) {
            _showCurrentTab();
            _renderExplainTab('current', row.current_record);
        }

        // 오답노트 메모장 초기화 (스플릿 우측 패널)
        if (typeof ErrorNote !== 'undefined' && ErrorNote.init) {
            ErrorNote.init(row, sectionType, moduleNumber, 'initial');
        }

    } catch (err) {
        console.error('❌ [해설] DB 조회 실패:', err);
        _showExplainError('데이터를 불러오는 데 실패했습니다.');
    }
}

// ============================================================
// 2. 헤더 / 탭 UI
// ============================================================

function _updateExplainHeader(sectionType, moduleNumber, week, day) {
    var iconEl = document.getElementById('explainViewerIcon');
    var titleEl = document.getElementById('explainViewerTitle');
    var subtitleEl = document.getElementById('explainViewerSubtitle');

    if (iconEl) iconEl.textContent = SECTION_ICONS[sectionType] || '';
    if (titleEl) titleEl.textContent = (SECTION_LABELS[sectionType] || sectionType) + ' 모듈 ' + moduleNumber;
    if (subtitleEl) subtitleEl.textContent = 'Week ' + week + ' - ' + _getDayLabel(day);
}

function _getDayLabel(day) {
    var map = { '월': '월요일', '화': '화요일', '수': '수요일', '목': '목요일', '금': '금요일' };
    return map[day] || day;
}

function _resetExplainTabs() {
    // 기존에 이동한 콘텐츠를 전용 화면으로 복원 (탭 초기화 전에!)
    _restoreAllScreenContent();

    // 실전풀이 탭 활성화
    var btnInitial = document.getElementById('explainTabBtnInitial');
    var btnCurrent = document.getElementById('explainTabBtnCurrent');
    var tabInitial = document.getElementById('explainTabInitial');
    var tabCurrent = document.getElementById('explainTabCurrent');

    if (btnInitial) btnInitial.classList.add('active');
    if (btnCurrent) {
        btnCurrent.classList.remove('active');
        btnCurrent.style.display = 'none';
    }
    if (tabInitial) {
        tabInitial.classList.add('active');
        tabInitial.style.display = '';
        tabInitial.innerHTML = '';
    }
    if (tabCurrent) {
        tabCurrent.classList.remove('active');
        tabCurrent.style.display = 'none';
        tabCurrent.innerHTML = '';
    }

    // 점수 배지 초기화
    var scoreInitial = document.getElementById('explainTabScoreInitial');
    var scoreCurrent = document.getElementById('explainTabScoreCurrent');
    if (scoreInitial) scoreInitial.textContent = '';
    if (scoreCurrent) scoreCurrent.textContent = '';
}

function _showCurrentTab() {
    var btnCurrent = document.getElementById('explainTabBtnCurrent');
    if (btnCurrent) btnCurrent.style.display = '';
}

// ============================================================
// 3. 탭 전환
// ============================================================

function _switchExplainTab(tabName) {
    if (!_explainState) return;
    _explainState.activeTab = tabName;

    var btnInitial = document.getElementById('explainTabBtnInitial');
    var btnCurrent = document.getElementById('explainTabBtnCurrent');
    var tabInitial = document.getElementById('explainTabInitial');
    var tabCurrent = document.getElementById('explainTabCurrent');

    if (tabName === 'initial') {
        if (btnInitial) btnInitial.classList.add('active');
        if (btnCurrent) btnCurrent.classList.remove('active');
        if (tabInitial) { tabInitial.classList.add('active'); tabInitial.style.display = ''; }
        if (tabCurrent) { tabCurrent.classList.remove('active'); tabCurrent.style.display = 'none'; }
    } else {
        if (btnInitial) btnInitial.classList.remove('active');
        if (btnCurrent) btnCurrent.classList.add('active');
        if (tabInitial) { tabInitial.classList.remove('active'); tabInitial.style.display = 'none'; }
        if (tabCurrent) { tabCurrent.classList.add('active'); tabCurrent.style.display = ''; }
    }

    // 오답노트 메모장 탭 전환
    if (typeof ErrorNote !== 'undefined' && ErrorNote.onTabSwitch) {
        ErrorNote.onTabSwitch(tabName);
    }
}

// ============================================================
// 4. 핵심: DB 데이터 → 기존 show 함수 호출 → 콘텐츠 이동
// ============================================================

/**
 * recordJson에서 세트별 데이터를 추출하여 기존 show 함수를 호출하고
 * 전용 화면에 렌더링된 HTML을 해설 탭 컨테이너로 이동
 *
 * @param {'initial'|'current'} tabName
 * @param {Object} recordJson - initial_record 또는 current_record
 */
function _renderExplainTab(tabName, recordJson) {
    var st = _explainState;
    if (!st) return;

    var tabContainer = document.getElementById(
        tabName === 'initial' ? 'explainTabInitial' : 'explainTabCurrent'
    );
    if (!tabContainer) return;

    tabContainer.innerHTML = '';

    var typeDefs = RESULT_TYPE_MAP[st.sectionType];
    if (!typeDefs) {
        console.error('❌ [해설] 알 수 없는 섹션:', st.sectionType);
        _showTabMessage(tabName, '알 수 없는 과제 유형입니다.');
        return;
    }

    console.log(`📖 [해설] ${tabName} 탭 렌더링 시작 — ${typeDefs.length}개 유형`);

    // currentTest 전역 변수 설정 (show 함수들이 week/day 표시에 참조)
    if (window.currentTest) {
        window.currentTest.currentWeek = st.week;
        window.currentTest.currentDay = st.day;
    }

    // 점수 배지 (있으면)
    _updateScoreBadge(tabName, recordJson);

    typeDefs.forEach(function(def) {
        try {
            _renderOneType(def, recordJson, tabContainer, st);
        } catch (err) {
            console.error('❌ [해설] ' + def.type + ' 렌더링 실패:', err);
            var errDiv = document.createElement('div');
            errDiv.className = 'explain-render-error';
            errDiv.textContent = def.type + ' 해설을 표시할 수 없습니다.';
            tabContainer.appendChild(errDiv);
        }
    });

    console.log(`📖 [해설] ${tabName} 탭 렌더링 완료`);
}

/**
 * 개별 유형 1개 렌더링
 */
function _renderOneType(def, recordJson, tabContainer, st) {
    var showFn = window[def.showFn];
    if (typeof showFn !== 'function') {
        console.warn('⚠️ [해설] show 함수 없음:', def.showFn);
        return;
    }

    // 전용 화면 요소 (show 함수가 여기에 렌더링함)
    var screen = document.getElementById(def.screenId);
    if (!screen) {
        console.warn('⚠️ [해설] 전용 화면 없음:', def.screenId);
        return;
    }

    // DB 데이터에서 해당 유형의 데이터 추출
    var data = _extractData(def, recordJson, st);
    if (!data) {
        console.log('📖 [해설] ' + def.type + ': 데이터 없음 (건너뜀)');
        return;
    }

    // show 함수에 데이터 직접 전달
    showFn(data);

    // 전용 화면의 콘텐츠를 해설 탭으로 이동
    _moveScreenContent(screen, tabContainer, def.type);
}

// ============================================================
// 5. 데이터 추출 (DB recordJson → show 함수 입력 형태)
// ============================================================

/**
 * DB recordJson에서 해당 유형의 데이터를 추출
 *
 * Reading/Listening: recordJson.sets에서 해당 type의 세트들을 배열로 모음
 * Writing arrange: recordJson.arrange
 * Writing email/discussion: recordJson.email / recordJson.discussion
 * Speaking repeat/interview: recordJson.repeat.data / recordJson.interview.data
 */
function _extractData(def, recordJson, st) {
    switch (def.type) {
        // ── Writing (param 기반) ──
        case 'arrange':
            if (!recordJson.arrange) return null;
            return recordJson.arrange;

        case 'email':
            if (!recordJson.email) return null;
            return Object.assign({
                weekDay: 'Week ' + st.week + ', ' + st.day + '요일'
            }, recordJson.email);

        case 'discussion':
            if (!recordJson.discussion) return null;
            return Object.assign({
                weekDay: 'Week ' + st.week + ', ' + st.day + '요일'
            }, recordJson.discussion);

        // ── Speaking (param 기반) ──
        case 'repeat':
            if (!recordJson.repeat || !recordJson.repeat.data) return null;
            return recordJson.repeat.data;

        case 'interview':
            if (!recordJson.interview || !recordJson.interview.data) return null;
            return recordJson.interview.data;

        // ── Reading / Listening (sets에서 배열 수집) ──
        default:
            var sets = recordJson.sets;
            if (!sets) return null;

            var collected = [];
            var keys = Object.keys(sets).sort();

            keys.forEach(function(key) {
                // 키 형태: "fillblanks_set1", "conver_set3" 등
                if (key.indexOf(def.type + '_set') === 0) {
                    collected.push(sets[key]);
                }
            });

            if (collected.length === 0) return null;
            return collected;
    }
}

// ============================================================
// 6. 전용 화면 → 탭 컨테이너 콘텐츠 이동
// ============================================================

/**
 * 전용 화면의 inner content를 탭 컨테이너로 이동
 * - 헤더(class에 'header' 포함), 네비게이션(class에 'navigation' 포함),
 *   하단 버튼(class에 'actions' 포함)은 제외
 * - 나머지 요소(통계, 상세 결과 등)만 이동
 */
function _moveScreenContent(screen, tabContainer, typeName) {
    // 래퍼 div 생성
    var wrapper = document.createElement('div');
    wrapper.className = 'explain-type-section';
    wrapper.setAttribute('data-explain-type', typeName);
    wrapper.setAttribute('data-explain-screen', screen.id);

    // 제외 판별: class에 'header', 'navigation', 'actions' 포함 여부
    function _shouldSkip(el) {
        if (!el.className || typeof el.className !== 'string') return false;
        var cls = el.className.toLowerCase();
        return cls.indexOf('header') !== -1 || cls.indexOf('navigation') !== -1 || cls.indexOf('actions') !== -1;
    }

    // 전용 화면의 자식 요소 중 제외 대상이 아닌 것만 이동
    var children = Array.prototype.slice.call(screen.children);
    children.forEach(function(child) {
        if (!_shouldSkip(child)) {
            wrapper.appendChild(child);
        }
    });

    tabContainer.appendChild(wrapper);
}

/**
 * 모든 탭에서 이전에 이동한 콘텐츠를 원래 전용 화면으로 복원
 * (_resetExplainTabs에서 탭을 비우기 전에 호출)
 * - 원래 화면에는 헤더/네비게이션이 남아있으므로, 마지막 자식 뒤에 append
 */
function _restoreAllScreenContent() {
    var tabs = ['explainTabInitial', 'explainTabCurrent'];
    tabs.forEach(function(tabId) {
        var tab = document.getElementById(tabId);
        if (!tab) return;

        var wrappers = tab.querySelectorAll('.explain-type-section[data-explain-screen]');
        wrappers.forEach(function(wrapper) {
            var screenId = wrapper.getAttribute('data-explain-screen');
            var screen = document.getElementById(screenId);
            if (!screen) return;

            // wrapper의 자식들을 전용 화면으로 복원
            // 네비게이션이 있는 화면(conver, announce, lecture)은 네비게이션 앞에 삽입
            var navEl = screen.querySelector('[class*="navigation"]');

            while (wrapper.firstChild) {
                if (navEl) {
                    screen.insertBefore(wrapper.firstChild, navEl);
                } else {
                    screen.appendChild(wrapper.firstChild);
                }
            }
        });
    });
}

// ============================================================
// 7. 점수 배지 업데이트
// ============================================================

function _updateScoreBadge(tabName, recordJson) {
    var badgeId = tabName === 'initial' ? 'explainTabScoreInitial' : 'explainTabScoreCurrent';
    var badge = document.getElementById(badgeId);
    if (!badge) return;

    var score = _calculateScore(recordJson);
    if (score !== null) {
        badge.textContent = score + '%';
    }
}

function _calculateScore(recordJson) {
    if (!recordJson) return null;

    // Reading/Listening: totalCorrect / totalQuestions
    if (recordJson.totalCorrect != null && recordJson.totalQuestions) {
        return Math.round((recordJson.totalCorrect / recordJson.totalQuestions) * 100);
    }

    // Writing: arrange accuracy
    if (recordJson.arrange && recordJson.arrange.accuracy != null) {
        return recordJson.arrange.accuracy;
    }

    // Speaking: 점수 없음 (완료 여부만)
    return null;
}

// ============================================================
// 8. 로딩 / 에러 / 메시지 UI
// ============================================================

function _showExplainLoading() {
    var tab = document.getElementById('explainTabInitial');
    if (tab) {
        tab.innerHTML = '<div class="explain-loading"><i class="fas fa-spinner fa-spin"></i> 해설 데이터를 불러오는 중...</div>';
    }
}

function _showExplainError(msg) {
    var tab = document.getElementById('explainTabInitial');
    if (tab) {
        tab.innerHTML = '<div class="explain-error"><i class="fas fa-exclamation-circle"></i> ' + msg + '</div>';
    }
}

function _showTabMessage(tabName, msg) {
    var tabId = tabName === 'initial' ? 'explainTabInitial' : 'explainTabCurrent';
    var tab = document.getElementById(tabId);
    if (tab) {
        tab.innerHTML = '<div class="explain-message">' + msg + '</div>';
    }
}

// ============================================================
// 9. 뒤로가기
// ============================================================

function _backFromExplainViewer() {
    console.log('📖 [해설] 뒤로가기 → 대시보드');

    // 오답노트 메모장 정리
    if (typeof ErrorNote !== 'undefined' && ErrorNote.cleanup) {
        ErrorNote.cleanup();
    }

    // 오디오 정리 (리스닝 해설에서 재생 중인 오디오 정지)
    _cleanupExplainAudio();

    // 이동한 콘텐츠를 전용 화면으로 복원
    _restoreAllScreenContent();

    // 상태 초기화
    _explainState = null;

    // 대시보드로 복귀
    if (typeof backToTaskDashboard === 'function') {
        backToTaskDashboard();
    }
}

function _cleanupExplainAudio() {
    // 해설 탭 내의 모든 오디오 정지
    var viewer = document.getElementById('explainViewerScreen');
    if (!viewer) return;

    var audios = viewer.querySelectorAll('audio');
    audios.forEach(function(audio) {
        audio.pause();
        audio.currentTime = 0;
    });
}

// ============================================================
// 10. 이벤트 바인딩 (DOM Ready)
// ============================================================

(function _initExplainViewer() {
    // 뒤로가기 버튼
    var backBtn = document.getElementById('explainBackBtn');
    if (backBtn) {
        backBtn.addEventListener('click', _backFromExplainViewer);
    }

    // 실전풀이 탭 버튼
    var tabBtnInitial = document.getElementById('explainTabBtnInitial');
    if (tabBtnInitial) {
        tabBtnInitial.addEventListener('click', function() {
            _switchExplainTab('initial');
        });
    }

    // 다시풀기 탭 버튼
    var tabBtnCurrent = document.getElementById('explainTabBtnCurrent');
    if (tabBtnCurrent) {
        tabBtnCurrent.addEventListener('click', function() {
            _switchExplainTab('current');
        });
    }

    console.log('📖 [해설] explain-viewer.js 초기화 완료');
})();
