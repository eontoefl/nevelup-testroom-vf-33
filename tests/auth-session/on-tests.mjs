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

// 새 창·탭 복제: 복사돼 온 보관값을 쓰지 않는다
async function testWindows(mutate) {
    const c = checker();
    const fromPage = (w, name) => w.auth.log.filter((e) => e.page === name);
    const refreshesOf = (w) => w.auth.log.filter((e) => e.route + e.search === R.refresh);

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
            const C = make(w, A);
            c.ok(typeof storedA === 'string' && C.session.get('tr_auth_v1') === storedA, `${label}: 시험이 보관값을 복사하지 못함`);
            const pc = await w.open(C, 'index.html', { locks });
            await w.browser.advance(2000);
            c.ok(st(pc) === 'off' && why(pc) === 'foreign_window', `${label}: 복사돼 온 값을 버린 화면이 아님(${st(pc)}·${why(pc)})`);
            c.ok(fromPage(w, 'C').length === 0, `${label}: 복사된 자격으로 요청을 보냄(${fromPage(w, 'C').map((e) => e.route).join(',')})`);
            c.ok(pc.scriptLoads.length === 0, `${label}: 복사돼 온 값으로 클라이언트를 만들려고 SDK 를 받음`);
            c.ok(!C.session.has('tr_auth_v1') && !C.session.has('tr_auth_v1:holder') && !C.session.has('currentUser'), `${label}: 그 창의 사본을 지우지 않음`);
            c.ok(!hasSchedule(pc) && lastScreen(pc) === 'loginScreen' && lastMessage(pc) === MSG.foreign && ready(pc) === false, `${label}: 옛 로그인으로 자동 진입했거나 안내가 없음(${lastMessage(pc)})`);
            // 그 창에서 로그인 버튼을 눌러도 이 화면에서는 보내지 않는다
            await w.submit(pc, emailOf('fast'), AUTH_PW);
            c.ok(fromPage(w, 'C').length === 0 && lastMessage(pc) === MSG.foreign, `${label}: 버린 화면에서 로그인 요청을 보냄`);
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

    // 한 가지 근거만 다른 경우들(원래 탭이 모듈을 싣지 않는 화면에 있어 쥠 표식이 "놓음"이고 차례표도 맞는 동안)
    for (const [name, make] of [
        ['연 창(이름까지 같게 만든 경우 — 연 창이라는 것만 다르다)', (w, A) => w.browser.newTab('C', { session: A.session, windowName: A.windowName, opener: A })],
        ['다른 화면에서 연 창, 연 창은 닫힘(창 이름만 다르다)', (w, A) => w.browser.newTab('C', { session: A.session, windowName: 'omrCard', opener: null })],
        ['다른 화면에서 연 _blank 창, 연 창은 닫힘(창 이름이 비어 있다)', (w, A) => w.browser.newTab('C', { session: A.session, windowName: '', opener: null })],
    ]) {
        const { w, tab: A } = await newLogin(mutate, 'std');
        await w.open(A, 'book.html');
        const C = make(w, A);
        const pc = await w.open(C, 'index.html');
        await w.browser.advance(2000);
        c.ok(st(pc) === 'off' && why(pc) === 'foreign_window' && fromPage(w, 'C').filter((e) => e.route.includes('/auth/') || e.route.includes('/rpc/')).length === 0, `새 창 › ${name}: 복사돼 온 값을 씀(${st(pc)})`);
        // 그 뒤 원래 탭이 돌아오면 원래 탭이 이어받는다
        const pa = await w.open(A, 'index.html');
        await w.browser.advance(2000);
        c.ok(st(pa) === 'signed_in', `새 창 › ${name}: 그 뒤 원래 탭이 이어받지 못함(${st(pa)}·${why(pa)})`);
    }

    // 이름 있는 창의 재사용: 처음 복사된 값이 그대로 남은 창에 다시 화면을 연다
    {
        const { w, tab: A } = await newLogin(mutate, 'std');
        const C = w.browser.windowOpen(A, 'C', 'omrCard');
        await w.open(C, 'book.html');                    // 모듈을 싣지 않는 화면(답안 카드 구실): 복사된 값이 그대로 남는다
        await w.browser.advance(2.2 * HOURS);            // 그 사이 원래 창은 갱신한다
        const pc = await w.open(C, 'index.html');
        await w.browser.advance(2000);
        c.ok(st(pc) === 'off' && fromPage(w, 'C').filter((e) => e.route.includes('/auth/') || e.route.includes('/rpc/')).length === 0 && !C.session.has('tr_auth_v1'), `새 창 › 이름 있는 창의 재사용: 처음 복사된 값을 씀(${st(pc)})`);
    }

    // 새 창의 화면·요청은 기준과 같다(모듈을 싣지 않는 화면 — 복사된 currentUser 를 지금처럼 읽고 공개 키로 요청한다)
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

    // 원래 탭: 새로 고침·다른 화면에 다녀오기 = 이 창의 것(갱신 성공)
    for (const locks of [true, false]) {
        const label = `원래 탭${locks ? '' : '(잠금을 쓸 수 없는 브라우저)'}`;
        const { w, tab: A } = await newLogin(mutate, 'std', { locks });
        const userA = A.session.get('currentUser');
        let page = await w.open(A, 'index.html', { locks });
        await w.browser.advance(2000);
        c.ok(st(page) === 'signed_in' && lastScreen(page) === 'scheduleScreen', `${label} › 새로 고침: 이 창의 것으로 보지 않음(${st(page)}·${why(page)})`);
        await w.open(A, 'book.html');
        await w.browser.advance(60 * 1000);
        page = await w.open(A, 'index.html', { locks });
        await w.browser.advance(2000);
        c.ok(st(page) === 'signed_in' && lastScreen(page) === 'scheduleScreen' && A.session.get('currentUser') === userA, `${label} › 다른 화면에 다녀옴: 이 창의 것으로 보지 않음(${st(page)}·${why(page)})`);
        await w.browser.advance(1.2 * HOURS);
        c.ok(st(page) === 'signed_in' && count(w, R.refresh) >= 1 && [...w.auth.sessions.values()].some((s) => s.alive && s.prevRefresh !== null), `${label}: 갱신이 되지 않음`);
    }

    // 모듈을 싣지 않는 화면에 있는 동안 복제된 탭: 먼저 돌아온 쪽 하나만 이어받는다(갱신하는 창은 언제나 하나)
    for (const first of ['원래 탭', '복제된 탭']) {
        const { w, tab: A } = await newLogin(mutate, 'std');
        await w.open(A, 'book.html');
        const C = w.browser.duplicate(A, 'C');
        await w.open(C, 'book.html');
        const order = first === '원래 탭' ? [A, C] : [C, A];
        const p1 = await w.open(order[0], 'index.html');
        await w.browser.advance(2000);
        const p2 = await w.open(order[1], 'index.html');
        await w.browser.advance(2000);
        c.ok(st(p1) === 'signed_in' && st(p2) === 'off' && why(p2) === 'foreign_window', `다른 화면에서 복제된 탭(${first}이 먼저 돌아옴): 이어받은 쪽이 하나가 아님(${st(p1)}·${st(p2)})`);
        await w.browser.advance(2.2 * HOURS);
        const refreshes = refreshesOf(w);
        c.ok(refreshes.length >= 2 && new Set(refreshes.map((e) => e.page)).size === 1 && [...w.auth.sessions.values()].filter((s) => s.alive).length === 1 && st(p1) === 'signed_in', `다른 화면에서 복제된 탭(${first}이 먼저): 갱신하는 창이 하나가 아니거나 갱신이 막힘`);
    }
    // 같은 순간에 돌아온 두 탭: 둘 다 이어받는 일은 없다
    for (const locks of [true, false]) {
        const { w, tab: A } = await newLogin(mutate, 'std', { locks });
        await w.open(A, 'book.html');
        const C = w.browser.duplicate(A, 'C');
        const p1 = await w.open(A, 'index.html', { noIdle: true, locks });
        const p2 = await w.open(C, 'index.html', { noIdle: true, locks });
        await w.browser.advance(3000);
        const mine = [p1, p2].filter((p) => st(p) === 'signed_in').length;
        c.ok(mine <= 1 && [p1, p2].every((p) => st(p) === 'signed_in' || st(p) === 'off'), `같은 순간에 돌아온 두 탭${locks ? '' : '(잠금 없음)'}: 둘 다 이어받음(${st(p1)}·${st(p2)})`);
    }

    // 마지막 탭을 닫고 새로 방문: 로그인이 남지 않는다
    {
        const { w, tab: A } = await newLogin(mutate, 'std');
        A.close();
        const before = w.auth.log.length;
        const N = w.tab('N');
        const page = await w.open(N, 'index.html');
        await w.browser.advance(2000);
        c.ok(st(page) === 'signed_out' && lastScreen(page) === 'loginScreen' && !hasSchedule(page) && Object.keys(sessionOf(N)).length === 0 && w.auth.log.length === before, `마지막 탭을 닫고 새로 방문: 로그인이 남음(${st(page)})`);
    }
    // 닫은 탭 복원(브라우저가 탭 단위 저장값과 창 이름을 되살린 경우): 다른 탭이 이어받지 않았으면 그 창의 것으로 본다(판단 — 보고서)
    {
        const { w, tab: A } = await newLogin(mutate, 'std');
        A.close();
        const restored = w.browser.duplicate(A, 'R');
        const page = await w.open(restored, 'index.html');
        await w.browser.advance(2000);
        c.ok(st(page) === 'signed_in' && lastScreen(page) === 'scheduleScreen', `닫은 탭 복원: 정해 둔 동작(그 창의 것으로 봄)과 다름(${st(page)}·${why(page)})`);
        audit(w, c, '닫은 탭 복원');
    }
    // 앞 문서가 놓지 못하고 사라진 경우(쥠 표식이 "쥠"인 채): 쓰지 않는다
    {
        const { w, tab: A } = await newLogin(mutate, 'std');
        A.page.closed = true;                 // pagehide 없이 사라짐
        A.page = null;
        const p2 = await w.open(A, 'index.html');
        await w.browser.advance(2000);
        c.ok(st(p2) === 'off' && why(p2) === 'foreign_window' && !hasSchedule(p2), `앞 문서가 놓지 못함: 쓰지 않는 쪽이 아님(${st(p2)})`);
    }
    // 차례표를 쓸 수 없는 브라우저(브라우저 단위 저장소가 막힘): 로그인은 되지만 다음 화면이 이어받지 못한다(쓰지 않는 쪽)
    {
        const w = makeWorld({ variant: V.ON, mutate });
        const A = w.tab('A');
        const breakLocal = (p) => { p.sandbox.localStorage.getItem = () => { throw new Error('막힘'); }; p.sandbox.localStorage.setItem = () => { throw new Error('막힘'); }; };
        const page = await w.open(A, 'index.html', { beforeLoad: breakLocal });
        await w.submit(page, emailOf('std'), AUTH_PW);
        c.ok(lastScreen(page) === 'scheduleScreen', `차례표를 쓸 수 없음: 로그인이 되지 않음(${lastMessage(page)})`);
        const p2 = await w.open(A, 'index.html', { beforeLoad: breakLocal });
        await w.browser.advance(2000);
        c.ok(st(p2) === 'off' && !hasSchedule(p2), `차례표를 쓸 수 없음: 다음 화면이 이어받음(${st(p2)})`);
    }
    return { problems: c.problems, note: '새 창 다섯 × 잠금 유무, 재사용, 새 창의 화면 = 기준, 원래 탭, 다른 화면에서의 복제, 동시, 닫고 새 방문, 닫은 탭 복원, 놓지 못함, 차례표 불가' };
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
    book: testBook,
    connection: testConnection,
};
const NAMES = {
    sameAsOld: '[4] 켜짐 › 옛 길과 같은 결과(currentUser·화면·저장 계획 = 옛 길의 실제 쓰기, 쓰기 전송 0)',
    outcomes: '[5] 켜짐 › 들어가지 못하는 경우',
    failures: '[5] 켜짐 › 실패와 "없음"의 구분',
    readyGate: '[6] 켜짐 › 준비 신호·늦게 온 응답',
    logout: '[6] 켜짐 › 로그아웃',
    windows: '[7] 켜짐 › 새 창·탭 복제·탭 닫기',
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
