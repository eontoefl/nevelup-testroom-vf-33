/**
 * ================================================
 * correction-main.js
 * FEEDBACK 탭 메인 화면 렌더링
 * ================================================
 * 
 * - Week 1~4 그룹 + 세션 카드 렌더링
 * - correction_schedules에서 start_date 조회 → 날짜 계산
 * - correction_submissions에서 상태 조회 → 카드 상태 아이콘 반영
 * - 스케줄 미배정 시 안내 메시지 표시
 */

/**
 * 첨삭 스케줄 렌더링 (FEEDBACK 탭 메인)
 * main.js의 _renderCorrectionMode()에서 호출
 */
async function renderCorrectionSchedule() {
    var container = document.getElementById('correctionScheduleContainer');
    if (!container) return;
    container.innerHTML = '';

    var track = getCorrectionTrack();
    var schedule = getCorrectionScheduleData();
    if (!schedule || schedule.length === 0) {
        container.innerHTML = '<div class="correction-empty-msg"><p>첨삭 스케줄 데이터가 없습니다.</p></div>';
        return;
    }

    var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : window.currentUser;
    if (!user || !user.id) {
        container.innerHTML = '<div class="correction-empty-msg"><p>로그인 정보를 확인할 수 없습니다.</p></div>';
        return;
    }

    // 1. correction_schedules에서 start_date 조회
    var scheduleData = null;
    try {
        scheduleData = await getCorrectionSchedule(user.id);
    } catch (e) {
        console.warn('⚠️ [Correction] 스케줄 조회 실패:', e);
    }

    // 개발 모드(localhost): 일정이 배정 안 돼 있으면 지난 일요일을 시작일로 가정
    if (window.CORR_DEV_AUS && (!scheduleData || !scheduleData.start_date)) {
        scheduleData = { start_date: _corrLastSunday(), duration_weeks: 4 };
        console.warn('🧪 [Correction] 개발 모드 임시 일정:', scheduleData.start_date);
    }

    // 개발 모드(localhost): 자기주도(시작·종료일 지정) 주입 — DB 없이 화면 확인용
    if (window.CORR_DEV_SELFPACED) {
        var devStart = null, devEnd = null, devDates = null;
        try {
            devStart = sessionStorage.getItem('corrDevStart');
            devEnd = sessionStorage.getItem('corrDevEnd');
            devDates = sessionStorage.getItem('corrDevSessionDates');
        } catch (e) {}
        scheduleData = {
            start_date: devStart,
            end_date: devEnd,
            duration_weeks: 4,
            session_dates: devDates || null
        };
        console.warn('🧪 [Correction] 개발 모드: 자기주도 주입', devStart, '~', devEnd);
    }

    if (!scheduleData || !scheduleData.start_date) {
        container.innerHTML = '<div class="correction-empty-msg"><p>아직 첨삭 일정이 배정되지 않았습니다.<br>담당자에게 문의해주세요.</p></div>';
        return;
    }

    var durationWeeks = scheduleData.duration_weeks || 4;

    // 1-b. 자기주도면 12세션 확정 일정표를 계산·저장(멱등). 종료일 없으면 아무것도 안 함.
    await _ensureCorrSessionDates(user, scheduleData);

    // 2. correction_submissions에서 전체 제출 내역 조회
    var submissions = [];
    try {
        submissions = await getCorrectionSubmissions(user.id);
    } catch (e) {
        console.warn('⚠️ [Correction] 제출 내역 조회 실패:', e);
    }

    // 세션별 상태 매핑
    // DB task_type: writing_email, writing_discussion, speaking_interview
    // 카드 조회 키: session_writing, session_speaking
    var submissionMap = {};
    submissions.forEach(function(sub) {
        // 원본 키 (detail 조회용)
        submissionMap[sub.session_number + '_' + sub.task_type] = sub;
        // 카테고리 키 (카드 상태용)
        var category = sub.task_type.indexOf('writing') === 0 ? 'writing' : 'speaking';
        submissionMap[sub.session_number + '_' + category] = sub;
    });

    // 3. correction_deadline_extensions에서 마감 연장 조회
    var extensions = [];
    var extBase = 'user_id=eq.' + user.id + '&select=session_number,task_type,extended_hours,created_at';
    try {
        extensions = await supabaseSelect('correction_deadline_extensions', extBase + ',draft_round');
    } catch (e) {
        // draft_round 마이그레이션 전이면 컬럼이 없어 실패한다 → 차수 없이 재조회 (연장이 전부 무효가 되는 것 방지)
        console.warn('⚠️ [Correction] 마감 연장 조회 실패, draft_round 없이 재시도:', e);
        try {
            extensions = await supabaseSelect('correction_deadline_extensions', extBase);
        } catch (e2) {
            console.warn('⚠️ [Correction] 마감 연장 조회 실패:', e2);
        }
    }

    // extensionMap 빌드 (이중 키: 원본 + 카테고리)
    var extensionMap = {};
    if (extensions && extensions.length > 0) {
        extensions.forEach(function(ext) {
            // 연장을 건 시각도 함께 보관 — 마감이 지난 뒤 연장한 경우의 기준점이 된다
            var entry = {
                hours: ext.extended_hours,
                at: ext.created_at ? new Date(ext.created_at) : null
            };
            // draft_round: 1=1차만, 2=2차만, null=둘 다(구버전 행)
            var round = ext.draft_round;

            function put(key) {
                var slot = extensionMap[key];
                if (!slot) { slot = { r1: null, r2: null }; extensionMap[key] = slot; }
                if (round === 1) slot.r1 = entry;
                else if (round === 2) slot.r2 = entry;
                else { slot.r1 = entry; slot.r2 = entry; }
            }

            // 원본 키: "1_writing_email"
            put(ext.session_number + '_' + ext.task_type);
            // 카테고리 키: "1_writing"
            var category = ext.task_type.indexOf('writing') === 0 ? 'writing' : 'speaking';
            put(ext.session_number + '_' + category);
        });
        console.log('📋 [Correction] 마감 연장:', Object.keys(extensionMap).length + '건');
    }

    console.log('📋 [Correction] 렌더링 시작 — start_date:', scheduleData.start_date, ', sessions:', schedule.length);

    // 0. 공지사항 배너 (첨삭 전용 — 메인 코스와 무관)
    _renderCorrectionNotice(container);

    // 연장(2학기) 활성화 여부 / 시작 여부
    // 호주첨삭은 12세션만 운영 — 연장(13~24세션) 미도입
    var extEnabled = (track !== 'aus') && !!(scheduleData.extension_enabled && scheduleData.extension_start_date);
    var extStarted = false;
    if (extEnabled) {
        var extStart = new Date(scheduleData.extension_start_date + 'T00:00:00');
        extStarted = (new Date() >= extStart);
    }

    // 렌더 컨텍스트 (주차 렌더 헬퍼에 전달)
    var ctx = { scheduleData: scheduleData, submissionMap: submissionMap, extensionMap: extensionMap, durationWeeks: durationWeeks };

    if (!extEnabled) {
        // ── 연장 OFF: 업셀 조건(세션9 종료 등) 충족 시 [1~12][🔒13~24] 칩, 아니면 1~12만 ──
        if (typeof shouldShowExtensionUpsell === 'function' && shouldShowExtensionUpsell(ctx)) {
            renderExtensionUpsellTabs(container, ctx);
        } else {
            _renderCorrectionPhase(container, 1, ctx);
        }
        return;
    }

    // ── 연장 ON: 탭 2개(1~12세션 / 13~24세션) ──
    var tabBar = document.createElement('div');
    tabBar.className = 'correction-tab-bar';

    var tab1 = document.createElement('button');
    tab1.className = 'correction-tab';
    tab1.textContent = '1~12세션';

    var tab2 = document.createElement('button');
    tab2.className = 'correction-tab';
    tab2.textContent = '13~24세션';

    tabBar.appendChild(tab1);
    tabBar.appendChild(tab2);
    container.appendChild(tabBar);

    // 각 탭 패널
    var panel1 = document.createElement('div');
    panel1.className = 'correction-tab-panel';
    var panel2 = document.createElement('div');
    panel2.className = 'correction-tab-panel';

    _renderCorrectionPhase(panel1, 1, ctx);
    _renderCorrectionPhase(panel2, 2, ctx);

    container.appendChild(panel1);
    container.appendChild(panel2);

    function activateTab(which) {
        var isP2 = (which === 2);
        tab1.classList.toggle('active', !isP2);
        tab2.classList.toggle('active', isP2);
        panel1.style.display = isP2 ? 'none' : 'block';
        panel2.style.display = isP2 ? 'block' : 'none';
    }

    tab1.onclick = function() { activateTab(1); };
    tab2.onclick = function() { activateTab(2); };

    // 기본 탭: 연장 시작일이 지났으면 13~24세션, 아니면 1~12세션
    activateTab(extStarted ? 2 : 1);
}

