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

    var startDate = new Date(scheduleData.start_date + 'T00:00:00');
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

    console.log('📋 [Correction] 렌더링 시작 — start_date:', scheduleData.start_date, ', sessions:', schedule.length);

    // 3. 주차별 그룹핑
    var weeks = {};
    schedule.forEach(function(s) {
        if (s.week > durationWeeks) return; // duration 초과 세션 제외
        if (!weeks[s.week]) weeks[s.week] = [];
        weeks[s.week].push(s);
    });

    var monthNames = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    var weekNums = Object.keys(weeks).sort(function(a, b) { return a - b; });

    weekNums.forEach(function(weekNum) {
        var sessions = weeks[weekNum];

        var weekBlock = document.createElement('div');
        weekBlock.className = 'week-block';

        // week-header
        var weekHeader = document.createElement('div');
        weekHeader.className = 'week-header';

        var weekTitle = document.createElement('h2');
        weekTitle.className = 'week-title';
        weekTitle.textContent = 'Week ' + String(weekNum).padStart(2, '0');

        var weekDivider = document.createElement('div');
        weekDivider.className = 'week-divider';

        weekHeader.appendChild(weekTitle);
        weekHeader.appendChild(weekDivider);

        // days-grid (3열)
        var daysGrid = document.createElement('div');
        daysGrid.className = 'days-grid correction-days-grid';

        sessions.forEach(function(session) {
            var writingLabel = session.writing.type === 'email' ? 'Email' : 'Discussion';
            var taskLabel = writingLabel + ' + Interview';

            // 세션 날짜 계산: startDate + dayOffset
            var sessionDate = new Date(startDate);
            sessionDate.setDate(sessionDate.getDate() + session.dayOffset);
            var dateStr = monthNames[sessionDate.getMonth()] + ' ' + String(sessionDate.getDate()).padStart(2, '0');

            // 세션 상태 결정 (Writing + Speaking 중 더 낮은 진행도 기준)
            var writingSub = submissionMap[session.session + '_writing'];
            var speakingSub = submissionMap[session.session + '_speaking'];
            var statusInfo = _getSessionStatus(writingSub, speakingSub);

            // 카드 생성 (기존 day-button 패턴 사용)
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
                openCorrectionSession(session, scheduleData, submissionMap);
            };

            daysGrid.appendChild(dayButton);
        });

        weekBlock.appendChild(weekHeader);
        weekBlock.appendChild(daysGrid);
        container.appendChild(weekBlock);
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

    // 둘 다 complete
    if (wStatus === 'complete' && sStatus === 'complete') {
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
