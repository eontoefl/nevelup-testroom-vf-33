// 켜짐(새 길)의 시험: 가짜 로그인 서버 + 가짜 표 요청. SDK 사본은 실제 파일이다.
import { V, makeWorld, checker, screens, lastScreen, lastMessage, messages, sessionOf, credOf, shapeOf, FAKE_ANON, PROD } from './world.mjs';
import { ENTERING, LEGACY_PW, AUTH_PW, emailOf, memberIdOf, student, bookToken } from './fixtures.mjs';
import { bookOnly } from './scenarios.mjs';

export const MSG = {
    invalid: '이메일 또는 비밀번호가 올바르지 않습니다.',
    blocked: '차단된 계정입니다. 관리자에게 문의하세요.',
    withdrawal: '탈퇴 처리 중인 계정입니다.',
    maintenance: '지금은 점검 중입니다. 잠시 뒤 다시 시도해주세요.',
    noApp: '수강 신청 내역이 없습니다. 공식 홈페이지에서 먼저 수강 신청을 해주세요.',
    notConfirmed: '수강 등록이 아직 확인되지 않았습니다. 관리자에게 문의해주세요.',
    checkFailed: '수강 정보를 확인하지 못했습니다. 잠시 뒤 다시 시도해주세요.',
    legacy: '이 탭에 다른 방식의 로그인 상태가 남아 있습니다. 이 탭을 닫고 새 탭에서 다시 로그인해 주세요.',
    foreign: '이 창에서는 다른 창의 로그인 상태를 쓰지 않습니다. 새로 고침한 뒤 다시 로그인해 주세요.',
    unproven: '로그인 상태를 이어받지 못했습니다. 다시 로그인해 주세요.',
    unavailable: '로그인 기능을 불러오지 못했습니다. 새로 고침해 주세요.',
    logoutUnknown: '로그아웃을 확인하지 못했습니다. 잠시 뒤 다시 시도해주세요.',
    ended: '로그인이 끝났습니다. 다시 로그인해 주세요.',
    error: '로그인 중 오류가 발생했습니다. 다시 시도해주세요.',
    emailEmpty: '이메일을 입력해주세요.',
    pwEmpty: '비밀번호를 입력해주세요.',
};
export const R = {
    login: 'POST /auth/v1/token?grant_type=password',
    refresh: 'POST /auth/v1/token?grant_type=refresh_token',
    logout: 'POST /auth/v1/logout?scope=local',
    profile: 'POST /rest/v1/rpc/my_profile',
    access: 'POST /rest/v1/rpc/my_site_access',
};
const HOURS = 60 * 60 * 1000;
export const st = (page) => page.evaluate('EonAuth.state()');
export const why = (page) => page.evaluate('EonAuth.reason()');
const routes = (w) => w.auth.log.map((e) => e.route + e.search);
export const count = (w, r) => routes(w).filter((x) => x === r).length;
const usersReads = (w) => w.rest.log.filter((e) => e.table === 'users').length;
const ready = (page) => page.evaluate('typeof trLoginV2 === "object" && trLoginV2.ready()');
const planOf = (page) => JSON.parse(page.evaluate('JSON.stringify(trLoginV2.plan())'));
const hasSchedule = (page) => screens(page).some((s) => s.id === 'scheduleScreen');
const nothingShown = (tab, page) => !hasSchedule(page) && !tab.session.has('currentUser') && page.evaluate('currentUser') === null && ready(page) === false;

// 모든 켜짐 시험에 공통으로 보는 것: 회원 자격은 인증 모듈 자신의 요청에만, 허용 밖의 요청 0, 쓰기 전송 0, 회원 표 요청 0, 창 사이로 보낸 것 0
export function audit(w, c, label) {
    for (const e of w.auth.log) {
        const r = e.route + e.search;
        const own = r === R.profile || r === R.access || r === R.logout;
        if (e.cred === 'member' && !own) c.ok(false, `${label}: 회원 자격이 허용 목록 밖의 요청에 실림(${e.route})`);
        if (own && r !== R.logout && e.cred !== 'member') c.ok(false, `${label}: 본인 확인 요청이 회원 자격이 아님(공개 키로 떨어짐)`);
        if (e.cred === 'other' || e.cred === 'none') c.ok(false, `${label}: 자격이 이상한 요청(${e.route})`);
        if (!e.apikey) c.ok(false, `${label}: 공개 키 머리글이 없는 요청(${e.route})`);
    }
    c.ok(w.outside.length === 0, `${label}: 허용 밖의 요청(${w.outside.length}건)`);
    c.ok(w.auth.foreign.length === 0, `${label}: 다른 출처로 간 요청`);
    c.ok(w.rest.writes.length === 0, `${label}: 새 길에서 쓰기를 보냄(${w.rest.writes.map((x) => x.table).join(',')})`);
    c.ok(usersReads(w) === 0, `${label}: 회원 표를 읽음(${usersReads(w)}번)`);
    c.ok(w.browser.channelPosts.length === 0, `${label}: 창 사이 통로로 보낸 것이 있음(${w.browser.channelPosts.length}건)`);
    const reg = w.browser.local.get('tr_auth_v1:claims') || '';
    c.ok(!/eyJ|fake-refresh/.test(reg) && [...w.browser.local.keys()].every((k) => k === 'tr_auth_v1:claims'), `${label}: 브라우저 단위 저장소에 차례표 말고 다른 것이 있음`);
}

export async function newLogin(mutate, key, opts = {}) {
    const w = makeWorld({ variant: V.ON, mutate, tables: opts.tables });
    if (opts.prepare) opts.prepare(w);
    const tab = w.tab('A');
    const page = await w.open(tab, 'index.html', { locks: opts.locks });
    await w.submit(page, opts.email === undefined ? emailOf(key) : opts.email, opts.password === undefined ? AUTH_PW : opts.password, { wait: opts.wait === undefined ? 1500 : opts.wait });
    return { w, tab, page };
}
export async function oldLogin(key) {
    const w = makeWorld({ variant: V.OFF });
    const tab = w.tab('A');
    const page = await w.open(tab, 'index.html');
    await w.submit(page, emailOf(key), LEGACY_PW);
    return { w, tab, page };
}
const planAsWrites = (plan) => (plan ? plan.items.map((i) => ({ method: i.method, table: i.table, search: i.match ? '?' + i.match : '?on_conflict=' + i.onConflict, body: i.values })) : null);
const readsOf = (w, skipUsers) => w.rest.log.filter((e) => e.method === 'GET' && !(skipUsers && e.table === 'users')).map((e) => e.table + e.search);
const gateOn = (w, where, match) => {
    let release;
    const gate = new Promise((r) => { release = r; });
    if (where === 'auth') w.auth.faults[match] = () => gate.then(() => null);
    else w.rest.faults.push((req, u) => (u.pathname === '/rest/v1/' + match ? gate.then(() => null) : null));
    return () => { release(); if (where === 'auth') delete w.auth.faults[match]; else w.rest.faults.length = 0; };
};

// 같은 학생 유형에서 옛 길과 같은 결과: currentUser, 화면, 저장 계획 = 옛 길의 실제 쓰기
async function testSameAsOld(mutate) {
    const c = checker();
    for (const key of ENTERING) {
        const label = `옛 길과 대조 › ${student(key).label}`;
        const o = await oldLogin(key);
        const n = await newLogin(mutate, key);
        const oldUser = o.tab.session.get('currentUser');
        const newUser = n.tab.session.get('currentUser');
        c.ok(typeof oldUser === 'string' && oldUser === newUser, `${label}: currentUser 의 키·값이 옛 길과 다름`);
        const os = screens(o.page).map((s) => [s.id, s.user]);
        const ns = screens(n.page).map((s) => [s.id, s.user]);
        c.ok(JSON.stringify(os) === JSON.stringify(ns), `${label}: 화면 전환(일정 화면의 currentUser 포함)이 옛 길과 다름`);
        c.ok(JSON.stringify(messages(o.page)) === JSON.stringify(messages(n.page)), `${label}: 안내 문구가 옛 길과 다름`);
        const plan = planOf(n.page);
        c.ok(plan && plan.authRates === 'done', `${label}: 인증률 확정의 계산이 끝나지 않음(${plan && plan.authRates})`);
        c.ok(JSON.stringify(planAsWrites(plan)) === JSON.stringify(o.w.rest.writes), `${label}: 저장 계획이 옛 길의 실제 쓰기 요청과 다름(계획 ${plan ? plan.items.length : 0}건·옛 길 ${o.w.rest.writes.length}건)`);
        c.ok(plan && plan.memberId === memberIdOf(key) && plan.applicationId === JSON.parse(newUser || '{}').applicationId, `${label}: 저장 계획의 회원·수강 건이 다름`);
        c.ok(JSON.stringify(readsOf(n.w)) === JSON.stringify(readsOf(o.w, true)), `${label}: 새 길의 읽기 요청이 옛 길의 읽기(회원 표 제외)와 다름`);
        c.ok(n.w.browser.requests.filter((r) => r.url.includes('/rest/v1/') && !r.url.includes('/rpc/')).every((r) => credOf(r, FAKE_ANON) === 'anon'), `${label}: 새 길의 표 요청이 공개 키가 아님`);
        // 머리글의 이름과 순서가 옛 길과 같은가(값은 주소·키가 달라 견주지 않는다)
        const names = (w) => [...new Set(w.browser.requests.filter((r) => r.url.includes('/rest/v1/applications')).map((r) => r.headers.map(([h]) => h).join(',')))];
        c.ok(JSON.stringify(names(n.w)) === JSON.stringify(names(o.w)), `${label}: 표 요청의 머리글 이름·순서가 옛 길과 다름`);
        c.ok(ready(n.page) === true && st(n.page) === 'signed_in', `${label}: 준비 신호가 서지 않음`);
        c.ok(count(n.w, R.login) === 1 && count(n.w, R.profile) === 1 && count(n.w, R.access) === 1 && count(n.w, R.refresh) === 0 && count(n.w, R.logout) === 0, `${label}: 인증 요청의 수가 기대(로그인 1·확인 둘)와 다름`);
        audit(n.w, c, label);

        // 새로 고침: 다시 확인하고 수강을 다시 조회한 뒤에만 화면을 연다. 결과는 로그인 직후와 같다
        const before = n.w.browser.requests.length;
        const page2 = await n.w.open(n.tab, 'index.html');
        await n.w.browser.advance(1500);
        const s2 = screens(page2);
        c.ok(s2.length === 2 && s2[0].id === 'loginScreen' && s2[0].user === null && s2[1].id === 'scheduleScreen' && s2[1].user === newUser, `${label} › 새로 고침: 로그인 화면 → (확인 뒤) 일정 화면이 아님`);
        c.ok(n.tab.session.get('currentUser') === newUser, `${label} › 새로 고침: currentUser 가 로그인 직후와 다름`);
        const after = n.w.browser.requests.slice(before);
        c.ok(after.filter((r) => r.url.endsWith('/rpc/my_profile')).length === 1 && after.filter((r) => r.url.endsWith('/rpc/my_site_access')).length === 1, `${label} › 새로 고침: 다시 확인(두 요청)이 한 번씩이 아님`);
        const noTime = (list) => JSON.stringify(list, (k, v) => (k === 'updated_at' ? '(그때의 시각)' : v));
        c.ok(noTime(planAsWrites(planOf(page2))) === noTime(o.w.rest.writes), `${label} › 새로 고침: 저장 계획이 로그인 때와 다름(시각 칸 updated_at 제외)`);
        audit(n.w, c, label + ' › 새로 고침');
    }
    return { problems: c.problems, note: `학생 유형 ${ENTERING.length}가지 × (로그인 + 새로 고침)` };
}

