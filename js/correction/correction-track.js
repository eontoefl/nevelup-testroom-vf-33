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

/**
 * 이 제출을 어느 n8n 워크플로우로 보낼지 결정한다.
 * 첨삭 webhook 주소를 정하는 유일한 곳 — 다른 파일에서 URL을 직접 고르지 않는다.
 *
 * 일반 → 기존 워크플로우
 * 호주 → 호주 전용 워크플로우. 단 ausWebhookReady에서 열린 유형만.
 *        아직 안 열린 유형은 null → 제출은 저장되고 첨삭만 나중에 소급 처리한다.
 *
 * @param {string} taskType - 예: 'writing_aus_discussion'
 * @param {boolean} isDraft2
 * @returns {string|null} webhook URL (없으면 null)
 */
/**
 * 점수 만점 — ETS 공식 기준을 따른다.
 *   라이팅(통라·토라·Email·Discussion) 0~5
 *   호주 스피킹(독스·통스)            0~4
 *   일반 Interview                   0~5 (기존 운영값 유지)
 */
function getCorrScoreMax(taskType) {
    var t = (taskType || '').toLowerCase();
    if (t.indexOf('speaking_aus') === 0) return 4;
    return 5;
}

function getCorrWebhookUrl(taskType, isDraft2) {
    var config = window.CORRECTION_CONFIG;
    if (!config || !taskType) return null;

    var isWriting = (taskType.indexOf('writing') === 0);
    var round = isDraft2 ? 'draft2' : 'draft1';

    if (getCorrectionTrack() !== 'aus') {
        return isWriting
            ? (isDraft2 ? config.writingWebhookDraft2 : config.writingWebhookDraft1)
            : (isDraft2 ? config.speakingWebhookDraft2 : config.speakingWebhookDraft1);
    }

    var ready = (config.ausWebhookReady || {})[taskType];
    if (!ready || !ready[round]) {
        console.log('📡 [Correction] 호주첨삭 ' + taskType + ' / ' + round +
                    ' — 아직 미개통. 제출은 저장됨, 첨삭은 소급 처리 예정.');
        return null;
    }

    var url = isWriting
        ? (isDraft2 ? config.ausWritingWebhookDraft2 : config.ausWritingWebhookDraft1)
        : (isDraft2 ? config.ausSpeakingWebhookDraft2 : config.ausSpeakingWebhookDraft1);

    if (!url) {
        console.warn('⚠️ [Correction] ' + taskType + '/' + round +
                     ' 이 개통(ready)으로 표시됐지만 webhook 주소가 비어 있습니다.');
        return null;
    }
    return url;
}

// ============================================================
// 1차 첨삭 패널 (호주첨삭 2차 화면 공용)
// ============================================================
//
// correction-feedback.js의 렌더러(renderAnnotatedHtml / renderSpeakingFeedback /
// renderFeedbackSummary)는 컨테이너 DOM에 직접 그리고 아무것도 반환하지 않는다.
// 문자열처럼 이어붙이면 화면에 'undefined'가 찍히므로,
// 자리(slot)만 먼저 잡아 DOM에 넣은 뒤 corrFillFeedbackSlot()으로 채운다.

/** 첨삭이 들어갈 빈 자리 — innerHTML 문자열 조립 단계에서 사용 */
function corrFeedbackSlotHtml() {
    return '' +
        '<div class="corr-fb-slot">' +
            '<div class="corr-fb-marked"></div>' +
            // 코멘트는 전부 카드로 펼쳐둔다. 2차는 첨삭을 보면서 답안을 고쳐 쓰는
            // 자리라, 하나 보려고 다른 걸 닫아야 하면 쓸 수가 없다.
            // (첨삭 상세 화면의 메모 패널과 같은 방식)
            '<div class="corr-mark-notes"></div>' +
            '<div class="corr-fb-summary"></div>' +
        '</div>';
}

/**
 * 마킹 ↔ 코멘트 카드 연동.
 * 코멘트를 전부 카드로 펼쳐놓고, 마킹을 누르면 해당 카드로 스크롤·강조한다.
 * 카드를 눌러도 본문의 해당 마킹이 강조된다.
 */
