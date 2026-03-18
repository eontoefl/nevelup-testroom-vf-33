/**
 * explain-viewer.js
 * V3 해설 보기 화면 제어 — 뎁스 방식
 *
 * 흐름:
 *   1. task-dashboard.js의 _onExplainClick()에서 openExplainViewer() 호출
 *   2. DB(study_results_v3)에서 initial_record / current_record 조회
 *   3. 선택 화면 표시: "실전풀이 해설 보기" / "다시풀기 해설 보기" 버튼
 *   4. 버튼 클릭 → 해당 record로 show 함수 호출 → 빨간 그릇에 데이터 채움
 *   5. 이전/다음 버튼으로 빨간 그릇 간 전환
 *   6. 뒤로가기: 해설 화면 → 선택 화면 → 대시보드 (2단계)
 *
 * 의존:
 *   - supabase-client.js  (getStudyResultV3, getCurrentUser)
 *   - task-dashboard.js   (backToTaskDashboard, SECTION_ICONS, SECTION_LABELS)
 *   - 13개 result 파일    (show 함수들)
 *   - showScreen()        (전역)
 */

// ─── 내부 상태 ───
var _explainState = null;

// ─── 섹션별 유형 → 결과 화면 매핑 ───
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
 */
async function openExplainViewer(sectionType, moduleNumber, week, day) {
    console.log('\n📖 ============================');
    console.log('📖 해설 뷰어 열기: ' + sectionType + ' M' + moduleNumber + ' W' + week + ' ' + day);
    console.log('📖 ============================\n');

    // 상태 초기화
    _explainState = {
        sectionType: sectionType,
        moduleNumber: moduleNumber,
        week: week,
        day: day,
        dbRow: null,
        selectedMode: null,   // 'initial' | 'current'
        visibleScreens: [],   // 데이터가 있는 빨간 그릇 screenId 배열
        currentIndex: 0       // 현재 보이는 그릇 인덱스
    };

    // 화면 전환
    if (typeof showScreen === 'function') {
        showScreen('explainViewerScreen');
    }

    // 헤더 업데이트
    _updateExplainHeader(sectionType, moduleNumber, week, day);

    // UI 초기화: 선택 화면 보이기, 콘텐츠 영역 숨기기
    _showSelectPanel();

    // 선택 버튼 초기화 (로딩 상태)
    var btnInitial = document.getElementById('explainBtnInitial');
    var btnCurrent = document.getElementById('explainBtnCurrent');
    if (btnInitial) { btnInitial.disabled = true; }
    if (btnCurrent) { btnCurrent.style.display = 'none'; }

    // DB 조회
    try {
        var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : window.currentUser;
        if (!user || !user.id) {
            console.error('❌ [해설] 로그인 정보 없음');
            _showSelectMessage('로그인 정보를 찾을 수 없습니다.');
            return;
        }

        var row = await getStudyResultV3(user.id, sectionType, moduleNumber, week, day);
        if (!row) {
            console.log('📖 [해설] 결과 없음 (아직 풀이하지 않음)');
            _showSelectMessage('아직 풀이한 기록이 없습니다.');
            return;
        }

        _explainState.dbRow = row;
        console.log('📖 [해설] DB 레코드 조회 성공:', row.id);

        // 실전풀이 버튼 활성화/비활성화
        if (btnInitial) {
            if (row.initial_record) {
                btnInitial.disabled = false;
                // 점수 표시
                var scoreInitial = document.getElementById('explainSelectScoreInitial');
                var score = _calculateScore(row.initial_record);
                if (scoreInitial && score !== null) {
                    scoreInitial.textContent = score + '%';
                }
            } else {
                btnInitial.disabled = true;
            }
        }

        // 다시풀기 버튼 표시/활성화
        if (btnCurrent) {
            if (row.current_record) {
                btnCurrent.style.display = '';
                btnCurrent.disabled = false;
                var scoreCurrent = document.getElementById('explainSelectScoreCurrent');
                var score2 = _calculateScore(row.current_record);
                if (scoreCurrent && score2 !== null) {
                    scoreCurrent.textContent = score2 + '%';
                }
            } else {
                btnCurrent.style.display = 'none';
            }
        }

    } catch (err) {
        console.error('❌ [해설] DB 조회 실패:', err);
        _showSelectMessage('데이터를 불러오는 데 실패했습니다.');
    }
}