// 들어가지 못하는 경우들: currentUser 를 만들지 않고 화면을 열지 않는다
async function testOutcomes(mutate) {
    const c = checker();
    const cases = [
        { name: '신청 없음', key: 'noapp', msg: MSG.noApp, state: 'signed_in', result: 'no_application' },
        { name: '입금 미확인', key: 'unconf', msg: MSG.notConfirmed, state: 'signed_in', result: 'not_confirmed' },
        { name: '차단', key: 'blocked', msg: MSG.blocked, state: 'rejected', reason: 'blocked', noRest: true },
        { name: '틀린 비밀번호', key: 'fast', password: 'zz-wrong', msg: MSG.invalid, state: 'signed_out', noRest: true, noRpc: true },
        { name: '옛 길의 값(회원 표의 비밀번호 열)으로는 들어가지 못함', key: 'fast', password: LEGACY_PW, msg: MSG.invalid, state: 'signed_out', noRest: true, noRpc: true },
        { name: '999999', key: 'fast', password: '999999', msg: MSG.invalid, state: 'signed_out', noRest: true, noRpc: true },
        { name: '없는 이메일', email: 'zzb3b_nobody@member.zz.invalid', msg: MSG.invalid, state: 'signed_out', noRest: true, noRpc: true },
        { name: '빈 값(둘 다)', email: '', password: '', msg: MSG.emailEmpty, state: 'signed_out', noRest: true, noRpc: true, noAuth: true },
        { name: '빈 값(비밀번호만)', key: 'fast', password: '', msg: MSG.pwEmpty, state: 'signed_out', noRest: true, noRpc: true, noAuth: true },
        { name: '탈퇴 처리 중', key: 'fast', prepare: (w) => { w.auth.accounts.get(emailOf('fast')).member = 'withdrawal'; }, msg: MSG.withdrawal, state: 'rejected', reason: 'withdrawal_pending', noRest: true },
        { name: '회원 대응이 없는 계정', key: 'fast', prepare: (w) => { w.auth.accounts.get(emailOf('fast')).member = 'none'; }, msg: MSG.invalid, state: 'signed_out', noRest: true, logout: 1 },
        { name: '점검(503)', key: 'fast', prepare: (w) => { w.auth.maintenance = true; }, msg: MSG.maintenance, state: 'rejected', reason: 'maintenance', noRest: true },
        { name: 'allowed 거짓', key: 'fast', prepare: (w) => { w.auth.allowedOverride = false; }, msg: MSG.error, state: 'rejected', reason: 'not_allowed', noRest: true },
        { name: 'my_profile 만 ok(my_site_access 실패)', key: 'fast', prepare: (w) => { w.auth.faults.my_site_access = () => ({ status: 500, headers: {}, body: '{}' }); }, msg: MSG.error, state: 'rejected', reason: 'unexpected', noRest: true },
    ];
    for (const k of cases) {
        const label = `들어가지 못함 › ${k.name}`;
        const { w, tab, page } = await newLogin(mutate, k.key, { email: k.email, password: k.password, prepare: k.prepare });
        c.ok(lastMessage(page) === k.msg, `${label}: 안내가 기대와 다름(${lastMessage(page)})`);
        c.ok(st(page) === k.state && (k.reason === undefined || why(page) === k.reason), `${label}: 상태가 ${k.state}${k.reason ? '·' + k.reason : ''} 가 아님(${st(page)}·${why(page)})`);
        c.ok(nothingShown(tab, page), `${label}: 화면을 열었거나 currentUser 를 만듦`);
        if (k.result) c.ok(page.evaluate('trLoginV2.result()') === k.result, `${label}: 결과 이름이 ${k.result} 가 아님`);
        if (k.noRest) c.ok(w.rest.log.length === 0, `${label}: 표 요청을 보냄(${w.rest.log.length}건) — 확인되지 않은 채 공개 키로 떨어짐`);
        if (k.noRpc) c.ok(count(w, R.profile) + count(w, R.access) === 0, `${label}: 확인 요청을 보냄`);
        if (k.noAuth) c.ok(w.auth.log.length === 0, `${label}: 인증 요청을 보냄(빈 값·개발 로그인의 길이 없어야 한다)`);
        if (k.logout !== undefined) c.ok(count(w, R.logout) === k.logout, `${label}: 종료 요청이 ${k.logout}번이 아님`);
        c.ok(!page.byId.loginBtn.disabled, `${label}: 로그인 버튼이 풀리지 않음`);
        audit(w, c, label);
    }
    return { problems: c.problems, note: `${cases.length}가지` };
}

// 실패와 "없음"을 구분한다
async function testFailures(mutate) {
    const c = checker();
    const nth = (table, n, how) => (w) => { let i = 0; w.rest.faults.push((req, u) => (u.pathname === '/rest/v1/' + table && ++i === n ? how() : null)); };
    const lost = () => 'network';
    const e500 = () => ({ status: 500, headers: { 'Content-Type': 'application/json' }, body: '{"message":"fake"}' });
    const notJson = () => ({ status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'ok' });
    const cases = [
        { name: '첫 조회(입금 확인 건) 응답 없음', key: 'fast', prepare: nth('applications', 1, lost), apps: 1 },
        { name: '첫 조회 500', key: 'fast', prepare: nth('applications', 1, e500), apps: 1 },
        { name: '첫 조회의 답이 JSON 이 아님', key: 'fast', prepare: nth('applications', 1, notJson), apps: 1 },
        { name: '신청 없음인 학생의 둘째 조회 실패("신청 없음"으로 삼지 않는다)', key: 'noapp', prepare: nth('applications', 2, lost), apps: 2 },
        { name: '자기주도 칸 조회 실패', key: 'fast', prepare: nth('applications', 2, e500) },
        { name: '자기주도 종료일 조회 실패', key: 'spv2ok', prepare: nth('applications', 3, lost) },
        { name: '자기주도 저장표 조회 실패', key: 'spv2ok', prepare: nth('applications', 4, e500) },
        { name: '정지 칸 조회 실패("정지 없음"으로 삼지 않는다)', key: 'paused', prepare: nth('applications', 3, lost) },
        { name: '마감 연장 조회 실패("연장 없음"으로 삼지 않는다)', key: 'std', prepare: nth('tr_deadline_extensions', 1, e500) },
        { name: '환불 칸 조회 실패', key: 'refund', prepare: nth('applications', 4, lost) },
    ];
    for (const k of cases) {
        const label = `확인 실패 › ${k.name}`;
        const { w, tab, page } = await newLogin(mutate, k.key, { prepare: k.prepare });
        c.ok(lastMessage(page) === MSG.checkFailed, `${label}: "확인 실패(다시 시도)"가 아님(${lastMessage(page)})`);
        c.ok(page.evaluate('trLoginV2.result()') === 'check_failed', `${label}: 결과 이름이 check_failed 가 아님`);
        c.ok(nothingShown(tab, page), `${label}: 화면을 열었거나 currentUser 를 만듦`);
        if (k.apps) c.ok(w.rest.log.filter((e) => e.table === 'applications').length === k.apps, `${label}: 실패한 뒤 다음 조회로 넘어감`);
        c.ok(st(page) === 'signed_in', `${label}: 로그인 확인 상태가 달라짐(${st(page)})`);
        audit(w, c, label);
        // 다시 시도(같은 버튼): 이번에는 된다
        w.rest.faults.length = 0;
        await w.submit(page, emailOf(k.key), AUTH_PW);
        if (k.key === 'noapp') c.ok(lastMessage(page) === MSG.noApp, `${label} › 다시 시도: 유효한 0건인데 "신청 없음"이 아님`);
        else c.ok(lastScreen(page) === 'scheduleScreen' && tab.session.has('currentUser'), `${label} › 다시 시도: 들어가지 못함(${lastMessage(page)})`);
    }
    // 유효한 0건은 실패가 아니다
    {
        const { tab, page } = await newLogin(mutate, 'fast');
        const u = JSON.parse(tab.session.get('currentUser') || '{}');
        c.ok(lastScreen(page) === 'scheduleScreen' && Array.isArray(u.deadlineExtensions) && u.deadlineExtensions.length === 0 && u.scheduleSyncOk === true, '유효한 0건(연장 없음): 실패로 봄');
    }
    // 인증률 확정의 읽기 실패: 화면은 열리지만 "밀린 것 없음"으로 삼지 않는다
    {
        const { w, page } = await newLogin(mutate, 'fast', { prepare: nth('study_results_v3', 1, e500) });
        const plan = planOf(page);
        c.ok(lastScreen(page) === 'scheduleScreen' && plan && plan.authRates === 'failed' && plan.items.every((i) => i.table !== 'study_results_v3'), '인증률 읽기 실패: 계획에 "실패"로 남지 않음');
        audit(w, c, '인증률 읽기 실패');
    }
    return { problems: c.problems, note: `${cases.length}가지 + 유효한 0건 + 인증률 읽기 실패` };
}

