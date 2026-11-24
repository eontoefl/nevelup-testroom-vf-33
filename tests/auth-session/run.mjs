// 테스트룸 인증 모듈·새 로그인 스위치 회귀시험 (보안작업 묶음2 계약 3B)
//
// 실행:  node tests/auth-session/run.mjs      (저장소 폴더에서, Node v26, 설치할 것 없음)
//
// 전부 가짜 화면·가짜 서버다(프로세스 안). 실제 네트워크 요청 0건 — 여기서 통과한 것은 실제 화면·실제 서버에서 된다는 증거가 아니다.
// 실제 화면 확인은 절차.md(실행기 screen.mjs — 브레인방이 시험 프로젝트를 상대로 돌린다).

import { installNetworkGuard, verifyNetworkGuard, realNetworkAttempts } from '../supabase-client-headers/harness.mjs';
import { V, BASE, baseFile, workFile, AUTH_FILE, CONFIG_FILE, SDK_FILE, PROD, staticRefs, pageScripts } from './world.mjs';
import { switchValue, findProdResidue } from './rewrite.mjs';
import { OLD_PATH } from './scenarios.mjs';
import * as ON from './on-tests.mjs';
import { MUTANTS, applyEdits } from './mutants.mjs';

const lines = [];
const out = (s) => { lines.push(s); console.log(s); };
const failures = [];
const fail = (where, text) => { failures.push(`${where}: ${text}`); };

process.on('unhandledRejection', (e) => { failures.push('처리되지 않은 거절: ' + String(e && e.message)); });

installNetworkGuard();
const guardPaths = verifyNetworkGuard();

// 두 기록에서 처음 다른 자리(값은 찍지 않는다 — 이름만)
function firstDiff(a, b, where = '') {
    if (JSON.stringify(a) === JSON.stringify(b)) return null;
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return `${where}[수 ${a.length}≠${b.length}]`;
        for (let i = 0; i < a.length; i++) { const d = firstDiff(a[i], b[i], `${where}[${i}]`); if (d) return d; }
    } else if (a && b && typeof a === 'object' && typeof b === 'object') {
        const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
        for (const k of keys) { const d = firstDiff(a[k], b[k], `${where}.${k}`); if (d) return d; }
    }
    return where || '(값)';
}

