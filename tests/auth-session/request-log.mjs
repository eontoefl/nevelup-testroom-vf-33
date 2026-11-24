// (공홈 계약 3A 의 tests/auth-session/request-log.mjs 를 테스트룸에 맞게 옮긴 것 — 표 요청의 범위 규칙을 더했다)
// 화면 시험에서 요청을 "보내기 전에 가르는" 차단기와 "가려서 기록하기".
// 이 파일은 요청을 보내지 않는다 — 가로챈 요청 하나를 받아 "계속/중단"과 기록 한 줄을 돌려줄 뿐이다.
// 쓰는 곳: tests/auth-session/screen.mjs (화면 시험 실행기 — 모든 요청이 이 결정을 거친 뒤에만 나간다).
//
// 규칙
//   * 허용 밖의 목적지는 전송 전에 중단한다(화면 이동·폼 제출·새 창 포함).
//   * 자격의 종류와 용도가 맞아야 한다 — 맞지 않으면 목적지가 시험 프로젝트여도 전송 전에 중단한다:
//       비밀번호 → 로그인 요청에만 / 갱신값 → 갱신 요청에만 / 회원 JWT → 로그아웃(scope=local)과 두 RPC 에만
//       service_role·알 수 없는 자격 → 어디로도 보내지 않는다
//       회원 JWT 는 발급자가 시험 프로젝트이고 계정이 이번 실행의 합성 계정 가운데 하나일 때만(실행기가 그 기준을 넘겨줄 때)
//   * 기록에는 자유 형식의 글자(주소·경로·키 이름·값)를 남기지 않는다. 정해 둔 이름과 참/거짓만 남긴다.
//   * (테스트룸) 표 요청의 범위 — 자격이 맞아도 범위를 벗어나면 전송 전에 중단한다:
//       예행 전·합성 자료의 목록을 확인하기 전: 시험 프로젝트로 가는 업무 요청을 전부 막는다
//       켜진 화면: 회원 표 요청과 업무 쓰기는 무조건 막는다(보내지 않는다)
//       꺼진 화면: 회원 표는 **지금 돌리는 그 합성 학생의** 이메일로 정확한 두 조회만, 쓰기는 옛 길의 세 가지
//       (신청서의 self_paced_schedule, tr_user_map 넣기, study_results_v3 의 locked_auth_rate)를 그 학생의 행·허용한 열·정해 둔 값으로 보낼 때만
//       읽기는 허용 목록(이 조각의 흐름이 실제로 읽는 표·조건·열 목록, 값은 그 학생의 것)만 — 그 밖은 막고 센다
//       위의 안전 조건을 어긴 요청(unsafe)이 한 번이라도 나오면 실행기는 그 경우를 끝내고 뒤의 경우를 시작하지 않는다

import { TEST_URL } from './rewrite.mjs';
import { STATIC_ALLOW } from './serve-core.mjs';

// 시험 프로젝트로 가는 요청의 이름(이 밖은 무리 이름으로만 적는다)
const NAMED = {
    'POST /auth/v1/token?grant_type=password': 'login',
    'POST /auth/v1/token?grant_type=refresh_token': 'refresh',
    'POST /auth/v1/logout?scope=local': 'logout',
    'POST /rest/v1/rpc/my_profile': 'my_profile',
    'POST /rest/v1/rpc/my_site_access': 'my_site_access',
};
export const MEMBER_JWT_TARGETS = ['logout', 'my_profile', 'my_site_access'];

// 종류 other 는 파비콘(<link rel="icon">)이다 — 그림의 허용 호스트에만
const STATIC_TYPES = { stylesheet: STATIC_ALLOW.style, font: STATIC_ALLOW.font, image: STATIC_ALLOW.img, other: STATIC_ALLOW.img };
const TYPES = ['document', 'stylesheet', 'image', 'media', 'font', 'script', 'xhr', 'fetch', 'websocket', 'manifest', 'other'];
const METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

function claimsOf(token) {
    try {
        const parts = String(token).split('.');
        if (parts.length !== 3) return null;
        return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    } catch (e) { return null; }
}

function headerOf(headers, lowerName) {
    for (const name of Object.keys(headers || {})) if (name.toLowerCase() === lowerName) return String(headers[name]);
    return null;
}