// 준비 신호와 늦게 온 응답
async function testReadyGate(mutate) {
    const c = checker();
    const typeIn = (page, key) => { page.byId.studentEmail.value = emailOf(key); page.byId.studentPassword.value = AUTH_PW; page.evaluate('handleLogin')({ preventDefault() {} }); };

    // (1) 새로 고침: 확인(my_site_access)이 끝나기 전에는 아무것도 나오지 않는다 — 표 요청도 0
    {
        const { w, tab } = await newLogin(mutate, 'std');
        const user = tab.session.get('currentUser');
        const release = gateOn(w, 'auth', 'my_site_access');
        const restBefore = w.rest.log.length;
        const page = await w.open(tab, 'index.html', { noIdle: true });
        await w.browser.spin(80);
        c.ok(nothingShown(tab, page), '준비 신호 › 새로 고침: 다시 확인하기 전에 표시·currentUser 가 나옴');
        c.ok(w.rest.log.length === restBefore, '준비 신호 › 새로 고침: 다시 확인하기 전에 표 요청을 보냄');
        c.ok(!page.trace.some((e) => e.t === 'event' && e.type === 'authReady'), '준비 신호 › 새로 고침: authReady 가 나옴');
        c.ok(count(w, R.access) === 2, '준비 신호 › 새로 고침: 시험이 확인 요청을 붙잡지 못함');
        release();
        await w.browser.advance(1500);
        c.ok(lastScreen(page) === 'scheduleScreen' && tab.session.get('currentUser') === user, '준비 신호 › 새로 고침: 확인 뒤 화면이 열리지 않음');
        audit(w, c, '준비 신호 › 새로 고침');
    }
    // (2) 새로 고침: 수강 조회가 끝나기 전에도 아무것도 나오지 않는다
    {
        const { w, tab } = await newLogin(mutate, 'std');
        const release = gateOn(w, 'rest', 'applications');
        const page = await w.open(tab, 'index.html', { noIdle: true });
        await w.browser.spin(120);
        c.ok(st(page) === 'signed_in' && nothingShown(tab, page), `준비 신호 › 수강 조회 중: 조회가 끝나기 전에 표시·currentUser 가 나옴(${st(page)})`);
        release();
        await w.browser.advance(1500);
        c.ok(lastScreen(page) === 'scheduleScreen', '준비 신호 › 수강 조회 중: 조회 뒤 화면이 열리지 않음');
    }
    // (3) 수강 조회의 답을 기다리는 사이 로그아웃 → 늦게 온 답을 반영하지 않는다
    {
        const w = makeWorld({ variant: V.ON, mutate });
        const tab = w.tab('A');
        const page = await w.open(tab, 'index.html');
        const release = gateOn(w, 'rest', 'applications');
        typeIn(page, 'fast');
        await w.browser.spin(120);
        c.ok(st(page) === 'signed_in' && nothingShown(tab, page), '늦은 응답 › 시험이 "조회 중"을 만들지 못함');
        page.evaluate('EonAuth.signOut()');
        await w.browser.spin(120);
        release();
        await w.browser.advance(3000);
        c.ok(st(page) === 'signed_out' && nothingShown(tab, page), `늦은 응답 › 로그아웃 뒤에 온 수강 조회의 답을 반영함(${st(page)}·${lastScreen(page)})`);
        audit(w, c, '늦은 응답 › 로그아웃');
    }
    // (4) 수강 조회의 답을 기다리는 사이 이 탭의 로그인이 다른 계정으로 바뀜 → 앞 계정의 답을 반영하지 않는다
    {
        const w = makeWorld({ variant: V.ON, mutate });
        const tab = w.tab('A');
        const page = await w.open(tab, 'index.html');
        const release = gateOn(w, 'rest', 'applications');
        typeIn(page, 'fast');
        await w.browser.spin(120);
        const sB = w.auth.createSession(emailOf('std'));
        tab.session.set('tr_auth_v1', JSON.stringify(w.auth.tokenBody(sB)));
        release();
        await w.browser.advance(3000);
        const cu = tab.session.get('currentUser');
        c.ok(!cu || JSON.parse(cu).id !== memberIdOf('fast'), '늦은 응답 › 계정이 바뀐 뒤에 앞 계정의 currentUser 를 만듦');
        c.ok(!screens(page).some((s) => s.user && JSON.parse(s.user).id === memberIdOf('fast')), '늦은 응답 › 계정이 바뀐 뒤에 앞 계정의 일정 화면을 엶');
        c.ok(w.rest.writes.length === 0, '늦은 응답 › 계정이 바뀐 뒤에 쓰기를 보냄');
    }
    // (5) 환영 안내 뒤 1.2초 안에 로그아웃 → 타이머가 일정 화면을 열지 않는다
    {
        const { w, tab, page } = await newLogin(mutate, 'fast', { wait: 0 });
        c.ok(ready(page) === true && !hasSchedule(page), '늦은 타이머 › 시험이 "환영 안내 직후"를 만들지 못함');
        page.evaluate('logout()');
        await w.browser.advance(3000);
        c.ok(!hasSchedule(page) && !tab.session.has('currentUser') && lastScreen(page) === 'loginScreen', '늦은 타이머 › 로그아웃 뒤에 일정 화면을 엶');
    }
    // (6) 새로 고침했더니 로그인 기록이 끝나 있음 → 로그인 화면, 표 요청 0(공개 키로 떨어지지 않음)
    {
        const { w, tab } = await newLogin(mutate, 'std');
        for (const s of w.auth.sessions.values()) w.auth.endSession(s, 'session_expired');
        const restBefore = w.rest.log.length;
        const page = await w.open(tab, 'index.html');
        await w.browser.advance(3000);
        c.ok(st(page) === 'rejected' && why(page) === 'expired' && lastMessage(page) === MSG.ended, `거절 › 끝난 로그인 기록: rejected·expired·안내가 아님(${st(page)}·${why(page)}·${lastMessage(page)})`);
        c.ok(nothingShown(tab, page) && w.rest.log.length === restBefore, '거절 › 끝난 로그인 기록: 표시가 나오거나 표 요청을 보냄(공개 키로 떨어짐)');
        c.ok(!tab.session.has('tr_auth_v1') && count(w, R.refresh) === 1, '거절 › 끝난 로그인 기록: 이 탭의 로그인을 지우지 않았거나 갱신이 한 번이 아님');
        audit(w, c, '거절 › 끝난 로그인 기록');
    }
    // (7) 새로 고침했더니 확인의 답을 받지 못함 → 모름: 로그인 화면, 로그인 기록은 그대로, 표 요청 0
    {
        const { w, tab } = await newLogin(mutate, 'std');
        w.auth.faults.my_profile = () => 'network';
        const restBefore = w.rest.log.length;
        const page = await w.open(tab, 'index.html');
        await w.browser.advance(3000);
        c.ok(st(page) === 'rejected' && why(page) === 'network' && nothingShown(tab, page) && w.rest.log.length === restBefore, `거절 › 확인의 답 없음: rejected·network·표시 0 이 아님(${st(page)}·${why(page)})`);
        c.ok(tab.session.has('tr_auth_v1') && count(w, R.logout) === 0, '거절 › 확인의 답 없음: 모르는 결과로 로그인을 지움');
    }
    // (8) 화면이 열린 뒤 로그인 기록이 끝남(갱신이 거절됨) → 이 탭의 표시를 거둔다
    {
        const { w, tab, page } = await newLogin(mutate, 'std');
        for (const s of w.auth.sessions.values()) w.auth.endSession(s, 'session_expired');
        await w.browser.advance(1.2 * HOURS);
        c.ok(st(page) !== 'signed_in' && lastScreen(page) === 'loginScreen' && page.evaluate('currentUser') === null && !tab.session.has('currentUser') && ready(page) === false, `거절 › 화면이 열린 뒤 끝남: 표시를 거두지 않음(${st(page)}·${why(page)}·${lastScreen(page)})`);
        audit(w, c, '거절 › 화면이 열린 뒤 끝남');
    }
    return { problems: c.problems, note: '새로 고침의 확인 전·수강 조회 전, 늦은 응답 둘, 늦은 타이머, 거절 셋' };
}