// ---------------------------------------------------------------------
// [1] 글자 점검
// ---------------------------------------------------------------------
function sectionText() {
    const problems = [];
    const auth = workFile(AUTH_FILE);
    if (switchValue(auth) !== 'off') problems.push('저장소의 스위치 값이 꺼짐이 아님');
    // 기존 파일에서 지워지거나 바뀐 줄: js/auth.js 는 한 줄(책 연결의 조건), 나머지는 0
    const removed = (p) => {
        const base = baseFile(p).split('\n');
        const work = new Map();
        for (const l of workFile(p).split('\n')) work.set(l, (work.get(l) || 0) + 1);
        const gone = [];
        for (const l of base) { const n = work.get(l) || 0; if (n === 0) gone.push(l.trim()); else work.set(l, n - 1); }
        return gone;
    };
    const goneAuth = removed('js/auth.js');
    if (JSON.stringify(goneAuth) !== JSON.stringify(['if (authToken) {'])) problems.push(`js/auth.js: 기준에서 사라진 줄이 책 연결의 조건 한 줄이 아님(${goneAuth.length}줄)`);
    if (removed('index.html').length !== 0) problems.push('index.html: 기준에서 사라진 줄이 있음');
    // 새 길의 신청서 열 목록·주소가 옛 함수와 글자까지 같은가
    const colsOld = (workFile(CONFIG_FILE).match(/const _appCols = '([^']+)';/) || [])[1];
    const colsNew = (workFile('js/auth.js').match(/const _appCols = '([^']+)';/) || [])[1];
    if (!colsOld || colsOld !== colsNew) problems.push('새 길의 신청서 열 목록이 옛 함수와 다름');
    // 로그아웃의 화면 정리: 새 길의 정리가 옛 logout 의 정리와 같은 줄들인가(저장값 지우기 두 줄·화면 전환 한 줄만 다르다)
    const authText = workFile('js/auth.js');
    const body = (from, to) => { const a = authText.indexOf(from); const b = authText.indexOf(to, a); return a < 0 || b < 0 ? null : authText.slice(a, b).split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//')); };
    const oldClean = body("        sessionStorage.removeItem('courseMode');\n        \n        // Sentry 사용자 정보 초기화", "        showScreen('loginScreen');\n        \n        // 폼 초기화");
    const newClean = body("    sessionStorage.removeItem('courseMode');\n\n    // Sentry 사용자 정보 초기화", "    if (typeof showScreen === 'function') showScreen('loginScreen');\n}");
    if (!oldClean || !newClean || JSON.stringify(oldClean) !== JSON.stringify(newClean)) problems.push('로그아웃의 화면 정리가 옛 길과 같은 줄들이 아님');
    // 시험 파일·새 파일에 운영 주소·키의 흔적이 없는가(값은 찍지 않는다)
    for (const p of [AUTH_FILE, SDK_FILE, 'tests/auth-session/run.mjs', 'tests/auth-session/world.mjs', 'tests/auth-session/fixtures.mjs', 'tests/auth-session/scenarios.mjs', 'tests/auth-session/on-tests.mjs', 'tests/auth-session/mutants.mjs', 'tests/auth-session/fake-rest.mjs', 'tests/auth-session/fake-supabase.mjs', 'tests/auth-session/browser.mjs']) {
        const text = workFile(p);
        if (text === null) { problems.push(`${p}: 파일이 없음`); continue; }
        const residue = findProdResidue(text, { prodKey: PROD.key, prodUrl: p.endsWith('rewrite.mjs') ? null : PROD.url });
        if (residue.length) problems.push(`${p}: 운영 흔적(${residue.join(', ')})`);
    }
    return { problems };
}

// ---------------------------------------------------------------------
// [2] 지금과 다른 것(차이 장부): 꺼짐의 화면이 기준보다 더 받는 정적 파일
// ---------------------------------------------------------------------
function sectionStatic(mutate) {
    const problems = [];
    const pages = ['index.html', 'book.html', 'commentary.html', 'omr-card.html', 'mypage.html', 'mypage-practice.html', 'mypage-australia.html', 'v2-records.html', 'book-v2.html', 'book-v3.html', 'audio-test.html'];
    const added = {};
    for (const p of pages) {
        const base = staticRefs(baseFile(p));
        let text = workFile(p);
        if (mutate) text = mutate(p, text);
        const work = staticRefs(text);
        const rest = work.slice();
        for (const r of base) { const i = rest.indexOf(r); if (i < 0) problems.push(`${p}: 기준이 싣던 정적 파일을 싣지 않음`); else rest.splice(i, 1); }
        added[p] = rest;
        const want = p === 'index.html' ? ['js/auth-session.js'] : [];
        if (JSON.stringify(rest.map((r) => r.split('?')[0])) !== JSON.stringify(want)) problems.push(`${p}: 기준보다 더 싣는 정적 파일이 ${want.length ? 'js/auth-session.js 1개' : '0개'}가 아님(${rest.length}개)`);
    }
    // 그 파일은 js/auth.js 바로 앞에 있다(다른 스크립트의 순서는 기준 그대로)
    const order = pageScripts(mutate ? mutate('index.html', workFile('index.html')) : workFile('index.html'));
    if (JSON.stringify(order) !== JSON.stringify(['js/supabase-client.js', 'js/timezone-utils.js', 'js/auth-session.js', 'js/auth.js'])) problems.push('index.html: 로그인에 관여하는 스크립트의 순서가 기대와 다름');
    return { problems, bytes: Buffer.byteLength(workFile(AUTH_FILE)) };
}

// ---------------------------------------------------------------------
// [3] 꺼짐 = 기준: 옛 길의 화면 동작마다 요청(주소·메서드·머리글·본문·횟수·순서)·탭 단위 저장값·화면 전환·안내·콘솔
// ---------------------------------------------------------------------
async function sectionOff(mutate, only) {
    const problems = [];
    let requests = 0;
    let writes = 0;
    let compared = 0;
    for (const [name, run] of OLD_PATH) {
        if (only && !only.test(name)) continue;
        const base = await run(V.BASE, null);
        const off = await run(V.OFF, mutate);
        compared++;
        requests += base.requests.length;
        writes += base.writes.length;
        // 꺼짐에서 더 실은 것은 인증 모듈 파일뿐이다(그 파일은 아무것도 하지 않는다): 기록에서 그 차이만 걷어 내고 글자까지 견준다
        const d = firstDiff(base, off);
        if (d) problems.push(`꺼짐 › ${name}: 기준과 다름 — ${d}`);
        if (off.outside.length) problems.push(`꺼짐 › ${name}: 허용 밖의 요청`);
        if (off.channels !== 0 || off.scripts.some((s) => s.length)) problems.push(`꺼짐 › ${name}: 인증 모듈의 흔적(SDK·창 사이 통로)`);
        if (Object.keys(off.local).length || off.localOps.length) problems.push(`꺼짐 › ${name}: 브라우저 단위 저장소를 건드림`);
        if (off.session.some((s) => Object.keys(s).some((k) => k.startsWith('tr_auth_v1')))) problems.push(`꺼짐 › ${name}: 새 모듈의 저장 이름이 생김`);
    }
    return { problems, compared, requests, writes };
}

// ---------------------------------------------------------------------
// 실행
// ---------------------------------------------------------------------
out('테스트룸 인증 모듈·새 로그인 스위치 회귀시험 (가짜 화면·가짜 서버 — 실제 서버의 증거가 아니다)');
out(`  기준 ${BASE}, 네트워크 차단 장치 ${guardPaths}경로 자체 점검 통과`);

const text = sectionText();
text.problems.forEach((p) => fail('글자', p));
out(`[1] 글자 점검(스위치 꺼짐, 기존 줄의 변경, 새 길의 열 목록, 로그아웃의 화면 정리, 운영 흔적): 어긋남 ${text.problems.length}`);

const st = sectionStatic(null);
st.problems.forEach((p) => fail('차이 장부', p));
out(`[2] 지금과 다른 것(차이 장부): 꺼짐의 화면이 기준보다 더 받는 정적 파일은 index.html 의 js/auth-session.js 1개뿐(${st.bytes}바이트 — js/auth.js 바로 앞, 다른 화면 10개는 0개): 어긋남 ${st.problems.length}`);

const off = await sectionOff(null);
off.problems.forEach((p) => fail('꺼짐', p));
out(`[3] 꺼짐 = 기준: 옛 길의 화면 동작 ${off.compared}가지를 기준과 글자까지 대조(요청 ${off.requests}건 — 그중 쓰기 ${off.writes}건, 탭 단위 저장값·화면 전환·안내·콘솔 포함): 어긋남 ${off.problems.length}`);

const onResults = await ON.runAll(null);
for (const r of onResults) {
    r.problems.forEach((p) => fail('켜짐', p));
    out(`    - ${r.name}: ${r.problems.length ? '어긋남 ' + r.problems.length : '통과'}${r.note ? ' — ' + r.note : ''}`);
}

// 감도: 일부러 바꾼 사본
let caught = 0;
const mutLines = [];
for (const m of MUTANTS) {
    const editProblems = [];
    const check = applyEdits(m.edits, editProblems);
    for (const file of new Set(m.edits.map((e) => e[0]))) check(file, workFile(file));
    if (editProblems.length) { fail('감도', `"${m.name}": ${editProblems[0]}`); continue; }
    const found = [];
    const mutate = applyEdits(m.edits, []);
    try {
        if (m.section === 'off') found.push(...(await sectionOff(mutate, m.only)).problems);
        if (m.section === 'static') found.push(...sectionStatic(mutate).problems);
        for (const name of m.tests || []) found.push(...(await ON.TESTS[name](mutate)).problems);
    } catch (e) { found.push('예외: ' + String(e && e.message)); }
    const hit = found.filter((p) => m.expect.test(p));
    if (hit.length === 0) { fail('감도', `"${m.name}": 겨냥한 판정이 깨지지 않음(다른 어긋남 ${found.length}건)`); mutLines.push(`    - ${m.name}: 잡지 못함`); }
    else { caught++; mutLines.push(`    - ${m.name}: 겨냥한 판정 ${hit.length}건이 깨짐`); }
}
out(`[9] 감도 점검(일부러 바꾼 사본 ${MUTANTS.length}개 — 변조마다 겨냥한 판정이 깨져야 검출): ${caught === MUTANTS.length ? '모두 검출' : `검출 ${caught}`}`);
mutLines.forEach(out);

if (realNetworkAttempts.length) fail('네트워크', `실제 네트워크 요청 시도 ${realNetworkAttempts.length}건`);
out(`[10] 실제 네트워크 요청 ${realNetworkAttempts.length}건`);

if (failures.length) {
    for (const f of failures.slice(0, 60)) out('      · ' + f);
    if (failures.length > 60) out(`      · … 모두 ${failures.length}건`);
    out(`결과: 실패 (${failures.length}건)`);
    process.exit(1);
}
out('결과: 통과  (가짜 화면·가짜 서버에서의 결과다 — 실제 화면 확인은 절차.md)');
