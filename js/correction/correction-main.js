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

    var schedule = window.CORRECTION_SCHEDULE;
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

    if (!scheduleData || !scheduleData.start_date) {
        container.innerHTML = '<div class="correction-empty-msg"><p>아직 첨삭 일정이 배정되지 않았습니다.<br>담당자에게 문의해주세요.</p></div>';
        return;
    }

    var durationWeeks = scheduleData.duration_weeks || 4;

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
    try {
        extensions = await supabaseSelect(
            'correction_deadline_extensions',
            'user_id=eq.' + user.id + '&select=session_number,task_type,extended_hours'
        );
    } catch (e) {
        console.warn('⚠️ [Correction] 마감 연장 조회 실패:', e);
    }

    // extensionMap 빌드 (이중 키: 원본 + 카테고리)
    var extensionMap = {};
    if (extensions && extensions.length > 0) {
        extensions.forEach(function(ext) {
            // 원본 키: "1_writing_email"
            extensionMap[ext.session_number + '_' + ext.task_type] = ext.extended_hours;
            // 카테고리 키: "1_writing"
            var category = ext.task_type.indexOf('writing') === 0 ? 'writing' : 'speaking';
            extensionMap[ext.session_number + '_' + category] = ext.extended_hours;
        });
        console.log('📋 [Correction] 마감 연장:', Object.keys(extensionMap).length + '건');
    }

    console.log('📋 [Correction] 렌더링 시작 — start_date:', scheduleData.start_date, ', sessions:', schedule.length);

    // 연장(2학기) 활성화 여부 / 시작 여부
    var extEnabled = !!(scheduleData.extension_enabled && scheduleData.extension_start_date);
    var extStarted = false;
    if (extEnabled) {
        var extStart = new Date(scheduleData.extension_start_date + 'T00:00:00');
        extStarted = (new Date() >= extStart);
    }

    // 렌더 컨텍스트 (주차 렌더 헬퍼에 전달)
    var ctx = { scheduleData: scheduleData, submissionMap: submissionMap, extensionMap: extensionMap, durationWeeks: durationWeeks };

    if (!extEnabled) {
        // ── 연장 OFF: 탭 없이 1~12세션만 렌더 (기존 화면 그대로) ──
        _renderCorrectionPhase(container, 1, ctx);
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
    var schedule = window.CORRECTION_SCHEDULE;
    var scheduleData = ctx.scheduleData;
    var submissionMap = ctx.submissionMap;
    var extensionMap = ctx.extensionMap;
    var durationWeeks = ctx.durationWeeks;

    var monthNames = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

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
        weekTitle.textContent = 'Week ' + String(weekNum).padStart(2, '0');

        var weekDivider = document.createElement('div');
        weekDivider.className = 'week-divider';

        weekHeader.appendChild(weekTitle);
        weekHeader.appendChild(weekDivider);

        var daysGrid = document.createElement('div');
        daysGrid.className = 'days-grid correction-days-grid';

        sessions.forEach(function(session) {
            var writingLabel = session.writing.type === 'email' ? 'Email' : 'Discussion';
            var taskLabel = writingLabel + ' + Interview';

            // 세션 날짜 계산: (해당 학기 시작일) + dayOffset
            var baseDateStr = getCorrSessionStartDate(scheduleData, session);
            var sessionDate = new Date(baseDateStr + 'T00:00:00');
            sessionDate.setDate(sessionDate.getDate() + session.dayOffset);
            var dateStr = monthNames[sessionDate.getMonth()] + ' ' + String(sessionDate.getDate()).padStart(2, '0');

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

// openCorrectionSession()은 js/correction/correction-session.js에서 정의

console.log('✅ correction-main.js 로드 완료');