// 로그아웃
async function testLogout(mutate) {
    const c = checker();
    {
        const { w, tab, page } = await newLogin(mutate, 'std');
        tab.session.set('courseMode', 'practice');
        tab.session.set('zz_other_key', 'keep');
        page.evaluate('logout()');
        await w.browser.advance(1000);
        c.ok(count(w, R.logout) === 1 && [...w.auth.sessions.values()].every((s) => !s.alive), '로그아웃: 종료 요청이 한 번이 아니거나 서버의 로그인 기록이 남음');
        c.ok(st(page) === 'signed_out' && lastScreen(page) === 'loginScreen' && page.evaluate('currentUser') === null, `로그아웃: 로그인 화면·signed_out 이 아님(${st(page)})`);
        c.ok(JSON.stringify(Object.keys(sessionOf(tab))) === JSON.stringify(['zz_other_key']), `로그아웃: 이 탭에 남은 값이 기대와 다름(${Object.keys(sessionOf(tab)).join(',')})`);
        c.ok(page.trace.some((e) => e.t === 'form-reset') && page.trace.some((e) => e.t === 'confirm'), '로그아웃: 확인 창·폼 초기화가 없음');
        c.ok(!w.browser.local.get('tr_auth_v1:claims') || w.browser.local.get('tr_auth_v1:claims') === '{}', '로그아웃: 차례표에 끝난 로그인 기록이 남음');
        audit(w, c, '로그아웃');
        // 다시 로그인(다른 계정)
        await w.submit(page, emailOf('fast'), AUTH_PW);
        c.ok(lastScreen(page) === 'scheduleScreen' && JSON.parse(tab.session.get('currentUser') || '{}').id === memberIdOf('fast'), '로그아웃 뒤 다른 계정 로그인: 들어가지 못함');
    }
    // 취소
    {
        const { w, tab, page } = await newLogin(mutate, 'std');
        page.confirmAnswer = false;
        page.evaluate('logout()');
        await w.browser.advance(1000);
        c.ok(count(w, R.logout) === 0 && st(page) === 'signed_in' && tab.session.has('currentUser') && lastScreen(page) === 'scheduleScreen', '로그아웃 취소: 무언가 바뀜');
    }
    // 답을 모름: 끝냈다고 하지 않는다 — 표시는 거두고, 서버의 기록·저장된 로그인은 그대로, 다시 보내지 않는다
    for (const [name, fault] of [['응답 없음', () => 'network'], ['5xx', () => ({ status: 500, headers: {}, body: '{}' })], ['429', () => ({ status: 429, headers: {}, body: '{}' })]]) {
        const { w, tab, page } = await newLogin(mutate, 'std');
        w.auth.faults.logout = fault;
        const stored = tab.session.get('tr_auth_v1');
        page.evaluate('logout()');
        await w.browser.advance(40 * 1000);
        const label = `로그아웃 모름(${name})`;
        c.ok(st(page) === 'rejected' && why(page) === 'logout_unknown' && lastMessage(page) === MSG.logoutUnknown && page.byId.loginMessage.style.display === 'block', `${label}: rejected·logout_unknown·안내가 아님(${st(page)}·${why(page)}·${lastMessage(page)}·${page.byId.loginMessage.style.display})`);
        c.ok(lastScreen(page) === 'loginScreen' && page.evaluate('currentUser') === null && !tab.session.has('currentUser') && page.evaluate('EonAuth.profile()') === null, `${label}: 표시를 거두지 않음`);
        c.ok(tab.session.get('tr_auth_v1') === stored && [...w.auth.sessions.values()].some((s) => s.alive), `${label}: 저장된 로그인·서버의 기록을 지움`);
        c.ok(count(w, R.logout) === 1, `${label}: 종료 요청을 다시 보냄(${count(w, R.logout)}번)`);
        audit(w, c, label);
    }
    return { problems: c.problems, note: '끝남·취소·모름 셋·재로그인' };
}

