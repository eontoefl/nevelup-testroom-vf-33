/**
 * ================================================
 * correction-track.js
 * 첨삭 트랙(일반 / 호주) 판별 + 스케줄·유형 메타 해석
 * ================================================
 *
 * 첨삭 진입점 어디에서든 "이 학생이 일반첨삭인가 호주첨삭인가"를
 * 이 파일 하나로만 판단한다. 다른 파일에 program 문자열 검사를 흩뿌리지 않는다.
 *
 * 트랙 판정:
 *   program에 'Australia' 포함 → 'aus'
 *   그 외                      → 'general'
 *
 * 유형 메타(taskType/label/ready):
 *   호주  — 스케줄 데이터에 직접 들어있음 (correction-schedule-data-aus.js)
 *   일반  — 기존 스케줄 데이터에는 없으므로 여기서 파생시킨다
 *          (correction-schedule-data.js를 건드리지 않기 위함)
 */

// ============================================================
// 개발용 오버라이드 (localhost 전용 — 운영에서는 항상 꺼짐)
// ============================================================
//   ?corrdev=aus  → 호주첨삭 강제 활성화 (일정 미배정이어도 열림)
//   ?corrdev=off  → 해제
// 운영 도메인에서는 hostname 체크로 무조건 무시된다.

(function _initCorrDevFlag() {
    var isLocal = (location.hostname === 'localhost' || location.hostname === '127.0.0.1');
    if (!isLocal) {
        window.CORR_DEV_AUS = false;
        return;
    }
    try {
        var param = new URLSearchParams(location.search).get('corrdev');
        if (param === 'aus') sessionStorage.setItem('corrDevAus', '1');
        if (param === 'off') sessionStorage.removeItem('corrDevAus');
        window.CORR_DEV_AUS = (sessionStorage.getItem('corrDevAus') === '1');
    } catch (e) {
        window.CORR_DEV_AUS = false;
    }
    if (window.CORR_DEV_AUS) {
        console.warn('🧪 [Correction] 개발 모드: 호주첨삭 강제 활성화 (localhost 전용)');
    }
})();

/**
 * 현재 학생의 첨삭 트랙
 * @returns {'aus'|'general'}
 */
function getCorrectionTrack() {
    if (window.CORR_DEV_AUS) return 'aus';
    var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : window.currentUser;
    var program = (user && user.program) || '';
    return program.indexOf('Australia') >= 0 ? 'aus' : 'general';
}

/** FEEDBACK 탭을 띄울지 여부 (개발 오버라이드 포함) */
function isCorrectionAvailable(user) {
    if (window.CORR_DEV_AUS) return true;
    return !!(user && (user.correctionEnabled || window.__isAdmin));
}

/**
 * 현재 트랙의 세션 스케줄 배열
 * @returns {Array}
 */
function getCorrectionScheduleData() {
    return getCorrectionTrack() === 'aus'
        ? (window.CORRECTION_SCHEDULE_AUS || [])
        : (window.CORRECTION_SCHEDULE || []);
}

// ── 일반첨삭 유형 메타 (스케줄 데이터에 없어서 여기서 파생) ──
var _GENERAL_CORR_META = {
    email:      { taskType: 'writing_email',      label: 'Email',      ready: true },
    discussion: { taskType: 'writing_discussion', label: 'Discussion', ready: true },
    interview:  { taskType: 'speaking_interview', label: 'Interview',  ready: true }
};

/**
 * 세션의 태스크 메타 정보
 * @param {object} session - 스케줄 항목
 * @param {'writing'|'speaking'} category
 * @returns {{type, taskType, label, ready, number}|null}
 */
function getCorrTaskMeta(session, category) {
    if (!session) return null;
    var task = session[category];
    if (!task) return null;

    // 호주 스케줄은 메타를 직접 들고 있다
    if (task.taskType) return task;

    // 일반 스케줄 → 파생
    var metaKey = (category === 'writing') ? task.type : 'interview';
    var meta = _GENERAL_CORR_META[metaKey];
    if (!meta) return null;

    return {
        type: metaKey,
        taskType: meta.taskType,
        label: meta.label,
        ready: meta.ready,
        number: task.number
    };
}

/**
 * 스피킹 인트로의 녹음 안내 배너 (IND SPK · INT SPK 공용)
 * 답변 시간이 시작된 뒤 녹음 앱을 찾으면 답변 시간을 그대로 날린다.
 * 그래서 "미리 켜두라"를 앞세운다.
 */
function _corrRecordNoticeHtml() {
    return '' +
        '<div class="corr-rec-notice">' +
            '<i class="fas fa-mobile-alt corr-rec-notice-icon"></i>' +
            '<div class="corr-rec-notice-body">' +
                '<div class="corr-rec-notice-title">시작 전, 개인 휴대폰의 녹음 앱을 켜주세요.</div>' +
                '<div class="corr-rec-notice-desc">화면에서는 녹음되지 않습니다. 답변이 끝나면 그 파일을 올려주세요.</div>' +
            '</div>' +
        '</div>';
}

window._corrRecordNoticeHtml = _corrRecordNoticeHtml;
window.getCorrectionTrack = getCorrectionTrack;
window.isCorrectionAvailable = isCorrectionAvailable;
window.getCorrectionScheduleData = getCorrectionScheduleData;
window.getCorrTaskMeta = getCorrTaskMeta;

console.log('✅ correction-track.js 로드 완료');
