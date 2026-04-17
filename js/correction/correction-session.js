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

    // 데드라인 배너 (카드별 마감으로 이전 — 상단 배너 숨김)
    _renderCorrectionDeadlineBanner(session, scheduleData);

    // 카드별 마감 타이머 초기화
    _stopCorrDeadlineTimer();

    // Writing 카드
    var writingSub = submissionMap[session.session + '_writing'] || null;
    var writingLabel = session.writing.type === 'email' ? 'Email' : 'Discussion';
    _renderCorrectionTaskCard(
        'corrWritingCard',
        'writing',
        writingLabel + ' ' + session.session,
        writingSub,
        session
    );

    // Speaking 카드
    var speakingSub = submissionMap[session.session + '_speaking'] || null;
    _renderCorrectionTaskCard(
        'corrSpeakingCard',
        'speaking',
        'Interview ' + session.session,
        speakingSub,
        session
    );

    // 카드별 마감 실시간 타이머 시작 (동적 갱신이 필요한 카드가 있으면)
    _startCardDeadlineTimer();
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

    // 마감 정보 HTML
    var deadlineHtml = _buildCardDeadlineHtml(submission, session);

    container.innerHTML =
        '<div class="task-card-header">' +
            '<div class="task-card-icon ' + iconBgClass + '"><i class="' + iconClass + '"></i></div>' +
            '<div class="task-card-title">' + taskTitle + '</div>' +
        '</div>' +
        '<div class="task-card-status">' + statusInfo.text + '</div>' +
        '<button class="task-card-btn ' + statusInfo.btnClass + '" id="' + containerId + 'Btn"' +
            (statusInfo.disabled ? ' disabled' : '') + '>' +
            statusInfo.btnText +
        '</button>' +
        deadlineHtml;

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
            startCorrectionWriting(session, scheduleData, submission);
        } else {
            startCorrectionSpeaking(session, scheduleData, submission);
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
    var seconds = Math.floor((diff % (1000 * 60)) / 1000);

    if (days > 0) return days + '일 ' + hours + '시간 남음';
    if (hours > 0) return hours + '시간 ' + minutes + '분 남음';
    if (minutes >= 10) return minutes + '분 남음';
    // 10분 미만: 분 + 초
    return minutes + '분 ' + (seconds < 10 ? '0' : '') + seconds + '초 남음';
}

// ============================================================
// 카드별 마감 정보 렌더링
// ============================================================

var _WEEKDAY_KR = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * 마감 시각 포맷: "4/21(월) 04:00"
 * @param {Date} date
 * @returns {string}
 */
function _formatDeadlineDateTime(date) {
    var m = date.getMonth() + 1;
    var d = date.getDate();
    var w = _WEEKDAY_KR[date.getDay()];
    var hh = String(date.getHours()).padStart(2, '0');
    var mm = String(date.getMinutes()).padStart(2, '0');
    return m + '/' + d + '(' + w + ') ' + hh + ':' + mm;
}

/**
 * 예상 시각 포맷 (시:분만): "10:00"
 * @param {Date} date
 * @returns {string}
 */
function _formatTimeHHMM(date) {
    var hh = String(date.getHours()).padStart(2, '0');
    var mm = String(date.getMinutes()).padStart(2, '0');
    return hh + ':' + mm;
}

/**
 * 카드 마감 정보 HTML 생성 (상태별 케이스 분기)
 * @param {object|null} submission
 * @param {object} session
 * @returns {string} HTML
 */
