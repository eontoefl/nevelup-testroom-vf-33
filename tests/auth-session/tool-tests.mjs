// 시험 도구 자신의 시험(브라우저 없이): 차단기의 범위 규칙, 저장 계획 검사, 실행기의 차례·보관함·원복 표시, 로컬 서버의 몸통.
// mutate: (경로, 글자) → 글자 — 감도 점검에서 도구의 사본을 바꿔 다시 돌린다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { ROOT, workFile, PROD, FAKE_ANON } from './world.mjs';
import { TEST_URL, switchValue } from './rewrite.mjs';
import { fakeJwt } from './fake-supabase.mjs';

const DIR = 'tests/auth-session/';
let seq = 0;
// 도구 파일을 (바꿨으면 바꾼 사본으로) 불러온다. 바꾼 사본은 임시 폴더에 두고 끝나면 지운다
async function load(name, mutate) {
    const rel = DIR + name;
    const text = workFile(rel);
    const changed = mutate ? mutate(rel, text) : text;
    const TOOL_FILES = ['rewrite.mjs', 'serve-core.mjs', 'request-log.mjs', 'screen-core.mjs'];
    if (!mutate || TOOL_FILES.every((f) => mutate(DIR + f, workFile(DIR + f)) === workFile(DIR + f))) return import('./' + name);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b3b-tool-'));
    try {
        for (const f of TOOL_FILES) {
            const src = f === name ? changed : (mutate ? mutate(DIR + f, workFile(DIR + f)) : workFile(DIR + f));
            fs.writeFileSync(path.join(dir, f), src);
        }
        return await import(pathToFileURL(path.join(dir, name)).href + '?v=' + (++seq));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

const SYN = {
    emails: ['zz_a@member.zz.invalid', 'zz_b@member.zz.invalid'],
    memberIds: ['zz-member-a', 'zz-member-b'], appIds: ['zz-app-a1', 'zz-app-b1'], recordIds: ['zz-rec-a1', 'zz-rec-a2'],
};
const enc = encodeURIComponent;

// ---- 차단기의 범위 규칙
export async function testDecider(mutate) {
    const problems = [];
    const { makeDecider } = await load('request-log.mjs', mutate);
    const iss = TEST_URL + '/auth/v1';
    const member = fakeJwt({ iss, role: 'authenticated', sub: 'auth-a', email: SYN.emails[0], session_id: 's1' });
    const anon = { apikey: FAKE_ANON, Authorization: 'Bearer ' + FAKE_ANON };
    const mk = (syn) => makeDecider({ selfOrigins: ['http://127.0.0.1:8787'], anonKey: FAKE_ANON, issuer: iss, memberEmails: () => SYN.emails, synthetic: () => syn });
    const dec = mk(SYN);
    const R = (method, p, body, headers) => ({ url: TEST_URL + p, method, headers: headers || anon, postData: body === undefined ? null : JSON.stringify(body), resourceType: 'fetch', isNavigation: false });
    const U = `/rest/v1/users?email=eq.${enc(SYN.emails[0])}`;
    const cases = [
        // [이름, 요청, 나가는가]
        ['회원 표: 옛 길의 첫 조회(정해진 열)', R('GET', U + '&select=id,name,email,phone,role,blocked,timezone'), true],
        ['회원 표: 옛 길의 둘째 조회(password 한 열)', R('GET', U + '&select=password'), true],
        ['회원 표: select=*', R('GET', U + '&select=*'), false],
        ['회원 표: 열 목록에 password 를 섞음', R('GET', U + '&select=id,name,password'), false],
        ['회원 표: 필터 없음', R('GET', '/rest/v1/users?select=password'), false],
        ['회원 표: 필터도 열도 없음', R('GET', '/rest/v1/users'), false],
        ['회원 표: 합성이 아닌 이메일', R('GET', `/rest/v1/users?email=eq.${enc('someone@real.invalid')}&select=password`), false],
        ['회원 표: 다른 조건을 덧붙임', R('GET', U + '&select=password&limit=1000'), false],
        ['회원 표: 다른 연산(like)', R('GET', `/rest/v1/users?email=like.${enc('%')}&select=password`), false],
        ['회원 표: 번호로 조회(책 연결의 길 — 이 실행기에서는 내보내지 않는다)', R('GET', '/rest/v1/users?id=eq.zz-member-a&select=id,name,email,phone&limit=1'), false],
        ['회원 표: 쓰기', R('PATCH', U, { password: 'x' }), false],
        ['신청서: 합성 이메일로', R('GET', `/rest/v1/applications?email=eq.${enc(SYN.emails[1])}&order=created_at.desc&limit=1&select=id`), true],
        ['신청서: 합성 신청서 번호로', R('GET', '/rest/v1/applications?id=eq.zz-app-a1&select=self_paced,self_paced_weeks'), true],
        ['신청서: 조건 없음', R('GET', '/rest/v1/applications?select=*'), false],
        ['신청서: 합성이 아닌 이메일', R('GET', `/rest/v1/applications?email=eq.${enc('someone@real.invalid')}&select=id`), false],
        ['신청서: 합성이 아닌 번호', R('GET', '/rest/v1/applications?id=eq.real-app-1&select=id'), false],
        ['쓰기: 신청서의 일정표(합성 행)', R('PATCH', '/rest/v1/applications?id=eq.zz-app-a1', { self_paced_schedule: '{}' }), true],
        ['쓰기: 신청서의 다른 열', R('PATCH', '/rest/v1/applications?id=eq.zz-app-a1', { deposit_confirmed_by_admin: true }), false],
        ['쓰기: 신청서의 일정표 + 다른 열', R('PATCH', '/rest/v1/applications?id=eq.zz-app-a1', { self_paced_schedule: '{}', status: 'x' }), false],
        ['쓰기: 합성이 아닌 신청서', R('PATCH', '/rest/v1/applications?id=eq.real-app-1', { self_paced_schedule: '{}' }), false],
        ['쓰기: 신청서 조건 없음', R('PATCH', '/rest/v1/applications', { self_paced_schedule: '{}' }), false],
        ['쓰기: 신청서 조건 둘', R('PATCH', '/rest/v1/applications?id=eq.zz-app-a1&email=neq.x', { self_paced_schedule: '{}' }), false],
        ['쓰기: 신청서 지우기', R('DELETE', '/rest/v1/applications?id=eq.zz-app-a1'), false],
        ['쓰기: tr_user_map(합성 회원)', R('POST', '/rest/v1/tr_user_map?on_conflict=user_id', { user_id: 'zz-member-a', email: SYN.emails[0], name: 'n', updated_at: 't' }), true],
        ['쓰기: tr_user_map(합성이 아닌 회원)', R('POST', '/rest/v1/tr_user_map?on_conflict=user_id', { user_id: 'real-member', email: SYN.emails[0], name: 'n', updated_at: 't' }), false],
        ['쓰기: tr_user_map(합성이 아닌 이메일)', R('POST', '/rest/v1/tr_user_map?on_conflict=user_id', { user_id: 'zz-member-a', email: 'x@real.invalid', name: 'n', updated_at: 't' }), false],
        ['쓰기: tr_user_map(다른 열)', R('POST', '/rest/v1/tr_user_map?on_conflict=user_id', { user_id: 'zz-member-a', email: SYN.emails[0], role: 'admin' }), false],
        ['쓰기: 인증률 확정(합성 행)', R('PATCH', '/rest/v1/study_results_v3?id=eq.zz-rec-a2', { locked_auth_rate: 50 }), true],
        ['쓰기: 인증률 확정(합성이 아닌 행)', R('PATCH', '/rest/v1/study_results_v3?id=eq.real-rec', { locked_auth_rate: 50 }), false],
        ['쓰기: 학습 기록의 다른 열', R('PATCH', '/rest/v1/study_results_v3?id=eq.zz-rec-a2', { initial_record: {} }), false],
        ['쓰기: 학습 기록을 회원 조건으로(여러 행)', R('PATCH', '/rest/v1/study_results_v3?user_id=eq.zz-member-a', { locked_auth_rate: 0 }), false],
        ['쓰기: 다른 표', R('POST', '/rest/v1/tr_notifications', { x: 1 }), false],
        ['쓰기: 책 연결의 값 지우기', R('DELETE', '/rest/v1/tr_auth_tokens?id=eq.x'), false],
        ['쓰기: 저장소 올리기', R('POST', '/storage/v1/object/x/y.webm', { a: 1 }), false],
        ['쓰기: 함수 부르기', R('POST', '/functions/v1/anything', { a: 1 }), false],
        ['쓰기: 다른 RPC', R('POST', '/rest/v1/rpc/anything', {}), false],
        ['읽기: 다른 표', R('GET', '/rest/v1/tr_notices?select=*'), true],
        ['읽기: 학습 기록', R('GET', '/rest/v1/study_results_v3?user_id=eq.zz-member-a&locked_auth_rate=is.null&select=id'), true],
        ['인증 모듈: 로그인', R('POST', '/auth/v1/token?grant_type=password', { email: SYN.emails[0], password: 'zz' }), true],
        ['인증 모듈: 본인 확인(회원 자격)', R('POST', '/rest/v1/rpc/my_profile', {}, { apikey: FAKE_ANON, Authorization: 'Bearer ' + member }), true],
        ['회원 자격으로 표 읽기(용도 밖)', R('GET', '/rest/v1/tr_notices?select=*', undefined, { apikey: FAKE_ANON, Authorization: 'Bearer ' + member }), false],
    ];
    for (const [name, req, want] of cases) {
        const d = dec(req);
        if ((d.action === 'continue') !== want) problems.push(`차단기 › ${name}: ${want ? '내보내야 하는데 막음' : '막아야 하는데 내보냄'}`);
        if (JSON.stringify(d.record).includes('zz_a@') || JSON.stringify(d.record).includes('zz-member')) problems.push(`차단기 › ${name}: 기록에 자유 형식의 글자가 남음`);
    }
    // 합성 자료의 목록을 받기 전: 회원 표·신청서 조회와 쓰기를 전부 막는다
    const early = mk(null);
    for (const [name, req] of [cases[0], cases[1], cases[11], cases[16], cases[23], cases[27]]) {
        if (early(req).action !== 'abort') problems.push(`차단기 › 목록을 받기 전 › ${name}: 내보냄`);
    }
    return { problems, note: `요청 ${cases.length}가지 + 목록을 받기 전 6가지` };
}

// ---- 저장 계획 검사·합성 자료 목록·차례·보관함·원복 표시
export async function testCore(mutate) {
    const problems = [];
    const core = await load('screen-core.mjs', mutate);
    const expect = { memberId: 'zz-member-a', email: SYN.emails[0], appIds: ['zz-app-a1'], recordIds: ['zz-rec-a1', 'zz-rec-a2'] };
    const dates = Array.from({ length: 24 }, (_, i) => `2026-12-${String(i + 1).padStart(2, '0')}`);
    const good = () => ({
        attempt: 's1', memberId: 'zz-member-a', applicationId: 'zz-app-a1', authRates: 'done',
        items: [
            { table: 'applications', method: 'PATCH', match: 'id=eq.zz-app-a1', values: { self_paced_schedule: JSON.stringify({ end: '2026-12-24', dates }) } },
            { table: 'tr_user_map', method: 'POST', onConflict: 'user_id', values: { user_id: 'zz-member-a', email: SYN.emails[0], name: '합성', updated_at: '2026-11-24T06:00:00.000Z' } },
            { table: 'study_results_v3', method: 'PATCH', match: 'id=eq.zz-rec-a1', values: { locked_auth_rate: 100 } },
            { table: 'study_results_v3', method: 'PATCH', match: 'id=eq.zz-rec-a2', values: { locked_auth_rate: 0 } },
        ],
    });
    const ok = core.checkPlan(good(), expect);
    if (!ok.ok || ok.items.length !== 4) problems.push('저장 계획 검사: 맞는 계획을 받지 않음');
    const bad = [
        ['다른 표', (p) => { p.items.push({ table: 'users', method: 'PATCH', match: 'id=eq.zz-member-a', values: { password: 'x' } }); }],
        ['합성이 아닌 학습 기록 행', (p) => { p.items[2].match = 'id=eq.real-rec'; }],
        ['합성이 아닌 신청서 행', (p) => { p.items[0].match = 'id=eq.real-app'; }],
        ['신청서의 다른 열', (p) => { p.items[0].values.deposit_confirmed_by_admin = true; }],
        ['학습 기록의 다른 열', (p) => { p.items[2].values.initial_record = {}; }],
        ['인증률 값이 0·50·100 이 아님', (p) => { p.items[2].values.locked_auth_rate = 75; }],
        ['인증률 값이 글자', (p) => { p.items[2].values.locked_auth_rate = '100; drop table x'; }],
        ['일정표의 모양이 다름(날짜 23개)', (p) => { p.items[0].values.self_paced_schedule = JSON.stringify({ end: '2026-12-24', dates: dates.slice(1) }); }],
        ['일정표에 다른 키', (p) => { p.items[0].values.self_paced_schedule = JSON.stringify({ end: '2026-12-24', dates, x: 1 }); }],
        ['일정표가 글자가 아님', (p) => { p.items[0].values.self_paced_schedule = { end: '2026-12-24', dates }; }],
        ['tr_user_map 의 회원이 다름', (p) => { p.items[1].values.user_id = 'real-member'; }],
        ['tr_user_map 의 이메일이 다름', (p) => { p.items[1].values.email = 'x@real.invalid'; }],
        ['tr_user_map 의 다른 열', (p) => { p.items[1].values.role = 'admin'; }],
        ['tr_user_map 의 충돌 열이 다름', (p) => { p.items[1].onConflict = 'email'; }],
        ['메서드가 다름(지우기)', (p) => { p.items[2].method = 'DELETE'; }],
        ['항목에 다른 키', (p) => { p.items[2].sql = 'select 1'; }],
        ['같은 행이 두 번', (p) => { p.items.push(JSON.parse(JSON.stringify(p.items[3]))); }],
        ['계획의 회원이 다름', (p) => { p.memberId = 'real-member'; }],
        ['계획의 수강 건이 합성이 아님', (p) => { p.applicationId = 'real-app'; }],
        ['목록이 아님', (p) => { p.items = 'x'; }],
    ];
    for (const [name, change] of bad) {
        const p = good();
        change(p);
        if (core.checkPlan(p, expect).ok !== false) problems.push(`저장 계획 검사 › ${name}: 받아들임`);
    }
    if (core.checkPlan(null, expect).ok !== false) problems.push('저장 계획 검사 › 계획이 없음: 받아들임');

    const synOk = core.checkSynthetic({ students: { a: { memberId: 'zz-member-a', appIds: ['zz-app-a1'], recordIds: ['zz-rec-a1'] }, b: { memberId: 'zz-member-b', appIds: [], recordIds: [] } } }, ['a', 'b']);
    if (!synOk || synOk.flat.memberIds.length !== 2) problems.push('합성 자료의 목록: 맞는 목록을 받지 않음');
    for (const [name, body] of [
        ['유형이 빠짐', { students: { a: { memberId: 'zz-member-a', appIds: [], recordIds: [] } } }],
        ['번호가 겹침', { students: { a: { memberId: 'zz-member-a', appIds: [], recordIds: [] }, b: { memberId: 'zz-member-a', appIds: [], recordIds: [] } } }],
        ['번호 모양이 아님', { students: { a: { memberId: "x' or 1=1", appIds: [], recordIds: [] }, b: { memberId: 'zz-member-b', appIds: [], recordIds: [] } } }],
        ['다른 키', { students: { a: { memberId: 'zz-member-a', appIds: [], recordIds: [], token: 'x' }, b: { memberId: 'zz-member-b', appIds: [], recordIds: [] } } }],
    ]) if (core.checkSynthetic(body, ['a', 'b']) !== null) problems.push(`합성 자료의 목록 › ${name}: 받아들임`);

    // 차례·보관함·원복 표시(공홈 3A 에서 인수된 것 — 이름만 바꿔 옮겼다)
    const mkBoard = () => new core.PauseBoard({ timeoutMs: 30, randomStep: (() => { let n = 100; return () => ++n; })() });
    {
        const vault = core.makeVault({ PW: 'zz' });
        const board = mkBoard();
        const ran = [];
        const r = await core.runSequence({ preflight: async () => ({ checks: [{ ok: true }, { ok: null }] }), cases: [{ id: 'x', run: async () => { ran.push('x'); } }], vault, board });
        if (r.stopped !== 'preflight' || ran.length || vault.armed()) problems.push('실행기: 예행이 통과하지 못했는데 뒤의 경우를 시작하거나 보관함이 열림');
        let threw = false;
        try { vault.get('PW'); } catch (e) { threw = true; }
        if (!threw) problems.push('실행기: 예행 통과 전에 비밀을 꺼냄');
    }
    {
        const vault = core.makeVault({ PW: 'zz' });
        const board = mkBoard();
        const ran = [];
        const r = await core.runSequence({
            preflight: async () => ({ checks: [{ ok: true }] }),
            cases: [
                { id: 'a', run: async () => { ran.push('a'); board.open('old-path-begin', {}, { needsRevert: true }).catch(() => {}); } },
                { id: 'b', run: async () => { ran.push('b'); } },
            ],
            vault, board,
        });
        if (r.stopped !== 'revert' || ran.join() !== 'a' || board.pendingRevert !== 'old-path-begin') problems.push('실행기: 원복 확인을 받지 못했는데 다음 경우를 시작함');
    }
    {
        const board = mkBoard();
        const p = board.open('old-path-begin', {}, { needsRevert: true });
        if (board.pendingRevert !== 'old-path-begin') problems.push('실행기: 멈춤을 내놓는 순간 원복 대상으로 표시하지 않음');
        board.answer(board.view().step, null);
        await p;
        const q = board.open('old-path-reset', {}, { revertOf: 'old-path-begin' });
        board.answer(board.view().step, { result: 'ok' });
        await q;
        if (board.pendingRevert !== 'old-path-begin') problems.push('실행기: 원복했다는 답이 아닌데 표시를 지움');
        const s = board.open('old-path-reset', {}, { revertOf: 'old-path-begin' });
        if (board.answer(999, { reverted: true }) !== false) problems.push('실행기: 단계 번호가 틀린 답을 받음');
        board.answer(board.view().step, { reverted: true });
        await s;
        if (board.pendingRevert !== null) problems.push('실행기: 원복 확인을 받았는데 표시가 남음');
    }
    const env = core.browserEnv({ PATH: 'p', TEMP: 't', B3B_PW: 'zzsecret', B3B_LEGACY_PW: 'zzsecret', B3B_CONTROL_SECRET: 'zzsecret', B3B_TEST_ANON_KEY: 'zzsecret', B3B_EMAIL_FAST: 'zzsecret' });
    if (JSON.stringify(env).includes('zzsecret') || !env.PATH) problems.push('실행기: 브라우저에 비밀이 든 환경 변수가 넘어감');
    return { problems, note: `틀린 계획 ${bad.length}가지, 합성 자료의 목록, 차례·보관함·원복 표시` };
}

// ---- 로컬 서버의 몸통: 내주는 사본에 운영 흔적이 없고, 설정·스위치가 바뀌어 있다
export async function testServer(mutate) {
    const problems = [];
    const { createCore } = await load('serve-core.mjs', mutate);
    const { findProdResidue } = await import('./rewrite.mjs');
    const files = execFileSync('git', ['-c', 'core.quotepath=false', 'ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\0').filter((f) => f && !f.startsWith('.'));
    const readFile = (rel) => { try { return fs.readFileSync(path.join(ROOT, rel)); } catch (e) { return null; } };
    let served = 0;
    let refused = 0;
    for (const mode of ['on', 'off']) {
        const core = createCore({ files, readFile, mode, testKey: FAKE_ANON, port: 8787, prod: PROD, log: null });
        const scan = core.scan();
        if (scan.repoSwitch !== 'off') problems.push(`서버(${mode}): 저장소의 스위치를 꺼짐으로 읽지 못함`);
        for (const rel of files) {
            const r = core.respond({ method: 'GET', url: '/' + rel.split('/').map(encodeURIComponent).join('/') });
            if (r.status === 200) {
                served++;
                if (findProdResidue(r.body, { prodKey: PROD.key, prodUrl: PROD.url }).length) problems.push(`서버(${mode}): 운영 흔적이 남은 채 내줌(${rel})`);
            } else if (r.status === 409) refused++;
        }
        const get = (p) => core.respond({ method: 'GET', url: p });
        const cfg = get('/js/supabase-client.js').body.toString('utf8');
        if (!cfg.includes(`url: '${TEST_URL}',`) || !cfg.includes(`anonKey: '${FAKE_ANON}'`)) problems.push(`서버(${mode}): 설정이 시험 프로젝트의 값이 아님`);
        const mod = get('/js/auth-session.js').body.toString('utf8');
        if (switchValue(mod) !== mode) problems.push(`서버(${mode}): 내준 인증 모듈의 스위치가 ${mode} 가 아님`);
        const omr = get('/omr-card.html');
        if (omr.status !== 200 || !omr.body.toString('utf8').includes(`var SUPABASE_URL = '${TEST_URL}';`)) problems.push(`서버(${mode}): 답안 카드의 설정이 시험 프로젝트의 값이 아님`);
        if (get('/css/book-page-fonts.css').status !== 409) problems.push(`서버(${mode}): 운영 주소가 박힌 파일(책 글꼴)을 내줌`);
        if (get('/index.html?eon_auth=on').headers['X-B3b-Mode'] !== mode) problems.push(`서버(${mode}): 주소의 꼬리표로 모드가 바뀜`);
        if (core.respond({ method: 'POST', url: '/index.html' }).status !== 405) problems.push(`서버(${mode}): 읽기가 아닌 요청을 받음`);
        if (get('/.git/config').status === 200 || get('/.gitignore').status === 200 || get('/tests/auth-session/%2e%2e%2f%2e%2e%2findex.html').status === 200 || get('/tests%5c..%5cindex.html').status === 200 || get('/zz-no-such-file.js').status === 200) problems.push(`서버(${mode}): 목록 밖의 경로를 내줌`);
    }
    return { problems, note: `내줄 수 있는 파일 ${files.length}개를 켜짐·꺼짐으로 한 번씩(내준 것 ${served}·내주지 않은 것 ${refused})` };
}

// ---- 실행기(screen.mjs)가 판단 부분을 실제로 쓰는가 — 글자로 본다(브라우저를 띄우는 파일이라 여기서 돌리지 않는다)
export function testScreenText(mutate) {
    const problems = [];
    const rel = DIR + 'screen.mjs';
    const text = mutate ? mutate(rel, workFile(rel)) : workFile(rel);
    const code = text.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    const must = [
        ['차례를 runSequence 에 맡김', 'seq = await runSequence({'],
        ['브라우저에 필요한 환경 변수만', 'env: browserEnv(process.env)'],
        ['회원 JWT 의 발급자·계정을 차단기에 넘김', 'issuer: ISSUER'],
        ['표 요청의 범위를 차단기에 넘김(보관함·목록 전에는 전부 막음)', 'synthetic: () => (vault.armed() && SYN ?'],
        ['옛 길의 쓰기는 원복 대상', "await pause('old-path-begin', { student: key }, { needsRevert: true });"],
        ['옛 길의 원복은 확인을 받음', "await pause('old-path-reset', { student: key }, { revertOf: 'old-path-begin' });"],
        ['로그인 기록 만료는 원복 대상', "await pause('expire-session', { sid }, { needsRevert: true });"],
        ['점검 켜기는 원복 대상', "await pause('maintenance-on', { exception: 'fast' }, { needsRevert: true });"],
        ['예행의 예외를 판단 부분에 맡김', 'if (controlPassOk(rec, { method: r.method(), postData: r.postData() })) {'],
        ['합성 자료의 목록을 검사함', 'const got = checkSynthetic(body, KEYS);'],
    ];
    for (const [name, needle] of must) if (!code.includes(needle)) problems.push(`실행기: ${name} — 그 줄이 없음`);
    const iCheck = code.indexOf('checkPlan(plan, {');
    const iRefuse = code.indexOf("if (!checked.ok) { cx.notes = { planRefused: checked.why }; return; }");
    const iPause = code.indexOf("await pause('compare-plan', { student: key, plan: checked.items });");
    if (!(iCheck > 0 && iRefuse > iCheck && iPause > iRefuse) || (code.match(/pause\('compare-plan'/g) || []).length !== 1) problems.push('실행기: 저장 계획을 검사하기 전에(또는 검사에서 떨어졌는데) 제어 포트로 넘김');
    if ((code.match(/process\.env\.B3B_PW/g) || []).length !== 1 || (code.match(/process\.env\.B3B_LEGACY_PW/g) || []).length !== 1) problems.push('실행기: 비밀번호를 환경 변수에서 읽는 곳이 한 곳씩이 아님');
    if (/screenshot|tracing\.start|recordHar|storageState\(/.test(code)) problems.push('실행기: 화면 캡처·추적·HAR·상태 내보내기를 씀');
    return { problems, note: '' };
}

// ---- 합성 자료 SQL 네 파일의 글자 점검. **SQL 을 실행하지 않는다 — 문법이 맞다는 증거가 아니다.**
//      확실히 틀리는 모양(특수 문법에 스키마 이름, 짝이 맞지 않는 괄호·따옴표, raise 의 자리 수)과
//      고치고 지우는 문장마다 그 행의 주인(회원번호·이메일·신청서 번호)을 함께 거는지만 본다.
const SQL_FILES = ['fixtures_up.sql', 'fixtures_reset.sql', 'fixtures_down.sql', 'state_rows.sql'];
// 주석을 걷고(글자 안의 -- 는 둔다), 글자 밖에서만 문장을 가른다
function sqlScan(text) {
    let code = '';
    const stmts = [];
    let cur = '';
    let depth = 0;
    let minDepth = 0;
    let openQuote = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '-' && text[i + 1] === '-') { while (i < text.length && text[i] !== '\n') i++; code += '\n'; cur += '\n'; continue; }
        if (ch === "'") {
            let j = i + 1;
            openQuote = true;
            while (j < text.length) { if (text[j] === "'") { if (text[j + 1] === "'") { j += 2; continue; } openQuote = false; break; } j++; }
            const lit = text.slice(i, j + 1);
            code += lit; cur += lit; i = j;
            continue;
        }
        if (ch === '(') depth++;
        if (ch === ')') { depth--; if (depth < minDepth) minDepth = depth; }
        code += ch;
        if (ch === ';') { stmts.push(cur.trim()); cur = ''; } else cur += ch;
    }
    return { code, stmts, depth, minDepth, openQuote };
}
const noStrings = (s) => s.replace(/'(?:[^']|'')*'/g, "''");
// 맨 바깥의 쉼표로 가른 인자의 수
function topArgs(s) {
    const t = noStrings(s).trim();
    if (!t) return 0;
    let d = 0; let n = 1;
    for (const ch of t) { if (ch === '(') d++; else if (ch === ')') d--; else if (ch === ',' && d === 0) n++; }
    return n;
}
const OWNER = {
    'public.applications': ["a.id = (x->>'id')::pg_catalog.uuid", "a.user_id = x->>'member_id'", "a.email = x->>'email'"],
    'public.study_results_v3': ["s.id = (x->>'id')::pg_catalog.uuid", "s.user_id = x->>'user_id'", "s.enrollment_id::pg_catalog.text = x->>'enrollment_id'"],
    'public.tr_deadline_extensions': ["e.id = x->>'id'", "e.user_id = x->>'user_id'", "e.enrollment_id::pg_catalog.text = x->>'enrollment_id'"],
    'public.tr_user_map': ['m.user_id = any (v_members)'],
    'public.users': ["u.id = (x->>'member_id')::pg_catalog.uuid", "u.email = 'zzb3b_' || (x->>'label') || '@member.zzb3b.invalid'"],
    'security_private.member_identity': ["mi.auth_user_id = (x->>'auth_user_id')::pg_catalog.uuid", "mi.member_id = (x->>'member_id')::pg_catalog.uuid"],
};
export function testSqlText(mutate) {
    const problems = [];
    let writes = 0;
    let raises = 0;
    for (const f of SQL_FILES) {
        const rel = DIR + 'sql/' + f;
        const raw = workFile(rel);
        if (raw === null) { problems.push('SQL ' + f + ': 파일이 없음'); continue; }
        const text = (mutate ? mutate(rel, raw) : raw).replace(/\r\n/g, '\n');
        const sc = sqlScan(text);
        const bare = noStrings(sc.code);
        if (sc.openQuote) problems.push('SQL ' + f + ': 닫히지 않은 따옴표');
        if (sc.depth !== 0 || sc.minDepth < 0) problems.push('SQL ' + f + ': 괄호의 짝이 맞지 않음');
        if ((bare.match(/\$zz_b3b\$/g) || []).length % 2 !== 0) problems.push('SQL ' + f + ': 달러 따옴표의 짝이 맞지 않음');
        // 특수 문법(이름 뒤가 보통의 인자 목록이 아닌 것)에는 스키마 이름을 붙이지 않는다
        const special = bare.match(/pg_catalog\.(extract|coalesce|nullif|greatest|least|position|substring|trim|overlay|cast|exists|current_date|current_timestamp|localtimestamp)\b/gi);
        if (special) problems.push('SQL ' + f + ': 특수 문법에 스키마 이름을 붙임(' + [...new Set(special.map((s) => s.toLowerCase()))].join(', ') + ')');
        if (/\bextract\s*\(/i.test(bare) && !/\(extract\(epoch from pg_catalog\.now\(\)\)\)::bigint/.test(bare)) problems.push('SQL ' + f + ': extract 의 모양이 정해 둔 것((extract(epoch from …))::bigint)이 아님');
        // raise 의 자리 수 = 넘긴 값의 수
        for (const st of sc.stmts) {
            const m = st.match(/raise exception '((?:[^']|'')*)'([\s\S]*)$/);
            if (!m) continue;
            raises++;
            const holes = (m[1].replace(/%%/g, '').match(/%/g) || []).length;
            const rest = m[2].trim();
            const args = rest === '' ? 0 : (rest.startsWith(',') ? topArgs(rest.slice(1)) : -1);
            if (args !== holes) problems.push('SQL ' + f + ': raise 의 자리 ' + holes + '개에 값 ' + args + '개');
        }
        // 고치고 지우는 문장마다 그 행의 주인을 함께 건다
        for (const st of sc.stmts) {
            const m = st.match(/\b(delete from|update)\s+((?:public|security_private|auth|storage)\.[a-z_0-9]+)/);
            if (!m) continue;
            writes++;
            const need = OWNER[m[2]];
            if (!need) { problems.push('SQL ' + f + ': 정해 두지 않은 표를 고치거나 지움(' + m[2] + ')'); continue; }
            const body = st.slice(m.index);
            for (const n of need) if (!body.includes(n)) problems.push('SQL ' + f + ': ' + m[2] + ' 를 ' + (m[1] === 'update' ? '고치는' : '지우는') + ' 문장에 주인 조건이 없음');
        }
        // 넣는 표는 올리기에서만, 정해 둔 여섯 표만
        const ins = [...bare.matchAll(/\binsert into\s+([a-z_.0-9]+)/g)].map((m) => m[1]);
        const okIns = f === 'fixtures_up.sql' ? ['zzb3b_plan', 'public.users', 'security_private.member_identity', 'public.applications', 'public.study_results_v3', 'public.tr_deadline_extensions', 'public.tr_user_map']
            : f === 'fixtures_reset.sql' ? ['zzb3b_reset_result'] : f === 'fixtures_down.sql' ? ['zzb3b_down_result'] : [];
        for (const t of ins) if (!okIns.includes(t)) problems.push('SQL ' + f + ': 정해 두지 않은 표에 넣음(' + t + ')');
        if (f === 'state_rows.sql') {
            if (/\b(insert|update|delete|create|alter|drop|truncate|grant|set)\b/i.test(bare.replace(/pg_catalog\.current_setting/g, ''))) problems.push('SQL state_rows.sql: 읽기만 하는 파일에 바꾸는 문장');
            if (!sc.code.includes("(pg_catalog.to_jsonb(u) - 'password')")) problems.push('SQL state_rows.sql: 회원 표의 집계에서 비밀번호 열을 빼지 않음');
            for (const t of ['users', 'member_identity', 'applications', 'study_results_v3', 'tr_user_map', 'tr_deadline_extensions']) if (!new RegExp("'outside'[\\s\\S]*'" + t + "', \\(select pg_catalog\\.jsonb_build_object\\('rows'").test(sc.code)) problems.push('SQL state_rows.sql: 합성 밖 행의 집계 지문에 ' + t + ' 가 없음');
        } else {
            if ((bare.match(/^begin;$/gm) || []).length !== 1 || (bare.match(/^commit;$/gm) || []).length !== 1) problems.push('SQL ' + f + ': begin·commit 이 한 번씩이 아님');
            if (!sc.code.includes("current_setting('b3b.test_project_ref', true), '') <> 'hmncdheiwqwekdbtijar'")) problems.push('SQL ' + f + ': 대상 확인 값을 보지 않음');
        }
        // 되돌리기·내리기: 목록 자체의 검사(겹친 번호·주인)가 고치고 지우는 문장보다 앞에 있다
        if (f === 'fixtures_reset.sql' || f === 'fixtures_down.sql') {
            const iList = sc.code.indexOf('목록에 겹친(또는 빠진) 번호가');
            const iOwn = sc.code.indexOf('목록의 마감 연장 %개가 목록의 합성 회원');
            const firstWrite = Math.min(...['update public.', 'delete from public.', 'delete from security_private.'].map((w) => { const i = sc.code.indexOf(w); return i < 0 ? Infinity : i; }));
            if (!(iList > 0 && iOwn > iList && iOwn < firstWrite)) problems.push('SQL ' + f + ': 목록 자체의 검사(겹친 번호·주인)가 고치고 지우는 문장보다 앞에 있지 않음');
        }
        // 비밀번호 열의 원문은 어디에도 내보내지 않는다: 올리기의 넣는 자리 한 곳에서만 읽는다
        const pwReads = (sc.code.match(/current_setting\('b3b\.legacy_pw'/g) || []).length;
        if (f === 'fixtures_up.sql' ? pwReads !== 2 : pwReads !== 0) problems.push('SQL ' + f + ': 옛 길 비밀번호 값을 읽는 곳이 정해 둔 수가 아님');
        if (/u\.password|'password',|\bpassword\s*(as|=)/i.test(bare.replace(/insert into public\.users \(id, email, password,/, ''))) problems.push('SQL ' + f + ': 비밀번호 열을 읽거나 내보냄');
    }
    return { problems, note: '글자만 봤다(실행 0 — 문법이 맞다는 증거가 아니다). 고치고 지우는 문장 ' + writes + '개, raise ' + raises + '개' };
}
