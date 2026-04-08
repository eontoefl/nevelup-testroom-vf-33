/**
 * ================================================
 * correction-session.js
 * 세션 상세 화면 (Writing + Speaking 카드)
 * ================================================
 * 
 * correctionSessionScreen에 Writing 카드 1개 + Speaking 카드 1개 렌더링.
 * correction_submissions 상태에 따라 카드 텍스트/버튼 분기.
 * 데드라인 배너 표시.
 */

// 현재 열린 세션 정보 (전역 상태)
window._correctionSessionState = null;

/**
 * 세션 상세 화면 열기
 * correction-main.js의 openCorrectionSession()에서 호출
 * 
 * @param {object} session - CORRECTION_SCHEDULE 항목
 * @param {object} scheduleData - correction_schedules 행 { start_date, duration_weeks }
 * @param {object} submissionMap - 전체 제출 상태 맵
 */
function openCorrectionSession(session, scheduleData, submissionMap) {
    console.log('📋 [Correction] 세션 상세 열기: Session', session.session);

    // 상태 저장
    window._correctionSessionState = {
        session: session,
        scheduleData: scheduleData,
        submissionMap: submissionMap
    };

    // 화면 전환
    showScreen('correctionSessionScreen');

    // 헤더 설정
    var titleEl = document.getElementById('corrSessionTitle');
    var subtitleEl = document.getElementById('corrSessionSubtitle');
    if (titleEl) titleEl.textContent = 'SESSION ' + String(session.session).padStart(2, '0');
    if (subtitleEl) subtitleEl.textContent = 'Week ' + session.week;

    // 데드라인 배너
    _renderCorrectionDeadlineBanner(session, scheduleData);

    // Writing 카드
    var writingSub = submissionMap[session.session + '_writing'] || null;
    var writingLabel = session.writing.type === 'email' ? 'Email' : 'Discussion';
    _renderCorrectionTaskCard(
        'corrWritingCard',
        'writing',
        writingLabel + ' ' + session.writing.number,
        writingSub,
        session
    );

    // Speaking 카드
    var speakingSub = submissionMap[session.session + '_speaking'] || null;
    _renderCorrectionTaskCard(
        'corrSpeakingCard',
        'speaking',
        'Interview ' + session.speaking.number,
        speakingSub,
        session
    );
}

/**
 * 태스크 카드 렌더링
 * @param {string} containerId - 카드 컨테이너 ID
 * @param {string} taskType - 'writing' | 'speaking'
 * @param {string} taskTitle - 표시 이름 (예: "Email 1", "Interview 1")
 * @param {object|null} submission - correction_submissions 행 또는 null
 * @param {object} session - CORRECTION_SCHEDULE 항목
 */
function _renderCorrectionTaskCard(containerId, taskType, taskTitle, submission, session) {
    var container = document.getElementById(containerId);
    if (!container) return;

    var statusInfo = _getCorrectionCardStatus(submission);
    var iconClass = taskType === 'writing' ? 'fas fa-pen' : 'fas fa-microphone';
    var iconBgClass = taskType === 'writing' ? 'writing' : 'speaking';

    container.innerHTML =
        '<div class="task-card-header">' +
            '<div class="task-card-icon ' + iconBgClass + '"><i class="' + iconClass + '"></i></div>' +
            '<div class="task-card-title">' + taskTitle + '</div>' +
        '</div>' +
        '<div class="task-card-status">' + statusInfo.text + '</div>' +
        '<button class="task-card-btn ' + statusInfo.btnClass + '" id="' + containerId + 'Btn"' +
            (statusInfo.disabled ? ' disabled' : '') + '>' +
            statusInfo.btnText +
        '</button>';

    // 버튼 클릭 핸들러
    var btn = document.getElementById(containerId + 'Btn');
    if (btn && !statusInfo.disabled) {
        btn.onclick = function() {
            _onCorrectionTaskClick(taskType, session, submission, statusInfo.action);
        };
    }
}

/**
 * 상태 → 카드 텍스트/버튼 매핑 (Q24 확정)
 * @param {object|null} sub - correction_submissions 행
 * @returns {{ text, btnText, btnClass, disabled, action }}
 */
