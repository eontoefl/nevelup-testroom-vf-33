// 감도 점검: 일부러 바꾼 사본(메모리에서만 — 저장소의 파일은 바꾸지 않는다). 변조마다 겨냥한 판정이 깨져야 검출로 센다.

const AUTH = 'js/auth.js';
const MOD = 'js/auth-session.js';

// edits: [파일, 원래 글자, 바꿀 글자] — 원래 글자는 그 파일에 정확히 1곳 있어야 한다
export function applyEdits(edits, problems) {
    return (p, text) => {
        let t = text;
        for (const [file, from, to] of edits) {
            if (file !== p) continue;
            if (t.split(from).length !== 2) { problems.push(`바꿀 자리를 정확히 1곳 찾지 못함(${file})`); continue; }
            t = t.replace(from, () => to);
        }
        return t;
    };
}

const GATE_LOGIN = "    if (_trAuthOn()) return _trHandleLogin(event);   // 새 로그인(스위치가 켜졌을 때만). 꺼짐이면 아래 그대로\n";
const GATE_START = "    if (_trAuthOn() && !_trBookOnlySaved()) { _trStart(); return; }\n";
const PRE_REMOVE = "        if (readSlot().kind === 'ours') window.sessionStorage.removeItem(COMPAT_USER);\n";

