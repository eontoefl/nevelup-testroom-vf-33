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

    // 데드라인 지남 + 미제출 → 시작 차단
    if (statusInfo.action === 'write') {
        var state = window._correctionSessionState;
        var scheduleData = state ? state.scheduleData : null;
        if (scheduleData) {
            var dl1 = getCorrDraft1Deadline(scheduleData.start_date, session.dayOffset);
            if (new Date() > dl1) {
                statusInfo = {
                    text: '마감됨 · 제출 불가',
                    btnText: '마감됨',
                    btnClass: 'btn-disabled',
                    disabled: true,
                    action: 'none'
                };
            }
        }
    }

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
        return { text: '미제출', btnText: '시작하기', btnClass: 'btn-active', disabled: false, action: 'write' };
    }

    var status = sub.status;

    switch (status) {
        case 'draft1_submitted':
            return { text: '1차 제출 완료 · 첨삭 대기', btnText: '확인하기', btnClass: 'btn-active', disabled: false, action: 'view' };
        case 'feedback1_processing':
            return { text: '1차 첨삭 진행중', btnText: '확인하기', btnClass: 'btn-active', disabled: false, action: 'view' };
        case 'feedback1_ready':
            if (sub.released_1) {
                return { text: '1차 첨삭 도착!', btnText: '확인하기', btnClass: 'btn-highlight', disabled: false, action: 'view' };
            }
            return { text: '1차 첨삭 완료 · 검수중', btnText: '확인하기', btnClass: 'btn-active', disabled: false, action: 'view' };
        case 'feedback1_failed':
            return { text: '첨삭 오류 · 재처리 대기', btnText: '확인하기', btnClass: 'btn-active', disabled: false, action: 'view' };
        case 'draft2_submitted':
            return { text: '2차 제출 완료 · 첨삭 대기', btnText: '확인하기', btnClass: 'btn-active', disabled: false, action: 'view' };
        case 'feedback2_processing':
            return { text: '2차 첨삭 진행중', btnText: '확인하기', btnClass: 'btn-active', disabled: false, action: 'view' };
        case 'feedback2_ready':
            if (sub.released_2) {
                return { text: '최종 첨삭 도착!', btnText: '확인하기', btnClass: 'btn-highlight', disabled: false, action: 'view' };
            }
            return { text: '최종 첨삭 완료 · 검수중', btnText: '확인하기', btnClass: 'btn-active', disabled: false, action: 'view' };
        case 'feedback2_failed':
            return { text: '첨삭 오류 · 재처리 대기', btnText: '확인하기', btnClass: 'btn-active', disabled: false, action: 'view' };
        case 'complete':
            return { text: '완료', btnText: '다시보기', btnClass: 'btn-active', disabled: false, action: 'view' };
        case 'expired':
            return { text: '마감됨', btnText: '모범답안 보기', btnClass: 'btn-active', disabled: false, action: 'view' };
        case 'skipped':
            return { text: '건너뜀', btnText: '모범답안 보기', btnClass: 'btn-active', disabled: false, action: 'view' };
        default:
            return { text: status || '알 수 없음', btnText: '확인하기', btnClass: 'btn-active', disabled: false, action: 'view' };
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

    var sessionState = window._correctionSessionState;
    var scheduleData = sessionState ? sessionState.scheduleData : null;

    if (action === 'write') {
        if (taskType === 'writing') {
            startCorrectionWriting(session, scheduleData, null);
        } else {
            startCorrectionSpeaking(session, scheduleData, null);
        }
        return;
    }

    // 과제 상세(아코디언) 화면으로 전환
    openCorrectionDetail(taskType, session, submission);
}

// ============================================================
// 데드라인 계산 함수 (전역 — correction-detail.js에서도 사용)
// ============================================================

/**
 * 1차 Draft 데드라인: sessionDate 다음날 04:00
 */
function getCorrDraft1Deadline(startDate, dayOffset) {
    var base = new Date(startDate + 'T00:00:00');
    base.setDate(base.getDate() + dayOffset + 1);
    base.setHours(4, 0, 0, 0);
    return base;
}

/**
 * 2차 Draft 데드라인: max(스케줄상 마감, feedback_1_at + 24시간)
 * 스케줄상 2차: dayOffset+1일의 다음날 04:00
 */
