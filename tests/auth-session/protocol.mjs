// 두 저장소의 인증 모듈이 같은 규약인가: 같은 입력(로그인·새로 고침·로그아웃·서버의 답) → 같은 상태·같은 요청.
//   공홈의 모듈(공홈 브랜치 보안작업-묶음2-공홈인증 4341235 의 js/auth-session.js)로 만든 기준표(protocol-golden.json)와
//   테스트룸의 모듈을 같은 가짜 서버·같은 차례로 돌린 결과를 견준다.
// 기준표를 다시 만들기(공홈 저장소의 파일을 읽기만 한다):
//   node tests/auth-session/protocol.mjs --write-golden <공홈 js/auth-session.js 의 경로>
// 화면 스크립트(js/auth.js)는 올리지 않는다 — 모듈만 본다. 전부 가짜 서버다.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { FakeBrowser } from './browser.mjs';
import { FakeSupabase } from './fake-supabase.mjs';
import { TEST_URL, rewriteSwitch } from './rewrite.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
export const GOLDEN_FILE = path.join(HERE, 'protocol-golden.json');
const ANON = 'zz-fake-anon-key-protocol';
const PW = 'zz-protocol-pw';
const norm = (t) => t.replace(/\r\n/g, '\n');
const read = (p) => norm(fs.readFileSync(p, 'utf8'));
export const sha256 = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

const ACCOUNTS = {
    A: { email: 'zzproto_a@member.zz.invalid', authId: 'auth-A' },
    B: { email: 'zzproto_b@member.zz.invalid', authId: 'auth-B' },
};

// kind: 'homepage'(공홈의 설정 모양) / 'testroom'(테스트룸의 설정 모양)
function makeRig(kind, moduleSource, mutate) {
    const sdk = read(path.join(ROOT, 'vendor', 'supabase-2.116.0.js'));
    let source = rewriteSwitch(moduleSource, 'on');
    if (mutate) source = mutate('js/auth-session.js', source);
    const glue = kind === 'homepage'
        ? `const SUPABASE_URL = '${TEST_URL}'; const SUPABASE_ANON_KEY = '${ANON}';`
        : `const SUPABASE_CONFIG = { url: '${TEST_URL}', anonKey: '${ANON}' };`;
    const rig = {};
    rig.browser = new FakeBrowser({ net: async (req) => rig.server.handle(req) });
    rig.server = new FakeSupabase({ origin: TEST_URL, anonKey: ANON, now: () => rig.browser.now });
    for (const [k, a] of Object.entries(ACCOUNTS)) {
        rig.server.addAccount({ email: a.email, password: PW, authId: a.authId, member: 'ok', profile: { id: 'm-' + k, name: '합성 ' + k, nickname: null, email: a.email, phone: null, timezone: null } });
    }
    rig.tab = rig.browser.newTab('T');
    rig.mark = 0;
    rig.open = async () => {
        const page = rig.tab.open({ files: (p) => (p === 'vendor/supabase-2.116.0.js' ? sdk : null), pageFile: 'index.html', ids: [] });
        page.run(glue, 'glue');
        page.run(source, 'js/auth-session.js');
        await page.domContentLoaded();
        rig.page = page;
    };
    rig.snap = () => {
        const reqs = rig.server.log.slice(rig.mark).map((e) => `${e.route}${e.search} [${e.cred}]`);
        rig.mark = rig.server.log.length;
        const p = rig.page;
        return {
            state: p.evaluate('EonAuth.state()'),
            reason: p.evaluate('EonAuth.reason()'),
            profile: p.evaluate('EonAuth.profile() ? EonAuth.profile().id : null'),
            access: p.evaluate('EonAuth.siteAccess() ? JSON.stringify(EonAuth.siteAccess()) : null'),
            reqs,
        };
    };
    return rig;
}