// 새 창·탭 복제·되살린 탭·다른 화면에 다녀온 탭: 이 문서의 것임을 보일 수 없는 보관값은 쓰지 않는다(다시 로그인)
async function testWindows(mutate) {
    const c = checker();
    const fromPage = (w, name) => w.auth.log.filter((e) => e.page === name);
    const refreshesOf = (w) => w.auth.log.filter((e) => e.route + e.search === R.refresh);
    const refreshOf = (stored) => { try { return JSON.parse(stored).refresh_token; } catch (e) { return null; } };
    const sidOf = (stored) => { try { return JSON.parse(Buffer.from(JSON.parse(stored).access_token.split('.')[1], 'base64url').toString('utf8')).session_id; } catch (e) { return null; } };

    // 보일 수 없는 값을 든 문서가 연 화면: 복사된 자격의 사용 0·확인 0·갱신 0·자동 진입 0, 그 탭의 사본은 지워지고 로그인 화면
    //   (그 값의 갱신값·JWT 가 실린 요청이 어디로도 나가지 않았는가까지 본다)
    function unusedCopy(label, w, T, page, stored, mark) {
        c.ok(st(page) === 'signed_out' && why(page) === 'window_unproven', `${label}: 다시 로그인으로 끝나지 않음(${st(page)}·${why(page)})`);
        const sent = w.auth.log.slice(mark.at).filter((e) => e.page === page.name);
        c.ok(sent.length === 0, `${label}: 그 문서가 인증 요청을 보냄(${sent.map((e) => e.route).join(',')})`);
        const rt = refreshOf(stored);
        const jwt = (() => { try { return JSON.parse(stored).access_token; } catch (e) { return null; } })();
        const carried = w.browser.requests.filter((r) => r.page === page.name && r.n > mark.n && ((rt && String(r.bodyText || '').includes(rt)) || (jwt && r.headers.some(([, v]) => String(v).includes(jwt)))));
        c.ok(!!rt && !!jwt && carried.length === 0, `${label}: 복사된 갱신값·JWT 가 실린 요청이 나감(${carried.length}건)`);
        c.ok(!T.session.has('tr_auth_v1') && !T.session.has('tr_auth_v1:holder') && !T.session.has('tr_auth_v1:user') && !T.session.has('currentUser'), `${label}: 그 탭의 사본을 지우지 않음`);
        c.ok(!hasSchedule(page) && lastScreen(page) === 'loginScreen' && lastMessage(page) === MSG.unproven && ready(page) === false && page.evaluate('currentUser') === null, `${label}: 옛 로그인으로 자동 진입했거나 안내가 다름(${lastMessage(page)})`);
        c.ok(!page.trace.some((e) => e.t === 'event' && e.type === 'authReady'), `${label}: authReady 를 알림`);
        // 공식 클라이언트는 사본을 지운 뒤에만 만든다(그 전에 SDK 를 받지 않는다)
        const removed = T.sessionLog.find((e) => e.op === 'remove' && e.key === 'tr_auth_v1' && e.n > mark.n);
        const sdk = page.trace.find((e) => e.t === 'script');
        c.ok(!!removed && (!sdk || sdk.n > removed.n), `${label}: 사본을 지우기 전에 클라이언트를 만들려고 SDK 를 받음`);
    }
    // 그때의 자리: 요청·저장소 기록의 차례(n)와 인증 서버 기록의 자리(at)
    const markOf = (w) => ({ n: w.browser.seq, at: w.auth.log.length });
    const authSince = (w, m, name) => w.auth.log.slice(m.at).filter((e) => !name || e.page === name);

    // ---- 1. 살아 있는 원래 문서가 쥔 채로 복사된 값(새 창 다섯 × 잠금 유무)
    const copies = [
        ['이름 있는 창(omrCard)', (w, A) => w.browser.windowOpen(A, 'C', 'omrCard')],
        ['_blank', (w, A) => w.browser.windowOpen(A, 'C', '_blank')],
        ['about:blank 뒤 이동', (w, A) => w.browser.windowOpen(A, 'C', '_blank')],
        ['탭 복제', (w, A) => w.browser.duplicate(A, 'C')],
        ['연 창이 닫힌 뒤의 새 창', (w, A) => { const t = w.browser.windowOpen(A, 'C', 'omrCard'); t.opener = null; return t; }],
    ];
    for (const locks of [true, false]) {
        for (const [name, make] of copies) {
            const label = `새 창 › ${name}${locks ? '' : '(잠금을 쓸 수 없는 브라우저)'}`;
            const { w, tab: A, page: pa } = await newLogin(mutate, 'std', { locks });
            const storedA = A.session.get('tr_auth_v1');
            const userA = A.session.get('currentUser');
            await w.browser.advance(1000);
            const C = make(w, A);
            c.ok(typeof storedA === 'string' && C.session.get('tr_auth_v1') === storedA, `${label}: 시험이 보관값을 복사하지 못함`);
            const m = markOf(w);
            const pc = await w.open(C, 'index.html', { locks });
            await w.browser.advance(2000);
            c.ok(authSince(w, m, 'C').length === 0, `${label}: 복사된 자격으로 요청을 보냄(${authSince(w, m, 'C').map((e) => e.route).join(',')})`);
            unusedCopy(label, w, C, pc, storedA, m);
            // 원래 창은 그대로: 로그인·currentUser·작성 중 값, 그리고 갱신은 원래 창만 한다
            A.session.set('zz_draft_answer', '작성 중');
            await w.browser.advance(2.2 * HOURS);
            c.ok(st(pa) === 'signed_in' && A.session.get('currentUser') === userA && A.session.get('zz_draft_answer') === '작성 중', `${label}: 원래 창의 로그인·작성 중 값이 달라짐(${st(pa)}·${why(pa)})`);
            const refreshes = refreshesOf(w);
            c.ok(refreshes.length >= 2 && refreshes.every((e) => e.page === 'A'), `${label}: 갱신을 원래 창만 하지 않음(전체 ${refreshes.length}번·새 창 ${refreshes.filter((e) => e.page !== 'A').length}번)`);
            c.ok([...w.auth.sessions.values()].filter((s) => s.alive).length === 1 && A.session.get('tr_auth_v1') !== storedA, `${label}: 원래 창의 갱신이 되지 않음`);
            audit(w, c, label);
        }
    }

    // ---- 2. 모듈을 싣지 않는 화면에 있는 동안 복사된 값(쥠 표식이 "놓음"·창 이름·차례표가 전부 맞는 사본)
    //         복제본이 먼저 돌아오든 원본이 먼저 돌아오든, 잠금이 있든 없든: 어느 쪽도 이어받지 않는다(가를 근거가 없다)
    for (const locks of [true, false]) {
        for (const first of ['복제본', '원본']) {
            const label = `다른 화면에서 복제된 탭 › ${first}이 먼저 돌아옴${locks ? '' : '(잠금을 쓸 수 없는 브라우저)'}`;
            const { w, tab: A } = await newLogin(mutate, 'std', { locks });
            const storedA = A.session.get('tr_auth_v1');
            await w.open(A, 'book.html');
            await w.browser.advance(30 * 1000);
            const C = w.browser.duplicate(A, 'C');
            await w.open(C, 'book.html');
            await w.browser.advance(5 * 1000);
            const m = markOf(w);
            const order = first === '복제본' ? [C, A] : [A, C];
            const p1 = await w.open(order[0], 'index.html', { locks });
            await w.browser.advance(2000);
            unusedCopy(`${label} › 먼저 온 쪽`, w, order[0], p1, storedA, m);
            const p2 = await w.open(order[1], 'index.html', { locks });
            await w.browser.advance(2000);
            unusedCopy(`${label} › 나중에 온 쪽`, w, order[1], p2, storedA, m);
            await w.browser.advance(2.2 * HOURS);
            c.ok(w.auth.log.slice(m.at).length === 0, `${label}: 돌아온 뒤 그 로그인으로 요청을 보냄(갱신 포함 ${w.auth.log.slice(m.at).length}건)`);
            audit(w, c, label);
        }
    }
    // 연 창·이름만 다른 창(모듈을 싣지 않는 화면에서 열린 것)도 같다
    for (const [name, make] of [
        ['연 창(이름까지 같게 만든 경우)', (w, A) => w.browser.newTab('C', { session: A.session, windowName: A.windowName, opener: A })],
        ['다른 화면에서 연 창, 연 창은 닫힘(창 이름만 다르다)', (w, A) => w.browser.newTab('C', { session: A.session, windowName: 'omrCard', opener: null })],
        ['다른 화면에서 연 _blank 창, 연 창은 닫힘(창 이름이 비어 있다)', (w, A) => w.browser.newTab('C', { session: A.session, windowName: '', opener: null })],
    ]) {
        const { w, tab: A } = await newLogin(mutate, 'std');
        const storedA = A.session.get('tr_auth_v1');
        await w.open(A, 'book.html');
        await w.browser.advance(3000);
        const C = make(w, A);
        const m = markOf(w);
        const pc = await w.open(C, 'index.html');
        await w.browser.advance(2000);
        unusedCopy(`새 창 › ${name}`, w, C, pc, storedA, m);
    }

    // ---- 3. 원본이 절전 중(대답하지 않는다 — 타이머도 돌지 않는다)인 동안의 복제본: 원본의 대답에 기대지 않고 쓰지 않는다
    {
        const label = '원본이 절전 중인 동안의 복제본';
        const { w, tab: A, page: pa } = await newLogin(mutate, 'std');
        const storedA = A.session.get('tr_auth_v1');
        pa.closed = true;                                    // 얼어 있다: pagehide 없음, 타이머·응답 없음(쥠 표식은 "쥠"인 채)
        await w.browser.advance(10 * 60 * 1000);
        const C = w.browser.duplicate(A, 'C');
        const m = markOf(w);
        const pc = await w.open(C, 'index.html');
        await w.browser.advance(2000);
        unusedCopy(label, w, C, pc, storedA, m);
        await w.browser.advance(2.2 * HOURS);
        c.ok(w.auth.log.slice(m.at).length === 0, `${label}: 복제본이 그 로그인으로 요청을 보냄(갱신 포함)`);
        audit(w, c, label);
    }

    // ---- 4. 닫은 탭을 되살린 경우(탭 단위 저장값·창 이름이 되살아난다): 쓰지 않는다. 닫자마자(0.3초 뒤) 되살려도 같다
    for (const gap of [300, 5000, 2 * HOURS]) {
        const label = `닫은 탭 복원(${gap}ms 뒤)`;
        const { w, tab: A } = await newLogin(mutate, 'std');
        const storedA = A.session.get('tr_auth_v1');
        A.close();
        await w.browser.advance(gap);
        const restored = w.browser.duplicate(A, 'R');
        const m = markOf(w);
        const page = await w.open(restored, 'index.html');
        await w.browser.advance(2000);
        unusedCopy(label, w, restored, page, storedA, m);
        await w.browser.advance(2.2 * HOURS);
        c.ok(w.auth.log.slice(m.at).length === 0, `${label}: 되살린 탭이 그 로그인으로 요청을 보냄(갱신 포함)`);
        audit(w, c, label);
    }

    // ---- 5. 같은 탭에서 바로 앞 문서를 갈아 낀 문서(새로 고침): 이어받는다 — 갱신도 된다
    for (const locks of [true, false]) {
        const label = `같은 탭의 새로 고침${locks ? '' : '(잠금을 쓸 수 없는 브라우저)'}`;
        const { w, tab: A } = await newLogin(mutate, 'std', { locks });
        const userA = A.session.get('currentUser');
        await w.browser.advance(40 * 1000);
        let page = await w.open(A, 'index.html', { locks });
        await w.browser.advance(2000);
        c.ok(st(page) === 'signed_in' && lastScreen(page) === 'scheduleScreen' && A.session.get('currentUser') === userA, `${label}: 이어받지 못함(${st(page)}·${why(page)})`);
        page = await w.open(A, 'index.html', { locks });           // 한 번 더
        await w.browser.advance(2000);
        c.ok(st(page) === 'signed_in', `${label}(두 번째): 이어받지 못함(${st(page)}·${why(page)})`);
        await w.browser.advance(1.2 * HOURS);
        c.ok(st(page) === 'signed_in' && count(w, R.refresh) >= 1 && [...w.auth.sessions.values()].some((s) => s.alive && s.prevRefresh !== null), `${label}: 갱신이 되지 않음`);
        audit(w, c, label);
    }
    // 새로 고침인데 탐색이 시작된 시각을 주지 않는 브라우저: 보일 수 없다 → 다시 로그인
    {
        const { w, tab: A } = await newLogin(mutate, 'std');
        const storedA = A.session.get('tr_auth_v1');
        await w.browser.advance(1000);
        const m = markOf(w);
        const page = await w.open(A, 'index.html', { noTimeOrigin: true });
        await w.browser.advance(2000);
        unusedCopy('탐색이 시작된 시각을 주지 않는 브라우저의 새로 고침', w, A, page, storedA, m);
    }

    // ---- 6. 같은 탭이 모듈을 싣지 않는 화면에 다녀옴: 복제된 탭과 가를 근거가 없다 → 다시 로그인(그 화면에서 로그인하면 된다)
    {
        const label = '같은 탭이 다른 화면에 다녀옴';
        const { w, tab: A } = await newLogin(mutate, 'std');
        const storedA = A.session.get('tr_auth_v1');
        const sidA = sidOf(storedA);
        await w.open(A, 'book.html');
        await w.browser.advance(60 * 1000);
        const m = markOf(w);
        const page = await w.open(A, 'index.html');
        await w.browser.advance(2000);
        unusedCopy(label, w, A, page, storedA, m);
        // 그 화면에서 다시 로그인: 새 로그인 기록으로 들어간다(앞의 기록은 쓰지 않는다 — 서버에 남는다)
        await w.submit(page, emailOf('std'), AUTH_PW);
        const sidB = sidOf(A.session.get('tr_auth_v1'));
        c.ok(st(page) === 'signed_in' && lastScreen(page) === 'scheduleScreen' && !!sidB && sidB !== sidA, `${label} › 다시 로그인: 들어가지 못했거나 앞의 기록을 씀(${st(page)}·${why(page)})`);
        const after = w.auth.log.slice(m.at);
        c.ok(after.filter((e) => e.route + e.search === R.login).length === 1 && after.every((e) => e.route + e.search !== R.refresh && e.route + e.search !== R.logout), `${label} › 다시 로그인: 로그인 1번 말고 갱신·종료를 보냄`);
        // 다시 로그인한 뒤의 새로 고침은 이어받는다
        const p2 = await w.open(A, 'index.html');
        await w.browser.advance(2000);
        c.ok(st(p2) === 'signed_in', `${label} › 다시 로그인한 뒤의 새로 고침: 이어받지 못함(${st(p2)}·${why(p2)})`);
        audit(w, c, label);
    }

    // ---- 7. 같은 문서가 되살아남(뒤로 가기로 브라우저가 보관해 둔 화면): 메모리로 보인다 → 이어받고 다시 확인한다
    {
        const label = '보관됐다가 되살아난 같은 문서';
        const { w, tab: A, page } = await newLogin(mutate, 'std');
        const storedA = A.session.get('tr_auth_v1');
        page.dispatchWindow('pagehide', { persisted: true });          // 보관된다(문서는 살아 있다)
        await w.browser.advance(60 * 1000);
        // 그 사이(쥠 표식이 "놓음"인 동안) 복제된 탭이 먼저 첫 화면을 연다: 쓰지 않는다
        const C = w.browser.duplicate(A, 'C');
        const m = markOf(w);
        const pc = await w.open(C, 'index.html');
        await w.browser.advance(2000);
        unusedCopy(`${label} › 그 사이의 복제본`, w, C, pc, storedA, m);
        const before = w.auth.log.length;
        page.dispatchWindow('pageshow', { persisted: true });
        await w.browser.advance(3000);
        c.ok(st(page) === 'signed_in' && lastScreen(page) === 'scheduleScreen' && A.session.get('tr_auth_v1') === storedA, `${label}: 이어받지 못함(${st(page)}·${why(page)})`);
        const again = w.auth.log.slice(before);
        c.ok(again.filter((e) => e.route + e.search === R.profile).length === 1 && again.every((e) => e.page === 'A'), `${label}: 다시 확인을 한 번 하지 않음`);
        await w.browser.advance(1.2 * HOURS);
        c.ok(st(page) === 'signed_in' && refreshesOf(w).length >= 1 && refreshesOf(w).every((e) => e.page === 'A'), `${label}: 갱신이 되지 않거나 다른 문서가 갱신함`);
        audit(w, c, label);
    }
    // 되살아났는데 그 사이 이 탭의 보관값을 다른 문서가 쥐었다(메모리와 다르다): 쓰지 않는다
    {
        const { w, tab: A, page } = await newLogin(mutate, 'std');
        page.dispatchWindow('pagehide', { persisted: true });
        const h = JSON.parse(A.session.get('tr_auth_v1:holder'));
        A.session.set('tr_auth_v1:holder', JSON.stringify(Object.assign({}, h, { doc: 'zz-another-document' })));
        const before = w.auth.log.length;
        page.dispatchWindow('pageshow', { persisted: true });
        await w.browser.advance(3000);
        c.ok(st(page) === 'off' && why(page) === 'foreign_window' && w.auth.log.length === before && !A.session.has('tr_auth_v1') && lastScreen(page) === 'loginScreen', `되살아난 문서(다른 문서가 쥔 값): 쓰지 않는 쪽이 아님(${st(page)}·${why(page)})`);
    }

    // ---- 8. 이름 있는 창의 재사용: 처음 복사된 값이 그대로 남은 창에 다시 화면을 연다
    {
        const { w, tab: A } = await newLogin(mutate, 'std');
        const storedA = A.session.get('tr_auth_v1');
        const C = w.browser.windowOpen(A, 'C', 'omrCard');
        await w.open(C, 'book.html');                    // 모듈을 싣지 않는 화면(답안 카드 구실): 복사된 값이 그대로 남는다
        await w.browser.advance(2.2 * HOURS);            // 그 사이 원래 창은 갱신한다
        const m = markOf(w);
        const pc = await w.open(C, 'index.html');
        await w.browser.advance(2000);
        unusedCopy('새 창 › 이름 있는 창의 재사용', w, C, pc, storedA, m);
    }

    // ---- 9. 새 창의 화면·요청은 기준과 같다(모듈을 싣지 않는 화면 — 복사된 currentUser 를 지금처럼 읽고 공개 키로 요청한다)
    {
        const { w, tab: A } = await newLogin(mutate, 'std');
        const userA = A.session.get('currentUser');
        const C = w.browser.windowOpen(A, 'C', '_blank');
        const before = w.browser.requests.length;
        const pc = await w.open(C, 'book.html');
        await w.browser.advance(2000);
        const got = w.browser.requests.slice(before).filter((r) => r.page === 'C');
        // 기준: 같은 currentUser 가 저장된 탭에서 같은 화면
        const o = makeWorld({ variant: V.BASE });
        const T = o.tab('C');
        T.session.set('currentUser', userA);
        const po = await o.open(T, 'book.html');
        await o.browser.advance(2000);
        const shape = (list) => list.map((r) => { const s = shapeOf(r); return [s.method, s.path, s.body, s.headers.map((h) => h.split(':')[0]).join(',')]; });
        c.ok(JSON.stringify(shape(got)) === JSON.stringify(shape(o.browser.requests)), `새 창의 화면(모듈을 싣지 않는 화면): 요청이 기준과 다름(${got.length}건·기준 ${o.browser.requests.length}건)`);
        c.ok(got.length > 0 && got.every((r) => credOf(r, FAKE_ANON) === 'anon'), '새 창의 화면: 공개 키가 아닌 자격을 씀');
        const tr = (p) => p.trace.filter((e) => ['event', 'nav', 'alert', 'screen'].includes(e.t)).map((e) => [e.t, e.type || e.to || e.id]);
        c.ok(JSON.stringify(tr(pc)) === JSON.stringify(tr(po)), '새 창의 화면: 화면 동작이 기준과 다름');
        c.ok(C.session.get('tr_auth_v1') === A.session.get('tr_auth_v1'), '새 창의 화면: 모듈을 싣지 않는 화면인데 복사된 보관값이 바뀜');
    }

    // ---- 10. 보일 수 없는 창에서 다시 로그인: 그 창의 새 로그인일 뿐이다 — 원래 창의 로그인·갱신은 그대로
    {
        const label = '복제된 탭에서 다시 로그인';
        const { w, tab: A, page: pa } = await newLogin(mutate, 'std');
        const storedA = A.session.get('tr_auth_v1');
        await w.browser.advance(1000);
        const C = w.browser.duplicate(A, 'C');
        const pc = await w.open(C, 'index.html');
        await w.browser.advance(2000);
        await w.submit(pc, emailOf('fast'), AUTH_PW);
        const sidC = sidOf(C.session.get('tr_auth_v1'));
        c.ok(st(pc) === 'signed_in' && !!sidC && sidC !== sidOf(storedA) && JSON.parse(C.session.get('currentUser')).id === memberIdOf('fast'), `${label}: 그 창의 새 로그인이 되지 않음(${st(pc)}·${why(pc)})`);
        await w.browser.advance(2.2 * HOURS);
        const alive = [...w.auth.sessions.values()].filter((s) => s.alive);
        c.ok(st(pa) === 'signed_in' && st(pc) === 'signed_in' && alive.length === 2 && alive.every((s) => s.prevRefresh !== null), `${label}: 두 창의 로그인이 서로를 막음(${st(pa)}·${st(pc)}·살아 있는 기록 ${alive.length})`);
        audit(w, c, label);
    }

    // ---- 11. 마지막 탭을 닫고 새로 방문: 로그인이 남지 않는다
    {
        const { w, tab: A } = await newLogin(mutate, 'std');
        A.close();
        const before = w.auth.log.length;
        const N = w.tab('N');
        const page = await w.open(N, 'index.html');
        await w.browser.advance(2000);
        c.ok(st(page) === 'signed_out' && why(page) === null && lastScreen(page) === 'loginScreen' && !hasSchedule(page) && Object.keys(sessionOf(N)).length === 0 && w.auth.log.length === before, `마지막 탭을 닫고 새로 방문: 로그인이 남음(${st(page)})`);
    }
    // ---- 12. 앞 문서가 놓지 못하고 사라진 경우(쥠 표식이 "쥠"인 채): 쓰지 않는다
    {
        const { w, tab: A } = await newLogin(mutate, 'std');
        const storedA = A.session.get('tr_auth_v1');
        A.page.closed = true;                 // pagehide 없이 사라짐
        A.page = null;
        const m = markOf(w);
        const p2 = await w.open(A, 'index.html');
        await w.browser.advance(2000);
        unusedCopy('앞 문서가 놓지 못함', w, A, p2, storedA, m);
    }
    // ---- 13. 차례표를 쓸 수 없는 브라우저(브라우저 단위 저장소가 막힘): 로그인은 되지만 다음 화면이 이어받지 못한다(쓰지 않는 쪽)
    {
        const w = makeWorld({ variant: V.ON, mutate });
        const A = w.tab('A');
        const breakLocal = (p) => { p.sandbox.localStorage.getItem = () => { throw new Error('막힘'); }; p.sandbox.localStorage.setItem = () => { throw new Error('막힘'); }; };
        const page = await w.open(A, 'index.html', { beforeLoad: breakLocal });
        await w.submit(page, emailOf('std'), AUTH_PW);
        c.ok(lastScreen(page) === 'scheduleScreen', `차례표를 쓸 수 없음: 로그인이 되지 않음(${lastMessage(page)})`);
        const before = w.auth.log.length;
        const p2 = await w.open(A, 'index.html', { beforeLoad: breakLocal });
        await w.browser.advance(2000);
        c.ok(st(p2) === 'signed_out' && why(p2) === 'window_unproven' && !hasSchedule(p2) && w.auth.log.length === before, `차례표를 쓸 수 없음: 다음 화면이 이어받음(${st(p2)})`);
    }
    // ---- 14. 그 탭의 사본을 지우지 못하는 경우(저장소가 지우기를 받지 않는다): 클라이언트를 만들지 않고 이 화면에서는 로그인도 보내지 않는다
    {
        const { w, tab: A } = await newLogin(mutate, 'std');
        await w.browser.advance(1000);
        const C = w.browser.duplicate(A, 'C');
        const before = w.auth.log.length;
        const pc = await w.open(C, 'index.html', { afterHead: (p) => { p.sandbox.sessionStorage.removeItem = () => {}; } });
        await w.browser.advance(2000);
        c.ok(st(pc) === 'off' && why(pc) === 'foreign_window' && pc.scriptLoads.length === 0 && lastMessage(pc) === MSG.foreign && !hasSchedule(pc), `사본을 지우지 못함: 닫는 쪽이 아님(${st(pc)}·${why(pc)})`);
        await w.submit(pc, emailOf('fast'), AUTH_PW);
        c.ok(w.auth.log.length === before && lastMessage(pc) === MSG.foreign, '사본을 지우지 못함: 그 화면에서 요청을 보냄');
    }
    // ---- 15. 한 겹만 남긴 경우: 놓은 시각까지 맞는 사본(탐색 도중에 복사된 것처럼 시험이 표식을 고친다) — 남은 조건 하나하나가 막는가
    const forge = (w, T, patch) => {
        const h = JSON.parse(T.session.get('tr_auth_v1:holder'));
        T.session.set('tr_auth_v1:holder', JSON.stringify(Object.assign({}, h, { state: 'released', at: w.browser.now }, patch || {})));
    };
    for (const [name, make, patch] of [
        ['연 창', (w, A) => w.browser.newTab('C', { session: A.session, windowName: A.windowName, opener: A }), null],
        ['창 이름', (w, A) => w.browser.newTab('C', { session: A.session, windowName: 'omrCard', opener: null }), null],
        ['쥠 표식', (w, A) => w.browser.duplicate(A, 'C'), { state: 'held' }],
    ]) {
        const { w, tab: A } = await newLogin(mutate, 'std');
        const storedA = A.session.get('tr_auth_v1');
        await w.browser.advance(1000);
        const C = make(w, A);
        forge(w, C, patch);
        const m = markOf(w);
        const pc = await w.open(C, 'index.html');
        await w.browser.advance(2000);
        unusedCopy(`한 겹 › ${name}`, w, C, pc, storedA, m);
    }
    // 차례표: 놓은 시각까지 맞는 같은 값을 든 두 탭 — 둘 다 이어받는 일은 없다(먼저 온 쪽이 차례를 새로 뽑는다)
    for (const locks of [true, false]) {
        const { w, tab: A } = await newLogin(mutate, 'std', { locks });
        await w.open(A, 'book.html');
        await w.browser.advance(3000);
        const C = w.browser.duplicate(A, 'C');
        forge(w, C);
        const p1 = await w.open(C, 'index.html', { locks });
        await w.browser.advance(2000);
        forge(w, A);
        const p2 = await w.open(A, 'index.html', { locks });
        await w.browser.advance(2000);
        c.ok([p1, p2].filter((p) => st(p) === 'signed_in').length <= 1 && st(p2) === 'signed_out' && why(p2) === 'window_unproven', `한 겹 › 차례표${locks ? '' : '(잠금 없음)'}: 같은 값을 든 두 탭이 다 이어받음(${st(p1)}·${st(p2)})`);
    }
    // 같은 순간에 연 두 탭(놓은 시각까지 맞는 값): 둘 다 이어받는 일은 없다
    for (const locks of [true, false]) {
        const { w, tab: A } = await newLogin(mutate, 'std', { locks });
        await w.open(A, 'book.html');
        await w.browser.advance(3000);
        const C = w.browser.duplicate(A, 'C');
        forge(w, C);
        forge(w, A);
        const p1 = await w.open(A, 'index.html', { noIdle: true, locks });
        const p2 = await w.open(C, 'index.html', { noIdle: true, locks });
        await w.browser.advance(3000);
        c.ok([p1, p2].filter((p) => st(p) === 'signed_in').length <= 1, `한 겹 › 차례표 › 같은 순간${locks ? '' : '(잠금 없음)'}: 둘 다 이어받음(${st(p1)}·${st(p2)})`);
    }
    return { problems: c.problems, note: '살아 있는 원본의 사본 다섯 × 잠금 유무, 다른 화면에서의 복제(복제본 먼저·원본 먼저 × 잠금 유무), 절전 중인 원본, 닫은 탭 복원 셋, 새로 고침(이어받음), 다른 화면에 다녀옴(다시 로그인), 되살아난 같은 문서, 재사용, 새 창의 화면 = 기준, 복제본의 새 로그인, 닫고 새 방문, 놓지 못함, 차례표 불가, 지우지 못함, 한 겹만 남긴 경우(연 창·창 이름·쥠 표식·차례표)' };
}