function _buildCardDeadlineHtml(submission, session) {
    var state = window._correctionSessionState;
    var scheduleData = state ? state.scheduleData : null;
    if (!scheduleData) return '';

    var status = submission ? submission.status : null;
    var released1 = submission ? submission.released_1 : false;
    var released2 = submission ? submission.released_2 : false;
    var now = new Date();
    var rows = [];

    // --- expired / skipped ---
    if (status === 'expired' || status === 'skipped') {
        rows.push({ html: '<i class="fas fa-times-circle"></i> 1차 마감 초과', cls: 'overdue' });
        return _wrapDeadlineRows(rows);
    }

    // --- complete / feedback2_ready+released_2 ---
    if (status === 'complete' || (status === 'feedback2_ready' && released2)) {
        rows.push({ html: '<i class="fas fa-check-circle"></i> 1차 완료', cls: 'completed' });
        rows.push({ html: '<i class="fas fa-check-circle"></i> 2차 완료', cls: 'completed' });
        return _wrapDeadlineRows(rows);
    }

    // --- feedback2_ready + released_2=false (최종 첨삭 검수중) ---
    if (status === 'feedback2_ready' && !released2) {
        rows.push({ html: '<i class="fas fa-check-circle"></i> 1차 완료', cls: 'completed' });
        rows.push({ html: '<i class="fas fa-check-circle"></i> 2차 제출 완료', cls: 'completed' });
        rows.push({ html: '<i class="fas fa-spinner fa-pulse"></i> 곧 도착합니다', cls: 'waiting' });
        return _wrapDeadlineRows(rows);
    }

    // --- draft2_submitted / feedback2_processing ---
    if (status === 'draft2_submitted' || status === 'feedback2_processing') {
        rows.push({ html: '<i class="fas fa-check-circle"></i> 1차 완료', cls: 'completed' });
        rows.push({ html: '<i class="fas fa-check-circle"></i> 2차 제출 완료', cls: 'completed' });
        var est2 = _getEstimatedArrival(submission.draft_2_submitted_at);
        rows.push({ html: '<i class="fas fa-hourglass-half"></i> 최종 첨삭 예상: ' + est2, cls: 'waiting' });
        return _wrapDeadlineRows(rows);
    }

    // --- feedback2_failed ---
    if (status === 'feedback2_failed') {
        rows.push({ html: '<i class="fas fa-check-circle"></i> 1차 완료', cls: 'completed' });
        rows.push({ html: '<i class="fas fa-check-circle"></i> 2차 제출 완료', cls: 'completed' });
        rows.push({ html: '<i class="fas fa-hourglass-half"></i> 첨삭 대기중', cls: 'waiting' });
        return _wrapDeadlineRows(rows);
    }

    // --- feedback1_ready + released_1=true (2차 단계) ---
    if (status === 'feedback1_ready' && released1) {
        rows.push({ html: '<i class="fas fa-check-circle"></i> 1차 완료', cls: 'completed' });
        var dl2 = getCorrDraft2Deadline(scheduleData.start_date, session.dayOffset, submission.feedback_1_at);
        var diff2 = dl2 - now;
        if (diff2 <= 0) {
            rows.push({ html: '<i class="fas fa-times-circle"></i> 2차 마감 초과', cls: 'overdue' });
        } else {
            var totalMin2 = diff2 / (1000 * 60);
            if (totalMin2 < 10) {
                rows.push({ html: '<i class="fas fa-exclamation-circle"></i> 2차: ' + _formatDeadlineRemaining(diff2), cls: 'urgent', dynamic: 'draft2' });
            } else {
                rows.push({ html: '<i class="far fa-calendar-alt"></i> 2차: ' + _formatDeadlineDateTime(dl2) + ' 까지', cls: '' });
                rows.push({ html: '<i class="fas fa-clock"></i> ' + _formatDeadlineRemaining(diff2), cls: '', dynamic: 'draft2' });
            }
        }
        return _wrapDeadlineRows(rows);
    }

    // --- feedback1_ready + released_1=false (검수중) ---
    if (status === 'feedback1_ready' && !released1) {
        rows.push({ html: '<i class="fas fa-check-circle"></i> 1차 제출 완료', cls: 'completed' });
        rows.push({ html: '<i class="fas fa-spinner fa-pulse"></i> 곧 도착합니다', cls: 'waiting' });
        return _wrapDeadlineRows(rows);
    }

    // --- feedback1_failed ---
    if (status === 'feedback1_failed') {
        rows.push({ html: '<i class="fas fa-check-circle"></i> 1차 제출 완료', cls: 'completed' });
        rows.push({ html: '<i class="fas fa-hourglass-half"></i> 첨삭 대기중', cls: 'waiting' });
        return _wrapDeadlineRows(rows);
    }

    // --- draft1_submitted / feedback1_processing ---
    if (status === 'draft1_submitted' || status === 'feedback1_processing') {
        rows.push({ html: '<i class="fas fa-check-circle"></i> 1차 제출 완료', cls: 'completed' });
        var est1 = _getEstimatedArrival(submission.draft_1_submitted_at);
        rows.push({ html: '<i class="fas fa-hourglass-half"></i> 첨삭 도착 예상: ' + est1, cls: 'waiting' });
        return _wrapDeadlineRows(rows);
    }

    // --- 미제출 (null) ---
    if (!status) {
        var dl1 = getCorrDraft1Deadline(scheduleData.start_date, session.dayOffset);
        var diff1 = dl1 - now;
        if (diff1 <= 0) {
            rows.push({ html: '<i class="fas fa-times-circle"></i> 1차 마감 초과', cls: 'overdue' });
        } else {
            var totalMin1 = diff1 / (1000 * 60);
            if (totalMin1 < 10) {
                rows.push({ html: '<i class="fas fa-exclamation-circle"></i> 1차: ' + _formatDeadlineRemaining(diff1), cls: 'urgent', dynamic: 'draft1' });
            } else {
                rows.push({ html: '<i class="far fa-calendar-alt"></i> 1차: ' + _formatDeadlineDateTime(dl1) + ' 까지', cls: '' });
                rows.push({ html: '<i class="fas fa-clock"></i> ' + _formatDeadlineRemaining(diff1), cls: '', dynamic: 'draft1' });
            }
        }
        return _wrapDeadlineRows(rows);
    }

    // fallback
    return '';
}