/**
 * 특정 학기(phase)의 주차 블록들을 targetEl에 렌더
 * @param {HTMLElement} targetEl
 * @param {number} phase - 1(1~12세션) | 2(13~24세션)
 * @param {object} ctx - { scheduleData, submissionMap, extensionMap, durationWeeks }
 */
function _renderCorrectionPhase(targetEl, phase, ctx) {
    var track = getCorrectionTrack();
    var schedule = getCorrectionScheduleData();
    var scheduleData = ctx.scheduleData;
    var submissionMap = ctx.submissionMap;
    var extensionMap = ctx.extensionMap;
    var durationWeeks = ctx.durationWeeks;

    var monthNames = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

    var selfPaced = isCorrSelfPaced(scheduleData);
    var todayYmd = selfPaced ? _corrYmd(getEffectiveToday(getUserTimezone())) : null;

    // 해당 phase 세션만 주차별 그룹핑
    var weeks = {};
    schedule.forEach(function(s) {
        if ((s.phase || 1) !== phase) return;
        if (phase === 1 && s.week > durationWeeks) return; // 1학기 duration 초과 제외
        if (!weeks[s.week]) weeks[s.week] = [];
        weeks[s.week].push(s);
    });

    var weekNums = Object.keys(weeks).sort(function(a, b) { return a - b; });

    weekNums.forEach(function(weekNum) {
        var sessions = weeks[weekNum];

        var weekBlock = document.createElement('div');
        weekBlock.className = 'week-block';

        var weekHeader = document.createElement('div');
        weekHeader.className = 'week-header';

        var weekTitle = document.createElement('h2');
        weekTitle.className = 'week-title';
        if (selfPaced) {
            var firstS = sessions[0].session;
            var lastS = sessions[sessions.length - 1].session;
            weekTitle.textContent = 'SESSION ' + String(firstS).padStart(2, '0') + '-' + String(lastS).padStart(2, '0');
        } else {
            weekTitle.textContent = 'Week ' + String(weekNum).padStart(2, '0');
        }

        var weekDivider = document.createElement('div');
        weekDivider.className = 'week-divider';

        weekHeader.appendChild(weekTitle);
        weekHeader.appendChild(weekDivider);

        var daysGrid = document.createElement('div');
        daysGrid.className = 'days-grid correction-days-grid';

        sessions.forEach(function(session) {
            var wMeta = getCorrTaskMeta(session, 'writing');
            var sMeta = getCorrTaskMeta(session, 'speaking');
            // 호주첨삭은 스피킹이 앞 (독스 + 토라), 일반첨삭은 라이팅이 앞 (Email + Interview)
            var taskLabel = (track === 'aus')
                ? (sMeta ? sMeta.label : '?') + ' + ' + (wMeta ? wMeta.label : '?')
                : (wMeta ? wMeta.label : '?') + ' + ' + (sMeta ? sMeta.label : '?');

            // 세션 날짜 계산: 자기주도면 확정 일정표, 아니면 (해당 학기 시작일) + dayOffset
            var sessionDate = getCorrSessionDate(scheduleData, session);
            var dateStr = sessionDate
                ? (monthNames[sessionDate.getMonth()] + ' ' + String(sessionDate.getDate()).padStart(2, '0'))
                : '';

            var writingSub = submissionMap[session.session + '_writing'];
            var speakingSub = submissionMap[session.session + '_speaking'];
            var statusInfo = _getSessionStatus(writingSub, speakingSub);

            var dayButton = document.createElement('button');
            dayButton.className = 'day-button';
            dayButton.setAttribute('data-session', session.session);

            dayButton.innerHTML =
                '<span class="day-name">SESSION ' + String(session.session).padStart(2, '0') + '</span>' +
                '<div class="progress-dot ' + statusInfo.dotClass + '"></div>' +
                '<span class="day-tasks">' + taskLabel + '</span>' +
                '<span class="day-tasks" style="font-size:10px;color:#bbb;">' + dateStr + '</span>';

            // 자기주도: 오늘 배정된 세션 카드 강조 (레이아웃 안 밀리게 box-shadow)
            if (selfPaced && sessionDate && _corrYmd(sessionDate) === todayYmd) {
                dayButton.style.boxShadow = '0 0 0 2px #6c5ce7';
            }

            dayButton.onclick = function() {
                console.log('🎯 [Correction] Session ' + session.session + ' 선택');
                openCorrectionSession(session, scheduleData, submissionMap, extensionMap);
            };

            daysGrid.appendChild(dayButton);
        });

        weekBlock.appendChild(weekHeader);
        weekBlock.appendChild(daysGrid);
        targetEl.appendChild(weekBlock);
    });
}