// ============================================================
// 2. 헤더
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

// ============================================================
// 3. 선택 화면 ↔ 콘텐츠 영역 전환
// ============================================================

function _showSelectPanel() {
    var selectPanel = document.getElementById('explainSelectPanel');
    var contentArea = document.getElementById('explainContentArea');
    var navBar = document.getElementById('explainNavBar');

    if (selectPanel) selectPanel.style.display = '';
    if (contentArea) contentArea.style.display = 'none';
    if (navBar) navBar.style.display = 'none';

    // 모든 빨간 그릇 숨기기
    _hideAllExplainScreens();
}

function _showContentArea() {
    var selectPanel = document.getElementById('explainSelectPanel');
    var contentArea = document.getElementById('explainContentArea');
    var navBar = document.getElementById('explainNavBar');

    if (selectPanel) selectPanel.style.display = 'none';
    if (contentArea) contentArea.style.display = '';
    if (navBar) navBar.style.display = '';
}

function _hideAllExplainScreens() {
    var typeDefs = RESULT_TYPE_MAP;
    var allDefs = (typeDefs.reading || [])
        .concat(typeDefs.listening || [])
        .concat(typeDefs.writing || [])
        .concat(typeDefs.speaking || []);

    allDefs.forEach(function(def) {
        var screen = document.getElementById(def.screenId);
        if (screen) screen.style.display = 'none';
    });
}

function _showSelectMessage(msg) {
    var selectPanel = document.getElementById('explainSelectPanel');
    if (!selectPanel) return;

    var titleEl = selectPanel.querySelector('.explain-select-title');
    if (titleEl) titleEl.textContent = msg;

    var btnArea = selectPanel.querySelector('.explain-select-buttons');
    if (btnArea) btnArea.style.display = 'none';
}

// ============================================================
// 4. 선택 버튼 클릭 → show 함수 호출 → 빨간 그릇 표시
// ============================================================

/**
 * 실전풀이 또는 다시풀기 해설 보기
 * @param {'initial'|'current'} mode
 */
function _onSelectExplain(mode) {
    var st = _explainState;
    if (!st || !st.dbRow) return;

    var recordJson = (mode === 'initial') ? st.dbRow.initial_record : st.dbRow.current_record;
    if (!recordJson) return;

    st.selectedMode = mode;
    st.visibleScreens = [];
    st.currentIndex = 0;

    console.log('📖 [해설] ' + mode + ' 해설 보기 시작');

    // 모든 빨간 그릇 숨기기
    _hideAllExplainScreens();

    var typeDefs = RESULT_TYPE_MAP[st.sectionType];
    if (!typeDefs) {
        console.error('❌ [해설] 알 수 없는 섹션:', st.sectionType);
        return;
    }

    // currentTest 전역 변수 설정 (show 함수들이 week/day 표시에 참조)
    if (window.currentTest) {
        window.currentTest.currentWeek = st.week;
        window.currentTest.currentDay = st.day;
    }

    // 각 유형별 show 함수 호출 → 빨간 그릇에 데이터 채움
    typeDefs.forEach(function(def) {
        try {
            var showFn = window[def.showFn];
            if (typeof showFn !== 'function') {
                console.warn('⚠️ [해설] show 함수 없음:', def.showFn);
                return;
            }

            var screen = document.getElementById(def.screenId);
            if (!screen) {
                console.warn('⚠️ [해설] 전용 화면 없음:', def.screenId);
                return;
            }

            var data = _extractData(def, recordJson, st);
            if (!data) {
                console.log('📖 [해설] ' + def.type + ': 데이터 없음 (건너뜀)');
                return;
            }

            // show 함수 호출 — 빨간 그릇에 데이터 채움
            showFn(data);

            // 이 그릇은 데이터가 있으므로 보여줄 목록에 추가
            st.visibleScreens.push(def.screenId);
            console.log('📖 [해설] ' + def.type + ' 렌더링 완료');

        } catch (err) {
            console.error('❌ [해설] ' + def.type + ' 렌더링 실패:', err);
        }
    });

    if (st.visibleScreens.length === 0) {
        console.log('📖 [해설] 표시할 해설이 없음');
        return;
    }

    // 콘텐츠 영역 전환 + 첫 번째 그릇 표시
    _showContentArea();
    _showScreenAtIndex(0);

    // 오답노트 초기화 (선택한 모드에 따라)
    if (typeof ErrorNote !== 'undefined' && ErrorNote.init) {
        ErrorNote.init(st.dbRow, st.sectionType, st.moduleNumber, mode);
    }

    console.log('📖 [해설] ' + mode + ' 해설 보기 완료 — ' + st.visibleScreens.length + '개 화면');
}

