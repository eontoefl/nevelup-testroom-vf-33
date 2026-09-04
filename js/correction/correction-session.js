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
function openCorrectionSession(session, scheduleData, submissionMap, extensionMap) {
    console.log('📋 [Correction] 세션 상세 열기: Session', session.session);

    // 상태 저장
    window._correctionSessionState = {
        session: session,
        scheduleData: scheduleData,
        submissionMap: submissionMap,
        extensionMap: extensionMap || {}
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
    var wMeta = getCorrTaskMeta(session, 'writing');
    _renderCorrectionTaskCard(
        'corrWritingCard',
        'writing',
        wMeta ? wMeta.label : 'Writing',
        writingSub,
        session
    );

    // Speaking 카드
    var speakingSub = submissionMap[session.session + '_speaking'] || null;
    var sMeta = getCorrTaskMeta(session, 'speaking');
    _renderCorrectionTaskCard(
        'corrSpeakingCard',
        'speaking',
        sMeta ? sMeta.label : 'Speaking',
        speakingSub,
        session
    );

    // 카드 좌우 순서 — 호주첨삭은 스피킹이 왼쪽(독스 → 토라), 일반첨삭은 라이팅이 왼쪽
    _applyCorrCardOrder(getCorrectionTrack());

    // 카드별 마감 실시간 타이머 시작 (동적 갱신이 필요한 카드가 있으면)
    _startCardDeadlineTimer();
}

/**
 * 세션 상세의 Writing/Speaking 카드 좌우 순서 지정
 * DOM 상으로는 Writing이 먼저 있으므로, 호주첨삭에서는 flex order로 뒤집는다.
 * @param {'aus'|'general'} track
 */
function _applyCorrCardOrder(track) {
    var writingCard = document.getElementById('corrWritingCard');
    var speakingCard = document.getElementById('corrSpeakingCard');
    if (!writingCard || !speakingCard) return;

    var speakingFirst = (track === 'aus');
    writingCard.style.order = speakingFirst ? '2' : '';
    speakingCard.style.order = speakingFirst ? '1' : '';
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

    // 아직 구현되지 않은 유형 → 잠금 (미제출 상태일 때만)
    var meta = getCorrTaskMeta(session, taskType);
    if (meta && meta.ready === false && !submission) {
        statusInfo = {
            text: '준비 중입니다',
            btnText: '준비 중',
            btnClass: 'btn-disabled',
            disabled: true,
            action: 'none'
        };
    }

    // 데드라인 지남 + 미제출 → 시작 차단
    if (statusInfo.action === 'write') {
        var state = window._correctionSessionState;
        var scheduleData = state ? state.scheduleData : null;
        if (scheduleData) {
            var ext = _corrExt(state.extensionMap, session.session, taskType);
            var dl1 = getCorrDraft1Deadline(getCorrSessionDate(scheduleData, session), ext);
            if (dl1 && new Date() > dl1) {
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
    var deadlineHtml = _buildCardDeadlineHtml(submission, session, taskType);

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
            _startCorrectionWritingByType(session, scheduleData, submission);
        } else {
            _startCorrectionSpeakingByType(session, scheduleData, submission);
        }
        return;
    }

    // 과제 상세(아코디언) 화면으로 전환
    openCorrectionDetail(taskType, session, submission);
}

/**
 * 라이팅 유형별 화면 라우팅
 *   email / discussion → 일반첨삭
 *   aus_discussion     → 호주첨삭 DISCUSSION (일반 Discussion과 화면 동일 → 같은 함수)
 *   aus_intwrt         → 호주첨삭 INT WRT
 */
function _startCorrectionWritingByType(session, scheduleData, submission) {
    var meta = getCorrTaskMeta(session, 'writing');
    var type = meta ? meta.type : 'email';

    if (type === 'aus_intwrt') {
        startCorrectionIntWrt(session, scheduleData, submission);
        return;
    }

    // email / discussion / aus_discussion
    startCorrectionWriting(session, scheduleData, submission);
}

/**
 * 스피킹 유형별 화면 라우팅
 *   interview       → 일반첨삭 인터뷰 (4문항)
 *   aus_indspk      → 호주첨삭 IND SPK
 *   aus_intspk2/3/4 → 호주첨삭 INT SPK
 */
function _startCorrectionSpeakingByType(session, scheduleData, submission) {
    var meta = getCorrTaskMeta(session, 'speaking');
    var type = meta ? meta.type : 'interview';

    if (type === 'aus_indspk') {
        startCorrectionIndSpk(session, scheduleData, submission);
        return;
    }
    if (type === 'aus_intspk2' || type === 'aus_intspk3' || type === 'aus_intspk4') {
        startCorrectionIntSpk(session, scheduleData, submission);
        return;
    }
    if (type === 'interview') {
        startCorrectionSpeaking(session, scheduleData, submission);
        return;
    }

    alert('아직 준비 중인 유형입니다.');
}

// ============================================================
// 데드라인 계산 함수 (전역 — correction-detail.js에서도 사용)
// ============================================================

/**
 * 세션의 기준 시작일 반환
 *   - 1학기(phase 1): scheduleData.start_date
 *   - 2학기/연장(phase 2): scheduleData.extension_start_date
 * 연장 시작일이 없으면 안전하게 start_date로 폴백.
 * @param {object} scheduleData - correction_schedules 행
 * @param {object} session - CORRECTION_SCHEDULE 항목
 * @returns {string} 'YYYY-MM-DD'
 */
function getCorrSessionStartDate(scheduleData, session) {
    if (session && session.phase === 2 && scheduleData && scheduleData.extension_start_date) {
        return scheduleData.extension_start_date;
    }
    return scheduleData ? scheduleData.start_date : null;
}

// ============================================================
// 자기주도(시작·종료일 지정) 첨삭 — 세션 날짜 출처 통합
// ============================================================

/**
 * 이 학생이 자기주도(시작·종료일 지정) 첨삭인지.
 * general 트랙 + scheduleData.end_date 존재. 호주는 end_date가 있어도 false(Q9).
 * @param {object} scheduleData - correction_schedules 행
 * @returns {boolean}
 */
function isCorrSelfPaced(scheduleData) {
    return getCorrectionTrack() === 'general' && !!(scheduleData && scheduleData.end_date);
}

/**
 * 저장된 확정 일정표(session_dates) 파싱.
 * 문자열이면 JSON.parse, 객체면 그대로. dates가 길이 12 배열이고 각 원소가 YYYY-MM-DD면 반환, 아니면 null.
 * @param {string|object} raw
 * @returns {{start:string, end:string, dates:string[]}|null}
 */
function _parseCorrSessionDates(raw) {
    if (!raw) return null;
    var obj;
    if (typeof raw === 'string') {
        try { obj = JSON.parse(raw); } catch (e) { return null; }
    } else if (typeof raw === 'object') {
        obj = raw;
    } else {
        return null;
    }
    if (!obj || !Array.isArray(obj.dates) || obj.dates.length !== 12) return null;
    for (var i = 0; i < 12; i++) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(obj.dates[i])) return null;
    }
    return { start: obj.start, end: obj.end, dates: obj.dates };
}