/**
 * 세션의 종합 상태 결정 (Writing + Speaking 중 더 낮은 진행도 기준)
 * @param {object|undefined} writingSub
 * @param {object|undefined} speakingSub
 * @returns {{ dotClass: string, label: string }}
 */
function _getSessionStatus(writingSub, speakingSub) {
    var wStatus = writingSub ? writingSub.status : null;
    var sStatus = speakingSub ? speakingSub.status : null;

    // 둘 다 없으면 미시작
    if (!wStatus && !sStatus) {
        return { dotClass: 'dot-none', label: '미시작' };
    }

    // 둘 다 완료 (feedback2_ready + released_2 또는 complete)
    var wDone = (wStatus === 'complete') || (wStatus === 'feedback2_ready' && writingSub && writingSub.released_2);
    var sDone = (sStatus === 'complete') || (sStatus === 'feedback2_ready' && speakingSub && speakingSub.released_2);
    if (wDone && sDone) {
        return { dotClass: 'dot-done', label: '완료' };
    }

    // expired 또는 skipped
    var endStates = ['expired', 'skipped'];
    if (endStates.indexOf(wStatus) >= 0 || endStates.indexOf(sStatus) >= 0) {
        return { dotClass: 'dot-expired', label: '마감' };
    }

    // failed
    if ((wStatus && wStatus.indexOf('failed') >= 0) || (sStatus && sStatus.indexOf('failed') >= 0)) {
        return { dotClass: 'dot-expired', label: '오류' };
    }

    // 하나라도 진행중이면
    return { dotClass: 'dot-partial', label: '진행중' };
}

