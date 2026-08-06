/**
 * ================================================
 * correction-extension-upsell.js
 * 첨삭 연장(13~24세션) 업셀 — 학생 화면
 * ================================================
 *
 * 노출 조건(연장 미적용 학생 한정):
 *   general 트랙 + FEEDBACK 사용 + 세션 9가 끝난 상태(2차 공개 or 마감)
 *   또는 localhost ?extdev=1 (개발 확인용, 운영 도메인에선 무시)
 *
 * 흐름: [1~12세션][🔒13~24세션] 칩 → 🔒칩 클릭 시 성적표 + 흐린 잠금 카드
 *   → [다음 4주 살펴보기] → 안내(문구·가격·동의) → [신청하기]
 *   → 신청 접수 상태 카드(계좌 안내) / 마감 후 잠금.
 *
 * 설계서: docs/correction-extension-upsell-spec.md
 */

// ── 상수 ──
var EXT_KAKAO_URL = 'https://pf.kakao.com/_FWxcZC';
var EXT_PRICE_TEXT = '200,000원';
var EXT_AGREEMENT_TEXT = '기존 첨삭과 동일한 조건·규정으로 진행되는 것에 동의합니다.';
var EXT_DEPOSIT_LINE = '국민은행 545601-01-233970 (황경민(이온))';

// 개발 스위치: localhost ?extdev=1 → 조건 무시하고 강제 노출 (운영 도메인에선 항상 false)
var EXT_DEV = (function () {
    try {
        var isLocal = (location.hostname === 'localhost' || location.hostname === '127.0.0.1');
        if (!isLocal) return false;
        var p = new URLSearchParams(location.search).get('extdev');
        if (p === '1') sessionStorage.setItem('extDev', '1');
        if (p === '0') sessionStorage.removeItem('extDev');
        return sessionStorage.getItem('extDev') === '1';
    } catch (e) { return false; }
})();

/**
 * 세션 9가 끝난 상태인가 (2차 공개 또는 마감). 둘 중 하나라도 최종 단계면 true.
 * @param {object} submissionMap - correction-main이 만든 맵 (키: "9_writing","9_speaking")
 */
function _ext_isSession9Done(submissionMap) {
    var endStates = ['complete', 'expired', 'skipped'];
    function done(sub) {
        if (!sub) return false;
        if (endStates.indexOf(sub.status) >= 0) return true;
        if (sub.status === 'feedback2_ready' && sub.released_2) return true;
        return false;
    }
    return done(submissionMap['9_writing']) || done(submissionMap['9_speaking']);
}

/**
 * 업셀 노출 여부 판정.
 * @param {object} ctx - { scheduleData, submissionMap } (correction-main 렌더 컨텍스트)
 * @returns {boolean}
 */
function shouldShowExtensionUpsell(ctx) {
    if (EXT_DEV) return true;
    if (getCorrectionTrack() !== 'general') return false;               // 호주 제외
    var sd = ctx && ctx.scheduleData;
    if (!sd) return false;
    if (sd.extension_enabled && sd.extension_start_date) return false;  // 이미 연장된 학생
    return _ext_isSession9Done(ctx.submissionMap || {});
}

/**
 * 12세션이 속한 주의 토요일 = 신청 마감일 (Date).
 * 마감 = start_date + 25일(세션12 dayOffset=목) 이 속한 주의 토요일.
 * 간단히: 세션12 날짜(start_date+25) 이후 첫 토요일.
 */
function _ext_deadlineDate(scheduleData) {
    var start = new Date((scheduleData.start_date) + 'T00:00:00');
    var s12 = new Date(start.getTime());
    s12.setDate(s12.getDate() + 25);                 // 세션 12 (dayOffset 25)
    var d = new Date(s12.getTime());
    // s12(목요일 기준) 이후 첫 토요일까지: 토요일=6
    var add = (6 - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + add);
    d.setHours(23, 59, 59, 999);
    return d;
}

function _ext_fmtDate(d) {
    var days = ['일', '월', '화', '수', '목', '금', '토'];
    return (d.getMonth() + 1) + '/' + d.getDate() + '(' + days[d.getDay()] + ')';
}