// 걸음: 화면이 하는 일과 서버 쪽의 변화
const S = {
    open: () => async (r) => { await r.open(); await r.browser.advance(100); },
    signIn: (key, pw) => async (r) => {
        r.page.sandbox.__out = null;
        r.page.evaluate(`EonAuth.signIn('${ACCOUNTS[key].email}', '${pw === undefined ? PW : pw}').then((v) => { __out = v.outcome; }, () => { __out = 'threw'; })`);
        await r.browser.advance(60 * 1000);
        return { outcome: r.page.sandbox.__out };
    },
    signOut: () => async (r) => {
        r.page.sandbox.__out = null;
        r.page.evaluate("EonAuth.signOut().then((v) => { __out = v.outcome; }, () => { __out = 'threw'; })");
        await r.browser.advance(60 * 1000);
        return { outcome: r.page.sandbox.__out };
    },
    recheck: () => async (r) => { r.page.evaluate('EonAuth.recheck()'); await r.browser.advance(90 * 1000); },
    reload: () => async (r) => { await r.open(); await r.browser.advance(90 * 1000); },
    wait: (ms) => async (r) => { await r.browser.advance(ms); },
    member: (key, value) => async (r) => { r.server.accounts.get(ACCOUNTS[key].email).member = value; },
    maintenance: (on) => async (r) => { r.server.maintenance = on; },
    allowed: (v) => async (r) => { r.server.allowedOverride = v; },
    end: (code) => async (r) => { for (const s of r.server.sessions.values()) r.server.endSession(s, code); },
    fault: (name, how) => async (r) => { if (how === null) delete r.server.faults[name]; else r.server.faults[name] = how; },
    refreshFault: (how) => async (r) => { r.server.faults.token = (req, u) => (u.searchParams.get('grant_type') === 'refresh_token' ? how() : null); },
    expireStored: (storage) => async (r) => {
        // 저장된 만료 시각이 지난 것으로(공홈은 브라우저 단위, 테스트룸은 탭 단위 저장소 — 이름도 다르다)
        const stores = [[r.browser.local, 'eon_auth_v1'], [r.tab.session, 'tr_auth_v1']];
        for (const [store, key] of stores) {
            if (!store.has(key)) continue;
            const v = JSON.parse(store.get(key));
            v.expires_at = Math.floor(r.browser.now / 1000) - 60;
            store.set(key, JSON.stringify(v));
        }
        void storage;
    },
};
const lost = () => 'network';
const status = (code, body) => () => ({ status: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

export const VECTORS = [
    ['로그인 → 새로 고침 → 로그아웃', [S.open(), S.signIn('A'), S.reload(), S.signOut(), S.reload()]],
    ['틀린 비밀번호', [S.open(), S.signIn('A', 'zz-wrong')]],
    ['차단', [S.open(), S.member('A', 'blocked'), S.signIn('A'), S.reload()]],
    ['탈퇴 처리 중', [S.open(), S.member('A', 'withdrawal'), S.signIn('A')]],
    ['회원 대응 없음(이 로그인을 끝낸다)', [S.open(), S.member('A', 'none'), S.signIn('A'), S.reload()]],
    ['회원 대응 없음 + 종료의 답 없음', [S.open(), S.member('A', 'none'), S.fault('logout', lost), S.signIn('A')]],
    ['allowed 거짓', [S.open(), S.allowed(false), S.signIn('A')]],
    ['점검(503)', [S.open(), S.maintenance(true), S.signIn('A'), S.maintenance(false), S.reload()]],
    ['my_profile 429', [S.open(), S.fault('my_profile', status(429)), S.signIn('A')]],
    ['my_profile 응답 없음', [S.open(), S.fault('my_profile', lost), S.signIn('A'), S.fault('my_profile', null), S.reload()]],
    ['my_profile 응답 모양이 다름', [S.open(), S.fault('my_profile', status(200, { state: 'ok' })), S.signIn('A')]],
    ['my_site_access 500', [S.open(), S.fault('my_site_access', status(500)), S.signIn('A')]],
    ['my_site_access 응답 없음', [S.open(), S.fault('my_site_access', lost), S.signIn('A')]],
    ['끝난 기록 → 새로 고침: session_expired', [S.open(), S.signIn('A'), S.end('session_expired'), S.reload(), S.reload()]],
    ['끝난 기록 → 새로 고침: session_not_found', [S.open(), S.signIn('A'), S.end('session_not_found'), S.reload()]],
    ['끝난 기록 → 새로 고침: refresh_token_not_found', [S.open(), S.signIn('A'), S.end('refresh_token_not_found'), S.reload(), S.reload()]],
    ['끝난 기록 → 새로 고침: refresh_token_already_used', [S.open(), S.signIn('A'), S.end('refresh_token_already_used'), S.reload()]],
    ['끝난 기록 → 새로 고침: 갱신 429', [S.open(), S.signIn('A'), S.end('session_expired'), S.refreshFault(status(429, { code: 'over_request_rate_limit' })), S.reload()]],
    ['끝난 기록 → 새로 고침: 갱신 5xx', [S.open(), S.signIn('A'), S.end('session_expired'), S.refreshFault(status(500)), S.reload()]],
    ['끝난 기록 → 새로 고침: 갱신의 답 없음', [S.open(), S.signIn('A'), S.end('session_expired'), S.refreshFault(lost), S.reload()]],
    ['끝난 기록 → 다시 확인(recheck)', [S.open(), S.signIn('A'), S.end('session_expired'), S.recheck()]],
    ['만료된 JWT 로 새로 고침(갱신 성공)', [S.open(), S.signIn('A'), S.expireStored(), S.reload()]],
    ['만료된 JWT 로 새로 고침(갱신의 답 없음)', [S.open(), S.signIn('A'), S.expireStored(), S.refreshFault(lost), S.reload()]],
    ['로그아웃의 답 없음', [S.open(), S.signIn('A'), S.fault('logout', lost), S.signOut(), S.fault('logout', null), S.reload()]],
    ['로그아웃 5xx', [S.open(), S.signIn('A'), S.fault('logout', status(500)), S.signOut()]],
    ['로그아웃 429', [S.open(), S.signIn('A'), S.fault('logout', status(429)), S.signOut()]],
    ['로그아웃 401', [S.open(), S.signIn('A'), S.fault('logout', status(401, { code: 'bad_jwt' })), S.signOut()]],
    ['로그아웃 403(코드 없음)', [S.open(), S.signIn('A'), S.fault('logout', status(403)), S.signOut()]],
    ['이미 끝난 기록의 로그아웃(403·session_not_found)', [S.open(), S.signIn('A'), S.end('session_not_found'), S.signOut()]],
    ['다른 계정으로 다시 로그인(앞의 것을 먼저 끝낸다)', [S.open(), S.signIn('A'), S.signIn('B'), S.reload()]],
    ['다시 로그인하려는데 앞의 것을 끝내지 못함', [S.open(), S.signIn('A'), S.fault('logout', lost), S.signIn('B')]],
    ['시간이 지나 갱신(1시간 10분)', [S.open(), S.signIn('A'), S.wait(70 * 60 * 1000), S.recheck()]],
    ['로그인 뒤 다시 확인(recheck)', [S.open(), S.signIn('A'), S.recheck()]],
    ['로그인 전 로그아웃', [S.open(), S.signOut()]],
];

export async function runVectors(kind, moduleSource, mutate) {
    const out = {};
    for (const [name, steps] of VECTORS) {
        const rig = makeRig(kind, moduleSource, mutate);
        const trail = [];
        for (const step of steps) {
            const extra = await step(rig);
            if (rig.page) trail.push(Object.assign(rig.snap(), extra || {}));
        }
        out[name] = trail;
    }
    return out;
}

// 테스트룸의 모듈을 기준표와 견준다. 돌려주는 값: { problems, vectors, steps, golden }
export async function compareWithGolden(moduleSource, mutate) {
    const problems = [];
    let golden = null;
    try { golden = JSON.parse(fs.readFileSync(GOLDEN_FILE, 'utf8')); } catch (e) { return { problems: ['규약 대조: 기준표(protocol-golden.json)를 읽지 못함'], vectors: 0, steps: 0, golden: null }; }
    const got = await runVectors('testroom', moduleSource, mutate);
    let steps = 0;
    if (JSON.stringify(Object.keys(golden.vectors)) !== JSON.stringify(VECTORS.map((v) => v[0]))) problems.push('규약 대조: 기준표의 입력 목록이 지금의 목록과 다름(기준표를 다시 만들어야 한다)');
    for (const [name] of VECTORS) {
        const a = golden.vectors[name] || [];
        const b = got[name] || [];
        steps += b.length;
        if (JSON.stringify(a) === JSON.stringify(b)) continue;
        let where = `걸음 수 ${a.length}≠${b.length}`;
        for (let i = 0; i < Math.min(a.length, b.length); i++) {
            if (JSON.stringify(a[i]) === JSON.stringify(b[i])) continue;
            const keys = Object.keys(Object.assign({}, a[i], b[i])).filter((k) => JSON.stringify(a[i][k]) !== JSON.stringify(b[i][k]));
            where = `${i + 1}번째 걸음의 ${keys.join('·')}(공홈 ${a[i].state}·${a[i].reason} / 테스트룸 ${b[i].state}·${b[i].reason})`;
            break;
        }
        problems.push(`규약 대조 › ${name}: 공홈의 모듈과 다름 — ${where}`);
    }
    return { problems, vectors: VECTORS.length, steps, golden: golden.source };
}

// 기준표 만들기
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const i = process.argv.indexOf('--write-golden');
    if (i < 0 || !process.argv[i + 1]) { console.error('쓰는 법: node tests/auth-session/protocol.mjs --write-golden <공홈 js/auth-session.js 의 경로>'); process.exit(2); }
    const src = read(process.argv[i + 1]);
    const vectors = await runVectors('homepage', src, null);
    const source = { repo: '공홈(eontoefl_official_website)', branch: '보안작업-묶음2-공홈인증', commit: '4341235', file: 'js/auth-session.js', sha256: sha256(src), bytes: Buffer.byteLength(src) };
    fs.writeFileSync(GOLDEN_FILE, JSON.stringify({ note: '공홈의 인증 모듈을 가짜 서버로 돌려 만든 기준표다(실제 서버의 기록이 아니다). 자격·주소·이메일은 들어 있지 않다.', source, vectors }, null, 1) + '\n');
    console.log('기준표를 씀:', Object.keys(vectors).length, '가지,', Object.values(vectors).reduce((n, t) => n + t.length, 0), '걸음, 공홈 모듈 sha256', source.sha256);
}