/**
 * 첨삭 공지사항 배너 렌더링 (FEEDBACK 메인 상단)
 * @param {HTMLElement} container - correctionScheduleContainer
 */
function _renderCorrectionNotice(container) {
    // 호주첨삭은 아직 별도 공지 없음 (일반첨삭 공지를 그대로 띄우면 안 됨)
    if (getCorrectionTrack() === 'aus') return;

    // TODO: 실제 운영 시 공지 내용/노출 여부는 DB(correction_notices 등)에서 조회
    var notice = {
        id: 'upgrade-2026-06-27',
        title: '첨삭 업그레이드 안내 (6/27~)',
        body: '6월 27일(일)부터 첨삭이 한층 강화됩니다. 그동안 누적된 시험 데이터와 채점 결과를 분석해, 더 정확하고 구체적이며 강력한 교습 방식을 새로 적용했어요. 이 과정에서 첨삭 방식과 피드백 형식이 다소 달라질 수 있는데, 모두 여러분의 실력 향상을 위한 변화입니다. 바뀐 방식대로 잘 따라와 주시면 분명 더 빠르게 성장하실 거예요. 응원합니다! 💪',
        dismissible: true
    };

    // 사용자가 닫은 공지는 다시 띄우지 않음 (localStorage)
    try {
        if (notice.dismissible && localStorage.getItem('corrNoticeDismissed_' + notice.id) === '1') {
            return;
        }
    } catch (e) {}

    var box = document.createElement('div');
    box.className = 'correction-notice';
    box.innerHTML =
        '<i class="fas fa-bullhorn correction-notice-icon"></i>' +
        '<div class="correction-notice-content">' +
            '<div class="correction-notice-title">' + notice.title + '</div>' +
            '<div class="correction-notice-body">' + notice.body + '</div>' +
        '</div>' +
        (notice.dismissible
            ? '<button class="correction-notice-close" title="닫기"><i class="fas fa-times"></i></button>'
            : '');

    if (notice.dismissible) {
        var closeBtn = box.querySelector('.correction-notice-close');
        closeBtn.onclick = function() {
            try { localStorage.setItem('corrNoticeDismissed_' + notice.id, '1'); } catch (e) {}
            box.remove();
        };
    }

    container.appendChild(box);
}

