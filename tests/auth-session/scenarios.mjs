// 옛 길(기준·꺼짐)에서 한 화면 동작이 남기는 것을 한 덩어리로 적는다 — 기준(cd66fcf)과 꺼짐을 글자까지 견주는 데 쓴다.
import { makeWorld, shapeOf, sessionOf } from './world.mjs';
import { STUDENTS, LEGACY_PW, emailOf, memberIdOf, bookToken, student } from './fixtures.mjs';

// 화면이 남긴 기록에서 "실은 스크립트의 목록"만 빼고 전부(화면 전환·안내·이동·알림·콘솔·이벤트…)
const traceOf = (page) => page.trace.filter((e) => e.t !== 'run-script').map((e) => { const o = Object.assign({}, e); delete o.n; return o; });

function capture(w, tabs, pages) {
    return {
        requests: w.browser.requests.map(shapeOf),
        writes: w.rest.writes,
        session: tabs.map((t) => sessionOf(t)),
        sessionWrites: tabs.map((t) => t.sessionLog.filter((e) => e.op !== 'get').map((e) => `${e.op} ${e.key}`)),
        local: Object.fromEntries([...w.browser.local.entries()].sort()),
        localOps: w.browser.storageLog.map((e) => `${e.op} ${e.key}`),
        traces: pages.map(traceOf),
        outside: w.outside,
        channels: w.browser.channelLog.length,
        scripts: pages.map((p) => p.scriptLoads.slice()),
    };
}

// 로그인 한 번(+ 그 뒤의 새로 고침)
async function login(variant, mutate, { key, email, password, reload, logout, fault }) {
    const w = makeWorld({ variant, mutate });
    if (fault) fault(w);
    const tab = w.tab('t1');
    const pages = [await w.open(tab, 'index.html')];
    await w.submit(pages[0], email === undefined ? emailOf(key) : email, password === undefined ? LEGACY_PW : password);
    if (logout !== undefined) {
        pages[0].confirmAnswer = logout;
        pages[0].evaluate('logout()');
        await w.browser.advance(500);
    }
    if (reload) {
        pages.push(await w.open(tab, 'index.html'));
        await w.browser.advance(2000);
    }
    return capture(w, [tab], pages);
}

// 저장된 값이 있는 탭에서 화면을 연다
async function openWith(variant, mutate, { pageFile, search, saved, tables }) {
    const w = makeWorld({ variant, mutate, tables });
    const tab = w.tab('t1');
    if (saved !== undefined) tab.session.set('currentUser', typeof saved === 'string' ? saved : JSON.stringify(saved));
    const pages = [await w.open(tab, pageFile, { search })];
    await w.browser.advance(2000);
    return capture(w, [tab], pages);
}

// 로그인한 탭에서 다른 화면으로(같은 탭)
async function loginThen(variant, mutate, { key, pageFile }) {
    const w = makeWorld({ variant, mutate });
    const tab = w.tab('t1');
    const pages = [await w.open(tab, 'index.html')];
    await w.submit(pages[0], emailOf(key), LEGACY_PW);
    pages.push(await w.open(tab, pageFile));
    await w.browser.advance(2000);
    return capture(w, [tab], pages);
}

const bookOnly = (key) => ({ id: memberIdOf(key), name: `합성학생-${key}`, email: emailOf(key), phone: '', program: '입문서 무료 신청', programType: 'book_only', applicationId: null, challengeDepositConfirmed: false });
const failApps = (nth) => (w) => { let n = 0; w.rest.faults.push((req, u) => (u.pathname === '/rest/v1/applications' && ++n === nth ? 'network' : null)); };
const failExt = (w) => { w.rest.faults.push((req, u) => (u.pathname === '/rest/v1/tr_deadline_extensions' ? { status: 500, headers: {}, body: '{}' } : null)); };