function _getCorrectionCardStatus(sub) {
    if (!sub) {
        return { text: '미제출', btnText: '작성하기', btnClass: 'btn-active', disabled: false, action: 'write' };
    }

    var status = sub.status;

    switch (status) {
        case 'draft1_submitted':
            return { text: '1차 제출 완료 · 첨삭 대기', btnText: '확인하기', btnClass: 'btn-disabled', disabled: true, action: 'view' };
        case 'feedback1_processing':
            return { text: '1차 첨삭 진행중', btnText: '확인하기', btnClass: 'btn-disabled', disabled: true, action: 'view' };
        case 'feedback1_ready':
            if (sub.released_1) {
                return { text: '1차 첨삭 도착!', btnText: '확인하기', btnClass: 'btn-highlight', disabled: false, action: 'view_feedback1' };
            }
            return { text: '1차 첨삭 완료 · 검수중', btnText: '확인하기', btnClass: 'btn-disabled', disabled: true, action: 'view' };
        case 'feedback1_failed':
            return { text: '첨삭 준비 중 문제가 발생했습니다. 잠시 후 다시 확인해주세요.', btnText: '확인하기', btnClass: 'btn-disabled', disabled: true, action: 'view' };
        case 'draft2_submitted':
            return { text: '2차 제출 완료 · 첨삭 대기', btnText: '확인하기', btnClass: 'btn-disabled', disabled: true, action: 'view' };
        case 'feedback2_processing':
            return { text: '2차 첨삭 진행중', btnText: '확인하기', btnClass: 'btn-disabled', disabled: true, action: 'view' };
        case 'feedback2_ready':
            if (sub.released_2) {
                return { text: '최종 첨삭 도착!', btnText: '확인하기', btnClass: 'btn-highlight', disabled: false, action: 'view_feedback2' };
            }
            return { text: '최종 첨삭 완료 · 검수중', btnText: '확인하기', btnClass: 'btn-disabled', disabled: true, action: 'view' };
        case 'feedback2_failed':
            return { text: '첨삭 준비 중 문제가 발생했습니다. 잠시 후 다시 확인해주세요.', btnText: '확인하기', btnClass: 'btn-disabled', disabled: true, action: 'view' };
        case 'complete':
            return { text: '완료', btnText: '다시보기', btnClass: 'btn-active', disabled: false, action: 'view_complete' };
        case 'expired':
            return { text: '마감됨', btnText: '모범답안 보기', btnClass: 'btn-active', disabled: false, action: 'view_model' };
        case 'skipped':
            return { text: '건너뜀', btnText: '모범답안 보기', btnClass: 'btn-active', disabled: false, action: 'view_model' };
        default:
            return { text: status || '알 수 없음', btnText: '확인하기', btnClass: 'btn-disabled', disabled: true, action: 'view' };
    }
}

/**
 * 태스크 카드 버튼 클릭 핸들러
 * @param {string} taskType - 'writing' | 'speaking'
 * @param {object} session - CORRECTION_SCHEDULE 항목
 * @param {object|null} submission - correction_submissions 행
 * @param {string} action - 'write' | 'view_feedback1' | 'view_feedback2' | 'view_complete' | 'view_model'
 */
function _onCorrectionTaskClick(taskType, session, submission, action) {
    console.log('🎯 [Correction] 태스크 클릭:', taskType, action, 'Session', session.session);

    if (action === 'write') {
        // Phase 4/5에서 Writing/Speaking 제출 화면으로 전환
        alert(taskType + ' 작성 화면은 Phase 4/5에서 구현됩니다.');
        return;
    }

    // Phase 6에서 과제 상세(아코디언) 화면으로 전환
    alert(taskType + ' 상세 화면은 Phase 6에서 구현됩니다.');
}

/**
 * 데드라인 배너 렌더링
 * @param {object} session - CORRECTION_SCHEDULE 항목
 * @param {object} scheduleData - { start_date, duration_weeks }
 */
function _renderCorrectionDeadlineBanner(session, scheduleData) {
    var bannerEl = document.getElementById('corrSessionDeadlineBanner');
    if (!bannerEl) return;

    var startDate = new Date(scheduleData.start_date + 'T00:00:00');
    var sessionDate = new Date(startDate);
    sessionDate.setDate(sessionDate.getDate() + session.dayOffset);

    // 1차 데드라인: sessionDate 다음날 04:00
    var deadline1 = new Date(sessionDate);
    deadline1.setDate(deadline1.getDate() + 1);
    deadline1.setHours(4, 0, 0, 0);

    var now = new Date();

    if (now > deadline1) {
        bannerEl.className = 'correction-deadline-banner deadline-passed';
        bannerEl.innerHTML = '<i class="fas fa-lock"></i> 1차 마감됨';
        bannerEl.style.display = '';
    } else {
        var diff = deadline1 - now;
        var days = Math.floor(diff / (1000 * 60 * 60 * 24));
        var hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        var minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        var timeText = '';
        if (days > 0) timeText = days + '일 ' + hours + '시간 남음';
        else if (hours > 0) timeText = hours + '시간 ' + minutes + '분 남음';
        else timeText = minutes + '분 남음';

        if (days === 0 && hours < 6) {
            bannerEl.className = 'correction-deadline-banner deadline-urgent';
            bannerEl.innerHTML = '<i class="fas fa-exclamation-circle"></i> 마감 임박 · ' + timeText;
        } else {
            bannerEl.className = 'correction-deadline-banner deadline-normal';
            bannerEl.innerHTML = '<i class="fas fa-clock"></i> 1차 마감 · ' + timeText;
        }
        bannerEl.style.display = '';
    }
}

/**
 * 세션 상세에서 FEEDBACK 메인으로 복귀
 */
function backToCorrectionMain() {
    window._correctionSessionState = null;
    showScreen('scheduleScreen');
    // scheduleScreen에서 correction 모드를 다시 렌더링
    // showScreen이 initScheduleScreen을 호출하므로 자동으로 _renderCorrectionMode() 실행
}

console.log('✅ correction-session.js 로드 완료');