// 켜진 화면인데 인증 모듈이 없다(파일을 받지 못함·꺼짐이라고 답함): 옛 로그인으로 가지 않고 닫는다.
// 새로 고침에서 모듈이 실리기 전에 앞의 currentUser 가 읽혀 쓰이지 않는다.
async function testClosed(mutate) {
    const c = checker();
    const MOD = 'js/auth-session.js';
    const sentry = (calls) => (p) => { p.sandbox.Sentry = { setUser: (u) => { calls.push(u === null ? 'null' : 'user'); } }; };
    const events = (p) => p.trace.filter((e) => e.t === 'event').map((e) => e.type);
    // 닫힌 화면에서 공통으로 보는 것
    function closed(label, w, tab, page, calls, reqBefore) {
        c.ok(lastScreen(page) === 'loginScreen' && !hasSchedule(page) && lastMessage(page) === MSG.unavailable, `${label}: 로그인 화면과 안내가 아님(${lastScreen(page)}·${lastMessage(page)})`);
        c.ok(page.evaluate('currentUser') === null && ready(page) === false, `${label}: currentUser·준비 신호가 섬`);
        c.ok(!events(page).includes('authReady'), `${label}: authReady 를 알림`);
        c.ok(!calls.includes('user'), `${label}: Sentry 에 사용자를 지정함`);
        c.ok(w.browser.requests.length === reqBefore, `${label}: 요청을 보냄(${w.browser.requests.slice(reqBefore).map((r) => new URL(r.url).pathname).join(',')})`);
        c.ok(page.scriptLoads.length === 0, `${label}: SDK 를 받음`);
        c.ok(w.rest.writes.length === 0 && usersReads(w) === 0, `${label}: 옛 길의 요청(회원 표·쓰기)을 보냄`);
    }

    // 1. 첫 방문에서 모듈을 받지 못함 → 닫힘. 로그인 버튼을 눌러도(빈 값·옛 길의 값·맞는 값) 요청 0
    {
        const label = '모듈을 받지 못함 › 첫 방문';
        const w = makeWorld({ variant: V.ON, mutate });
        const tab = w.tab('A');
        const calls = [];
        const page = await w.open(tab, 'index.html', { missing: [MOD], afterHead: sentry(calls) });
        await w.browser.advance(2000);
        closed(label, w, tab, page, calls, 0);
        for (const [email, pw] of [['', ''], [emailOf('std'), LEGACY_PW], [emailOf('std'), AUTH_PW], [emailOf('std'), '999999']]) {
            await w.submit(page, email, pw);
            closed(`${label} › 로그인 버튼`, w, tab, page, calls, 0);
        }
        page.evaluate('logout')();
        await w.browser.advance(500);
        closed(`${label} › 로그아웃 버튼`, w, tab, page, calls, 0);
        c.ok(Object.keys(sessionOf(tab)).length === 0 && w.browser.local.size === 0, `${label}: 저장소에 무엇을 씀`);
    }
    // 2. 새 로그인으로 들어가 있던 탭을 새로 고쳤는데 모듈을 받지 못함: 앞의 currentUser 로 화면·요청이 나가지 않는다
    {
        const label = '모듈을 받지 못함 › 로그인돼 있던 탭의 새로 고침';
        const { w, tab } = await newLogin(mutate, 'std');
        const stored = tab.session.get('tr_auth_v1');
        c.ok(typeof tab.session.get('currentUser') === 'string' && tab.session.has('tr_auth_v1:user'), `${label}: 시험이 앞의 로그인 상태를 만들지 못함`);
        await w.browser.advance(5000);
        const before = w.browser.requests.length;
        const calls = [];
        let seenAfterHead = 'unset';
        const page = await w.open(tab, 'index.html', { missing: [MOD], afterHead: (p) => { seenAfterHead = tab.session.has('currentUser'); sentry(calls)(p); } });
        await w.browser.advance(2000);
        c.ok(seenAfterHead === false, `${label}: 화면 머리의 스크립트가 앞의 currentUser 를 치우지 않음(다른 스크립트가 읽을 수 있다)`);
        closed(label, w, tab, page, calls, before);
        c.ok(!tab.session.has('currentUser'), `${label}: currentUser 가 다시 생김`);
        c.ok(tab.session.get('tr_auth_v1') === stored, `${label}: 저장된 로그인을 건드림(모듈 없이 읽거나 지움)`);
        // 그 뒤 모듈을 받은 새로 고침: 다시 확인을 거쳐 들어간다(닫힌 화면도 같은 탭의 바로 앞 문서였다 — 그 문서는 쥔 적이 없으므로 이어받지 못한다 → 다시 로그인)
        const p2 = await w.open(tab, 'index.html');
        await w.browser.advance(2000);
        c.ok(st(p2) === 'signed_out' && why(p2) === 'window_unproven' && !hasSchedule(p2), `${label} › 그 뒤의 새로 고침: 정해 둔 동작(다시 로그인)과 다름(${st(p2)}·${why(p2)})`);
    }
    // 3. 옛 방식의 currentUser(표식 없음)가 남은 탭 + 모듈을 받지 못함: 그 값으로 복원하지 않는다(값은 건드리지 않는다)
    {
        const label = '모듈을 받지 못함 › 옛 방식의 값이 남은 탭';
        const o = await oldLogin('std');
        const legacyUser = o.tab.session.get('currentUser');
        const w = makeWorld({ variant: V.ON, mutate });
        const tab = w.tab('A');
        tab.session.set('currentUser', legacyUser);
        const calls = [];
        const page = await w.open(tab, 'index.html', { missing: [MOD], afterHead: sentry(calls) });
        await w.browser.advance(2000);
        closed(label, w, tab, page, calls, 0);
        c.ok(tab.session.get('currentUser') === legacyUser, `${label}: 옛 방식의 값을 지우거나 바꿈`);
    }
    // 4. 모듈은 받았는데 꺼짐이라고 답한다(두 스위치가 어긋남 — 화면만 켜짐): 닫힘
    {
        const label = '화면만 켜짐(모듈은 꺼짐)';
        const off = (p, text) => (p === MOD ? text.replace("const EON_AUTH_SWITCH = 'on';", "const EON_AUTH_SWITCH = 'off';") : text);
        const w = makeWorld({ variant: V.ON, mutate: (p, text) => off(p, mutate ? mutate(p, text) : text) });
        const tab = w.tab('A');
        const calls = [];
        const page = await w.open(tab, 'index.html', { afterHead: sentry(calls) });
        await w.browser.advance(2000);
        c.ok(page.evaluate('EonAuth.isOn()') === false, `${label}: 시험이 모듈을 끄지 못함`);
        closed(label, w, tab, page, calls, 0);
        await w.submit(page, emailOf('std'), LEGACY_PW);
        closed(`${label} › 로그인 버튼`, w, tab, page, calls, 0);
    }
    // 5. 모듈만 켜짐(화면은 꺼짐): 모듈은 아무것도 하지 않고 옛 길이 기준 그대로 돈다
    {
        const label = '모듈만 켜짐(화면은 꺼짐)';
        const o = await oldLogin('std');
        const w = makeWorld({ variant: V.ON, mutate: (p, text) => { const t = mutate ? mutate(p, text) : text; return p === 'index.html' ? t.replace("var TR_AUTH_PAGE_SWITCH = 'on';", "var TR_AUTH_PAGE_SWITCH = 'off';") : t; } });
        const tab = w.tab('A');
        const page = await w.open(tab, 'index.html');
        c.ok(page.evaluate('EonAuth.isOn()') === false && page.evaluate('typeof trLoginV2') === 'undefined', `${label}: 인증 모듈·새 길이 켜짐`);
        c.ok(w.auth.log.length === 0 && page.scriptLoads.length === 0 && [...tab.session.keys()].every((k) => !k.startsWith('tr_auth_v1')), `${label}: 인증 모듈이 무엇을 함`);
        c.ok(JSON.stringify(screens(page).map((s) => s.id)) === JSON.stringify(['loginScreen']), `${label}: 로그인 화면이 아님`);
        c.ok(typeof o.tab.session.get('currentUser') === 'string', `${label}: 대조용 옛 길이 들어가지 못함`);
    }
    // 6. 책 전용 상태가 저장된 탭 + 켜진 화면 + 모듈을 받지 못함: 기준 그대로(책 화면으로 보낸다)
    {
        const label = '모듈을 받지 못함 › 책 전용 상태';
        const run = async (variant, opts) => {
            const w = makeWorld({ variant, mutate: variant === V.ON ? mutate : null });
            const tab = w.tab('A');
            tab.session.set('currentUser', JSON.stringify(bookOnly()));
            const page = await w.open(tab, 'index.html', opts);
            await w.browser.advance(1000);
            return page.trace.filter((e) => ['nav', 'screen', 'event'].includes(e.t)).map((e) => [e.t, e.to || e.id || e.type]);
        };
        const base = await run(V.BASE, {});
        const on = await run(V.ON, { missing: [MOD] });
        c.ok(JSON.stringify(base) === JSON.stringify(on) && base.some((e) => e[0] === 'nav'), `${label}: 기준과 다름`);
    }
    // 7. 켜진 화면의 보통 새로 고침(모듈을 받음): 모듈이 실리기 전에 앞의 currentUser 는 이미 치워져 있고, 확인 뒤에 화면이 다시 만든다
    {
        const label = '새로 고침 › 모듈이 실리기 전';
        const { w, tab } = await newLogin(mutate, 'std');
        const user = tab.session.get('currentUser');
        await w.browser.advance(3000);
        let seenAfterHead = 'unset';
        const calls = [];
        const page = await w.open(tab, 'index.html', { noIdle: true, afterHead: (p) => { seenAfterHead = tab.session.has('currentUser'); sentry(calls)(p); } });
        c.ok(seenAfterHead === false, `${label}: 화면 머리의 스크립트가 앞의 currentUser 를 치우지 않음`);
        c.ok(!tab.session.has('currentUser') && !calls.includes('user') && !hasSchedule(page), `${label}: 다시 확인하기 전에 currentUser·Sentry 사용자 지정·일정 화면`);
        await w.browser.advance(2000);
        c.ok(st(page) === 'signed_in' && tab.session.get('currentUser') === user && lastScreen(page) === 'scheduleScreen', `${label}: 확인 뒤에 들어가지 못함(${st(page)}·${why(page)})`);
    }
    return { problems: c.problems, note: '모듈을 받지 못함(첫 방문·로그인돼 있던 탭·옛 방식의 값·책 전용 상태), 두 스위치가 어긋남 둘, 새로 고침에서 모듈이 실리기 전' };
}