// Authorization 의 종류(값은 돌려주지 않는다)
export function credentialKind(headers, anonKey) {
    const auth = headerOf(headers, 'authorization');
    if (auth === null) return 'none';
    if (!auth.startsWith('Bearer ')) return 'other';
    const token = auth.slice(7);
    if (anonKey && token === anonKey) return 'anon';
    const c = claimsOf(token);
    if (!c) return 'other';
    if (c.role === 'anon') return 'anon';
    if (c.role === 'authenticated') return 'member';
    if (c.role === 'service_role') return 'service_role';
    return 'other';
}

// 본문에 비밀번호·갱신값이 들어 있는가(값도 키 이름도 돌려주지 않는다)
export function secretItems(postData) {
    const out = { password: false, refreshToken: false };
    if (postData === null || postData === undefined || postData === '') return out;
    const text = String(postData);
    let keys = [];
    try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object') keys = Object.keys(parsed);
    } catch (e) {
        try { keys = [...new URLSearchParams(text).keys()]; } catch (_) { keys = []; }
    }
    const lower = keys.map((k) => String(k).toLowerCase());
    out.password = lower.includes('password') || /"password"\s*:/i.test(text);
    out.refreshToken = lower.includes('refresh_token') || /"refresh_token"\s*:/i.test(text);
    return out;
}

// 시험 프로젝트로 가는 요청의 이름(정해 둔 다섯 또는 무리 이름)
function targetName(method, u) {
    const exact = NAMED[`${method} ${u.pathname}${u.search}`];
    if (exact) return exact;
    if (u.pathname.startsWith('/rest/v1/rpc/')) return 'rest-rpc-other';
    if (u.pathname.startsWith('/rest/v1/')) return 'rest-table';
    if (u.pathname.startsWith('/auth/v1/')) return 'auth-other';
    if (u.pathname.startsWith('/storage/v1/')) return 'storage';
    if (u.pathname.startsWith('/functions/v1/')) return 'functions';
    return 'other';
}