// openCorrectionSession()은 js/correction/correction-session.js에서 정의

/**
 * 자기주도면 12세션 확정 일정표를 계산해 correction_schedules.session_dates에 저장(멱등).
 *   - 자기주도가 아니거나 start_date가 없으면 아무것도 안 함(= 기존 학생 무영향).
 *   - 저장표가 있고 start·end가 그대로면 아무것도 안 함(멱등).
 *   - 아니면 [오늘~종료일] 재배분(지난 세션 보존)해서 메모리·DB에 반영. DB 실패는 경고만.
 * 개발모드(CORR_DEV_SELFPACED)에서는 DB 대신 sessionStorage에 저장(재배분 테스트용).
 */
async function _ensureCorrSessionDates(user, scheduleData) {
    if (!isCorrSelfPaced(scheduleData) || !scheduleData.start_date) return;

    var stored = _parseCorrSessionDates(scheduleData.session_dates);
    if (stored && stored.start === scheduleData.start_date && stored.end === scheduleData.end_date) {
        return; // 멱등 — 이미 최신
    }

    var todayYmd = _corrYmd(getEffectiveToday(getUserTimezone()));
    var built = buildCorrSessionDates(
        scheduleData.start_date,
        scheduleData.end_date,
        stored ? stored.dates : null,
        todayYmd
    );
    if (!built) {
        console.warn('⚠️ [Correction] 자기주도 일정표 생성 실패 (start/end 확인):', scheduleData.start_date, scheduleData.end_date);
        return;
    }

    scheduleData.session_dates = built; // 메모리 즉시 반영

    if (window.CORR_DEV_SELFPACED) {
        try { sessionStorage.setItem('corrDevSessionDates', JSON.stringify(built)); } catch (e) {}
        return; // 개발모드: DB에 쓰지 않음
    }

    try {
        await supabaseUpdate('correction_schedules', 'user_id=eq.' + user.id, { session_dates: JSON.stringify(built) });
        console.log('📋 [Correction] 자기주도 일정표 저장:', built.dates[0], '~', built.dates[11]);
    } catch (e) {
        console.warn('⚠️ [Correction] session_dates 저장 실패(화면은 계속):', e);
    }
}

/**
 * 개발 모드 전용: 가장 최근 일요일 'YYYY-MM-DD'
 * (첨삭 일정이 배정되지 않은 계정으로 화면을 확인하기 위한 임시 시작일)
 */
function _corrLastSunday() {
    var d = new Date();
    d.setDate(d.getDate() - d.getDay());
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
}

console.log('✅ correction-main.js 로드 완료');