// ============================================================
// 5. 이전/다음 네비게이션
// ============================================================

function _showScreenAtIndex(index) {
    var st = _explainState;
    if (!st || st.visibleScreens.length === 0) return;

    // 범위 보정
    if (index < 0) index = 0;
    if (index >= st.visibleScreens.length) index = st.visibleScreens.length - 1;

    // 현재 보이는 그릇 숨기기
    var currentScreenId = st.visibleScreens[st.currentIndex];
    var currentScreen = document.getElementById(currentScreenId);
    if (currentScreen) currentScreen.style.display = 'none';

    // 새 그릇 보이기
    st.currentIndex = index;
    var newScreenId = st.visibleScreens[index];
    var newScreen = document.getElementById(newScreenId);
    if (newScreen) newScreen.style.display = '';

    // 스크롤 맨 위로
    window.scrollTo(0, 0);

    // 네비게이션 표시 업데이트
    _updateNavIndicator();
}

function _updateNavIndicator() {
    var st = _explainState;
    if (!st) return;

    var indicator = document.getElementById('explainNavIndicator');
    var prevBtn = document.getElementById('explainPrevBtn');
    var nextBtn = document.getElementById('explainNextBtn');

    var total = st.visibleScreens.length;
    var current = st.currentIndex + 1;

    if (indicator) indicator.textContent = current + ' / ' + total;
    if (prevBtn) prevBtn.disabled = (st.currentIndex === 0);
    if (nextBtn) nextBtn.disabled = (st.currentIndex >= total - 1);
}

function _goToPrevScreen() {
    var st = _explainState;
    if (!st || st.currentIndex <= 0) return;
    _showScreenAtIndex(st.currentIndex - 1);
}

function _goToNextScreen() {
    var st = _explainState;
    if (!st || st.currentIndex >= st.visibleScreens.length - 1) return;
    _showScreenAtIndex(st.currentIndex + 1);
}

// ============================================================
// 6. 데이터 추출 (DB recordJson → show 함수 입력 형태)
// ============================================================