function _corrBuildMarkNotes(slot, markEl) {
    var notes = slot.querySelector('.corr-mark-notes');
    if (!notes) return;

    var marks = markEl.querySelectorAll('.correction-mark[data-comment]');
    if (!marks.length) {
        notes.style.display = 'none';
        return;
    }

    var html = '<div class="corr-mark-notes-title">첨삭 코멘트 ' + marks.length + '개</div>';
    for (var i = 0; i < marks.length; i++) {
        marks[i].setAttribute('data-mi', i);
        var c = marks[i].getAttribute('data-comment') || '';
        html += '<div class="corr-mark-note-card" data-mi="' + i + '">' +
                    '<span class="corr-mark-note-num">' + (i + 1) + '</span>' +
                    '<div class="corr-mark-note-text">' + _escapeHtml(c) + '</div>' +
                '</div>';
    }
    notes.innerHTML = html;

    var cards = notes.querySelectorAll('.corr-mark-note-card');

    function focusPair(idx, scrollCard) {
        for (var j = 0; j < marks.length; j++) {
            marks[j].classList.toggle('note-active', j === idx);
        }
        for (var k = 0; k < cards.length; k++) {
            cards[k].classList.toggle('active', k === idx);
        }
        if (scrollCard && cards[idx]) {
            cards[idx].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }

    for (var m = 0; m < marks.length; m++) {
        (function(idx) {
            marks[idx].addEventListener('click', function(e) {
                e.stopPropagation();
                focusPair(idx, true);
            });
        })(m);
    }
    for (var n = 0; n < cards.length; n++) {
        (function(idx) {
            cards[idx].addEventListener('click', function() {
                focusPair(idx, false);
                if (marks[idx]) marks[idx].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            });
        })(n);
    }
}

/**
 * DOM 삽입 후 첨삭 내용을 실제로 그린다.
 * @param {HTMLElement} rootEl - corrFeedbackSlotHtml()이 들어간 엘리먼트
 * @param {object|null} fb - feedback_1 JSONB
 * @param {'writing'|'speaking'} kind
 */
function corrFillFeedbackSlot(rootEl, fb, kind) {
    if (!rootEl) return;
    var slot = rootEl.querySelector('.corr-fb-slot');
    if (!slot) return;

    if (!fb) {
        slot.innerHTML = '<p class="corr-ids-d2-nofb">1차 첨삭 내용을 불러오지 못했습니다.</p>';
        return;
    }

    var markEl = slot.querySelector('.corr-fb-marked');
    var sumEl = slot.querySelector('.corr-fb-summary');

    if (kind === 'speaking') {
        if (typeof renderSpeakingFeedback === 'function') renderSpeakingFeedback(markEl, fb);
    } else if (fb.annotated_html && typeof renderAnnotatedHtml === 'function') {
        renderAnnotatedHtml(markEl, fb.annotated_html);
    }
    // 호주 화면에서만 호출되므로, 스피킹이면 4점 만점
    var scoreMax = (kind === 'speaking') ? 4 : 5;
    if (typeof renderFeedbackSummary === 'function') renderFeedbackSummary(sumEl, fb, scoreMax);

    if (!markEl.innerHTML && !sumEl.innerHTML) {
        slot.innerHTML = '<p class="corr-ids-d2-nofb">표시할 첨삭 내용이 없습니다.</p>';
        return;
    }

    _corrBuildMarkNotes(slot, markEl);
}

window.getCorrWebhookUrl = getCorrWebhookUrl;
window.getCorrScoreMax = getCorrScoreMax;
window.corrFeedbackSlotHtml = corrFeedbackSlotHtml;
window.corrFillFeedbackSlot = corrFillFeedbackSlot;
window._corrRecordNoticeHtml = _corrRecordNoticeHtml;
window.getCorrectionTrack = getCorrectionTrack;
window.isCorrectionAvailable = isCorrectionAvailable;
window.getCorrectionScheduleData = getCorrectionScheduleData;
window.getCorrTaskMeta = getCorrTaskMeta;

console.log('✅ correction-track.js 로드 완료');