// 이름 → (변형, 변조) → 남긴 것
export const OLD_PATH = [];
for (const s of STUDENTS) {
    OLD_PATH.push([`로그인 › ${s.label}`, (v, m) => login(v, m, { key: s.key })]);
    if (!s.expect) OLD_PATH.push([`로그인 뒤 새로 고침 › ${s.label}`, (v, m) => login(v, m, { key: s.key, reload: true })]);
}
OLD_PATH.push(
    ['틀린 비밀번호', (v, m) => login(v, m, { key: 'fast', password: 'zz-wrong' })],
    ['없는 이메일', (v, m) => login(v, m, { email: 'zzb3b_nobody@member.zz.invalid' })],
    ['빈 값(둘 다)', (v, m) => login(v, m, { email: '', password: '' })],
    ['빈 값(둘 다) 뒤 새로 고침', (v, m) => login(v, m, { email: '', password: '', reload: true })],
    ['빈 값(이메일만)', (v, m) => login(v, m, { email: '', password: 'x' })],
    ['빈 값(비밀번호만)', (v, m) => login(v, m, { key: 'fast', password: '' })],
    ['999999', (v, m) => login(v, m, { key: 'fast', password: '999999' })],
    ['999999 › 차단', (v, m) => login(v, m, { key: 'blocked', password: '999999' })],
    ['999999 › 신청 없음', (v, m) => login(v, m, { key: 'noapp', password: '999999' })],
    ['로그아웃(확인)', (v, m) => login(v, m, { key: 'std', logout: true })],
    ['로그아웃(취소)', (v, m) => login(v, m, { key: 'std', logout: false })],
    ['로그아웃 뒤 새로 고침', (v, m) => login(v, m, { key: 'std', logout: true, reload: true })],
    ['첫 신청서 조회가 응답 없음', (v, m) => login(v, m, { key: 'fast', fault: failApps(1) })],
    ['일정 재료(정지 칸) 조회가 응답 없음', (v, m) => login(v, m, { key: 'paused', fault: failApps(3) })],
    ['마감 연장 조회 실패 뒤 새로 고침', (v, m) => login(v, m, { key: 'std', fault: failExt, reload: true })],
    ['저장된 값 없이 첫 화면', (v, m) => openWith(v, m, { pageFile: 'index.html' })],
    ['책 연결 주소(입금 확인된 신청 있음)', (v, m) => openWith(v, m, { pageFile: 'book.html', search: '?auth_token=zzb3b-token-fast&x=1', tables: bookToken('fast', { confirmed: true }) })],
    ['책 연결 주소(입금 확인된 신청 없음)', (v, m) => openWith(v, m, { pageFile: 'book.html', search: '?auth_token=zzb3b-token-noapp', tables: bookToken('noapp', { confirmed: false }) })],
    ['책 연결 주소(해설 화면)', (v, m) => openWith(v, m, { pageFile: 'commentary.html', search: '?auth_token=zzb3b-token-std', tables: bookToken('std', { confirmed: true }) })],
    ['책 연결 주소(없는 값)', (v, m) => openWith(v, m, { pageFile: 'book.html', search: '?auth_token=zz-none' })],
    ['책 연결 주소 + 저장된 책 전용 상태', (v, m) => openWith(v, m, { pageFile: 'book.html', search: '?auth_token=zzb3b-token-fast', saved: bookOnly('std'), tables: bookToken('fast', { confirmed: true }) })],
    ['책 화면(저장된 값 없음)', (v, m) => openWith(v, m, { pageFile: 'book.html' })],
    ['책 전용 상태로 첫 화면', (v, m) => openWith(v, m, { pageFile: 'index.html', saved: bookOnly('fast') })],
    ['책 전용 상태로 책 화면', (v, m) => openWith(v, m, { pageFile: 'book.html', saved: bookOnly('fast') })],
    ['책 전용 상태로 해설 화면', (v, m) => openWith(v, m, { pageFile: 'commentary.html', saved: bookOnly('fast') })],
    ['읽을 수 없는 저장값으로 책 화면', (v, m) => openWith(v, m, { pageFile: 'book.html', saved: 'zz-not-json' })],
    ['로그인한 탭에서 책 화면', (v, m) => loginThen(v, m, { key: 'std', pageFile: 'book.html' })],
    ['로그인한 탭에서 해설 화면', (v, m) => loginThen(v, m, { key: 'spv2new', pageFile: 'commentary.html' })],
);

export { capture, traceOf, bookOnly, student };