// (테스트룸) 표 요청의 범위. 돌려주는 값: { table(정해 둔 이름), write, blocked(정해 둔 이름들), unsafe }
//   ctx = { ready(예행이 통과했고 합성 자료의 목록을 확인했는가), mode('on'·'off' — 요청을 낸 화면이 어느 서버의 것인가. 모르면 'on' 으로 본다),
//           student(지금 돌리는 그 합성 학생: { email, memberId, appIds, recordIds } 또는 null) }
//   * 준비 전(ready 아님): 시험 프로젝트로 가는 업무 요청을 전부 막는다
//   * 켜진 화면: 회원 표 요청(읽기 포함)과 업무 쓰기(표·저장소·함수·다른 RPC)는 무조건 막는다 — 안전 조건 위반(unsafe)
//   * 꺼진 화면: 회원 표는 그 학생의 이메일로 정확한 두 조회만, 쓰기는 옛 길의 세 가지를 그 학생의 행·허용한 열·정해 둔 값으로 보낼 때만.
//     벗어나면 막는다 — 안전 조건 위반(unsafe)
//   * 읽기는 허용 목록(이 조각의 흐름이 실제로 읽는 표·조건·열 목록, 값은 그 학생의 것)만 내보낸다. 그 밖의 읽기는 막고 센다(위반으로 치지는 않는다)
const TABLES = ['users', 'applications', 'tr_user_map', 'study_results_v3', 'tr_deadline_extensions', 'tr_auth_tokens', 'tr_notifications', 'tr_app_settings', 'tr_notices', 'tr_schedule_assignment'];
const USERS_COLS = ['id,name,email,phone,role,blocked,timezone', 'password'];
// 신청서의 열 목록(js/auth.js 의 _appCols 와 글자까지 같아야 한다 — 회귀시험이 견준다)
export const APP_COLS = 'id,preferred_program,assigned_program,preferred_start_date,schedule_start,australia_schedule_start,current_step,status,deposit_confirmed_by_admin,practice_enabled,correction_enabled,correction_start_date,enrollment_no,shipping_completed_at,shipping_waived,restart_materials';
const APP_PARTS = ['self_paced,self_paced_weeks', 'self_paced_end_date', 'self_paced_schedule', 'challenge_pauses,correction_pauses', 'service_stops,app_status,refund_at'];
// 값의 자리: E = 그 학생의 이메일, A = 그 학생의 신청서 번호, M = 그 학생의 회원번호, T = 시각. 배열 = 그 가운데 하나. 글자 = 그 글자 그대로
const READS = [
    ['applications', [['email', 'E'], ['deposit_confirmed_by_admin', 'eq.true'], ['order', 'created_at.desc'], ['limit', '1'], ['select', APP_COLS]]],
    ['applications', [['email', 'E'], ['order', 'created_at.desc'], ['limit', '1'], ['select', APP_COLS]]],
    ['applications', [['id', 'A'], ['select', APP_PARTS]]],
    ['study_results_v3', [['user_id', 'M'], ['initial_record', 'not.is.null'], ['enrollment_id', 'A'], ['select', 'id,section_type,module_number,week,day,error_note_submitted']]],
    ['study_results_v3', [['user_id', 'M'], ['locked_auth_rate', 'is.null'], ['completed_at', 'not.is.null'], ['enrollment_id', 'A'], ['select', 'id,initial_record,error_note_submitted,week,day']]],
    ['tr_deadline_extensions', [['enrollment_id', 'A'], ['select', 'original_date,extra_days']]],
    ['tr_notifications', [['user_id', 'M'], ['order', 'created_at.desc'], ['limit', '20']]],
    ['tr_app_settings', [['key', 'eq.vocab_version'], ['select', 'value']]],
    ['tr_notices', [['active_until', 'T'], ['order', 'sort_order.asc']]],
    ['tr_schedule_assignment', [['select', '*'], ['order', 'id.asc']]],
];
const TIME = /^gt\.\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;
function valueOk(spec, v, st) {
    if (Array.isArray(spec)) return spec.includes(v);
    if (spec === 'E') return !!st && v === 'eq.' + st.email;
    if (spec === 'A') return !!st && st.appIds.some((id) => v === 'eq.' + id);
    if (spec === 'M') return !!st && v === 'eq.' + st.memberId;
    if (spec === 'T') return TIME.test(v);
    return v === spec;
}
// 조건의 이름·차례·수가 정해 둔 것과 정확히 같고 값이 맞는가
function shapeOk(q, params, st) {
    return q.length === params.length && params.every(([k, spec], i) => q[i][0] === k && valueOk(spec, q[i][1], st));
}
const NONE = { table: 'none', write: false, blocked: [], unsafe: false };
function scopeOf(method, u, postData, ctx) {
    const p = u.pathname;
    const own = ['/auth/v1/token', '/auth/v1/logout', '/rest/v1/rpc/my_profile', '/rest/v1/rpc/my_site_access'];
    if (own.includes(p)) return NONE;
    const read = method === 'GET' || method === 'HEAD';
    const rest = p.startsWith('/rest/v1/') && !p.startsWith('/rest/v1/rpc/');
    const name = rest ? p.slice('/rest/v1/'.length) : '';
    const table = rest ? (TABLES.includes(name) ? name : 'other') : 'other';
    const stop = (why, unsafe) => ({ table, write: !read, blocked: [why], unsafe: !!unsafe });
    if (!ctx.ready) return stop('not_ready', false);                    // 예행 전·합성 목록을 확인하기 전: 업무 요청 0
    const on = ctx.mode !== 'off';
    const st = ctx.student || null;
    const q = [...u.searchParams.entries()];
    // 회원 표: 켜진 화면에서는 어떤 요청도, 꺼진 화면에서는 그 학생의 정확한 두 조회 말고는 — 위반
    if (table === 'users') {
        if (on) return stop('users_on', true);
        const ok = read && shapeOk(q, [['email', 'E'], ['select', USERS_COLS]], st);
        return ok ? { table, write: false, blocked: [], unsafe: false } : stop('users_query', true);
    }
    if (!read) {
        if (on) return stop('write_on', true);                         // 켜진 화면의 업무 쓰기(표·저장소·함수·다른 RPC): 보내지 않는다
        if (!rest) return stop('write_not_allowed', true);
        let body = null;
        try { body = JSON.parse(postData); } catch (e) { body = null; }
        const plain = !!body && typeof body === 'object' && !Array.isArray(body);
        const keysAre = (allowed) => plain && Object.keys(body).length > 0 && Object.keys(body).every((k) => allowed.includes(k));
        let ok = false;
        if (st && table === 'applications' && method === 'PATCH') ok = shapeOk(q, [['id', 'A']], st) && keysAre(['self_paced_schedule']) && typeof body.self_paced_schedule === 'string';
        else if (st && table === 'tr_user_map' && method === 'POST') ok = shapeOk(q, [['on_conflict', 'user_id']], st) && keysAre(['user_id', 'email', 'name', 'updated_at']) && body.user_id === st.memberId && body.email === st.email;
        else if (st && table === 'study_results_v3' && method === 'PATCH') ok = q.length === 1 && q[0][0] === 'id' && st.recordIds.some((id) => q[0][1] === 'eq.' + id) && keysAre(['locked_auth_rate']) && [0, 50, 100].includes(body.locked_auth_rate);
        return ok ? { table, write: true, blocked: [], unsafe: false } : stop('write_not_allowed', true);
    }
    // 읽기: 허용 목록만. 그 밖은 막고 센다
    if (!rest) return stop('read_not_listed', false);
    const listed = READS.some(([tb, params]) => tb === name && shapeOk(q, params, st));
    return listed ? { table, write: false, blocked: [], unsafe: false } : stop('read_not_listed', false);
}