function _ext_ymd(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/**
 * 성적표 재료 로드: 세션별 평균 점수(1·2차 있는 값 전부) + 교정포인트 누적 + 시험총점 + 목표총점.
 * @param {object} user - getCurrentUser()
 * @returns {Promise<object>} { points:[{s,avg}], completed, hintTotal, lastExam, target, rising }
 */
async function loadExtensionReportData(user) {
    var result = { points: [], completed: 0, hintTotal: 0, lastExam: null, target: null, rising: false };

    // 1) 첨삭 점수(feedback level, hint_count) — 세션 1~12만
    try {
        var subs = await supabaseSelect(
            'correction_submissions',
            'user_id=eq.' + user.id +
            '&select=session_number,task_type,l1:feedback_1->level,l2:feedback_2->level,h1:feedback_1->hint_count,h2:feedback_2->hint_count'
        ) || [];
        var bySession = {};
        subs.forEach(function (r) {
            if (r.task_type && r.task_type.indexOf('aus') >= 0) return;
            if (r.session_number < 1 || r.session_number > 12) return;
            var slot = bySession[r.session_number] || (bySession[r.session_number] = { scores: [] });
            if (r.l1 !== null && r.l1 !== undefined) slot.scores.push(Number(r.l1));
            if (r.l2 !== null && r.l2 !== undefined) slot.scores.push(Number(r.l2));
            if (r.h1) result.hintTotal += Number(r.h1) || 0;
            if (r.h2) result.hintTotal += Number(r.h2) || 0;
        });
        Object.keys(bySession).map(Number).sort(function (a, b) { return a - b; }).forEach(function (s) {
            var sc = bySession[s].scores;
            if (!sc.length) return;
            var avg = sc.reduce(function (a, b) { return a + b; }, 0) / sc.length;
            result.points.push({ s: s, avg: avg });
        });
        // 완료 세션 = 라이팅·스피킹 모두 최종 도달한 세션 수 (근사: 점 4개 있는 세션)
        result.completed = Object.keys(bySession).filter(function (s) { return bySession[s].scores.length >= 4; }).length;
    } catch (e) { console.warn('[Ext] 첨삭 점수 로드 실패:', e); }

    // 2) 상승 곡선 여부 (선형 기울기 > 0)
    result.rising = _ext_isRising(result.points);

    // 3) 최근 인증 시험 총점
    try {
        var scores = await supabaseSelect(
            'toefl_actual_scores',
            'user_id=eq.' + user.id + '&order=test_date.desc&limit=1&select=overall,test_date'
        ) || [];
        if (scores[0] && scores[0].overall != null) result.lastExam = Number(scores[0].overall);
    } catch (e) { console.warn('[Ext] 시험 점수 로드 실패:', e); }

    // 4) 목표 총점
    try {
        if (user.applicationId) {
            var apps = await supabaseSelect(
                'applications',
                'id=eq.' + user.applicationId + '&select=target_cutoff_new,no_target_score&limit=1'
            ) || [];
            if (apps[0] && !apps[0].no_target_score && apps[0].target_cutoff_new != null) {
                var t = parseFloat(apps[0].target_cutoff_new);
                if (!isNaN(t)) result.target = t;
            }
        }
    } catch (e) { console.warn('[Ext] 목표 로드 실패:', e); }

    return result;
}

function _ext_isRising(points) {
    if (!points || points.length < 2) return false;
    var n = points.length, sx = 0, sy = 0, sxy = 0, sxx = 0;
    points.forEach(function (p) { sx += p.s; sy += p.avg; sxy += p.s * p.avg; sxx += p.s * p.s; });
    var denom = n * sxx - sx * sx;
    if (denom === 0) return false;
    return (n * sxy - sx * sy) / denom > 0.01;
}

/**
 * 세션별 평균 점수 꺾은선 그래프 (SVG, self-contained).
 * @param {Array} points - [{s, avg}]
 */
function _ext_renderGraph(points) {
    if (!points || points.length < 2) return '';
    var W = 300, H = 120, padL = 8, padR = 8, padT = 12, padB = 18;
    var xs = points.map(function (p) { return p.s; });
    var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    var minY = 0, maxY = 5;                                   // 5점 만점 고정 축
    function X(s) { return padL + (maxX === minX ? 0.5 : (s - minX) / (maxX - minX)) * (W - padL - padR); }
    function Y(v) { return padT + (1 - (v - minY) / (maxY - minY)) * (H - padT - padB); }
    var line = points.map(function (p, i) { return (i ? 'L' : 'M') + X(p.s).toFixed(1) + ' ' + Y(p.avg).toFixed(1); }).join(' ');
    var dots = points.map(function (p) {
        return '<circle cx="' + X(p.s).toFixed(1) + '" cy="' + Y(p.avg).toFixed(1) + '" r="3.5" fill="#9480c5"/>';
    }).join('');
    var area = 'M' + X(points[0].s).toFixed(1) + ' ' + (H - padB) +
        ' ' + points.map(function (p) { return 'L' + X(p.s).toFixed(1) + ' ' + Y(p.avg).toFixed(1); }).join(' ') +
        ' L' + X(points[points.length - 1].s).toFixed(1) + ' ' + (H - padB) + ' Z';
    var first = points[0].avg.toFixed(2), last = points[points.length - 1].avg.toFixed(2);
    return '' +
        '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block;">' +
        '<defs><linearGradient id="extGrad" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="#9480c5" stop-opacity="0.22"/>' +
        '<stop offset="100%" stop-color="#9480c5" stop-opacity="0"/></linearGradient></defs>' +
        '<path d="' + area + '" fill="url(#extGrad)"/>' +
        '<path d="' + line + '" fill="none" stroke="#9480c5" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' +
        dots +
        '<text x="' + X(points[0].s) + '" y="' + (H - 4) + '" font-size="10" fill="#9aa0a6" text-anchor="start">세션 ' + points[0].s + '</text>' +
        '<text x="' + X(points[points.length - 1].s) + '" y="' + (H - 4) + '" font-size="10" fill="#9aa0a6" text-anchor="end">세션 ' + points[points.length - 1].s + '</text>' +
        '</svg>' +
        '<div class="ext-graph-caption">첫 세션 평균 ' + first + '점 → 최근 ' + last + '점</div>';
}

/**
 * 성적표 본문 HTML (데이터 로드 후).
 */
function _ext_reportInnerHtml(data) {
    var html = '';

    // 위층: 시험 총점 → 목표 (둘 다 6점 만점 같은 자)
    var showExamRow = (data.target != null) && (data.lastExam == null || data.lastExam < data.target);
    if (showExamRow) {
        html += '<div class="ext-exam-row">';
        if (data.lastExam != null) {
            html += '<div class="ext-exam-now"><span class="ext-exam-num">' + data.lastExam.toFixed(1) + '</span><span class="ext-exam-lbl">최근 시험</span></div>';
            html += '<div class="ext-exam-arrow">→</div>';
        }
        html += '<div class="ext-exam-goal"><span class="ext-exam-num">' + data.target.toFixed(1) + '</span><span class="ext-exam-lbl">목표</span></div>';
        html += '</div>';
        html += '<div class="ext-exam-caption">' + (data.lastExam != null
            ? '목표까지 아직 거리가 남았습니다. 지금이 멈출 때가 아니에요.'
            : '목표 점수까지, 지금 만들어진 흐름을 이어가야 할 때예요.') + '</div>';
    }

    // 아래층: 상승 곡선이면 그래프, 아니면 누적 숫자
    if (data.rising && data.points.length >= 2) {
        html += '<div class="ext-report-block"><div class="ext-report-block-title">지난 세션, 이렇게 올랐어요</div>' +
            _ext_renderGraph(data.points) + '</div>';
    } else {
        html += '<div class="ext-report-block ext-report-nums">' +
            '<div class="ext-num-cell"><span class="ext-num">' + data.completed + '<span class="ext-num-unit">/12</span></span><span class="ext-num-lbl">완료한 세션</span></div>' +
            '<div class="ext-num-cell"><span class="ext-num">' + data.hintTotal + '<span class="ext-num-unit">개</span></span><span class="ext-num-lbl">함께 고친 교정 포인트</span></div>' +
            '</div>';
    }

    // 문구 (방식을 안 바꾸는 이유)
    html += '<div class="ext-copy">' +
        '<p>13~24세션은 새로운 문제 12세션입니다. 방식은 그대로예요.</p>' +
        '<p>방식을 바꾸지 않는 이유는 하나입니다. 위에 보이는 변화가 이 방식에서 나왔거든요.</p>' +
        '<p>지난 8주는 큰 오류를 지우는 시간이었어요. 다음 4주는 남은 습관을 지우는 시간입니다. 남은 습관은 혼자서는 잘 안 보여요. 보였다면 이미 고치셨을 테니까요.</p>' +
        '</div>';

    return html;
}

// ================================================
// 칩(탭) + 패널 렌더 — correction-main의 연장 OFF 분기에서 호출
// ================================================

/**
 * [1~12세션][🔒13~24세션] 칩 2개 + 패널.
 * @param {HTMLElement} container - correctionScheduleContainer
 * @param {object} ctx - { scheduleData, submissionMap, extensionMap, durationWeeks }
 */
function renderExtensionUpsellTabs(container, ctx) {
    var tabBar = document.createElement('div');
    tabBar.className = 'correction-tab-bar';

    var tab1 = document.createElement('button');
    tab1.className = 'correction-tab active';
    tab1.textContent = '1~12세션';

    var tab2 = document.createElement('button');
    tab2.className = 'correction-tab ext-tab-locked';
    tab2.innerHTML = '<i class="fas fa-lock" style="font-size:11px; margin-right:5px;"></i>13~24세션';

    tabBar.appendChild(tab1);
    tabBar.appendChild(tab2);
    container.appendChild(tabBar);

    var panel1 = document.createElement('div');
    panel1.className = 'correction-tab-panel';
    _renderCorrectionPhase(panel1, 1, ctx);

    var panel2 = document.createElement('div');
    panel2.className = 'correction-tab-panel';
    panel2.style.display = 'none';
    _ext_renderLockedPanel(panel2, ctx);

    container.appendChild(panel1);
    container.appendChild(panel2);

    function activate(which) {
        var p2 = (which === 2);
        tab1.classList.toggle('active', !p2);
        tab2.classList.toggle('active', p2);
        panel1.style.display = p2 ? 'none' : 'block';
        panel2.style.display = p2 ? 'block' : 'none';
    }
    tab1.onclick = function () { activate(1); };
    tab2.onclick = function () { activate(2); };
}

/**
 * 잠금 패널: 업셀 카드(성적표/신청/마감) + 흐린 잠금 세션 카드 12개.
 */
function _ext_renderLockedPanel(panel, ctx) {
    var upsell = document.createElement('div');
    upsell.className = 'ext-upsell-card';
    upsell.innerHTML = '<div class="ext-loading"><i class="fas fa-spinner fa-spin"></i> 불러오는 중…</div>';
    panel.appendChild(upsell);

    // 흐린 잠금 세션 카드 12개 (장식 — 클릭 불가)
    var grid = document.createElement('div');
    grid.className = 'ext-locked-grid';
    var labels = ['Email', 'Discussion'];
    for (var i = 13; i <= 24; i++) {
        var card = document.createElement('div');
        card.className = 'ext-locked-card';
        card.innerHTML = '<i class="fas fa-lock ext-locked-icon"></i>' +
            '<span class="ext-locked-name">SESSION ' + i + '</span>' +
            '<span class="ext-locked-task">' + (i % 2 ? 'Email' : 'Discussion') + ' + Interview</span>';
        grid.appendChild(card);
    }
    panel.appendChild(grid);

    _ext_loadAndRenderState(upsell, ctx);
}

/**
 * 업셀 카드의 현재 상태를 판정해 렌더 (신청 대기 / 성적표 / 마감).
 */
async function _ext_loadAndRenderState(host, ctx) {
    var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : window.currentUser;
    if (!user || !user.id) { host.innerHTML = '<div class="ext-loading">로그인 정보를 확인할 수 없습니다.</div>'; return; }

    var deadline = _ext_deadlineDate(ctx.scheduleData);
    var now = new Date();

    // 이미 신청(pending)했는지 확인
    var pending = null;
    try {
        var rows = await supabaseSelect('correction_extension_requests',
            'user_id=eq.' + user.id + '&status=eq.pending&limit=1');
        pending = (rows && rows[0]) || null;
    } catch (e) { console.warn('[Ext] 신청 조회 실패:', e); }

    if (pending) { _ext_renderApplied(host, pending); return; }
    if (!EXT_DEV && now > deadline) { _ext_renderClosed(host); return; }

    // 성적표 + [다음 4주 살펴보기]
    var data = await loadExtensionReportData(user);
    host.innerHTML =
        '<div class="ext-report">' + _ext_reportInnerHtml(data) + '</div>' +
        '<div class="ext-deadline-note">신청 마감 ' + _ext_fmtDate(deadline) + '까지 · 다음 주 일요일부터 쉼 없이 이어서 시작할 수 있어요.</div>' +
        '<button class="ext-cta-btn" id="extLookBtn">다음 4주 살펴보기</button>';
    var btn = host.querySelector('#extLookBtn');
    if (btn) btn.onclick = function () { _ext_renderApplyGuide(host, ctx, deadline); };
}

/**
 * 안내 화면: 무엇을 하는지 + 가격 + 동의 체크 + [신청하기].
 */
function _ext_renderApplyGuide(host, ctx, deadline) { return _ext_renderApplyGuideImpl(host, ctx, deadline); }
function _ext_renderApplyGuideImpl(host, ctx, deadline) {
    host.innerHTML =
        '<div class="ext-guide">' +
        '<div class="ext-guide-title">13~24세션 — 다음 4주</div>' +
        '<p>지금까지와 똑같이 라이팅·스피킹을 매일 새 문제로 풀고, 1차·2차 첨삭을 받습니다. 새로운 문제 12세션이에요.</p>' +
        '<p>지난 8주의 첨삭 흐름을 그대로 이어받아, 남은 습관을 지우는 데 집중합니다.</p>' +
        '<div class="ext-price-row"><span>연장 비용</span><strong>' + EXT_PRICE_TEXT + '</strong></div>' +
        '<label class="ext-agree"><input type="checkbox" id="extAgree"> <span>' + EXT_AGREEMENT_TEXT + '</span></label>' +
        '<button class="ext-cta-btn" id="extApplyBtn" disabled>신청하기</button>' +
        '<button class="ext-back-btn" id="extBackBtn">← 성적표로 돌아가기</button>' +
        '</div>';
    var agree = host.querySelector('#extAgree');
    var apply = host.querySelector('#extApplyBtn');
    var back = host.querySelector('#extBackBtn');
    agree.onchange = function () { apply.disabled = !agree.checked; };
    back.onclick = function () { _ext_loadAndRenderState(host, ctx); };
    apply.onclick = function () { _ext_submitApplication(host, ctx, deadline, apply); };
}

/**
 * 신청 처리: 신청 기록 INSERT + 텔레그램 알림 → 접수 상태 카드.
 */
async function _ext_submitApplication(host, ctx, deadline, btn) {
    var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : window.currentUser;
    if (!user || !user.id) return;
    if (btn) { btn.disabled = true; btn.textContent = '신청 중…'; }

    var reqRow = null;
    try {
        reqRow = await supabaseInsert('correction_extension_requests', {
            user_id: user.id,
            application_id: user.applicationId || null,
            status: 'pending',
            agreed_at: new Date().toISOString(),
            agreement_text: EXT_AGREEMENT_TEXT,
            deadline_date: _ext_ymd(deadline)
        });
    } catch (e) { console.error('[Ext] 신청 INSERT 실패:', e); }

    if (!reqRow || !reqRow.id) {
        if (btn) { btn.disabled = false; btn.textContent = '신청하기'; }
        alert('신청 처리에 실패했습니다. 잠시 후 다시 시도하거나 카톡으로 문의해주세요.');
        return;
    }

    // 텔레그램 알림 (실패해도 신청은 접수됨)
    try {
        await fetch(SUPABASE_CONFIG.url + '/functions/v1/telegram-notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SUPABASE_CONFIG.anonKey },
            body: JSON.stringify({
                type: 'extension_requested',
                data: {
                    name: user.name || '',
                    deadline: _ext_fmtDate(deadline),
                    request_id: reqRow.id,
                    app_id: user.applicationId || ''
                }
            })
        });
    } catch (e) { console.warn('[Ext] 텔레그램 알림 실패(무시):', e); }

    _ext_renderApplied(host, reqRow);
}