/**
 * 첨삭 도착 예상 시각 계산
 * submitted_at + 6시간, 이미 지났으면 "곧 도착"
 * @param {string} submittedAt - ISO 날짜 문자열
 * @returns {string}
 */
function _getEstimatedArrival(submittedAt) {
    if (!submittedAt) return '곧 도착';
    var est = new Date(submittedAt);
    est.setHours(est.getHours() + 6);
    if (new Date() >= est) return '곧 도착';
    return _formatTimeHHMM(est);
}

/**
 * 마감 행 배열 → task-card-deadline HTML 래핑
 * @param {Array<{html:string, cls:string}>} rows
 * @returns {string}
 */
function _wrapDeadlineRows(rows) {
    if (!rows.length) return '';
    var html = '<div class="task-card-deadline">';
    for (var i = 0; i < rows.length; i++) {
        var clsAttr = rows[i].cls ? ' ' + rows[i].cls : '';
        html += '<div class="task-card-deadline-row' + clsAttr + '">' + rows[i].html + '</div>';
    }
    html += '</div>';
    return html;
}

// ============================================================
// 카드별 마감 실시간 갱신 타이머
// ============================================================

// 실시간 카운트다운 타이머 ID (화면 전환 시 정리)
var _corrDeadlineTimerId = null;

function _stopCorrDeadlineTimer() {
    if (_corrDeadlineTimerId) {
        clearInterval(_corrDeadlineTimerId);
        _corrDeadlineTimerId = null;
    }
}

/**
 * 데드라인 배너를 특정 엘리먼트에 렌더링 (레거시 — 외부 호출 유지)
 * @param {HTMLElement} bannerEl
 * @param {string} label - '1차 마감' 또는 '2차 마감'
 * @param {Date} deadline
 */
function renderDeadlineBanner(bannerEl, label, deadline) {
    // 카드별 마감으로 이전됨 — 배너 숨김 유지
    if (bannerEl) bannerEl.style.display = 'none';
}

/**
 * 카드별 마감 실시간 갱신
 * Writing + Speaking 카드를 1개의 setInterval로 동시 갱신
 */
function _startCardDeadlineTimer() {
    _stopCorrDeadlineTimer();

    function tick() {
        var state = window._correctionSessionState;
        if (!state) { _stopCorrDeadlineTimer(); return; }

        var session = state.session;
        var scheduleData = state.scheduleData;
        var submissionMap = state.submissionMap;
        if (!session || !scheduleData) { _stopCorrDeadlineTimer(); return; }

        var writingSub = submissionMap[session.session + '_writing'] || null;
        var speakingSub = submissionMap[session.session + '_speaking'] || null;

        var needsTick = false;

        needsTick = _updateCardDeadlineEl('corrWritingCard', writingSub, session, scheduleData) || needsTick;
        needsTick = _updateCardDeadlineEl('corrSpeakingCard', speakingSub, session, scheduleData) || needsTick;

        // 동적 갱신이 필요한 카드가 없으면 타이머 해제
        if (!needsTick) {
            _stopCorrDeadlineTimer();
        }
    }

    // 초기 1회 체크 — 동적 갱신이 필요하면 1초 간격 시작
    var state = window._correctionSessionState;
    if (!state || !state.session || !state.scheduleData) return;

    var session = state.session;
    var sd = state.scheduleData;
    var sm = state.submissionMap;
    var wSub = sm[session.session + '_writing'] || null;
    var sSub = sm[session.session + '_speaking'] || null;

    var needs = _updateCardDeadlineEl('corrWritingCard', wSub, session, sd) ||
                _updateCardDeadlineEl('corrSpeakingCard', sSub, session, sd);

    if (needs) {
        _corrDeadlineTimerId = setInterval(tick, 1000);
    }
}