// 책 연결·책 전용 상태·옛 방식의 값
async function testBook(mutate) {
    const c = checker();
    const shape = (list) => list.map((r) => { const s = shapeOf(r); return [s.method, s.path, s.body]; });
    const tr = (p) => p.trace.filter((e) => ['event', 'nav', 'alert', 'screen', 'replaceState'].includes(e.t)).map((e) => [e.t, e.type || e.to || e.id || e.url || e.text]);
    const cases = [
        ['책 연결 주소', 'book.html', '?auth_token=zzb3b-token-fast', undefined, bookToken('fast', { confirmed: true })],
        ['책 연결 주소(해설 화면)', 'commentary.html', '?auth_token=zzb3b-token-std', undefined, bookToken('std', { confirmed: false })],
        ['책 연결 주소(없는 값)', 'book.html', '?auth_token=zz-none', undefined, {}],
        ['책 전용 상태로 첫 화면', 'index.html', '', bookOnly('fast'), {}],
        ['책 전용 상태로 책 화면', 'book.html', '', bookOnly('fast'), {}],
        ['책 화면(저장된 값 없음)', 'book.html', '', undefined, {}],
    ];
    for (const [name, pageFile, search, saved, tables] of cases) {
        const run = async (variant, m) => {
            const w = makeWorld({ variant, mutate: m, tables });
            const tab = w.tab('t');
            if (saved) tab.session.set('currentUser', JSON.stringify(saved));
            const page = await w.open(tab, pageFile, { search });
            await w.browser.advance(2000);
            return { w, tab, page };
        };
        const b = await run(V.BASE, null);
        const n = await run(V.ON, mutate);
        const label = `책 › ${name}(켜짐)`;
        c.ok(JSON.stringify(shape(n.w.browser.requests)) === JSON.stringify(shape(b.w.browser.requests)), `${label}: 요청이 기준과 다름`);
        c.ok(JSON.stringify(sessionOf(n.tab)) === JSON.stringify(sessionOf(b.tab)), `${label}: 탭 단위 저장값이 기준과 다름`);
        c.ok(JSON.stringify(tr(n.page)) === JSON.stringify(tr(b.page)), `${label}: 화면 동작이 기준과 다름`);
        c.ok(n.w.auth.log.every((e) => !e.route.includes('/auth/v1/') && !e.route.includes('/rpc/')) && n.w.browser.requests.every((r) => credOf(r, FAKE_ANON) === 'anon'), `${label}: 인증 요청·회원 자격이 있음`);
        c.ok(JSON.stringify(n.w.rest.writes) === JSON.stringify(b.w.rest.writes), `${label}: 쓰기가 기준과 다름`);
    }
    // 한 탭에 일반 로그인(새 길)이 있는데 책 연결 주소로 들어옴: 덮지 않고 기존 값을 보존하고 안내(숨은 재시도 없음)
    {
        const { w, tab } = await newLogin(mutate, 'std', { tables: bookToken('fast', { confirmed: true }) });
        const before = w.rest.log.length;
        const page = await w.open(tab, 'book.html', { search: '?auth_token=zzb3b-token-fast' });
        await w.browser.advance(2000);
        const u = JSON.parse(tab.session.get('currentUser') || '{}');
        c.ok(u.id === memberIdOf('std') && u.programType !== 'book_only', '책 연결과 일반 로그인이 한 탭에: 일반 로그인을 책 상태로 덮음');
        c.ok(page.trace.filter((e) => e.t === 'alert').length === 1, '책 연결과 일반 로그인이 한 탭에: 안내가 한 번이 아님');
        c.ok(w.rest.log.slice(before).every((e) => e.table !== 'tr_auth_tokens') && w.rest.tables.tr_auth_tokens.length === 1, '책 연결과 일반 로그인이 한 탭에: 책 연결의 값을 읽거나 지움');
    }
    // 이 탭에 옛 방식의 값(표식 없음)이 남아 있음: 자동 진입 0, 로그인도 그 값을 덮지 않는다(인증 요청 0)
    {
        const o = await oldLogin('std');
        const legacy = o.tab.session.get('currentUser');
        const w = makeWorld({ variant: V.ON, mutate });
        const tab = w.tab('A');
        tab.session.set('currentUser', legacy);
        const page = await w.open(tab, 'index.html');
        await w.browser.advance(2000);
        c.ok(!hasSchedule(page) && lastScreen(page) === 'loginScreen' && w.rest.log.length === 0 && w.auth.log.length === 0, '옛 방식의 값이 남은 탭: 저장된 currentUser 만 보고 화면을 열었거나 요청을 보냄');
        await w.submit(page, emailOf('fast'), AUTH_PW);
        c.ok(lastMessage(page) === MSG.legacy && w.auth.log.length === 0 && tab.session.get('currentUser') === legacy && !hasSchedule(page), `옛 방식의 값이 남은 탭: 로그인이 그 값을 덮었거나 인증 요청을 보냄(${lastMessage(page)})`);
    }
    return { problems: c.problems, note: `책의 길 ${cases.length}가지(기준과 대조) + 한 탭의 충돌 + 옛 방식의 값` };
}