function getCorrDraft2Deadline(startDate, dayOffset, feedback1At) {
    // 스케줄 기반
    var base = new Date(startDate + 'T00:00:00');
    base.setDate(base.getDate() + dayOffset + 2);
    base.setHours(4, 0, 0, 0);

    // feedback_1_at + 24시간
    if (feedback1At) {
        var fbDeadline = new Date(feedback1At);
        fbDeadline.setHours(fbDeadline.getHours() + 24);
        if (fbDeadline > base) return fbDeadline;
    }
    return base;
}

/**
 * 남은 시간 텍스트 생성
 */
function _formatDeadlineRemaining(diff) {
    var days = Math.floor(diff / (1000 * 60 * 60 * 24));
    var hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    var minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (days > 0) return days + '일 ' + hours + '시간 남음';
    if (hours > 0) return hours + '시간 ' + minutes + '분 남음';
    return minutes + '분 남음';
}

/**
 * 데드라인 배너를 특정 엘리먼트에 렌더링
 * @param {HTMLElement} bannerEl
 * @param {string} label - '1차 마감' 또는 '2차 마감'
 * @param {Date} deadline
 */
function renderDeadlineBanner(bannerEl, label, deadline) {
    if (!bannerEl) return;
    var now = new Date();

    if (now > deadline) {
        bannerEl.className = 'correction-deadline-banner deadline-passed';
        bannerEl.innerHTML = '<i class="fas fa-lock"></i> ' + label + ' 완료';
    } else {
        var diff = deadline - now;
        var timeText = _formatDeadlineRemaining(diff);
        var days = Math.floor(diff / (1000 * 60 * 60 * 24));
        var hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

        if (days === 0 && hours < 6) {
            bannerEl.className = 'correction-deadline-banner deadline-urgent';
            bannerEl.innerHTML = '<i class="fas fa-exclamation-circle"></i> 마감 임박 · ' + timeText;
        } else {
            bannerEl.className = 'correction-deadline-banner deadline-normal';
            bannerEl.innerHTML = '<i class="fas fa-clock"></i> ' + label + ' · ' + timeText;
        }
    }
    bannerEl.style.display = '';
}

/**
 * 세션 상세 데드라인 배너 — submission 상태에 따라 1차/2차 표시
 */
function _renderCorrectionDeadlineBanner(session, scheduleData) {
    var bannerEl = document.getElementById('corrSessionDeadlineBanner');
    if (!bannerEl) return;

    var state = window._correctionSessionState;
    var submissionMap = state ? state.submissionMap : {};
    var writingSub = submissionMap[session.session + '_writing'];
    var speakingSub = submissionMap[session.session + '_speaking'];

    // 둘 중 하나라도 2차 단계면 2차 데드라인 표시
    var anyDraft2Phase = false;
    var feedback1At = null;
    [writingSub, speakingSub].forEach(function(sub) {
        if (!sub) return;
        var s = sub.status;
        if (s === 'draft2_submitted' || s === 'feedback2_processing' || s === 'feedback2_ready' || s === 'feedback2_failed') {
            anyDraft2Phase = true;
        }
        if (sub.released_1 && !anyDraft2Phase && !sub.draft_2_text && !sub.draft_2_audio_q1) {
            // 1차 피드백 도착 + 2차 미제출 → 2차 데드라인 보여줘야 함
            anyDraft2Phase = true;
        }
        if (sub.feedback_1_at && (!feedback1At || new Date(sub.feedback_1_at) > new Date(feedback1At))) {
            feedback1At = sub.feedback_1_at;
        }
    });

    // complete/expired/skipped면 배너 숨김
    var allDone = true;
    [writingSub, speakingSub].forEach(function(sub) {
        if (!sub || ['complete', 'expired', 'skipped'].indexOf(sub.status) === -1) {
            allDone = false;
        }
    });
    if (writingSub && speakingSub && allDone) {
        bannerEl.style.display = 'none';
        return;
    }

    if (anyDraft2Phase) {
        var dl2 = getCorrDraft2Deadline(scheduleData.start_date, session.dayOffset, feedback1At);
        renderDeadlineBanner(bannerEl, '2차 마감', dl2);
    } else {
        var dl1 = getCorrDraft1Deadline(scheduleData.start_date, session.dayOffset);
        renderDeadlineBanner(bannerEl, '1차 마감', dl1);
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