/**
 * 개별 카드의 마감 영역 동적 갱신
 * @returns {boolean} 계속 틱이 필요한지
 */
function _updateCardDeadlineEl(containerId, submission, session, scheduleData) {
    var container = document.getElementById(containerId);
    if (!container) return false;

    var deadlineEl = container.querySelector('.task-card-deadline');
    if (!deadlineEl) return false;

    var status = submission ? submission.status : null;
    var released1 = submission ? submission.released_1 : false;
    var now = new Date();

    // 미제출 → 1차 마감 카운트다운
    if (!status) {
        var dl1 = getCorrDraft1Deadline(scheduleData.start_date, session.dayOffset);
        var diff1 = dl1 - now;
        if (diff1 <= 0) {
            deadlineEl.innerHTML = '<div class="task-card-deadline-row overdue"><i class="fas fa-times-circle"></i> 1차 마감 초과</div>';
            return false;
        }
        var totalMin1 = diff1 / (1000 * 60);
        if (totalMin1 < 10) {
            deadlineEl.innerHTML = '<div class="task-card-deadline-row urgent"><i class="fas fa-exclamation-circle"></i> 1차: ' + _formatDeadlineRemaining(diff1) + '</div>';
            return true;
        }
        // 10분 이상 → 남은 시간 row만 갱신 (분 단위 변경 반영)
        var rows = deadlineEl.querySelectorAll('.task-card-deadline-row');
        if (rows.length >= 2) {
            rows[1].innerHTML = '<i class="fas fa-clock"></i> ' + _formatDeadlineRemaining(diff1);
        }
        return true;
    }

    // feedback1_ready + released_1 → 2차 마감 카운트다운
    if (status === 'feedback1_ready' && released1) {
        var dl2 = getCorrDraft2Deadline(scheduleData.start_date, session.dayOffset, submission.feedback_1_at);
        var diff2 = dl2 - now;
        if (diff2 <= 0) {
            deadlineEl.innerHTML =
                '<div class="task-card-deadline-row completed"><i class="fas fa-check-circle"></i> 1차 완료</div>' +
                '<div class="task-card-deadline-row overdue"><i class="fas fa-times-circle"></i> 2차 마감 초과</div>';
            return false;
        }
        var totalMin2 = diff2 / (1000 * 60);
        if (totalMin2 < 10) {
            deadlineEl.innerHTML =
                '<div class="task-card-deadline-row completed"><i class="fas fa-check-circle"></i> 1차 완료</div>' +
                '<div class="task-card-deadline-row urgent"><i class="fas fa-exclamation-circle"></i> 2차: ' + _formatDeadlineRemaining(diff2) + '</div>';
            return true;
        }
        // 10분 이상 → 분 단위 갱신으로 충분하지만, 10분 진입 감지를 위해 계속 틱
        // (다만 표시 텍스트 갱신은 남은 시간 row만)
        var rows = deadlineEl.querySelectorAll('.task-card-deadline-row');
        if (rows.length >= 2) {
            rows[1].innerHTML = '<i class="fas fa-clock"></i> ' + _formatDeadlineRemaining(diff2);
        }
        return true;
    }

    return false;
}

/**
 * 세션 상세 데드라인 배너 — 카드별 마감으로 이전, 상단 배너 숨김
 * (함수 호출은 유지하되 early return)
 */
function _renderCorrectionDeadlineBanner(session, scheduleData) {
    var bannerEl = document.getElementById('corrSessionDeadlineBanner');
    if (bannerEl) bannerEl.style.display = 'none';
}

/**
 * 세션 상세에서 FEEDBACK 메인으로 복귀
 */
function backToCorrectionMain() {
    _stopCorrDeadlineTimer();
    window._correctionSessionState = null;
    showScreen('scheduleScreen');
    // scheduleScreen에서 correction 모드를 다시 렌더링
    // showScreen이 initScheduleScreen을 호출하므로 자동으로 _renderCorrectionMode() 실행
}

console.log('✅ correction-session.js 로드 완료');