// issuer·memberEmails(배열 또는 배열을 돌려주는 함수)를 주면 회원 JWT 의 출처도 본다
// ready(함수): 예행이 통과했고 합성 자료의 목록을 확인했는가. 요청마다 pageMode('on'·'off')와 student(그 학생)를 함께 넘긴다
export function makeDecider({ selfOrigins, anonKey, issuer, memberEmails, ready }) {
    const selves = new Set([].concat(selfOrigins || []));
    if (!selves.size) throw new Error('selfOrigins 가 필요하다');
    const emailsNow = () => (typeof memberEmails === 'function' ? memberEmails() : (memberEmails || [])).map((e) => String(e).trim().toLowerCase());
    return function decide(req) {
        let u = null;
        try { u = new URL(req.url); } catch (e) { u = null; }
        const rawMethod = String(req.method || 'GET').toUpperCase();
        const method = METHODS.includes(rawMethod) ? rawMethod : 'OTHER';
        const type = TYPES.includes(String(req.resourceType)) ? String(req.resourceType) : 'other';
        const nav = !!req.isNavigation;
        const local = !!u && (u.protocol === 'data:' || u.protocol === 'blob:' || u.protocol === 'about:');
        let where;
        let target = 'other';
        if (!u) where = 'outside';
        else if (local) where = 'local';
        else if (selves.has(u.origin)) {
            where = 'self';
            if (u.pathname.startsWith('/__b3b/sink')) { where = 'sink'; target = 'sink'; }
            else if (u.pathname.startsWith('/__b3b/')) target = 'test-endpoint';
            else target = 'file';
        } else if (u.origin === TEST_URL) { where = 'test-project'; target = targetName(rawMethod, u); }
        else if (!nav && method === 'GET' && STATIC_TYPES[type] && STATIC_TYPES[type].includes(u.origin)) { where = 'static-allowed'; target = 'static'; }
        else where = 'outside';

        const cred = credentialKind(req.headers, anonKey);
        const items = secretItems(req.postData);
        // 자격의 종류와 용도
        const problems = [];
        if (items.password && !(where === 'test-project' && target === 'login')) problems.push('password');
        if (items.refreshToken && !(where === 'test-project' && target === 'refresh')) problems.push('refresh_token');
        if (cred === 'member' && !(where === 'test-project' && MEMBER_JWT_TARGETS.includes(target))) problems.push('member_jwt');
        if (cred === 'member' && issuer) {
            const c = claimsOf((headerOf(req.headers, 'authorization') || '').slice(7)) || {};
            if (c.iss !== issuer || typeof c.email !== 'string' || !emailsNow().includes(c.email.trim().toLowerCase())) problems.push('foreign_member_jwt');
        }
        if (cred === 'service_role') problems.push('service_role');
        if (cred === 'other') problems.push('unknown_credential');
        const leak = problems.length > 0;
        const publicRetry = where === 'test-project' && (target === 'my_profile' || target === 'my_site_access') && cred !== 'member';

        // 시험 프로젝트로 가는 것이라도 화면 이동(최상위·폼)은 이 조각에 없다 → 중단
        const placeOk = where === 'self' || where === 'local' || where === 'static-allowed' || (where === 'test-project' && !nav);
        // 표 요청의 범위(테스트룸): 회원 표는 정확한 두 조회만, 쓰기는 이번 실행의 합성 행·허용한 열만
        const isReady = typeof ready === 'function' ? ready() === true : false;
        const mode = req.pageMode === 'off' ? 'off' : 'on';            // 모르면 켜진 화면으로 본다(더 막는 쪽)
        const scope = where === 'test-project' && !nav ? scopeOf(rawMethod, u, req.postData, { ready: isReady, mode, student: req.student || null }) : NONE;
        const allowed = placeOk && !leak && scope.blocked.length === 0;
        // 안전 조건 위반: 준비가 끝난 뒤에 자격이 용도 밖으로 가려 했거나, 범위 규칙의 위반(회원 표·쓰기)이 있었다. 전송 전에 막는다
        const unsafe = isReady && (leak || scope.unsafe === true);
        return {
            action: allowed ? 'continue' : 'abort',
            record: {
                where, target, nav, type, method,
                apikey: headerOf(req.headers, 'apikey') !== null,
                credential: cred,
                password: items.password,
                refreshToken: items.refreshToken,
                leak,
                leakKinds: problems,
                publicRetry,
                table: scope.table,
                write: scope.write,
                scopeBlocked: scope.blocked,
                pageMode: where === 'test-project' ? (req.pageMode === 'off' ? 'off' : (req.pageMode === 'on' ? 'on' : 'unknown')) : 'none',
                unsafe,
                aborted: !allowed,
            },
        };
    };
}