function _extractData(def, recordJson, st) {
    switch (def.type) {
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

        case 'repeat':
            if (!recordJson.repeat || !recordJson.repeat.data) return null;
            // DB: { sets: [세트], type } → show 함수: { set: 세트 }
            var repeatSets = recordJson.repeat.data.sets;
            if (!repeatSets || repeatSets.length === 0) return null;
            return { set: repeatSets[0] };

        case 'interview':
            if (!recordJson.interview || !recordJson.interview.data) return null;
            // DB: { sets: [세트], type } → show 함수: { set: 세트 }
            var interviewSets = recordJson.interview.data.sets;
            if (!interviewSets || interviewSets.length === 0) return null;
            return { set: interviewSets[0] };

        default:
            var sets = recordJson.sets;
            if (!sets) return null;

            var collected = [];
            var keys = Object.keys(sets).sort(function(a, b) {
                var numA = parseInt(a.match(/\d+$/)[0]);
                var numB = parseInt(b.match(/\d+$/)[0]);
                return numA - numB;
            });

            keys.forEach(function(key) {
                if (key.indexOf(def.type + '_set') === 0) {
                    collected.push(sets[key]);
                }
            });

            if (collected.length === 0) return null;
            return collected;
    }
}

// ============================================================
// 7. 점수 계산
// ============================================================

function _calculateScore(recordJson) {
    if (!recordJson) return null;

    if (recordJson.totalCorrect != null && recordJson.totalQuestions) {
        return Math.round((recordJson.totalCorrect / recordJson.totalQuestions) * 100);
    }

    if (recordJson.arrange && recordJson.arrange.accuracy != null) {
        return recordJson.arrange.accuracy;
    }

    return null;
}

// ============================================================
// 8. 뒤로가기 (2단계)
// ============================================================

function _backFromExplainViewer() {
    var st = _explainState;

    // 해설 콘텐츠 화면에 있으면 → 선택 화면으로
    if (st && st.selectedMode) {
        console.log('📖 [해설] 뒤로가기 → 선택 화면');

        // 오답노트 정리
        if (typeof ErrorNote !== 'undefined' && ErrorNote.cleanup) {
            ErrorNote.cleanup();
        }

        // 오디오 정리
        _cleanupExplainAudio();

        // 선택 화면으로 복귀
        st.selectedMode = null;
        st.visibleScreens = [];
        st.currentIndex = 0;
        _showSelectPanel();
        return;
    }

    // 선택 화면에 있으면 → 대시보드로
    console.log('📖 [해설] 뒤로가기 → 대시보드');

    // 오답노트 정리 (혹시 남아있으면)
    if (typeof ErrorNote !== 'undefined' && ErrorNote.cleanup) {
        ErrorNote.cleanup();
    }

    // 상태 초기화
    _explainState = null;

    // 대시보드로 복귀
    if (typeof backToTaskDashboard === 'function') {
        backToTaskDashboard();
    }
}

function _cleanupExplainAudio() {
    var viewer = document.getElementById('explainViewerScreen');
    if (!viewer) return;

    var audios = viewer.querySelectorAll('audio');
    audios.forEach(function(audio) {
        audio.pause();
        audio.currentTime = 0;
    });
}

// ============================================================
// 9. 이벤트 바인딩 (DOM Ready)
// ============================================================

(function _initExplainViewer() {
    // 뒤로가기 버튼
    var backBtn = document.getElementById('explainBackBtn');
    if (backBtn) {
        backBtn.addEventListener('click', _backFromExplainViewer);
    }

    // 실전풀이 해설 보기 버튼
    var btnInitial = document.getElementById('explainBtnInitial');
    if (btnInitial) {
        btnInitial.addEventListener('click', function() {
            _onSelectExplain('initial');
        });
    }

    // 다시풀기 해설 보기 버튼
    var btnCurrent = document.getElementById('explainBtnCurrent');
    if (btnCurrent) {
        btnCurrent.addEventListener('click', function() {
            _onSelectExplain('current');
        });
    }

    // 이전 버튼
    var prevBtn = document.getElementById('explainPrevBtn');
    if (prevBtn) {
        prevBtn.addEventListener('click', _goToPrevScreen);
    }

    // 다음 버튼
    var nextBtn = document.getElementById('explainNextBtn');
    if (nextBtn) {
        nextBtn.addEventListener('click', _goToNextScreen);
    }

    console.log('📖 [해설] explain-viewer.js 초기화 완료 (뎁스 방식)');
})();