// 연결점: 등급을 받지 않으면 지금과 같고, 등급을 받으면 인증 모듈에 맡긴다
async function testConnection(mutate) {
    const c = checker();
    const fn = ['supabase', 'Headers'].join('');
    for (const variant of [V.OFF, V.ON]) {
        const w = makeWorld({ variant, mutate });
        const page = await w.open(w.tab('A'), 'index.html');
        const key = variant.test ? FAKE_ANON : PROD.key;
        const plain = page.evaluate(`JSON.stringify(Object.entries(${fn}({ 'Prefer': 'x', 'Zz': '1' })))`);
        c.ok(plain === JSON.stringify([['apikey', key], ['Authorization', 'Bearer ' + key], ['Content-Type', 'application/json'], ['Prefer', 'x'], ['Zz', '1']]), `연결점(${variant.name}): 등급 없는 호출의 결과가 지금과 다름`);
        const anon = page.evaluate(`JSON.stringify(Object.entries(${fn}({ 'Zz': '1' }, 'anon')))`);
        c.ok(anon === JSON.stringify([['apikey', key], ['Authorization', 'Bearer ' + key], ['Content-Type', 'application/json'], ['Zz', '1']]), `연결점(${variant.name}): 익명 등급의 결과가 기대와 다름`);
        for (const [grade, extra] of [['member', '{}'], ['admin', '{}'], ['legacy_own', '{}'], ['zz', '{}'], ['anon', "{ 'Authorization': 'x' }"], ['anon', "{ 'apikey': 'x' }"]]) {
            const r = page.evaluate(`(() => { try { ${fn}(${extra}, '${grade}'); return 'ok'; } catch (e) { return 'error'; } })()`);
            c.ok(r === 'error', `연결점(${variant.name}): ${grade} 등급·자격 덮어쓰기가 오류가 아님(공개 키로 떨어짐)`);
        }
        c.ok(page.evaluate(`typeof window['${fn}']`) === 'undefined', `연결점(${variant.name}): 헤더 함수가 window 에 붙음`);
    }
    return { problems: c.problems, note: '꺼짐·켜짐' };
}

export const TESTS = {
    sameAsOld: testSameAsOld,
    outcomes: testOutcomes,
    failures: testFailures,
    readyGate: testReadyGate,
    logout: testLogout,
    windows: testWindows,
    closed: testClosed,
    book: testBook,
    connection: testConnection,
};
const NAMES = {
    sameAsOld: '[4] 켜짐 › 옛 길과 같은 결과(currentUser·화면·저장 계획 = 옛 길의 실제 쓰기, 쓰기 전송 0)',
    outcomes: '[5] 켜짐 › 들어가지 못하는 경우',
    failures: '[5] 켜짐 › 실패와 "없음"의 구분',
    readyGate: '[6] 켜짐 › 준비 신호·늦게 온 응답',
    logout: '[6] 켜짐 › 로그아웃',
    windows: '[7] 켜짐 › 새 창·탭 복제·되살린 탭·다른 화면에 다녀옴(보일 수 없으면 다시 로그인)',
    closed: '[7] 켜짐 › 켜진 화면인데 모듈이 없음(닫는 쪽)·모듈이 실리기 전',
    book: '[8] 켜짐 › 책 연결·책 전용 상태·옛 방식의 값',
    connection: '[8] 연결점',
};

export async function runAll(mutate) {
    const out = [];
    for (const [key, fn] of Object.entries(TESTS)) {
        let r;
        try { r = await fn(mutate); } catch (e) { r = { problems: [`예외: ${String(e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)}`] }; }
        out.push({ name: NAMES[key], problems: r.problems, note: r.note });
    }
    return out;
}