export const MUTANTS = [
    // ---- 새 길의 쓰기 전송 0
    {
        name: '새 길에서 tr_user_map 을 저장함', tests: ['sameAsOld'], expect: /새 길에서 쓰기를 보냄\(tr_user_map/,
        edits: [[AUTH, "        _trV2.plan = plan;\n        _trV2.attempt = attempt;\n", "        supabaseUpsert('tr_user_map', plan.items[plan.items.length - 1].values, 'user_id');\n        _trV2.plan = plan;\n        _trV2.attempt = attempt;\n"]],
    },
    {
        name: '새 길에서 밀린 인증률을 확정해 저장함', tests: ['sameAsOld'], expect: /새 길에서 쓰기를 보냄\([^)]*study_results_v3/,
        edits: [[AUTH, "            items.push({ table: 'study_results_v3', method: 'PATCH',", "            await supabaseUpdate('study_results_v3', 'id=eq.' + row.id, { locked_auth_rate: rate });\n            items.push({ table: 'study_results_v3', method: 'PATCH',"]],
    },
    {
        name: '새 길에서 자기주도 일정표를 저장함', tests: ['sameAsOld'], expect: /자기주도 v2\(저장표 없음\): 새 길에서 쓰기를 보냄\(applications/,
        edits: [[AUTH, "        user.selfPacedSchedule = built;\n        if (!applicationId) return null;", "        user.selfPacedSchedule = built;\n        if (!applicationId) return null;\n        supabaseUpdate('applications', 'id=eq.' + applicationId, { self_paced_schedule: JSON.stringify(built) });"]],
    },
    // ---- 저장 계획 = 옛 길의 실제 쓰기, 선택 규칙, currentUser
    {
        name: '저장 계획의 인증률이 옛 길과 다름(50 → 60)', tests: ['sameAsOld'], expect: /저장 계획이 옛 길의 실제 쓰기 요청과 다름/,
        edits: [[AUTH, "                rate = 50;\n            }\n            items.push(", "                rate = 60;\n            }\n            items.push("]],
    },
    {
        name: '저장 계획에서 마감 전의 행도 확정함(마감 가드 없음)', tests: ['sameAsOld'], expect: /저장 계획이 옛 길의 실제 쓰기 요청과 다름/,
        edits: [[AUTH, "            if (rowDl && now <= rowDl) continue;\n\n            var hasInitial = row.initial_record != null;\n            var rate = 0;\n            if (hasInitial && row.error_note_submitted) {\n                rate = 100;\n            } else if (hasInitial) {\n                rate = 50;\n            }\n            items.push(", "            var hasInitial = row.initial_record != null;\n            var rate = 0;\n            if (hasInitial && row.error_note_submitted) {\n                rate = 100;\n            } else if (hasInitial) {\n                rate = 50;\n            }\n            items.push("]],
    },
    {
        name: '수강 선택 규칙이 다름(입금 확인된 것을 먼저 찾지 않음)', tests: ['sameAsOld'], expect: /재시작\(최신 미입금 \+ 과거 입금 확인\): (currentUser 의 키·값이 옛 길과 다름|화면 전환)/,
        edits: [[AUTH, "&deposit_confirmed_by_admin=eq.true&order=created_at.desc&limit=1&select=${_appCols}`);\n    if (!confirmed.ok)", "&order=created_at.desc&limit=1&select=${_appCols}`);\n    if (!confirmed.ok)"]],
    },
    {
        name: 'currentUser 의 칸 하나가 옛 길과 다름(시간대)', tests: ['sameAsOld'], expect: /정규 Standard: currentUser 의 키·값이 옛 길과 다름/,
        edits: [[AUTH, "    const userTimezone = user.timezone || 'Asia/Seoul';\n    return {", "    const userTimezone = 'Asia/Seoul';\n    return {"]],
    },
    {
        name: 'currentUser 에 칸을 하나 더 둠', tests: ['sameAsOld'], expect: /currentUser 의 키·값이 옛 길과 다름/,
        edits: [[AUTH, "        scheduleSyncOk: programInfo.deadlineExtensions !== null,\n        timezone: userTimezone\n    };\n}", "        scheduleSyncOk: programInfo.deadlineExtensions !== null,\n        timezone: userTimezone,\n        nickname: user.nickname\n    };\n}"]],
    },
    // ---- 회원 표·빈 값·옛 길
    {
        name: '켜짐에서도 옛 길(회원 표·비밀번호 열)로 로그인함', tests: ['sameAsOld', 'outcomes'], expect: /회원 표를 읽음/,
        edits: [[AUTH, GATE_LOGIN, '']],
    },
    {
        name: '켜짐에서 빈 값 로그인의 길이 남음', tests: ['outcomes'], expect: /빈 값\(둘 다\): (안내가 기대와 다름|화면을 열었거나)/,
        edits: [[AUTH, GATE_LOGIN, "    if (_trAuthOn() && (document.getElementById('studentEmail').value.trim() || document.getElementById('studentPassword').value.trim())) return _trHandleLogin(event);\n"]],
    },
    // ---- 실패와 "없음"
    {
        name: '조회 실패를 "0건"으로 삼음', tests: ['failures'], expect: /확인 실패 › 첫 조회\(입금 확인 건\) 응답 없음: ("확인 실패|실패한 뒤 다음 조회로)/,
        edits: [[AUTH, "    return Array.isArray(r) ? { ok: true, rows: r } : { ok: false };", "    return { ok: true, rows: Array.isArray(r) ? r : [] };"]],
    },
    {
        name: '첫 조회가 실패하면 둘째 조회로 넘어감', tests: ['failures'], expect: /확인 실패 › 첫 조회[^:]*: 실패한 뒤 다음 조회로 넘어감/,
        edits: [[AUTH, "    if (!confirmed.ok) return failed;\n    let apps = confirmed.rows;", "    let apps = confirmed.ok ? confirmed.rows : [];"]],
    },
    {
        name: '둘째 조회의 실패를 "신청 없음"으로 삼음', tests: ['failures'], expect: /둘째 조회 실패[^:]*: "확인 실패/,
        edits: [[AUTH, "        if (!latest.ok) return failed;\n        apps = latest.rows;", "        apps = latest.ok ? latest.rows : [];"]],
    },
    {
        name: '정지 칸 조회 실패를 "정지 없음"으로 삼음', tests: ['failures'], expect: /정지 칸 조회 실패[^:]*: "확인 실패/,
        edits: [[AUTH, "    if (!pz.ok) return failed;\n    if (pz.rows[0]) {", "    if (pz.ok && pz.rows[0]) {"]],
    },
    {
        name: '마감 연장 조회 실패를 넘어감(옛 길처럼 들어감)', tests: ['failures'], expect: /마감 연장 조회 실패[^:]*: "확인 실패/,
        edits: [[AUTH, "    if (deadlineExtensions === null) return failed;\n", '']],
    },
    {
        name: '환불 칸 조회 실패를 "환불 없음"으로 삼음', tests: ['failures'], expect: /환불 칸 조회 실패: "확인 실패/,
        edits: [[AUTH, "    if (!stp.ok) return failed;\n    if (stp.rows[0]) {", "    if (stp.ok && stp.rows[0]) {"]],
    },
    {
        name: '인증률 읽기 실패를 "밀린 것 없음"으로 삼음', tests: ['failures'], expect: /인증률 읽기 실패: 계획에 "실패"로 남지 않음/,
        edits: [[AUTH, "        if (!read.ok) return { ok: false };\n        var rows = read.rows;", "        var rows = read.ok ? read.rows : [];"]],
    },
    // ---- signed_in 의 조건
    {
        name: 'my_profile 만 보고 signed_in 으로 감', tests: ['outcomes'], expect: /들어가지 못함 › (allowed 거짓|my_profile 만 ok)/,
        edits: [[MOD, "        if (a.kind !== 'ok') return { ok: false, reason: a.kind };\n        if (a.allowed !== true) return { ok: false, reason: 'not_allowed' };\n", "        if (a.kind !== 'ok' || a.allowed !== true) return { ok: true, sub: att.sub, sid: att.sid, profile: p.profile, isAdmin: false };\n"]],
    },
    {
        name: '차단·탈퇴 처리 중인데 화면을 엶(상태를 보지 않고 수강을 조회)', tests: ['outcomes'], expect: /들어가지 못함 › (차단|탈퇴 처리 중): (표 요청을 보냄|화면을 열었거나|안내)/,
        edits: [[MOD, "        if (b.state === 'no_member' || b.state === 'blocked' || b.state === 'withdrawal_pending') return { kind: b.state };", "        if (b.state === 'no_member') return { kind: b.state };\n        if (b.state === 'blocked' || b.state === 'withdrawal_pending') return { kind: 'ok', profile: { id: 'zzb3b-m-fast', name: 'x', nickname: null, email: 'zzb3b_fast@member.zz.invalid', phone: null, timezone: null } };"]],
    },
    // ---- 준비 신호
    {
        name: '저장된 currentUser 만 보고 화면을 엶(재확인 전에)', tests: ['readyGate'], expect: /준비 신호 › 새로 고침: 다시 확인하기 전에 (표시·currentUser 가 나옴|표 요청을 보냄)/,
        edits: [[AUTH, GATE_START, ''], [MOD, PRE_REMOVE, '']],
    },
    {
        name: '다시 확인하기 전에 저장된 currentUser 를 치우지 않음', tests: ['readyGate'], expect: /준비 신호 › 새로 고침: 다시 확인하기 전에 표시·currentUser 가 나옴/,
        edits: [[MOD, PRE_REMOVE, '']],
    },
    {
        name: '수강 조회 전에 일정 화면을 엶', tests: ['readyGate'], expect: /준비 신호 › 수강 조회 중: 조회가 끝나기 전에/,
        edits: [[AUTH, "    var result;\n    try { result = await _trEnter(attempt); }", "    if (typeof showScreen === 'function') showScreen('scheduleScreen');\n    var result;\n    try { result = await _trEnter(attempt); }"]],
    },
    {
        name: '환영 안내 뒤의 타이머가 다시 보지 않고 화면을 엶', tests: ['readyGate'], expect: /늦은 타이머 › 로그아웃 뒤에 일정 화면을 엶/,
        edits: [[AUTH, "                if (_trV2.ready && _trStill(seq, attempt)) showScreen('scheduleScreen');", "                showScreen('scheduleScreen');"]],
    },
    {
        name: '시도 차례만 보고 로그인 기록은 보지 않음', tests: ['readyGate'], expect: /늦은 응답 › 계정이 바뀐 뒤에/,
        edits: [[AUTH, "    try { return seq === _trV2.seq && window.EonAuth.isCurrent(attempt) === true; } catch (e) { return false; }", "    return seq === _trV2.seq;"], [MOD, "        if (state !== 'signed_in' || !verified || verified.sid !== attempt) return { ok: false, why: 'session_changed' };\n        try {\n            const store = window.sessionStorage;\n            const slot = readSlot();\n            if (slot.kind === 'foreign') return { ok: false, why: 'legacy_present' };\n            if (slot.stored !== 'ok' || slot.storedSid !== verified.sid) return { ok: false, why: 'session_changed' };", "        try {\n            const store = window.sessionStorage;\n            const slot = readSlot();\n            if (slot.kind === 'foreign') return { ok: false, why: 'legacy_present' };"]],
    },
    {
        name: '확인된 로그인이 아니게 돼도 표시를 거두지 않음', tests: ['readyGate', 'logout'], expect: /(화면이 열린 뒤 끝남: 표시를 거두지 않음|로그아웃 모름\([^)]*\): 표시를 거두지 않음)/,
        edits: [[AUTH, "    if (_trV2.ready || currentUser) _trClearScreenState();\n    else _trV2.seq++;\n    if (_trV2.loginInFlight) return;", "    if (_trV2.loginInFlight) return;"], [AUTH, "    if (currentUser || _trV2.ready) _trClearScreenState();\n\n    // 폼 초기화", "    if (r && r.outcome === 'signed_out') _trClearScreenState();\n\n    // 폼 초기화"]],
    },
    // ---- 로그아웃
    {
        name: '로그아웃의 결과를 보지 않고 끝낸 것으로 안내함', tests: ['logout'], expect: /로그아웃 모름\([^)]*\): rejected·logout_unknown·안내가 아님/,
        edits: [[AUTH, "    if (r && r.outcome === 'signed_out') { hideLoginMessage(); return; }", "    hideLoginMessage(); return;"]],
    },
    {
        name: '로그아웃이 다른 값까지 지움(이 탭의 다른 값)', tests: ['logout'], expect: /로그아웃: 이 탭에 남은 값이 기대와 다름/,
        edits: [[AUTH, "    currentUser = null;\n    sessionStorage.removeItem('courseMode');\n\n    // Sentry", "    currentUser = null;\n    sessionStorage.removeItem('courseMode');\n    sessionStorage.removeItem('zz_other_key');\n\n    // Sentry"]],
    },
    // ---- 새 창·복제
    {
        name: '복사돼 온 값으로 클라이언트를 만듦(가리지 않음)', tests: ['windows'], expect: /새 창 › [^:]*: (복사된 자격으로 요청을 보냄|복사돼 온 값을 버린 화면이 아님)/,
        edits: [[MOD, "            if (own !== 'mine') { discardCopy(); return; }\n        }\n        const beganLoad", "        }\n        const beganLoad"]],
    },
    {
        name: '쥠 표식을 보지 않음(살아 있는 문서가 쥔 값도 받음)', tests: ['windows'], expect: /새 창 › 탭 복제: /,
        edits: [[MOD, "        if (h.state !== 'released') return Promise.resolve('foreign');\n", '']],
    },
    {
        name: '연 창인지 보지 않음', tests: ['windows'], expect: /새 창 › 연 창\(이름까지 같게 만든 경우[^:]*: 복사돼 온 값을 씀/,
        edits: [[MOD, "        if (opened) return Promise.resolve('foreign');\n", '']],
    },
    {
        name: '창 이름을 보지 않음', tests: ['windows'], expect: /새 창 › 다른 화면에서 연[^:]*: 복사돼 온 값을 씀/,
        edits: [[MOD, "        if (!h.name || h.name !== name) return Promise.resolve('foreign');\n", '']],
    },
    {
        name: '차례표를 보지 않음(같은 값을 든 두 탭이 다 이어받음)', tests: ['windows'], expect: /다른 화면에서 복제된 탭\([^)]*\): 이어받은 쪽이 하나가 아님/,
        edits: [[MOD, "            if (!reg || !reg[c.sid] || reg[c.sid].claim !== h.claim) return 'foreign';", "            if (!reg) return 'foreign';"]],
    },
    {
        name: '차례표를 읽지 못해도 이어받음', tests: ['windows'], expect: /차례표를 쓸 수 없음: 다음 화면이 이어받음/,
        edits: [[MOD, "            if (!reg || !reg[c.sid] || reg[c.sid].claim !== h.claim) return 'foreign';\n            mineClaim = randomId();\n            reg[c.sid] = { claim: mineClaim, at: Date.now() };\n            writeRegistry(reg);\n            return locked ? 'locked' : 'unlocked';", "            if (!reg) { mineClaim = null; return 'skip'; }\n            if (!reg[c.sid] || reg[c.sid].claim !== h.claim) return 'foreign';\n            mineClaim = randomId();\n            reg[c.sid] = { claim: mineClaim, at: Date.now() };\n            writeRegistry(reg);\n            return locked ? 'locked' : 'unlocked';"], [MOD, "            if (how === 'foreign') return 'foreign';\n            const finish = function () {", "            if (how === 'foreign') return 'foreign';\n            if (how === 'skip') { holding = true; return 'mine'; }\n            const finish = function () {"]],
    },
    {
        name: '버린 화면에서도 로그인 요청을 보냄', tests: ['windows'], expect: /새 창 › [^:]*: 버린 화면에서 로그인 요청을 보냄/,
        edits: [[MOD, "            if (state === 'off') return { outcome: 'off' };        // 복사돼 온 값을 버린 화면: 이 화면에서는 로그인하지 않는다(새로 고침 뒤에)\n            if (!client) return { outcome: 'error' };", "            if (!client) { loadConfig(); const sdk = await loadSdk(); client = new sdk.AuthClient({ url: ORIGIN + '/auth/v1', headers: { 'apikey': ANON, 'Authorization': 'Bearer ' + ANON }, storageKey: STORAGE_KEY, storage: scopedStorage, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, fetch: guardedFetch }); closeBroadcast(client); }"]],
    },
    {
        name: '떠날 때 쥔 것을 놓지 않음(원래 탭의 새로 고침이 이어받지 못함)', tests: ['windows'], expect: /원래 탭[^›]* › 새로 고침: 이 창의 것으로 보지 않음/,
        edits: [[MOD, "    window.addEventListener('pagehide', function () { releaseHold(); });", "    window.addEventListener('pagehide', function () {});"]],
    },
    {
        name: '공식 클라이언트의 창 사이 통로를 닫지 않음(로그인 상태가 다른 창으로 감)', tests: ['sameAsOld'], expect: /창 사이 통로로 보낸 것이 있음/,
        edits: [[MOD, "            closeBroadcast(client);\n", '']],
    },
    {
        name: '차례표에 로그인 기록의 자격을 적음', tests: ['sameAsOld'], expect: /브라우저 단위 저장소에 차례표 말고 다른 것이 있음/,
        edits: [[MOD, "            reg[att.sid] = { claim: claim, at: Date.now() };\n            writeRegistry(reg);\n            return true;", "            reg[att.sid] = { claim: claim + ':' + storedSession().refreshToken, at: Date.now() };\n            writeRegistry(reg);\n            return true;"]],
    },
    // ---- 공홈의 모듈과 같은 규약
    {
        name: '끝남의 코드를 넓힘(refresh_token_not_found 도 끝난 것으로)', section: 'protocol', expect: /규약 대조 › 끝난 기록 → 새로 고침: refresh_token_not_found/,
        edits: [[MOD, "    const ENDED_CODES = ['session_not_found', 'session_expired'];", "    const ENDED_CODES = ['session_not_found', 'session_expired', 'refresh_token_not_found'];"]],
    },
    {
        name: '로그아웃의 결과를 보지 않음(실패·모름도 끝낸 것으로)', section: 'protocol', expect: /규약 대조 › 로그아웃/,
        edits: [[MOD, "        if (!ended) return 'unknown';             // 실패·모름: 끝냈다고 하지 않는다. 다시 보내지도 않는다\n", '']],
    },
    {
        name: '결과를 모르는 갱신을 다시 보냄', section: 'protocol', expect: /규약 대조 › [^:]*갱신의 답 없음/,
        edits: [[MOD, "            if (unknownRefresh.indexOf(refreshToken) >= 0) return Promise.reject(EonAuthError('refresh_unknown'));\n", '']],
    },
    {
        name: '429 를 끝난 것으로 봄(로그인 기록을 지움)', section: 'protocol', expect: /규약 대조 › 끝난 기록 → 새로 고침: 갱신 429/,
        edits: [[MOD, "        if (res.status === 429) return { kind: 'rate_limited' };", "        if (res.status === 429) return { kind: 'ended' };"]],
    },
    // ---- 시험 도구 자신
    {
        name: '차단기: 회원 표 조회의 열 목록을 보지 않음', section: 'tools', tool: 'decider', expect: /차단기 › 회원 표: (select=\*|열 목록에 password 를 섞음): 막아야 하는데 내보냄/,
        edits: [['tests/auth-session/request-log.mjs', " && USERS_COLS.includes(q[1][1]);", ";"]],
    },
    {
        name: '차단기: 회원 표 조회를 합성 이메일로 좁히지 않음', section: 'tools', tool: 'decider', expect: /차단기 › 회원 표: 합성이 아닌 이메일: 막아야 하는데 내보냄/,
        edits: [['tests/auth-session/request-log.mjs', "syn.emails.some((e) => q[0][1] === 'eq.' + e) && USERS_COLS", "q[0][1].startsWith('eq.') && USERS_COLS"]],
    },
    {
        name: '차단기: 합성 자료의 목록을 받기 전에도 회원 표 조회를 내보냄', section: 'tools', tool: 'decider', expect: /차단기 › 목록을 받기 전 › 회원 표/,
        edits: [['tests/auth-session/request-log.mjs', "const ok = !!syn && q.length === 2 && q[0][0] === 'email' && q[1][0] === 'select' && syn.emails.some((e) => q[0][1] === 'eq.' + e)", "const ok = q.length === 2 && q[0][0] === 'email' && q[1][0] === 'select' && (!syn || syn.emails.some((e) => q[0][1] === 'eq.' + e))"]],
    },
    {
        name: '차단기: 옛 길의 쓰기에서 열을 보지 않음', section: 'tools', tool: 'decider', expect: /차단기 › 쓰기: 신청서의 (다른 열|일정표 \+ 다른 열): 막아야 하는데 내보냄/,
        edits: [['tests/auth-session/request-log.mjs', "ok = q.length === 1 && some('id', syn.appIds) && keysIn(['self_paced_schedule']);", "ok = q.length === 1 && some('id', syn.appIds);"]],
    },
    {
        name: '차단기: 인증률 확정의 행을 보지 않음', section: 'tools', tool: 'decider', expect: /차단기 › 쓰기: (인증률 확정\(합성이 아닌 행\)|학습 기록을 회원 조건으로[^:]*): 막아야 하는데 내보냄/,
        edits: [['tests/auth-session/request-log.mjs', "ok = q.length === 1 && some('id', syn.recordIds) && keysIn(['locked_auth_rate']);", "ok = keysIn(['locked_auth_rate']);"]],
    },
    {
        name: '차단기: 그 밖의 쓰기를 내보냄', section: 'tools', tool: 'decider', expect: /차단기 › 쓰기: 다른 표: 막아야 하는데 내보냄/,
        edits: [['tests/auth-session/request-log.mjs', "    return { table, write: true, blocked: ok ? [] : ['write_not_allowed'] };", "    return { table, write: true, blocked: [] };"]],
    },
    {
        name: '차단기: 신청서 조회를 합성 행으로 좁히지 않음', section: 'tools', tool: 'decider', expect: /차단기 › 신청서: (조건 없음|합성이 아닌)/,
        edits: [['tests/auth-session/request-log.mjs', "            return { table, write: false, blocked: ok ? [] : ['applications_scope'] };", "            return { table, write: false, blocked: [] };"]],
    },
    {
        name: '저장 계획 검사: 행이 합성 행인지 보지 않음', section: 'tools', tool: 'core', expect: /저장 계획 검사 › 합성이 아닌 학습 기록 행: 받아들임/,
        edits: [['tests/auth-session/screen-core.mjs', "!id || !expect.recordIds.includes(id) || ", "!id || "]],
    },
    {
        name: '저장 계획 검사: 값의 모양을 보지 않음', section: 'tools', tool: 'core', expect: /저장 계획 검사 › 인증률 값/,
        edits: [['tests/auth-session/screen-core.mjs', "            if (![0, 50, 100].includes(it.values.locked_auth_rate)) return no('rate_value');\n", '']],
    },
    {
        name: '저장 계획 검사: 허용한 표인지 보지 않음', section: 'tools', tool: 'core', expect: /저장 계획 검사 › 다른 표: 받아들임/,
        edits: [['tests/auth-session/screen-core.mjs', "        } else return no('table');", "        } else { items.push({ table: it.table, match: String(it.match), values: it.values }); }"]],
    },
    {
        name: '저장 계획 검사: 허용한 열인지 보지 않음(신청서)', section: 'tools', tool: 'core', expect: /저장 계획 검사 › 신청서의 다른 열: 받아들임/,
        edits: [['tests/auth-session/screen-core.mjs', "it.match !== 'id=eq.' + plan.applicationId || !onlyKeys(it.values, ['self_paced_schedule'])) return no('applications_row_or_column');", "it.match !== 'id=eq.' + plan.applicationId) return no('applications_row_or_column');"]],
    },
    {
        name: '실행기: 예행이 실패해도 다음 경우로 감', section: 'tools', tool: 'core', expect: /실행기: 예행이 통과하지 못했는데/,
        edits: [['tests/auth-session/screen-core.mjs', "    if (!p || !allTrue(p.checks)) return { stopped: 'preflight', started };\n", '']],
    },
    {
        name: '실행기: 원복 대상의 표시를 내놓는 순간에 세우지 않음', section: 'tools', tool: 'core', expect: /실행기: (멈춤을 내놓는 순간 원복 대상으로 표시하지 않음|원복 확인을 받지 못했는데 다음 경우를 시작함)/,
        edits: [['tests/auth-session/screen-core.mjs', "        if (needsRevert) this.pendingRevert = kind;\n", '']],
    },
    {
        name: '실행기: 원복했다는 답이 아닌데 표시를 지움', section: 'tools', tool: 'core', expect: /실행기: 원복했다는 답이 아닌데 표시를 지움/,
        edits: [['tests/auth-session/screen-core.mjs', "if (revertOf && this.pendingRevert === revertOf && body && body.reverted === true) this.pendingRevert = null;", "if (revertOf && this.pendingRevert === revertOf) this.pendingRevert = null;"]],
    },
    {
        name: '실행기: 저장 계획이 검사에서 떨어져도 제어 포트로 넘김', section: 'tools', tool: 'text', expect: /실행기: 저장 계획을 검사하기 전에/,
        edits: [['tests/auth-session/screen.mjs', "            if (!checked.ok) { cx.notes = { planRefused: checked.why }; return; }              // 넘기지 않는다\n", '']],
    },
    {
        name: '실행기: 옛 길의 쓰기를 원복 대상으로 표시하지 않음', section: 'tools', tool: 'text', expect: /실행기: 옛 길의 쓰기는 원복 대상/,
        edits: [['tests/auth-session/screen.mjs', "await pause('old-path-begin', { student: key }, { needsRevert: true });", "await pause('old-path-begin', { student: key });"]],
    },
    {
        name: '로컬 서버: 운영 흔적이 남은 파일을 내줌', section: 'tools', tool: 'server', expect: /서버\([^)]*\): (운영 흔적이 남은 채 내줌|운영 주소가 박힌 파일)/,
        edits: [['tests/auth-session/serve-core.mjs', "        if (r.residue.length) {\n            counts.refused++;", "        if (false) {\n            counts.refused++;"]],
    },
    {
        name: '로컬 서버: 설정을 시험 프로젝트의 값으로 바꾸지 않음', section: 'tools', tool: 'server', expect: /서버\([^)]*\): (설정이 시험 프로젝트의 값이 아님|운영 흔적)/,
        edits: [['tests/auth-session/rewrite.mjs', "    if (relPath === CONFIG_FILE) {", "    if (relPath === 'zz-none') {"]],
    },
    // ---- 책·옛 방식의 값
    {
        name: '책 연결이 한 탭의 일반 로그인을 덮음', tests: ['book'], expect: /책 연결과 일반 로그인이 한 탭에: /,
        edits: [[AUTH, "        if (authToken && !_trBookConflict()) {", "        if (authToken) {"]],
    },
    {
        name: '책 전용 상태로 첫 화면에 와도 새 로그인의 길을 탐', tests: ['book'], expect: /책 › 책 전용 상태로 첫 화면\(켜짐\): 화면 동작이 기준과 다름/,
        edits: [[AUTH, GATE_START, "    if (_trAuthOn()) { _trStart(); return; }\n"]],
    },
    {
        name: '옛 방식의 값이 있어도 로그인 요청을 보냄', tests: ['book'], expect: /옛 방식의 값이 남은 탭: 로그인이 그 값을 덮었거나 인증 요청을 보냄/,
        edits: [[MOD, "            if (slot.kind === 'foreign') return { outcome: 'legacy_present' };\n", '']],
    },
    {
        name: '옛 방식의 값을 새 로그인의 값으로 덮음', tests: ['book'], expect: /옛 방식의 값이 남은 탭: 로그인이 그 값을 덮었거나 인증 요청을 보냄/,
        edits: [[MOD, "            if (slot.kind === 'foreign') return { outcome: 'legacy_present' };\n", ''], [MOD, "            if (slot.kind === 'foreign') return { ok: false, why: 'legacy_present' };   // 책 전용 상태·옛 방식의 값 — 덮어쓰지 않는다\n", ''], [MOD, "            if (slot.kind === 'foreign') return { ok: false, why: 'legacy_present' };\n            if (slot.stored !== 'ok'", "            if (slot.stored !== 'ok'"]],
    },
    // ---- 연결점
    {
        name: '연결점: 등급을 받으면 공개 키로 떨어짐', tests: ['connection'], expect: /연결점\([^)]*\): member 등급·자격 덮어쓰기가 오류가 아님/,
        edits: [['js/supabase-client.js', "        return auth.headersForGrade(arguments[1], extra);\n", '']],
    },
    {
        name: '연결점: 등급 없는 호출의 결과가 달라짐', tests: ['connection'], section: 'off', only: /^로그인 › 정규 Fast$/, expect: /(연결점\([^)]*\): 등급 없는 호출의 결과가 지금과 다름|꺼짐 › 로그인 › 정규 Fast: 기준과 다름)/,
        edits: [['js/supabase-client.js', "    if (arguments.length > 1 && arguments[1] !== undefined && arguments[1] !== null) {", "    extra = Object.assign({ 'X-Zz': '1' }, extra);\n    if (arguments.length > 1 && arguments[1] !== undefined && arguments[1] !== null) {"]],
    },
    // ---- 꺼짐
    {
        name: '꺼짐: 인증 모듈이 실려 있기만 하면 새 로그인의 길을 탐', section: 'off', only: /^(로그인 › 정규 Fast|틀린 비밀번호|빈 값\(둘 다\))$/, expect: /꺼짐 › [^:]*: 기준과 다름/,
        edits: [[AUTH, GATE_LOGIN, "    if (window.EonAuth) return _trHandleLogin(event);\n"]],
    },
    {
        name: '꺼짐: 저장소의 스위치가 켜져 있음', section: 'off', only: /^(로그인 › 정규 Fast|저장된 값 없이 첫 화면)$/, expect: /꺼짐 › [^:]*: (기준과 다름|인증 모듈의 흔적)/,
        edits: [[MOD, "    const EON_AUTH_SWITCH = 'off';", "    const EON_AUTH_SWITCH = 'on';"]],
    },
    {
        name: '꺼짐: 인증 모듈이 탭 단위 저장소에 무언가 씀', section: 'off', only: /^저장된 값 없이 첫 화면$/, expect: /꺼짐 › [^:]*: (기준과 다름|새 모듈의 저장 이름이 생김)/,
        edits: [[MOD, "    if (!ON) {\n", "    if (!ON) {\n        try { window.sessionStorage.setItem('tr_auth_v1:seen', '1'); } catch (e) {}\n"]],
    },
    {
        name: '꺼짐: 로그인의 쓰기 순서가 바뀜(tr_user_map 을 일정표보다 먼저)', section: 'off', only: /^로그인 › 자기주도 v2\(저장표 없음\)$/, expect: /꺼짐 › [^:]*: 기준과 다름/,
        edits: [[AUTH, "        await _ensureSelfPacedSchedule(currentUser, programInfo.applicationId, userTimezone);\n", "        await supabaseUpsert('tr_user_map', { user_id: user.id, email: user.email, name: user.name, updated_at: new Date().toISOString() }, 'user_id');\n        await _ensureSelfPacedSchedule(currentUser, programInfo.applicationId, userTimezone);\n"]],
    },
    {
        name: '꺼짐: 새로 고침 뒤 인증률 확정을 동기화보다 먼저 함', section: 'off', only: /^로그인 뒤 새로 고침 › 정규 Standard$/, expect: /꺼짐 › [^:]*: 기준과 다름/,
        edits: [[AUTH, "        currentUser.scheduleSyncOk = false;\n        var _restoreSync", "        _fillMissingAuthRates(currentUser.id);\n        currentUser.scheduleSyncOk = false;\n        var _restoreSync"]],
    },
    {
        name: '꺼짐: 책 연결의 충돌 확인이 값을 바꿈', section: 'off', only: /^책 연결 주소/, expect: /꺼짐 › 책 연결 주소[^:]*: 기준과 다름/,
        edits: [[AUTH, "    try {\n        var mark = JSON.parse(sessionStorage.getItem('tr_auth_v1:user'));", "    try {\n        sessionStorage.setItem('zz_seen', '1');\n        var mark = JSON.parse(sessionStorage.getItem('tr_auth_v1:user'));"]],
    },
    // ---- 차이 장부
    {
        name: '꺼짐의 화면이 정적 파일을 하나 더 받음(차이 장부 밖)', section: 'static', expect: /index\.html: 기준보다 더 싣는 정적 파일이/,
        edits: [['index.html', '    <script src="js/auth-session.js?v=20261124_b3b"></script>\n', '    <script src="vendor/supabase-2.116.0.js"></script>\n    <script src="js/auth-session.js?v=20261124_b3b"></script>\n']],
    },
    {
        name: '다른 화면(책)에도 인증 모듈을 실음', section: 'static', expect: /book\.html: 기준보다 더 싣는 정적 파일이 0개가 아님/,
        edits: [['book.html', '<script src="js/auth.js?v=20261108_extsync"></script>', '<script src="js/auth-session.js"></script><script src="js/auth.js?v=20261108_extsync"></script>']],
    },
];