/**
 * 신청 접수 상태 카드 (계좌 안내).
 */
function _ext_renderApplied(host, req) {
    var deadlineStr = req && req.deadline_date
        ? _ext_fmtDate(new Date(req.deadline_date + 'T00:00:00'))
        : '';
    host.innerHTML =
        '<div class="ext-applied">' +
        '<div class="ext-applied-badge"><i class="fas fa-check-circle"></i> 신청 접수됨 · 입금 확인 대기</div>' +
        '<div class="ext-applied-box">' +
        '<div class="ext-applied-line">' + EXT_DEPOSIT_LINE + '</div>' +
        '<div class="ext-applied-amount">' + EXT_PRICE_TEXT + '</div>' +
        '</div>' +
        '<p class="ext-applied-note">반드시 <strong>본인 이름</strong>으로 입금해주세요.</p>' +
        '<p class="ext-applied-note">입금이 확인되면 카톡으로 확정 안내가 가고, 13~24세션이 열립니다.' +
        (deadlineStr ? ' (신청 마감 ' + deadlineStr + ')' : '') + '</p>' +
        '</div>';
}

/**
 * 마감 잠금 카드.
 */
function _ext_renderClosed(host) {
    host.innerHTML =
        '<div class="ext-closed">' +
        '<i class="fas fa-lock ext-closed-icon"></i>' +
        '<div class="ext-closed-title">신청 기간이 지났어요.</div>' +
        '<div class="ext-closed-sub">관리자에게 문의해주세요.</div>' +
        '<a class="ext-kakao-btn" href="' + EXT_KAKAO_URL + '" target="_blank" rel="noopener">카톡 문의</a>' +
        '</div>';
}

console.log('✅ correction-extension-upsell.js 로드 완료' + (EXT_DEV ? ' (개발 모드 ON)' : ''));