// 'YYYY-MM-DD' 포맷 헬퍼 (이 파일 안 하나만) — 로컬 Date → 문자열
function _corrYmd(date) {
    return date.getFullYear() + '-' +
        String(date.getMonth() + 1).padStart(2, '0') + '-' +
        String(date.getDate()).padStart(2, '0');
}

// 'YYYY-MM-DD' 로컬 자정 기준 + n일 → 'YYYY-MM-DD'
function _corrAddDaysYmd(ymd, n) {
    var d = new Date(ymd + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return _corrYmd(d);
}

// (bYmd − aYmd) 일수 (양끝 미포함). 로컬 자정 기준.
function _corrDaysDiff(aYmd, bYmd) {
    var a = new Date(aYmd + 'T00:00:00');
    var b = new Date(bYmd + 'T00:00:00');
    return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/**
 * 세션의 배정 날짜(로컬 00:00 Date) 또는 null.
 *   - phase 1이고 저장된 확정 일정표에 그 세션 날짜가 있으면 그 날짜(자기주도).
 *   - 그 외: (해당 학기 시작일) + dayOffset. (기존 학생·연장·호주 전부 이 줄.)
 * @param {object} scheduleData
 * @param {object} session - CORRECTION_SCHEDULE 항목
 * @returns {Date|null}
 */
function getCorrSessionDate(scheduleData, session) {
    if (session && session.phase !== 2) {
        var parsed = _parseCorrSessionDates(scheduleData && scheduleData.session_dates);
        if (parsed && parsed.dates[session.session - 1]) {
            return new Date(parsed.dates[session.session - 1] + 'T00:00:00');
        }
    }
    var base = getCorrSessionStartDate(scheduleData, session);
    if (!base) return null;
    var d = new Date(base + 'T00:00:00');
    d.setDate(d.getDate() + session.dayOffset);
    return d;
}

/**
 * 12세션 확정 일정표 생성기. 세션1=시작일, 세션12=종료일, 사이 균등(Q7).
 * 챌린지 계산기(_distributeSetCounts)와 무관한 첨삭 전용 규칙.
 * @param {string} startYmd
 * @param {string} endYmd
 * @param {string[]|null} prevDates - 기존 확정표(재배분용). 없거나 길이≠12면 첫 생성.
 * @param {string} todayYmd
 * @returns {{start:string, end:string, dates:string[]}|null}
 */
function buildCorrSessionDates(startYmd, endYmd, prevDates, todayYmd) {
    if (!startYmd || !endYmd) return null;
    var D = _corrDaysDiff(startYmd, endYmd) + 1;   // 양끝 포함 일수
    if (D < 1) return null;

    var dates;
    var hasPrev = prevDates && prevDates.length === 12;

    if (!hasPrev) {
        // 첫 생성: i번째(0~11) = start + round(i * (D-1) / 11)
        dates = [];
        for (var i = 0; i < 12; i++) {
            dates.push(_corrAddDaysYmd(startYmd, Math.round(i * (D - 1) / 11)));
        }
    } else {
        // 재배분: 오늘 이전 접두구간 보존, 나머지를 [오늘~종료일]에 같은 규칙으로
        var P = 0;
        for (var k = 0; k < 12; k++) {
            if (prevDates[k] < todayYmd) P++;
            else break;
        }
        var R = 12 - P;
        dates = prevDates.slice(0, P);
        if (R > 0) {
            var D2 = _corrDaysDiff(todayYmd, endYmd) + 1;   // 남은 창 일수(양끝 포함)
            if (D2 >= 1) {
                for (var j = 0; j < R; j++) {
                    if (R === 1) {
                        dates.push(endYmd);
                    } else {
                        dates.push(_corrAddDaysYmd(todayYmd, Math.round(j * (D2 - 1) / (R - 1))));
                    }
                }
            } else {
                // 남은 창 < 1일(오늘 > 종료일): R개 전부 종료일 (방어)
                for (var j2 = 0; j2 < R; j2++) dates.push(endYmd);
            }
        }
        // R === 0: prev 그대로 (end만 갱신)
    }

    return { start: startYmd, end: endYmd, dates: dates };
}

/**
 * extensionMap에서 해당 세션·과제의 연장 정보를 꺼낸다.
 * @returns {object|null} { hours, at } — 없으면 null
 */
function _corrExt(extMap, sessionNumber, taskType) {
    if (!extMap) return null;
    return extMap[sessionNumber + '_' + (taskType || 'writing')] || null;
}

/**
 * 연장 묶음에서 해당 차수의 연장을 꺼낸다.
 * 예전 형태(숫자 / 차수 없는 객체)도 그대로 받아준다.
 *
 * @param {number} round - 1 = 1차, 2 = 2차
 */
function _pickCorrExt(ext, round) {
    if (!ext) return null;
    if (typeof ext === 'number') return ext > 0 ? { hours: ext, at: null } : null;
    if (ext.hours) return ext;   // 차수 구분 없는 옛 형태
    var e = (round === 2) ? ext.r2 : ext.r1;
    return (e && e.hours) ? e : null;
}

/**
 * 마감에 연장을 적용한다.
 *
 * 기준점 = max(원래 마감, 연장을 건 시각)
 *   - 마감 전에 연장 → 원래 마감 + N시간 (기존과 동일)
 *   - 마감 후에 연장 → 연장을 건 시각 + N시간 (이전에는 이미 지난 시각이 나와 무의미했다)
 */
function _applyCorrExt(base, ext, round) {
    var e = _pickCorrExt(ext, round);
    if (!e) return base;
    var anchor = (e.at && e.at > base) ? e.at : base;
    return new Date(anchor.getTime() + e.hours * 60 * 60 * 1000);
}

/**
 * 1차 Draft 데드라인: sessionDate 다음날 04:00 (학생 타임존 기준) + 연장.
 * sessionDate(로컬 Date)는 getCorrSessionDate()가 결정한다 — 자기주도/기존/연장/호주 한 출처.
 * sessionDate가 null이면 null 반환(호출처는 잠금·마감 행을 생략).
 * @param {Date|null} sessionDate
 * @param {object} ext
 * @returns {Date|null}
 */
function getCorrDraft1Deadline(sessionDate, ext) {
    if (!sessionDate) return null;
    return _applyCorrExt(getTaskDeadline(sessionDate, getUserTimezone()), ext, 1);
}

/**
 * 2차 Draft 데드라인: 1차 첨삭 **공개** 시각(released_1_at) + 24시간 (+연장). 스케줄 바닥 없음.
 * 카톡(1차 첨삭 완료 안내)의 "수정본 마감"과 같은 기준이라 앱·카톡 숫자가 일치한다.
 * 앵커가 없으면 feedback_1_at(레거시 행 예비), 둘 다 없으면 null → 호출처는 null이면 차단·카운트다운을 생략한다.
 * (2026-08-31 개정: 생성시각 기준 + '1차마감 다음날 04:00' 바닥의 max → 공개시각 기준으로 통일.
 *  함수명을 바꿔 옛 4인자 호출이 남아 있으면 즉시 오류로 드러나게 했다.)
 */
function getCorrDraft2DeadlineFromRelease(releasedAt, feedback1At, ext) {
    var anchor = releasedAt || feedback1At;
    if (!anchor) return null;
    return _applyCorrExt(new Date(new Date(anchor).getTime() + 24 * 60 * 60 * 1000), ext, 2);
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
 * 예상 시각 포맷 (시 단위, 가장 가까운 정시로 반올림): "오전 8시쯤" / "낮 12시쯤" / "밤 12시쯤"
 * 추정값이라 분 단위로 보여주면 정확한 척이 된다(2026-08-31 개정: "09:08" → "오전 9시쯤").
 * @param {Date} date
 * @returns {string}
 */
function _formatHourApprox(date) {
    var h = new Date(date.getTime() + 30 * 60 * 1000).getHours();
    if (h === 0) return '밤 12시쯤';
    if (h === 12) return '낮 12시쯤';
    return (h < 12 ? '오전 ' : '오후 ') + (h % 12) + '시쯤';
}

/**
 * 카드 마감 정보 HTML 생성 (상태별 케이스 분기)
 * @param {object|null} submission
 * @param {object} session
 * @returns {string} HTML
 */
function _buildCardDeadlineHtml(submission, session, taskType) {
    var state = window._correctionSessionState;
    var scheduleData = state ? state.scheduleData : null;
    if (!scheduleData) return '';

    var ext = _corrExt(state.extensionMap, session.session, taskType);

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
        var est2 = _getEstimatedArrival(submission.draft_2_submitted_at, submission.feedback_2_at);
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
        var dl2 = getCorrDraft2DeadlineFromRelease(submission.released_1_at, submission.feedback_1_at, ext);
        if (!dl2) return _wrapDeadlineRows(rows);   // 앵커 없음 → 2차 행 생략 (차단도 하지 않음)
        var diff2 = dl2 - now;
        if (diff2 <= 0) {
            rows.push({ html: '<i class="fas fa-times-circle"></i> 2차 마감 초과', cls: 'overdue' });
        } else {
            var urgentCls2 = (diff2 / (1000 * 60)) < 10 ? 'urgent' : '';
            rows.push({ html: '<i class="far fa-calendar-alt"></i> 2차: ' + _formatDeadlineDateTime(dl2) + ' 까지 (' + _formatDeadlineRemaining(diff2) + ')', cls: urgentCls2, dynamic: 'draft2' });
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
        var est1 = _getEstimatedArrival(submission.draft_1_submitted_at, submission.feedback_1_at);
        rows.push({ html: '<i class="fas fa-hourglass-half"></i> 첨삭 도착 예상: ' + est1, cls: 'waiting' });
        return _wrapDeadlineRows(rows);
    }

    // --- 미제출 (null) ---
    if (!status) {
        var dl1 = getCorrDraft1Deadline(getCorrSessionDate(scheduleData, session), ext);
        if (dl1) {   // null(세션 날짜 없음)이면 1차 마감 행 생략
            var diff1 = dl1 - now;
            if (diff1 <= 0) {
                rows.push({ html: '<i class="fas fa-times-circle"></i> 1차 마감 초과', cls: 'overdue' });
            } else {
                var urgentCls1 = (diff1 / (1000 * 60)) < 10 ? 'urgent' : '';
                rows.push({ html: '<i class="far fa-calendar-alt"></i> 1차: ' + _formatDeadlineDateTime(dl1) + ' 까지 (' + _formatDeadlineRemaining(diff1) + ')', cls: urgentCls1, dynamic: 'draft1' });
            }
        }
        rows.push({ html: '<i class="fas fa-lock"></i> 2차: 1차 완료 후 진행', cls: 'waiting' });
        return _wrapDeadlineRows(rows);
    }

    // fallback
    return '';
}

/**
 * 첨삭 도착 예상 시각 계산
 * 실제 공개 = AI 생성(feedback_N_at) + 5시간(자동 공개 cron). 생성 시각이 있으면 그것을, 없으면 제출 시각을 기준으로 +5시간.
 * (실측: 제출→공개 중앙값 304분. 이전 +6시간·분 단위 표시는 2026-08-31 개정.) 이미 지났으면 "곧 도착".
 * @param {string} submittedAt - 제출 ISO 문자열
 * @param {string} [feedbackAt] - AI 생성 ISO 문자열 (있으면 우선)
 * @returns {string}
 */
function _getEstimatedArrival(submittedAt, feedbackAt) {
    var anchor = feedbackAt || submittedAt;
    if (!anchor) return '곧 도착';
    var est = new Date(new Date(anchor).getTime() + 5 * 60 * 60 * 1000);
    if (new Date() >= est) return '곧 도착';
    return _formatHourApprox(est);
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

        needsTick = _updateCardDeadlineEl('corrWritingCard', writingSub, session, scheduleData, 'writing') || needsTick;
        needsTick = _updateCardDeadlineEl('corrSpeakingCard', speakingSub, session, scheduleData, 'speaking') || needsTick;

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

    var needs = _updateCardDeadlineEl('corrWritingCard', wSub, session, sd, 'writing') ||
                _updateCardDeadlineEl('corrSpeakingCard', sSub, session, sd, 'speaking');

    if (needs) {
        _corrDeadlineTimerId = setInterval(tick, 1000);
    }
}

/**
 * 개별 카드의 마감 영역 동적 갱신
 * @returns {boolean} 계속 틱이 필요한지
 */
function _updateCardDeadlineEl(containerId, submission, session, scheduleData, taskType) {
    var container = document.getElementById(containerId);
    if (!container) return false;

    var deadlineEl = container.querySelector('.task-card-deadline');
    if (!deadlineEl) return false;

    var state = window._correctionSessionState;
    var ext = _corrExt(state ? state.extensionMap : null, session.session, taskType);

    var status = submission ? submission.status : null;
    var released1 = submission ? submission.released_1 : false;
    var now = new Date();

    // 미제출 → 1차 마감 카운트다운
    if (!status) {
        var dl1 = getCorrDraft1Deadline(getCorrSessionDate(scheduleData, session), ext);
        if (!dl1) return false;   // 세션 날짜 없음 → 카운트다운 생략
        var diff1 = dl1 - now;
        if (diff1 <= 0) {
            deadlineEl.innerHTML = '<div class="task-card-deadline-row overdue"><i class="fas fa-times-circle"></i> 1차 마감 초과</div>';
            return false;
        }
        var urgentCls1 = (diff1 / (1000 * 60)) < 10 ? ' urgent' : '';
        var row = deadlineEl.querySelector('.task-card-deadline-row');
        if (row) {
            row.className = 'task-card-deadline-row' + urgentCls1;
            row.innerHTML = '<i class="far fa-calendar-alt"></i> 1차: ' + _formatDeadlineDateTime(dl1) + ' 까지 (' + _formatDeadlineRemaining(diff1) + ')';
        }
        return true;
    }

    // feedback1_ready + released_1 → 2차 마감 카운트다운
    if (status === 'feedback1_ready' && released1) {
        var dl2 = getCorrDraft2DeadlineFromRelease(submission.released_1_at, submission.feedback_1_at, ext);
        if (!dl2) return false;   // 앵커 없음 → 갱신 중단
        var diff2 = dl2 - now;
        if (diff2 <= 0) {
            deadlineEl.innerHTML =
                '<div class="task-card-deadline-row completed"><i class="fas fa-check-circle"></i> 1차 완료</div>' +
                '<div class="task-card-deadline-row overdue"><i class="fas fa-times-circle"></i> 2차 마감 초과</div>';
            return false;
        }
        var urgentCls2 = (diff2 / (1000 * 60)) < 10 ? ' urgent' : '';
        var rows = deadlineEl.querySelectorAll('.task-card-deadline-row');
        if (rows.length >= 2) {
            rows[1].className = 'task-card-deadline-row' + urgentCls2;
            rows[1].innerHTML = '<i class="far fa-calendar-alt"></i> 2차: ' + _formatDeadlineDateTime(dl2) + ' 까지 (' + _formatDeadlineRemaining(diff2) + ')';
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