// 통과 기준의 숫자들.
//   leakSent·outsideSent 는 차단기의 결정을 센 것이다(차단기가 중단한 것은 "보내지 않은 것"으로 센다).
//   실제로 나가지 않았다는 독립된 증거는 로컬 시험 목적지의 수신 수(서버 쪽 숫자)다.
export function summarize(records) {
    const is = (fn) => records.filter(fn).length;
    const byTarget = {};
    for (const r of records) if (r.where === 'test-project' && !r.aborted) byTarget[r.target] = (byTarget[r.target] || 0) + 1;
    return {
        total: records.length,
        self: is((r) => r.where === 'self' && !r.aborted),
        testProject: is((r) => r.where === 'test-project' && !r.aborted),
        testProjectByTarget: byTarget,
        staticAllowed: is((r) => r.where === 'static-allowed'),
        leakBlocked: is((r) => r.leak && r.aborted),
        leakSent: is((r) => r.leak && !r.aborted),
        publicRetry: is((r) => r.publicRetry && !r.aborted),
        serviceRole: is((r) => r.credential === 'service_role'),
        sinkAttempts: is((r) => r.where === 'sink'),
        outsideBlockedNavigation: is((r) => (r.where === 'outside' || r.where === 'sink' || (r.where === 'test-project' && r.nav)) && r.nav && r.aborted),
        outsideBlockedRequest: is((r) => (r.where === 'outside' || r.where === 'sink') && !r.nav && r.aborted),
        outsideSent: is((r) => (r.where === 'outside' || r.where === 'sink' || (r.where === 'test-project' && r.nav)) && !r.aborted),
        writesSent: is((r) => r.where === 'test-project' && r.write && !r.aborted),
        writesBlocked: is((r) => r.where === 'test-project' && r.write && r.aborted),
        usersReads: is((r) => r.where === 'test-project' && r.table === 'users' && !r.aborted),
        scopeBlocked: is((r) => r.scopeBlocked && r.scopeBlocked.length > 0),
        readsBlocked: is((r) => r.scopeBlocked && r.scopeBlocked.includes('read_not_listed')),
        notReadyBlocked: is((r) => r.scopeBlocked && r.scopeBlocked.includes('not_ready')),
        unsafe: is((r) => r.unsafe === true),
        unsafeSent: is((r) => r.unsafe === true && !r.aborted),
    };
}
