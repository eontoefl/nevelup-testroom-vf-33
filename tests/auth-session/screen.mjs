// 화면 시험 실행기 (보안작업 묶음2 계약 3B) — 실제 브라우저(Chromium)로 절차를 돌린다.
// (공홈 계약 3A 의 tests/auth-session/screen.mjs 를 테스트룸에 맞게 옮긴 것: 지키는 것은 같고 경우들이 다르다)
//
//   node tests/auth-session/screen.mjs --fake            가짜 서버(fake-supabase.mjs·fake-rest.mjs)를 상대로 — 작업방이 돌리는 것
//   node tests/auth-session/screen.mjs --real            시험 프로젝트(hmncdheiwqwekdbtijar)를 상대로 — 브레인방만
//   [--out 결과.json] [--only F,S-fast,RG] [--pause-timeout-ms 600000] [--headed]
//
// 환경 변수
//   B3B_PLAYWRIGHT   playwright-core 폴더의 경로            B3B_CHROMIUM   chrome.exe 의 경로      (둘 다 필수. 설치·내려받기를 하지 않는다)
//   --real 일 때: B3B_TEST_URL(정확히 시험 프로젝트의 주소), B3B_TEST_ANON_KEY(시험 프로젝트의 anon 키),
//                B3B_PW(새 길 — 합성 로그인 계정 공통 비밀번호), B3B_LEGACY_PW(옛 길 전용 — 합성 회원의 회원 표 비밀번호 열에 넣은 일회성 합성 값. B3B_PW 와 달라야 한다),
//                B3B_EMAIL_<유형>(합성 학생 유형마다 — 유형 이름은 절차.md), B3B_CONTROL_SECRET(16자 이상), [B3B_CONTROL_PORT]
//
// 지키는 것
//   * 모든 요청(새 창·화면 이동·폼·리디렉션 포함)이 차단기(request-log.mjs)의 결정을 거친 뒤에만 나간다.
//     브라우저는 127.0.0.1 말고는 이름을 풀지 못하게 띄운다 — 시험 프로젝트로 가는 요청은 차단기를 지난 뒤 이 실행기가 대신 내보낸다.
//     리디렉션 응답은 브라우저에 넘기지 않고 다음 주소를 차단기로 다시 가른다. 서비스 워커는 끈다.
//   * 차단기를 붙이지 못하면 아무 화면도 열지 않는다. playwright-core·Chromium 을 쓸 수 없으면 종료한다(다른 방식으로 넘어가지 않는다).
//   * 경우마다 디스크에 남지 않는 새 브라우저 상태(context). 추적·HAR·상태 내보내기·화면 캡처를 하지 않는다.
//   * 비밀번호·이메일·JWT·갱신값을 출력·파일에 쓰지 않는다. 결과에는 정해 둔 판정값·이름·수만 적는다.
//   * --fake 에서는 시험 프로젝트·바깥으로 나가는 연결이 0 이어야 한다(실행기가 연 연결도 센다).
//   * 차단의 예행(P)이 전부 통과하기 전에는 비밀번호를 꺼낼 수 없고(보관함), 뒤의 경우를 하나도 시작하지 않는다.
//   * DB 변경이 남는 멈춤(옛 길의 쓰기·로그인 기록 만료·점검)은 내놓는 순간 원복 대상으로 표시하고, 원복 확인을 받기 전에는 다음 경우를 시작하지 않는다.
//   * 꺼짐의 화면(옛 길)이 보내는 요청도 전송 전에 좁힌다: 회원 표는 정확한 두 조회만, 쓰기는 이번 실행의 합성 행·허용한 열만.
//   * 새 길의 저장 계획은 화면에서 온 값이다 — 표·열·행·값의 모양을 확인한 뒤에만 제어 포트로 넘긴다. 계획을 SQL 로 실행하지 않는다.
//   * Sentry·첨삭 발주 웹훅·바깥 링크·소리 파일 등 바깥으로 가는 것은 전송 전에 막고 센다.
//   종료 코드: 0 통과 / 1 통과 아님 / 2 환경 / 3 원복 확인을 받지 못함·중단 / 4 예행(P) 실패 — 뒤의 경우를 돌리지 않음 / 5 결과에 비밀값의 흔적

import fs from 'node:fs';
import net from 'node:net';
import dns from 'node:dns';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import { TEST_URL, TEST_REF, CONFIG_FILE, readProdConfig } from './rewrite.mjs';
import { FakeRest } from './fake-rest.mjs';
import { STUDENTS, ENTERING, authAccount } from './fixtures.mjs';
import { createCore, makeIgnore } from './serve-core.mjs';
import { makeDecider, summarize } from './request-log.mjs';
import { FakeSupabase, fakeJwt } from './fake-supabase.mjs';
import { ISSUER, PauseTimeout, PauseBoard, makeVault, runSequence, confirmRevert, browserEnv, controlPassOk, checkPlan, checkSynthetic, rosterOk } from './screen-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback; };
const flag = (name) => process.argv.includes(name);
function stop(message) { console.error('중단: ' + message); process.exit(2); }

const FAKE = flag('--fake');
const REAL = flag('--real');
if (FAKE === REAL) stop('--fake 또는 --real 중 하나를 주세요');
const ONLY = arg('--only') ? new Set(arg('--only').split(',')) : null;
const PAUSE_TIMEOUT = Number(arg('--pause-timeout-ms', '600000'));
// 실행기 자신의 대조 실험(--fake 에서만): 일부러 고장을 내고 실행기가 멈추는지 본다
//   --selftest leaky-blocker        차단기가 시험 목적지로 가는 요청을 보내 주게 한다 → 예행(P)이 잡고, 뒤의 경우를 시작하지 않아야 한다(종료 코드 4)
//   --selftest silent-operator      가짜 조작자가 옛 길의 원복과 원복 확인에 답하지 않는다 → 다음 경우를 시작하지 않아야 한다(종료 코드 3)
//   --selftest bad-plan             화면에서 읽은 저장 계획에 합성 행이 아닌 행을 끼워 넣는다 → 넘기지 않아야 한다(그 경우는 기대와 다름)
//   --selftest bad-control-pass     예행의 대조용 요청을 자격·본문이 실린 POST 로 보낸다 → 예외로 내보내지 않아야 한다(수신 0, 종료 코드 4)
//   --selftest unsafe-write         켜진 화면에서 업무 쓰기를 시켜 본다 → 전송 전에 막고, 그 경우를 끝내고, 뒤의 경우를 시작하지 않아야 한다(종료 코드 6)
const SELFTEST = arg('--selftest', null);
if (SELFTEST && !FAKE) stop('--selftest 는 --fake 에서만 쓴다');
if (SELFTEST && !['leaky-blocker', 'silent-operator', 'bad-plan', 'bad-control-pass', 'unsafe-write'].includes(SELFTEST)) stop('--selftest 의 값이 맞지 않음');
const OUT = path.resolve(arg('--out', path.join(ROOT, 'tests', 'auth-session', '.run', `screen-${FAKE ? 'fake' : 'real'}.json`)));

// ---------------------------------------------------------------------------
// 환경
// ---------------------------------------------------------------------------
// 합성 학생 유형(fixtures.mjs 의 이름 그대로 — 시험 프로젝트의 합성 자료도 같은 유형이다)
const KEYS = STUDENTS.map((s) => s.key);
const envKey = (k) => 'B3B_EMAIL_' + k.toUpperCase();
let ANON;
let CONTROL_SECRET;
let vault;                 // 비밀번호·이메일의 보관함: 예행(P)이 통과하기 전에는 꺼낼 수 없다
let SYN = null;            // 합성 자료의 목록(회원번호·신청서 번호·학습 기록 번호 — 비밀이 아니다): { students, flat }
const SCAN = [];           // 끝에서 결과에 흔적이 없는지 찾아볼 값들(찾는 데만 쓴다)
const fakeEmail = (k) => `zzb3b_${k}@member.zz.invalid`;      // --fake 의 합성 이메일(fixtures.mjs 와 같다 — 비밀이 아니다)
{
    let PW;
    let LEGACY_PW;
    const EMAIL = {};
    if (FAKE) {
        ANON = fakeJwt({ role: 'anon', ref: TEST_REF, fake: true });      // 가짜 공개 키(서명 자리는 고정 글자)
        PW = 'zz-' + crypto.randomBytes(9).toString('hex');
        LEGACY_PW = 'zz-' + crypto.randomBytes(9).toString('hex');
        for (const k of KEYS) EMAIL[k] = fakeEmail(k);
        CONTROL_SECRET = crypto.randomBytes(24).toString('hex');
    } else {
        if (process.env.B3B_TEST_URL !== TEST_URL) stop(`B3B_TEST_URL 이 시험 프로젝트의 주소(${TEST_URL})와 정확히 같지 않음`);
        ANON = process.env.B3B_TEST_ANON_KEY || '';
        let claims = null;
        try { claims = JSON.parse(Buffer.from(ANON.split('.')[1], 'base64url').toString('utf8')); } catch (e) { claims = null; }
        if (!claims || claims.ref !== TEST_REF || claims.role !== 'anon') stop('B3B_TEST_ANON_KEY 가 시험 프로젝트의 anon 키가 아님');
        PW = process.env.B3B_PW || '';
        if (PW.length < 8) stop('B3B_PW 가 없거나 너무 짧음');
        LEGACY_PW = process.env.B3B_LEGACY_PW || '';
        if (LEGACY_PW.length < 8) stop('B3B_LEGACY_PW 가 없거나 너무 짧음');
        if (LEGACY_PW === PW || LEGACY_PW === '999999') stop('B3B_LEGACY_PW 는 B3B_PW 와 달라야 한다(회원 표는 공개 키로 읽힌다 — 로그인 계정의 비밀번호를 거기에 두지 않는다)');
        for (const k of KEYS) { EMAIL[k] = process.env[envKey(k)] || ''; if (!/^[^@\s]+@[^@\s]+$/.test(EMAIL[k])) stop(envKey(k) + ' 가 없음'); }
        if (new Set(Object.values(EMAIL)).size !== KEYS.length) stop('합성 이메일이 서로 달라야 한다');
        // 받는 이메일은 정해 둔 합성 명단(zzb3b_<유형>@member.zzb3b.invalid 의 정확한 14개)과 글자까지 같아야 한다
        if (!rosterOk(EMAIL, KEYS)) stop('합성 이메일이 정해 둔 명단(zzb3b_<유형>@member.zzb3b.invalid)과 다름 — ' + KEYS.map(envKey).join(', ') + ' 를 확인할 것');
        CONTROL_SECRET = process.env.B3B_CONTROL_SECRET || '';
        if (CONTROL_SECRET.length < 16) stop('B3B_CONTROL_SECRET 이 없거나 16자보다 짧음(실행마다 새로 만든 값)');
    }
    const values = { PW, LEGACY_PW };
    for (const k of KEYS) values['EMAIL_' + k] = EMAIL[k];
    vault = makeVault(values);
    SCAN.push(PW, LEGACY_PW, ANON, CONTROL_SECRET, ...(FAKE ? [] : Object.values(EMAIL)));
}
const SINGLE = ['W', 'E', 'RG', 'LO', 'EX', 'MT', 'WN', 'NM', 'BC', 'OFF'];
const EXPECTED_IDS = ['P', 'F', ...KEYS.map((k) => 'S-' + k), ...SINGLE];

const pwPath = process.env.B3B_PLAYWRIGHT;
const chromePath = process.env.B3B_CHROMIUM;
if (!pwPath || !fs.existsSync(pwPath)) stop('B3B_PLAYWRIGHT(playwright-core 폴더)가 없음 — 이 실행기는 설치·내려받기를 하지 않는다');
if (!chromePath || !fs.existsSync(chromePath)) stop('B3B_CHROMIUM(chrome.exe)이 없음 — 이 실행기는 설치·내려받기를 하지 않는다');
let chromium;
try { chromium = createRequire(import.meta.url)(pwPath).chromium; } catch (e) { chromium = null; }
if (!chromium || typeof chromium.launch !== 'function') stop('playwright-core 를 쓸 수 없음 — 같은 보호를 입증하지 못한 다른 방식으로 넘어가지 않고 종료한다');

// ---------------------------------------------------------------------------
// 실행기가 여는 연결도 막고 센다: 127.0.0.1 과(--real 일 때만) 시험 프로젝트
// ---------------------------------------------------------------------------
const egress = { local: 0, testProject: 0, blocked: 0 };
{
    const LOCAL = new Set(['127.0.0.1', 'localhost', '::1']);
    const testHost = new URL(TEST_URL).hostname;
    const classify = (host) => (LOCAL.has(host) ? 'local' : (REAL && host === testHost ? 'testProject' : 'blocked'));
    const origConnect = net.Socket.prototype.connect;
    net.Socket.prototype.connect = function (...args) {
        let host = 'localhost';
        let pipe = false;
        const first = Array.isArray(args[0]) ? args[0][0] : args[0];
        if (first && typeof first === 'object') { if (first.path) pipe = true; host = first.host || first.hostname || 'localhost'; }
        else if (typeof first === 'string') pipe = true;
        else if (typeof args[1] === 'string') host = args[1];
        const kind = pipe ? 'local' : classify(String(host));
        egress[kind]++;
        if (kind === 'blocked') { process.nextTick(() => this.destroy(new Error('b3b: 허용 밖 연결을 막음'))); return this; }
        return origConnect.apply(this, args);
    };
    const origLookup = dns.lookup;
    dns.lookup = function (hostname, ...rest) {
        if (classify(String(hostname)) === 'blocked') {
            egress.blocked++;
            const cb = rest[rest.length - 1];
            if (typeof cb === 'function') process.nextTick(() => cb(Object.assign(new Error('b3b: 허용 밖 이름 풀이를 막음'), { code: 'ENOTFOUND' })));
            return {};
        }
        return origLookup.call(this, hostname, ...rest);
    };
}

// ---------------------------------------------------------------------------
// 로컬 서버 둘(켜짐·꺼짐)과 제어 포트 — 전부 127.0.0.1
// ---------------------------------------------------------------------------
const tracked = execFileSync('git', ['-c', 'core.quotepath=false', 'ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\0').filter(Boolean);
let ignoreText = '';
try { ignoreText = fs.readFileSync(path.join(ROOT, '.vercelignore'), 'utf8'); } catch (e) { ignoreText = ''; }
const ignored = makeIgnore(ignoreText);
const files = tracked.filter((f) => !ignored(f) && !f.startsWith('.'));
const prod = readProdConfig(fs.readFileSync(path.join(ROOT, CONFIG_FILE), 'utf8'));
const readFile = (rel) => { try { return fs.readFileSync(path.join(ROOT, rel)); } catch (e) { return null; } };

async function startSite(mode) {
    const server = http.createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const core = createCore({ files, readFile, mode, testKey: ANON, port, prod, log: null });
    server.on('request', (req, res) => {
        const chunks = [];
        req.on('data', (c) => { if (chunks.length < 64) chunks.push(c); });
        req.on('end', () => {
            let out;
            try { out = core.respond({ method: req.method, url: req.url, body: Buffer.concat(chunks) }); } catch (e) { out = { status: 500, headers: {}, body: Buffer.alloc(0) }; }
            res.writeHead(out.status, out.headers);
            res.end(out.body);
        });
    });
    return { server, core, origin: `http://127.0.0.1:${port}` };
}

// 제어 포트: 브레인방이 사이에 끼어야 하는 단계에서 멈춰 기다린다.
// 127.0.0.1 이라는 것은 권한 확인이 아니다 — 실행마다의 비밀과 그 멈춤의 일회용 단계 번호가 둘 다 맞는 명령만 받는다.
const control = { server: null, port: 0, arrivals: 0, rejected: 0 };
const board = new PauseBoard({
    timeoutMs: PAUSE_TIMEOUT,
    randomStep: () => crypto.randomInt(100000, 999999999),
    onOpen: (w) => console.log(`  [멈춤] ${w.kind}${w.needsRevert ? ' (DB 변경이 남는다 — 원복 대상으로 표시함)' : ''} — 제어 포트 ${control.port} 에서 기다림(단계 번호는 GET /wait 로)`),
});
function secretOk(value) {
    const a = Buffer.from(String(value || ''));
    const b = Buffer.from(CONTROL_SECRET);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}
async function startControl() {
    control.server = http.createServer((req, res) => {
        control.arrivals++;
        const chunks = [];
        let size = 0;
        req.on('data', (c) => { size += c.length; if (size <= 262144) chunks.push(c); });
        req.on('end', () => {
            const reply = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
            if (!secretOk(req.headers['x-b3b-secret'])) { control.rejected++; return reply(403, { error: 'forbidden' }); }
            const u = new URL(req.url, 'http://127.0.0.1');
            if (req.method === 'GET' && u.pathname === '/wait') {
                return reply(200, { waiting: board.view(), pendingRevert: board.pendingRevert });
            }
            if (req.method === 'POST' && u.pathname === '/continue') {
                let body = null;
                if (size > 262144) return reply(413, { error: 'too-large' });
                try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null; } catch (e) { return reply(400, { error: 'bad-json' }); }
                if (!board.answer(u.searchParams.get('step'), body)) { control.rejected++; return reply(409, { error: 'no-such-step' }); }
                return reply(200, { ok: true, pendingRevert: board.pendingRevert });
            }
            control.rejected++;
            return reply(404, { error: 'not-found' });
        });
    });
    const wanted = Number(process.env.B3B_CONTROL_PORT || 0);
    await new Promise((resolve) => control.server.listen(wanted, '127.0.0.1', resolve));
    control.port = control.server.address().port;
}

// 멈춤(장부는 screen-core.mjs): kind 는 정해 둔 이름, info 는 비밀이 아닌 식별값(로그인 기록 번호·계정 이름표).
//   needsRevert 인 멈춤은 내놓는 순간 원복 대상으로 표시된다. revertOf 인 멈춤은 본문 { "reverted": true } 를 받아야 그 표시를 지운다.
// 안전 조건을 어긴 요청이 나온 뒤에는 새 일을 시키는 멈춤을 내놓지 않는다(되돌리는 멈춤만 내놓는다 — DB 에 남기지 않으려고)
const pause = (kind, info, opts) => {
    if (HALT && !(opts && opts.revertOf)) return Promise.reject(new Error('안전 조건을 어긴 요청이 나와 멈춤'));
    return board.open(kind, info, opts);
};

// ---------------------------------------------------------------------------
// --fake: 가짜 서버와, 브레인방 구실을 하는 가짜 조작자(제어 포트로 답한다)
// ---------------------------------------------------------------------------
let fake = null;
let fakeRest = null;
const fakeNotes = { snapshot: null, oldWrites: {}, mark: 0 };
const clone = (v) => JSON.parse(JSON.stringify(v));
function setupFake() {
    // 합성 학생 유형의 표(fixtures.mjs) — 옛 길의 비밀번호 열에는 이번 실행의 옛 길 전용 값을 넣는다
    const tables = {};
    for (const s of STUDENTS) {
        for (const [name, rows] of Object.entries(s.tables())) tables[name] = (tables[name] || []).concat(rows);
    }
    for (const u of tables.users) u.password = SCAN[1];
    fakeRest = new FakeRest(tables);
    fake = new FakeSupabase({ origin: TEST_URL, anonKey: ANON, now: () => Date.now() });
    for (const s of STUDENTS) fake.addAccount(Object.assign(authAccount(s), { password: SCAN[0] }));
    fake.business = (req, u) => fakeRest.handle(req, u);
}
function fakeSynthetic() {
    const students = {};
    for (const s of STUDENTS) {
        const t = s.tables();
        students[s.key] = { memberId: t.users[0].id, appIds: (t.applications || []).map((a) => a.id), recordIds: (t.study_results_v3 || []).map((r) => r.id) };
    }
    return checkSynthetic({ students }, KEYS);
}
function controlCall(method, pathAndQuery, body) {
    return new Promise((resolve) => {
        const req = http.request({ host: '127.0.0.1', port: control.port, method, path: pathAndQuery, headers: { 'x-b3b-secret': CONTROL_SECRET, 'Content-Type': 'application/json' } }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { resolve(null); } });
        });
        req.on('error', () => resolve(null));
        if (body !== undefined) req.write(JSON.stringify(body));
        req.end();
    });
}
// 가짜 조작자: 브레인방이 DB 로 하는 일을 가짜 표로 한다
async function fakeOperator() {
    const noTime = (list) => JSON.stringify(list, (k, v) => (k === 'updated_at' ? '(그때의 시각)' : v));
    const restoreAll = () => {
        if (fakeNotes.snapshot) { fakeRest.tables = clone(fakeNotes.snapshot); fakeNotes.snapshot = null; }
        fake.maintenance = false;
        fake.maintenanceExcept = new Set();
        for (const s of fake.sessions.values()) if (s.endCode === 'session_expired') { s.alive = true; s.endCode = null; }
    };
    for (;;) {
        await sleep(120);
        if (!control.server) return;
        const r = await controlCall('GET', '/wait');
        const w = r && r.waiting;
        if (!w) continue;
        if (SELFTEST === 'silent-operator' && (w.kind === 'old-path-reset' || w.kind === 'revert-confirm')) continue;      // 대조 실험: 답하지 않는다
        let body = null;
        const bySid = (sid) => fake.sessions.get(sid);
        if (w.kind === 'fixtures') {
            const f = fakeSynthetic();
            body = { students: f.students };
        } else if (w.kind === 'old-path-begin') {
            fakeNotes.snapshot = clone(fakeRest.tables);
            fakeNotes.mark = fakeRest.writes.length;
        } else if (w.kind === 'old-path-reset') {
            // 옛 길의 실제 변화(표·행·값)를 적어 두고 되돌린다
            fakeNotes.oldWrites[w.info.student] = fakeRest.writes.slice(fakeNotes.mark).map((x) => ({ table: x.table, match: x.search.replace(/^\?/, ''), values: x.body }));
            if (fakeNotes.snapshot) fakeRest.tables = clone(fakeNotes.snapshot);
            fakeNotes.snapshot = null;
            fakeNotes.mark = fakeRest.writes.length;
            body = { reverted: true };
        } else if (w.kind === 'compare-plan') {
            const old = fakeNotes.oldWrites[w.info.student] || [];
            body = { result: noTime(old) === noTime(w.info.plan) ? 'ok' : 'differs', unchanged: fakeRest.writes.length === fakeNotes.mark };
        } else if (w.kind === 'check-logout') {
            const ended = bySid(w.info.ended);
            body = { result: ended && !ended.alive ? 'ok' : 'differs' };
        } else if (w.kind === 'expire-session') fake.endSession(bySid(w.info.sid), 'session_expired');
        else if (w.kind === 'restore-session') { const s = bySid(w.info.sid); if (s) { s.alive = true; s.endCode = null; } body = { reverted: true }; }
        else if (w.kind === 'maintenance-on') { fake.maintenance = true; fake.maintenanceExcept = new Set(['zzb3b-auth-' + w.info.exception]); }
        else if (w.kind === 'maintenance-off') { fake.maintenance = false; fake.maintenanceExcept = new Set(); body = { reverted: true }; }
        else if (w.kind === 'revert-confirm') { restoreAll(); body = { reverted: true }; }
        await controlCall('POST', '/continue?step=' + w.step, body === null ? undefined : body);
    }
}

// ---------------------------------------------------------------------------
// 브라우저 안에 넣는 관찰 장치(화면이 뜨기 전에): 표시의 시각, 저장소 접근 횟수(키의 무리 이름만), 되살아난 화면
// ---------------------------------------------------------------------------
const INIT_SCRIPT = `(() => {
  if (window.__b3b) return;
  const b = window.__b3b = { scheduleAt: -1, userAt: -1, persistedAt: -1, shows: 0 };
  const shown = (el) => !!el && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
  // 일정 화면이 보이는가, 이 탭에 currentUser 가 있는가(값은 보지 않는다 — 있다·없다와 그 시각만)
  b.sample = () => {
    const out = { schedule: false, user: false };
    try { out.schedule = shown(document.getElementById('scheduleScreen')); } catch (e) {}
    try { out.user = b.rawGet.call(window.sessionStorage, 'currentUser') !== null; } catch (e) {}
    const now = performance.now();
    if (out.schedule) b.scheduleAt = now;
    if (out.user && document.readyState !== 'loading') b.userAt = now;
    if (out.user && document.readyState === 'loading') b.userWhileLoading = true;
    return out;
  };
  b.rawGet = Storage.prototype.getItem;
  const tickFrame = () => { b.sample(); requestAnimationFrame(tickFrame); };
  requestAnimationFrame(tickFrame);
  setInterval(b.sample, 100);
  window.addEventListener('pageshow', (ev) => { b.shows++; if (ev.persisted) b.persistedAt = performance.now(); try { window.__b3bEvent(ev.persisted ? 'pageshow-persisted' : 'pageshow-normal'); } catch (e) {} }, true);
  // 창 사이 통로로 오가는 것이 있는가(같은 이름의 통로를 열어 듣기만 한다 — 내용은 보지 않고 센다)
  try { const ch = new BroadcastChannel('tr_auth_v1'); ch.onmessage = () => { try { window.__b3bEvent('broadcast'); } catch (e) {} }; b.channel = ch; } catch (e) {}
  // 탭 복제의 흉내(실행기가 __b3bDup 이라는 이름의 창을 열었을 때만): 탭 단위 저장값은 브라우저가 복사했다 —
  // 창의 이름을 연 창의 이름으로 맞추고 연 창과의 연결을 끊는다(복제된 탭에는 연 창이 없고 창 이름은 같다).
  try {
    if (window.name === '__b3bDup' && window.opener) { window.name = String(window.opener.name || ''); window.opener = null; }
  } catch (e) {}
})();`;

const MESSAGES = {
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
    unknownState: '로그인 상태를 확인하지 못했습니다. 잠시 뒤 새로 고침해 주세요.',
    error: '로그인 중 오류가 발생했습니다. 다시 시도해주세요.',
    emailEmpty: '이메일을 입력해주세요.',
    pwEmpty: '비밀번호를 입력해주세요.',
    logoutConfirm: '로그아웃 하시겠습니까?',
};
const messageId = (text) => {
    const t = String(text || '').trim();
    for (const [id, m] of Object.entries(MESSAGES)) if (m === t) return id;
    if (/^환영합니다, .+님! \((4주 Fast|8주 Standard)\)$/.test(t)) return 'welcome';
    return t === '' ? 'none' : 'other';
};
const STATES = ['off', 'signed_out', 'restoring', 'signed_in', 'rejected'];
const REASONS = [null, 'blocked', 'withdrawal_pending', 'no_member', 'not_allowed', 'maintenance', 'network', 'rate_limited', 'expired', 'ended', 'logout_unknown', 'unreadable',
    'session_changed', 'legacy_present', 'unexpected', 'token_shape', 'unavailable', 'storage', 'error', 'foreign_window', 'window_unproven'];
const PROFILE_KEYS = ['id', 'name', 'nickname', 'email', 'phone', 'timezone'];
// 서버의 오류 코드는 이 목록의 이름으로만 적는다(그 밖은 other)
const KNOWN_CODES = ['session_not_found', 'session_expired', 'refresh_token_not_found', 'refresh_token_already_used', 'invalid_credentials',
    'over_request_rate_limit', 'bad_jwt', 'no_authorization', 'validation_failed', 'user_banned', 'PGRST301', 'PGRST303', 'PGRST202', 'PT503', 'PT405', '42501'];

// ---------------------------------------------------------------------------
// 브라우저와 경우 하나의 환경
// ---------------------------------------------------------------------------
let browser = null;
let ON = '';
let OFF = '';
let siteOn = null;
let siteOff = null;
let decide = null;
const STATIC_BODY = { stylesheet: 'text/css', font: 'font/woff2', image: 'image/png' };

async function newCx(id) {
    const context = await browser.newContext({ serviceWorkers: 'block' });      // 디스크에 남지 않는 새 상태
    const cx = { id, context, records: [], hooks: {}, dialogs: [], store: {}, events: [], seen: { profileKeysOk: null, sids: {}, names: {}, lastLoginSid: null, states: [] }, account: null };
    await context.exposeBinding('__b3bEvent', (src, name) => { if (['pageshow-persisted', 'pageshow-normal', 'broadcast'].includes(name)) cx.events.push(name); });
    await context.addInitScript(INIT_SCRIPT);
    // 차단기: context 단위로, 첫 화면을 열기 전에(새 창도 같은 차단기 아래다). 붙이지 못하면(예외) 이 경우는 아무 화면도 열지 않는다.
    await context.route('**/*', (route) => handleRoute(route, cx).catch(() => route.abort('blockedbyclient').catch(() => {})));
    context.on('page', (page) => page.on('dialog', (d) => { cx.dialogs.push(messageId(d.message())); (cx.dismissDialogs ? d.dismiss() : d.accept()).catch(() => {}); }));
    cx.page = () => context.newPage();
    return cx;
}

// 응답에서 정해 둔 것만 본다(본문을 기록하지 않는다)
function observe(cx, rec, out) {
    let body = null;
    try { body = JSON.parse(Buffer.isBuffer(out.body) ? out.body.toString('utf8') : String(out.body || '')); } catch (e) { body = null; }
    rec.status = [200, 204, 400, 401, 403, 404, 405, 409, 429, 500, 503].includes(out.status) ? out.status : (out.status >= 500 ? 500 : (out.status >= 400 ? 400 : 200));
    if (!body || typeof body !== 'object') return;
    if (out.status >= 400) {
        const code = typeof body.code === 'string' ? body.code : (typeof body.error_code === 'string' ? body.error_code : null);
        rec.code = code === null ? 'none' : (KNOWN_CODES.includes(code) ? code : 'other');
    }
    if ((rec.target === 'login' || rec.target === 'refresh') && out.status === 200 && typeof body.access_token === 'string') {
        try {
            const c = JSON.parse(Buffer.from(body.access_token.split('.')[1], 'base64url').toString('utf8'));
            if (typeof c.session_id === 'string') { cx.seen.lastLoginSid = c.session_id; cx.seen.sids[cx.account || '?'] = c.session_id; rec.hasSessionId = true; } else rec.hasSessionId = false;
        } catch (e) { rec.hasSessionId = false; }
    }
    if (rec.target === 'my_profile' && out.status === 200) {
        const state = ['ok', 'no_member', 'blocked', 'withdrawal_pending'].includes(body.state) ? body.state : 'other';
        rec.profileState = state;
        cx.seen.states.push(state);
        const keys = Object.keys(body).concat(body.profile && typeof body.profile === 'object' ? Object.keys(body.profile) : []);
        const ok = Object.keys(body).every((k) => k === 'state' || k === 'profile') &&
            (state !== 'ok' ? Object.keys(body).length === 1 : Object.keys(body.profile || {}).every((k) => PROFILE_KEYS.includes(k))) &&
            !keys.some((k) => /pass|pw|secret|hash/i.test(k));
        cx.seen.profileKeysOk = cx.seen.profileKeysOk === false ? false : ok;
        if (state === 'ok' && body.profile && typeof body.profile.name === 'string') cx.seen.names[cx.account || '?'] = body.profile.name;
    }
    if (rec.target === 'my_site_access' && out.status === 200) { rec.allowed = body.allowed === true; rec.isAdmin = body.is_admin === true; }
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-expose-headers': '*' };
let HALT = false;          // 안전 조건을 어긴 요청이 나왔다: 그 경우를 끝내고 뒤의 경우를 시작하지 않는다
// 그 요청을 낸 화면이 어느 서버의 것인가(켜짐·꺼짐). 모르면 null — 차단기는 켜진 화면으로 본다(더 막는 쪽)
function pageModeOf(r) {
    try {
        const o = new URL(r.frame().url()).origin;
        return o === ON ? 'on' : (o === OFF ? 'off' : null);
    } catch (e) { return null; }
}
// 지금 돌리는 그 합성 학생(이 경우가 마지막으로 로그인을 시킨 유형). 보관함이 열리고 합성 자료의 목록을 받은 뒤에만
function studentOf(cx) {
    if (!cx.account || !vault.armed() || !SYN || !SYN.students[cx.account]) return null;
    const s = SYN.students[cx.account];
    return { email: vault.get('EMAIL_' + cx.account), memberId: s.memberId, appIds: s.appIds, recordIds: s.recordIds };
}
async function handleRoute(route, cx) {
    const r = route.request();
    let headers;
    try { headers = await r.allHeaders(); } catch (e) { headers = r.headers(); }
    const d = decide({ url: r.url(), method: r.method(), headers, postData: r.postData(), resourceType: r.resourceType(), isNavigation: r.isNavigationRequest(), pageMode: pageModeOf(r), student: studentOf(cx) });
    const rec = d.record;
    rec.sent = false;
    cx.records.push(rec);
    // 안전 조건을 어긴 요청(켜진 화면의 회원 표·쓰기, 꺼진 화면의 범위 밖 회원 표·쓰기, 용도 밖의 자격): 보내지 않고,
    // 이 경우를 끝내고(브라우저 상태를 닫는다), 뒤의 경우를 시작하지 않는다
    if (rec.unsafe) { cx.unsafe = (cx.unsafe || 0) + 1; HALT = true; rec.aborted = true; setTimeout(() => { cx.context.close().catch(() => {}); }, 0); return route.abort('blockedbyclient'); }
    // 모듈 파일을 받지 못하는 화면(경우 NM): 그 파일만 내주지 않는다
    if (cx.withholdModule && rec.where === 'self' && new URL(r.url()).pathname === '/js/auth-session.js') { rec.how = 'module-withheld'; cx.withheld = (cx.withheld || 0) + 1; return route.fulfill({ status: 404, contentType: 'text/plain', body: '' }); }
    if (cx.sinkPass && rec.where === 'sink' && r.url() === cx.sinkPass) {
        // 예행(P)의 대조: 차단하지 않은 정상 요청 1건을 같은 수신기(시험 목적지)가 실제로 받는지 본다 — 이 한 건만 일부러 보낸다.
        // 자격 위반 판정(위의 decide)이 먼저다: 예외로 나갈 수 있는 것은 자격 없는·본문 없는 GET 한 번뿐.
        // 그 조건을 벗어난 요청이 이 주소로 오면 예외를 거두고 아래의 보통 길로 중단한다(P 는 통과가 아니다).
        cx.sinkPass = null;
        if (controlPassOk(rec, { method: r.method(), postData: r.postData() })) {
            rec.aborted = false;
            rec.how = 'control-pass';
            const resp = await route.fetch({ maxRedirects: 0 });
            rec.sent = true;
            return route.fulfill({ response: resp });
        }
        cx.sinkPassRefused = (cx.sinkPassRefused || 0) + 1;
    }
    if (SELFTEST === 'leaky-blocker' && rec.where === 'sink') {
        // 대조 실험(--fake 에서만): 차단기가 고장 나 시험 목적지로 가는 요청을 보내 준다
        rec.aborted = false;
        rec.how = 'selftest-leak';
        const resp = await route.fetch({ maxRedirects: 0 });
        rec.sent = true;
        return route.fulfill({ response: resp });
    }
    if (d.action === 'abort') return route.abort('blockedbyclient');
    if (rec.where === 'local') return route.continue();                        // data:·blob:·about: — 네트워크로 나가지 않는다
    if (rec.where === 'static-allowed') {                                       // 허용 목록의 정적 자원: 보내지 않고 빈 응답(화면 시험에 필요 없다)
        rec.how = 'fulfilled-empty';
        return route.fulfill({ status: 200, contentType: STATIC_BODY[rec.type] || 'text/plain', body: '' });
    }
    if (rec.where === 'self') {
        const resp = await route.fetch({ maxRedirects: 0 });
        rec.sent = true;
        if (resp.status() >= 300 && resp.status() < 400) {
            // 리디렉션은 브라우저에 넘기지 않는다: 다음 주소를 차단기로 다시 가른다
            let next = '';
            try { next = new URL(resp.headers().location || '', r.url()).href; } catch (e) { next = ''; }
            const d2 = decide({ url: next, method: 'GET', headers: {}, postData: null, resourceType: r.resourceType(), isNavigation: r.isNavigationRequest() });
            d2.record.redirectHop = true;
            d2.record.sent = false;
            d2.record.aborted = true;           // 허용되는 다음 주소라도 이 실행기는 리디렉션을 따라가지 않는다(이 조각에 필요한 리디렉션이 없다)
            cx.records.push(d2.record);
            return route.abort('blockedbyclient');
        }
        return route.fulfill({ response: resp });
    }
    // 시험 프로젝트
    const hook = cx.hooks[rec.target];
    if (hook && hook.before) {
        const act = await hook.before(rec);
        if (act === 'abort') { rec.how = 'aborted-before-send'; return route.abort('failed'); }
        if (act && act.fulfill) { rec.how = 'fake-response'; rec.status = act.fulfill.status; return route.fulfill({ status: act.fulfill.status, headers: Object.assign({ 'content-type': 'application/json' }, CORS), body: act.fulfill.body }); }
    }
    let out;
    if (FAKE) {
        rec.how = 'fake-server';
        const res = await fake.handle({ url: r.url(), method: r.method(), headers: Object.entries(headers), bodyText: r.postData(), page: cx.id });
        out = { status: res.status, headers: Object.assign({}, res.headers, CORS), body: res.body === null || res.body === undefined ? '' : res.body };
    } else {
        const resp = await route.fetch({ maxRedirects: 0 });
        rec.sent = true;
        rec.how = 'sent';
        if (resp.status() >= 300 && resp.status() < 400) { rec.how = 'redirect-blocked'; return route.abort('blockedbyclient'); }
        out = { status: resp.status(), headers: resp.headers(), body: await resp.body() };
    }
    observe(cx, rec, out);
    if (hook && hook.after) {
        const act = await hook.after(rec, out);
        if (act === 'drop') { rec.how = rec.how + '+response-dropped'; return route.abort('failed'); }
        if (act && act.replace) { rec.how = rec.how + '+response-replaced'; out = Object.assign({}, out, act.replace); }
    }
    return route.fulfill({ status: out.status, headers: out.headers, body: out.body });
}

// ---------------------------------------------------------------------------
// 화면을 다루는 작은 도구
// ---------------------------------------------------------------------------
async function until(page, expr, ms = 12000) {
    const end = Date.now() + ms;
    for (;;) {
        try { if (await page.evaluate(expr)) return true; } catch (e) { /* 이동 중 */ }
        if (Date.now() > end) return false;
        await sleep(120);
    }
}
const settled = (page, ms) => until(page, "!!window.EonAuth && window.EonAuth.state() !== 'restoring'", ms);
async function stateOf(page) {
    try {
        const [s, r] = await page.evaluate(() => [window.EonAuth.state(), window.EonAuth.reason()]);
        return { state: STATES.includes(s) ? s : 'other', reason: REASONS.includes(r) ? r : 'other' };
    } catch (e) { return { state: 'other', reason: 'other' }; }
}
const SCHEDULE = "(() => { const e = document.getElementById('scheduleScreen'); return !!e && getComputedStyle(e).display !== 'none'; })()";
const LOGIN_SHOWN = "(() => { const e = document.getElementById('loginScreen'); return !!e && getComputedStyle(e).display !== 'none'; })()";
const MESSAGE = "(() => { const e = document.getElementById('loginMessage'); return e && getComputedStyle(e).display !== 'none' ? e.textContent : ''; })()";
const scheduleShown = (page) => page.evaluate(SCHEDULE).catch(() => false);
const loginShown = (page) => page.evaluate(LOGIN_SHOWN).catch(() => false);
const messageOf = async (page) => messageId(await page.evaluate(MESSAGE).catch(() => ''));
const userJson = (page) => page.evaluate(() => window.sessionStorage.getItem('currentUser')).catch(() => null);      // 합성 자료다 — 메모리에서 견주기만 하고 적지 않는다
const sessionKeys = (page) => page.evaluate(() => Object.keys(window.sessionStorage).filter((k) => k.indexOf('__') !== 0).sort()).catch(() => []);
const marks = (page) => page.evaluate(() => ({ cur: window.__b3b.sample(), scheduleAt: window.__b3b.scheduleAt, userAt: window.__b3b.userAt, userWhileLoading: window.__b3b.userWhileLoading === true, now: performance.now(), persistedAt: window.__b3b.persistedAt })).catch(() => null);
const pathOf = (page) => { try { return new URL(page.url()).pathname; } catch (e) { return ''; } };
const count = (cx, target, pred) => cx.records.filter((r) => r.where === 'test-project' && r.target === target && !r.aborted && (!pred || pred(r))).length;
const AUTH_TARGETS = ['login', 'refresh', 'logout', 'my_profile', 'my_site_access'];
const authCount = (cx, from) => cx.records.slice(from).filter((r) => r.where === 'test-project' && AUTH_TARGETS.includes(r.target) && !r.aborted).length;
const phase = (cx, from) => {
    const list = cx.records.slice(from).filter((r) => r.where === 'test-project');
    const sent = list.filter((r) => !r.aborted);
    return {
        writesSent: sent.filter((r) => r.write).length,
        writesBlocked: list.filter((r) => r.write && r.aborted).length,
        loginWrites: sent.filter((r) => r.write && ['applications', 'tr_user_map', 'study_results_v3'].includes(r.table)).length,
        usersReads: sent.filter((r) => r.table === 'users').length,
        usersBlocked: list.filter((r) => r.table === 'users' && r.aborted).length,
        tableReads: sent.filter((r) => r.table !== 'none' && !r.write).length,
        readsBlocked: list.filter((r) => r.scopeBlocked && r.scopeBlocked.includes('read_not_listed')).length,
        businessTried: list.filter((r) => r.table !== 'none').length,          // 업무 요청의 시도(나간 것 + 막힌 것)
        member: sent.filter((r) => r.credential === 'member').length,
        auth: sent.filter((r) => AUTH_TARGETS.includes(r.target)).length,
    };
};

// 로그인 화면에서 제출. 돌려주는 값: { message(정해 둔 이름), schedule(일정 화면이 보이는가) }
async function doLogin(cx, page, key, { site = ON, legacy = false, password, email, goto = true } = {}) {
    cx.account = key;
    if (goto) {
        await page.goto(site + '/index.html', { waitUntil: 'domcontentloaded' });
        await until(page, "typeof handleLogin === 'function' && !!document.getElementById('loginBtn')", 20000);
        if (site === ON) await settled(page, 20000);
    }
    // 예행(P)이 통과하기 전에는 여기서 예외가 난다(보관함)
    await page.fill('#studentEmail', email !== undefined ? email : vault.get('EMAIL_' + key));
    await page.fill('#studentPassword', password !== undefined ? password : vault.get(legacy ? 'LEGACY_PW' : 'PW'));
    await page.evaluate(() => { const m = document.getElementById('loginMessage'); if (m) m.style.display = 'none'; });
    await page.click('#loginBtn');
    await until(page, `${SCHEDULE} || (${MESSAGE} !== '' && !document.getElementById('loginBtn').disabled && !/환영합니다/.test(${MESSAGE}))`, 25000);
    const first = await messageOf(page);
    if (first === 'welcome') await until(page, SCHEDULE, 6000);
    else await sleep(1600);                                   // 실패 안내 뒤에도 화면이 열리지 않는지 본다
    await sleep(400);
    return { message: await scheduleShown(page) && first === 'none' ? 'welcome' : first, schedule: await scheduleShown(page) };
}

// 새 길의 저장 계획을 화면에서 읽는다(인증률 확정의 계산이 끝날 때까지 기다린다)
async function readPlan(page) {
    await until(page, "typeof trLoginV2 === 'object' && trLoginV2.plan() && trLoginV2.plan().authRates !== 'pending'", 15000);
    try { return JSON.parse(await page.evaluate(() => JSON.stringify(window.trLoginV2.plan()))); } catch (e) { return null; }
}

// ---------------------------------------------------------------------------
// 경우들. 판정: ok 가 전부 참이면 통과 / 거짓이 있으면 기대와 다름 / null(재지 못함)이 있으면 미확인
// ---------------------------------------------------------------------------
const results = [];
function makeChecks() {
    const list = [];
    return { list, ck: (name, ok) => { list.push({ name, ok: ok === null || ok === undefined ? null : !!ok }); } };
}
const baseline = (cx, ck) => {
    const s = summarize(cx.records);
    ck('자격이 용도 밖으로 나간 것 0(차단기의 결정)', s.leakSent === 0);
    // 대조 단계(P)는 일부러 용도가 맞지 않는 요청을 시켜 본다. 그 밖의 경우에는 그런 시도 자체가 없어야 한다
    if (cx.id !== 'P') ck('자격의 용도가 맞지 않는 요청을 시도한 것 0', s.leakBlocked === 0);
    else ck('대조: 자격의 용도가 맞지 않는 요청을 전송 전에 막음', s.leakBlocked >= 1);
    // 대조 단계는 수신기가 살아 있음을 보이려고 정상 요청 1건을 일부러 시험 목적지로 보낸다
    ck('회원 자격이 필요한 주소에 공개 키로 나간 것 0', s.publicRetry === 0);
    ck(cx.id === 'P' ? '허용 밖으로 보낸 것은 대조용 1건뿐(차단기의 결정)' : '허용 밖으로 보낸 것 0(차단기의 결정)', s.outsideSent === (cx.id === 'P' ? 1 : 0));
    ck('service_role 자격 0', s.serviceRole === 0);
    ck('안전 조건을 어긴 요청 0(켜진 화면의 회원 표·쓰기, 꺼진 화면의 범위 밖 회원 표·쓰기)', s.unsafe === 0 && !cx.unsafe);
    ck('안전 조건을 어긴 요청이 나간 것 0(차단기의 결정)', s.unsafeSent === 0);
    return s;
};
async function execCase(id, title, fn, { required = true } = {}) {
    const entry = { id, title, required, verdict: 'unknown', checks: [], summary: null, storage: null, records: [] };
    results.push(entry);
    let cx = null;
    const t0 = Date.now();
    try {
        cx = await newCx(id);
        const { list, ck } = makeChecks();
        entry.checks = list;
        const sink0 = siteOn.core.counts.sink + siteOff.core.counts.sink;
        await fn(cx, ck);
        entry.summary = baseline(cx, ck);
        ck(id === 'P' ? '로컬 시험 목적지 수신은 대조용 1건뿐(차단기와 독립된 증거)' : '로컬 시험 목적지 수신 0(차단기와 독립된 증거)', siteOn.core.counts.sink + siteOff.core.counts.sink === sink0 + (id === 'P' ? 1 : 0));
    } catch (e) {
        if (e instanceof PauseTimeout) entry.checks.push({ name: '멈춤의 기다림이 상한을 넘김', ok: null });
        else entry.checks.push({ name: '실행 도중 예외(경우를 끝까지 돌리지 못함)', ok: null });
    } finally {
        if (cx) {
            if (cx.unsafe) entry.checks.push({ name: '안전 조건을 어긴 요청이 있었다(전송 전에 막음) — 이 경우를 끝냈고 뒤의 경우를 시작하지 않는다', ok: false });
            entry.storage = cx.store;
            entry.records = cx.records;
            entry.pageshow = cx.events;
            entry.notes = cx.notes || null;
            // 바깥으로 가려던 시도(전송 전에 막힌 것)의 수 — 대조 단계(P) 말고는 0 이 기대다. 판정에는 넣지 않고 적어 둔다
            const s = summarize(cx.records);
            entry.outsideAttempts = s.outsideBlockedRequest + s.outsideBlockedNavigation;
            entry.readsBlocked = s.readsBlocked;            // 허용 목록에 없는 읽기(전송 전에 막힘) — 판정에 넣지 않고 적어 둔다
            entry.unsafe = s.unsafe;
            await cx.context.close().catch(() => {});
        }
        entry.verdict = entry.checks.some((c) => c.ok === false) ? 'differs' : (entry.checks.some((c) => c.ok === null) || entry.checks.length === 0 ? 'unknown' : 'pass');
        console.log(`  ${id.padEnd(4)} ${entry.verdict === 'pass' ? '통과' : (entry.verdict === 'differs' ? '기대와 다름' : '미확인')}  ${title}  (${Math.round((Date.now() - t0) / 100) / 10}초)`);
        for (const c of entry.checks.filter((x) => x.ok !== true)) console.log(`         · ${c.ok === false ? '다름' : '미확인'}: ${c.name}`);
        if (id !== 'P' && entry.outsideAttempts) console.log(`         · 참고: 바깥으로 가려던 시도 ${entry.outsideAttempts}건(전송 전에 막힘)`);
    }
}

// 경우들의 차례표를 만든다(여기서는 아무것도 돌리지 않는다 — 돌리는 차례는 runSequence 가 정한다: P 가 먼저, 전부 참이어야 다음)
async function buildCases() {
    const plan = [];
    const runCase = (id, title, fn, opts) => { plan.push({ id, run: () => execCase(id, title, fn, opts) }); };
    // ---- P. 로컬 대조: 차단이 실제로 듣는가(수신기가 살아 있음을 먼저 보인 뒤) ----
    await runCase('P', '차단기의 로컬 대조(첫 화면·새 창·리디렉션·폼·제어 포트)', async (cx, ck) => {
        const core = siteOn.core;
        const page = await cx.page();
        await page.goto(ON + '/__b3b/blank');
        // 같은 수신기(시험 목적지)로: 먼저 차단하지 않은 정상 요청 1건을 실제로 받는지, 그 뒤 차단 시험 동안 추가 수신이 0 인지
        const sinkBefore = core.counts.sink;
        cx.sinkPass = ON + '/__b3b/sink/alive';
        // 대조 실험(--fake 에서만): 대조용 요청을 자격·본문이 실린 POST 로 보낸다 → 예외로 나가면 안 된다
        const controlInit = SELFTEST === 'bad-control-pass' ? { method: 'POST', headers: { Authorization: 'Bearer zz-not-a-real-credential' }, body: 'x=1' } : null;
        await page.evaluate((init) => fetch('/__b3b/sink/alive', init || undefined).then((r) => r.status, () => 0), controlInit);
        ck('수신기가 살아 있음: 차단하지 않은 정상 요청 1건을 시험 목적지가 실제로 받음', core.counts.sink === sinkBefore + 1);
        ck('예행의 예외로 나간 것은 자격 없는·본문 없는 GET 한 번뿐(조건을 벗어난 요청 0, 예외는 거둬짐)', !cx.sinkPassRefused && cx.sinkPass === null && cx.records.filter((r) => r.how === 'control-pass').length === 1);
        const sink0 = core.counts.sink;
        const csp0 = core.counts.csp;
        const rejected0 = control.rejected;
        const blockedBefore = cx.records.filter((r) => r.aborted).length;
        const tryFetch = (url, init) => page.evaluate(([u, i]) => fetch(u, i).then(() => 'sent', () => 'blocked'), [url, init || {}]);
        let attempts = 0;
        ck('fetch → 시험 목적지: 막힘', (await tryFetch('/__b3b/sink/fetch')) === 'blocked'); attempts++;
        ck('fetch(POST) → 시험 목적지: 막힘', (await tryFetch('/__b3b/sink/post', { method: 'POST', body: 'x=1' })) === 'blocked'); attempts++;
        ck('fetch → 리디렉션 → 시험 목적지: 막힘', (await tryFetch('/__b3b/redirect/sink')) === 'blocked'); attempts++;
        ck('fetch → 제어 포트: 막힘', (await tryFetch(`http://127.0.0.1:${control.port}/wait`)) === 'blocked'); attempts++;
        ck('fetch → 바깥 주소: 막힘', (await tryFetch('https://example.invalid/x')) === 'blocked'); attempts++;
        ck('fetch → 시험 프로젝트에 회원 표 읽기(공개 키 없이 알 수 없는 자격): 막힘', (await tryFetch(TEST_URL + '/rest/v1/users', { headers: { Authorization: 'Bearer zz-not-a-real-credential' } })) === 'blocked'); attempts++;
        const navTry = async (how) => {                   // 화면 이동은 새 탭에서(중단된 이동은 그 탭을 오류 화면으로 만든다)
            const p = await cx.page();
            await p.goto(ON + '/__b3b/blank');
            await how(p).catch(() => {});
            await sleep(500);
            await p.close().catch(() => {});
        };
        await navTry((p) => p.evaluate(() => { location.href = '/__b3b/sink/nav'; })); attempts++;
        await navTry((p) => p.evaluate(() => { const f = document.createElement('form'); f.method = 'POST'; f.action = '/__b3b/sink/form'; document.body.appendChild(f); f.submit(); })); attempts++;
        await navTry((p) => p.goto(ON + '/__b3b/redirect/sink')); attempts++;
        await navTry((p) => p.evaluate(() => { window.open('/__b3b/sink/popup'); })); attempts++;
        await navTry((p) => p.evaluate(() => { location.href = 'https://example.invalid/nav'; })); attempts++;
        await navTry((p) => p.evaluate((port) => { location.href = 'http://127.0.0.1:' + port + '/wait'; }, control.port)); attempts++;
        await navTry((p) => p.evaluate((u) => { location.href = u + '/auth/v1/authorize?provider=x'; }, TEST_URL)); attempts++;
        {   // 첫 화면이 곧 시험 목적지인 새 브라우저 상태
            const cx2 = await newCx('P2');
            const p = await cx2.page();
            await p.goto(ON + '/__b3b/sink/first').catch(() => {});
            await sleep(300);
            cx.records.push(...cx2.records);
            await cx2.context.close();
            attempts++;
        }
        const blocked = cx.records.filter((r) => r.aborted).length - blockedBefore;
        // 화면 안의 fetch 중 일부(바깥 주소·제어 포트)는 내용 보안 정책이 차단기보다 먼저 막는다 — 따로 센다
        const cspBlocked = core.counts.csp - csp0;
        ck('시킨 시도가 전부 전송 전에 막힘(차단기가 센 수 + 내용 보안 정책이 먼저 막은 수 ≥ 시킨 수)', blocked + cspBlocked >= attempts);
        ck('차단기가 직접 막은 것: fetch·리디렉션·폼·화면 이동·새 창·첫 화면(11건 이상)', blocked >= 11);
        ck('차단 시험 동안 같은 수신기(시험 목적지)의 추가 수신 0', core.counts.sink === sink0);
        ck('비밀 보관함이 아직 닫혀 있음(예행 중에는 비밀번호를 꺼낼 수 없다)', vault.armed() === false);
        ck('제어 포트가 화면에서 받은 요청 0(비밀 없이 온 요청 0)', control.rejected === rejected0);
    });

    // ---- F. 합성 자료의 목록을 받는다(브레인방이 fixtures_up.sql 의 결과로 준다 — 번호들은 비밀이 아니다) ----
    await runCase('F', '합성 자료의 목록(회원번호·신청서 번호·학습 기록 번호)을 받음', async (cx, ck) => {
        const body = await pause('fixtures', { students: KEYS });
        const got = checkSynthetic(body, KEYS);
        ck('목록의 모양이 정해 둔 형식(유형마다 회원번호 1·신청서 번호·학습 기록 번호, 서로 겹치지 않음)', !!got);
        if (got) SYN = got;
        ck('비밀 보관함이 열려 있음(예행 통과 뒤)', vault.armed() === true);
    });

    // ---- S-<유형>. 옛 길(꺼짐)과 새 길(켜짐)을 같은 합성 DB 상태에서 각각 ----
    for (const s of STUDENTS) {
        const key = s.key;
        const entering = ENTERING.includes(key);
        runCase('S-' + key, `학생 유형 ${key}: 옛 길(꺼짐)과 새 길(켜짐)을 같은 합성 DB 상태에서`, async (cx, ck) => {
            ck('합성 자료의 목록을 받았음', !!SYN);
            if (!SYN) return;
            const syn = SYN.students[key];
            cx.account = key;                                  // 차단기가 내보내는 것은 이 학생의 행뿐이다
            // 옛 길: 실제로 쓴다 — 멈춤을 내놓는 순간 원복 대상이다
            await pause('old-path-begin', { student: key }, { needsRevert: true });
            const p1 = await cx.page();
            const o = await doLogin(cx, p1, key, { site: OFF, legacy: true });
            await sleep(1500);                                 // 로그인 뒤의 백그라운드 쓰기(인증률 확정)까지
            const oldUser = await userJson(p1);
            const oph = phase(cx, 0);
            ck('옛 길: 인증 모듈의 상태는 off, 회원 자격이 실린 요청 0·인증 요청 0', (await stateOf(p1)).state === 'off' && oph.member === 0 && oph.auth === 0);
            ck('옛 길: 회원 표 조회는 이 학생의 정확한 두 조회 안에서만 나감(범위 밖 0)', oph.usersBlocked === 0 && oph.usersReads >= 1 && oph.usersReads <= 2);
            ck('옛 길: 허용 목록에 없는 읽기 0(화면의 정상 요청이 막히지 않음)', oph.readsBlocked === 0);
            ck(entering ? '옛 길: 일정 화면이 열림' : '옛 길: 화면이 열리지 않고 안내만', entering ? (o.schedule && o.message === 'welcome') : (!o.schedule && ['noApp', 'notConfirmed', 'blocked'].includes(o.message)));
            ck('옛 길: 범위 밖의 쓰기 시도 0(로그인에 딸린 세 가지만 합성 행으로)', oph.writesBlocked === 0 && oph.writesSent === oph.loginWrites);
            await p1.close().catch(() => {});
            const mark = cx.records.length;
            await pause('old-path-reset', { student: key }, { revertOf: 'old-path-begin' });

            // 새 길: 같은 합성 DB 상태에서
            const p2 = await cx.page();
            const n = await doLogin(cx, p2, key, { site: ON });
            const st = await stateOf(p2);
            const newUser = await userJson(p2);
            let plan = entering ? await readPlan(p2) : null;
            await sleep(600);
            if (SELFTEST === 'unsafe-write' && entering) {
                // 대조 실험(--fake 에서만): 켜진 화면에서 업무 쓰기를 시켜 본다(공개 키, 이 학생의 합성 행) → 전송 전에 막혀야 한다
                const tried = await p2.evaluate((id) => fetch(SUPABASE_CONFIG.url + '/rest/v1/applications?id=eq.' + id, { method: 'PATCH', headers: { apikey: SUPABASE_CONFIG.anonKey, Authorization: 'Bearer ' + SUPABASE_CONFIG.anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ self_paced_schedule: 'zz' }) }).then(() => 'sent', () => 'blocked'), syn.appIds[0]).catch(() => 'blocked');
                ck('대조 실험: 켜진 화면의 쓰기가 전송 전에 막힘', tried === 'blocked');
            }
            const nph = phase(cx, mark);
            ck('새 길: 안내가 옛 길과 같음', n.message === o.message);
            ck('새 길: 화면(일정 화면이 열렸는가)이 옛 길과 같음', n.schedule === o.schedule);
            ck('새 길: currentUser 의 키·값이 옛 길과 글자까지 같음', oldUser === newUser);
            ck('새 길: 쓰기 전송 0', nph.writesSent === 0);
            ck('새 길: 쓰기 시도(전송 전에 막힌 것) 0', nph.writesBlocked === 0);
            ck('새 길: 회원 표 요청 0(시도 포함)', nph.usersReads === 0 && nph.usersBlocked === 0);
            ck('새 길: 허용 목록에 없는 읽기 0(화면의 정상 요청이 막히지 않음)', nph.readsBlocked === 0);
            ck('새 길: 로그인 요청 1·확인 요청 둘', count(cx, 'login') === 1 && count(cx, 'my_profile') >= 1 && count(cx, 'my_site_access') >= (key === 'blocked' ? 0 : 1));
            if (key === 'blocked') ck('새 길: 차단 — rejected·blocked, 표 요청 0', st.state === 'rejected' && st.reason === 'blocked' && nph.tableReads === 0);
            else ck('새 길: 로그인 확인 상태 signed_in', st.state === 'signed_in');
            ck('새 길: 본인 확인 응답에 비밀번호 같은 열이 없음', cx.seen.profileKeysOk === true);
            if (entering) {
                ck('새 길: 준비 신호가 섬', await p2.evaluate(() => window.trLoginV2.ready()).catch(() => false));
                ck('새 길: 저장 계획을 읽음(인증률 확정의 계산까지 끝남)', !!plan && plan.authRates === 'done');
                ck('새 길: 저장 계획의 건수 = 옛 길이 실제로 보낸 쓰기의 건수', !!plan && plan.items.length === oph.loginWrites);
            }
            // 저장 계획은 화면에서 온 값이다: 표·열·행·값의 모양을 확인한 뒤에만 넘긴다
            if (plan && SELFTEST === 'bad-plan') plan.items.push({ table: 'study_results_v3', method: 'PATCH', match: 'id=eq.zz-not-a-synthetic-row', values: { locked_auth_rate: 0 } });
            const checked = entering ? checkPlan(plan, { memberId: syn.memberId, email: vault.get('EMAIL_' + key), appIds: syn.appIds, recordIds: syn.recordIds }) : { ok: true, items: [] };
            ck('새 길: 저장 계획이 허용한 표·열·이번 사례의 합성 행·정해 둔 값의 모양 안에 있음', checked.ok === true);
            if (!checked.ok) { cx.notes = { planRefused: checked.why }; return; }              // 넘기지 않는다
            const res = await pause('compare-plan', { student: key, plan: checked.items });
            ck('브레인방의 대조: 새 길의 저장 계획 = 옛 길의 실제 DB 변화(항목마다)', !!res && res.result === 'ok');
            ck('브레인방의 대조: 새 길 뒤 세 업무 표의 대상 행·비대상 행 불변', !!res && res.unchanged === true);
            cx.notes = { planItems: checked.items.length };
        });
    }

    // ---- W. 틀린 비밀번호·옛 길의 값·999999(켜짐) ----
    await runCase('W', '켜짐: 틀린 비밀번호·옛 길의 값·999999 로는 들어가지 못함', async (cx, ck) => {
        const page = await cx.page();
        for (const [name, pw] of [['틀린 비밀번호', vault.get('PW') + 'x'], ['옛 길의 값(회원 표의 비밀번호 열)', vault.get('LEGACY_PW')], ['999999', '999999']]) {
            const before = cx.records.length;
            const r = await doLogin(cx, page, 'fast', { password: pw });
            const ph = phase(cx, before);
            ck(`${name}: 안내(일치하지 않음)·화면 0`, r.message === 'invalid' && !r.schedule && (await userJson(page)) === null);
            ck(`${name}: 확인 요청 0·표 요청 0·회원 표 요청 0`, ph.member === 0 && ph.tableReads === 0 && ph.usersReads === 0 && ph.usersBlocked === 0 && ph.writesSent === 0);
        }
        ck('서버의 답: 400·invalid_credentials', cx.records.filter((r) => r.target === 'login' && !r.aborted).every((r) => r.status === 400 && r.code === 'invalid_credentials'));
    });

    // ---- E. 빈 값 ----
    await runCase('E', '빈 값: 켜짐에는 개발 로그인의 길이 없음(꺼짐은 기준 그대로)', async (cx, ck) => {
        const page = await cx.page();
        const r = await doLogin(cx, page, 'fast', { email: '', password: '' });
        ck('켜짐: 안내(이메일을 입력해주세요)·화면 0·인증 요청 0', r.message === 'emailEmpty' && !r.schedule && authCount(cx, 0) === 0 && (await userJson(page)) === null);
        const p2 = await cx.page();
        const before = cx.records.length;
        const o = await doLogin(cx, p2, 'fast', { site: OFF, email: '', password: '' });
        const ph = phase(cx, before);
        ck('꺼짐(기준 그대로): 빈 값이면 서버 확인 없이 일정 화면 — 회원 표 요청 0·인증 요청 0·쓰기 0', o.schedule && ph.usersReads === 0 && ph.auth === 0 && ph.writesSent === 0);
    });

    // ---- RG. 준비 신호 ----
    await runCase('RG', '준비 신호: 다시 확인·수강 조회 전에는 표시·currentUser 0(새로 고침). 다른 화면에 다녀오면 다시 로그인, 되살아난 같은 문서만 이어받음', async (cx, ck) => {
        const page = await cx.page();
        const r = await doLogin(cx, page, 'std');
        ck('로그인: 일정 화면', r.schedule);
        const user = await userJson(page);
        // 새로 고침: 확인(my_site_access)의 응답을 붙잡아 둔 동안
        let reached;
        let release;
        const reachedP = new Promise((x) => { reached = x; });
        const releasedP = new Promise((x) => { release = x; });
        cx.hooks.my_site_access = { after: async () => { reached(true); await releasedP; return null; } };
        const mark = cx.records.length;
        const nav = page.reload({ waitUntil: 'domcontentloaded' }).catch(() => null);
        const got = await Promise.race([reachedP, sleep(15000).then(() => false)]);
        await sleep(1300);
        const during = await marks(page);
        ck('새로 고침: 확인 요청을 붙잡음', got === true);
        ck('새로 고침: 다시 확인하기 전에는 일정 화면이 한 번도 보이지 않음', !!during && during.cur.schedule === false && during.scheduleAt < 0);
        ck('새로 고침: 화면을 다 읽은 뒤부터(다른 스크립트의 리스너가 돌 수 있는 때부터) 다시 확인하기 전까지 이 탭에 currentUser 가 없음', !!during && during.cur.user === false && during.userAt < 0);
        ck('새로 고침: 화면을 읽는 도중에도(인증 모듈이 실리기 전에도) 이 탭에 currentUser 가 없음 — 화면 머리가 먼저 치운다', !!during && during.userWhileLoading === false);
        ck('새로 고침: 다시 확인하기 전에는 표 요청 0', phase(cx, mark).tableReads === 0 && phase(cx, mark).writesSent === 0);
        release();
        delete cx.hooks.my_site_access;
        await nav;
        ck('새로 고침: 확인 뒤 일정 화면', await until(page, SCHEDULE, 20000));
        ck('새로 고침: currentUser 가 로그인 직후와 같음', (await userJson(page)) === user);
        // 다른 화면(모듈을 싣지 않는 화면 — 여기서는 시험 서버의 빈 화면)에 다녀오기: 복제된 탭과 가를 근거가 없다 → 다시 로그인
        await page.goto(ON + '/__b3b/blank', { waitUntil: 'domcontentloaded' }).catch(() => {});
        await sleep(1200);
        ck('다른 화면: 같은 탭 — 탭 단위 저장값이 그대로 있음', (await userJson(page)) !== null);
        let mark2 = cx.records.length;
        await page.goto(ON + '/index.html', { waitUntil: 'domcontentloaded' });
        await settled(page, 20000);
        await sleep(1500);
        const back = await stateOf(page);
        ck('다른 화면에 다녀옴: 이어받지 않음(signed_out·window_unproven) — 로그인 화면·안내', back.state === 'signed_out' && back.reason === 'window_unproven' && (await loginShown(page)) && (await messageOf(page)) === 'unproven');
        ck('다른 화면에 다녀옴: 일정 화면 0·currentUser 0·인증 요청 0(확인·갱신·종료)·표 요청 0', !(await scheduleShown(page)) && (await userJson(page)) === null && authCount(cx, mark2) === 0 && phase(cx, mark2).tableReads === 0);
        ck('다른 화면에 다녀옴: 이 탭의 새 모듈 값이 지워짐', (await sessionKeys(page)).every((k) => !k.startsWith('tr_auth_v1') && k !== 'currentUser'));
        const again = await doLogin(cx, page, 'std', { goto: false });
        ck('다른 화면에 다녀옴: 그 화면에서 다시 로그인하면 들어감', again.schedule && again.message === 'welcome');
        // 뒤로 가기: 브라우저가 화면을 보관해 뒀다가 되살려 주면(같은 문서) 이어받고, 새로 읽으면 다시 로그인
        await page.goto(ON + '/__b3b/blank', { waitUntil: 'domcontentloaded' }).catch(() => {});
        await sleep(1200);
        const shows0 = cx.events.filter((e) => e === 'pageshow-persisted').length;
        mark2 = cx.records.length;
        await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
        await settled(page, 20000);
        await sleep(2500);
        const revived = cx.events.filter((e) => e === 'pageshow-persisted').length > shows0;
        const after = await stateOf(page);
        if (revived) ck('뒤로 가기(보관된 화면이 되살아남 — 같은 문서): 다시 확인한 뒤 일정 화면', after.state === 'signed_in' && await until(page, SCHEDULE, 20000) && count(cx, 'my_profile', (r) => cx.records.indexOf(r) >= mark2) >= 1);
        else ck('뒤로 가기(새로 읽힌 문서): 이어받지 않음 — 로그인 화면·인증 요청 0', after.state === 'signed_out' && after.reason === 'window_unproven' && !(await scheduleShown(page)) && authCount(cx, mark2) === 0);
        ck('쓰기 전송 0', phase(cx, 0).writesSent === 0);
        cx.notes = Object.assign(cx.notes || {}, { bfcache: revived });
    });

    // ---- LO. 로그아웃 → 재로그인 → 다른 계정 ----
    await runCase('LO', '로그아웃(이 로그인만) → 재로그인 → 다른 계정 로그인', async (cx, ck) => {
        const page = await cx.page();
        const r = await doLogin(cx, page, 'std');
        ck('로그인: 일정 화면', r.schedule);
        const sid = cx.seen.lastLoginSid;
        await page.evaluate(() => { window.sessionStorage.setItem('zz_b3b_other', 'keep'); window.logout(); });
        await until(page, "window.EonAuth.state() === 'signed_out'", 15000);
        ck('로그아웃: 확인 창이 떴고, 로그인 화면·signed_out', cx.dialogs.includes('logoutConfirm') && (await loginShown(page)) && (await stateOf(page)).state === 'signed_out');
        ck('로그아웃: 종료 요청 1(204)', count(cx, 'logout') === 1 && cx.records.filter((x) => x.target === 'logout' && !x.aborted).every((x) => x.status === 204));
        const left = await sessionKeys(page);
        ck('로그아웃: 이 탭에 새 모듈의 값·currentUser 가 남지 않고, 다른 값은 그대로', left.includes('zz_b3b_other') && left.every((k) => !k.startsWith('tr_auth_v1') && k !== 'currentUser'));
        const res = await pause('check-logout', { ended: sid });
        ck('DB 대조(브레인방): 그 로그인 기록만 끝남', !!res && res.result === 'ok');
        const again = await doLogin(cx, page, 'std', { goto: false });
        ck('재로그인: 일정 화면', again.schedule && again.message === 'welcome');
        await page.evaluate(() => window.logout());
        await until(page, "window.EonAuth.state() === 'signed_out'", 15000);
        const other = await doLogin(cx, page, 'fast', { goto: false });
        const u = await userJson(page);
        ck('다른 계정 로그인: 일정 화면, currentUser 는 그 계정의 것', other.schedule && !!u && !!SYN && JSON.parse(u).id === SYN.students.fast.memberId);
        ck('쓰기 전송 0', phase(cx, 0).writesSent === 0);
    });

    // ---- EX. 만료된 로그인 기록 ----
    await runCase('EX', '확정된 만료: 새로 고침하면 로그인 화면(갱신은 그 기록으로 한 번)', async (cx, ck) => {
        const page = await cx.page();
        const r = await doLogin(cx, page, 'fast');
        ck('로그인: 일정 화면', r.schedule);
        const sid = cx.seen.lastLoginSid;
        await pause('expire-session', { sid }, { needsRevert: true });
        const mark = cx.records.length;
        await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
        await settled(page, 30000);
        await sleep(800);
        const st = await stateOf(page);
        ck('rejected·expired, 로그인 화면, 안내(로그인이 끝났습니다)', st.state === 'rejected' && st.reason === 'expired' && (await loginShown(page)) && (await messageOf(page)) === 'ended');
        ck('일정 화면·currentUser 0, 표 요청 0(공개 키로 떨어지지 않음)', !(await scheduleShown(page)) && (await userJson(page)) === null && phase(cx, mark).tableReads === 0);
        ck('갱신 요청 1, 종료 요청 0', count(cx, 'refresh') === 1 && count(cx, 'logout') === 0);
        const refresh = cx.records.filter((x) => x.target === 'refresh' && !x.aborted)[0];
        cx.notes = { refreshRefusalCode: refresh ? refresh.code || 'none' : 'none' };
        await pause('restore-session', { sid }, { revertOf: 'expire-session' });
    });

    // ---- MT. 점검 ----
    await runCase('MT', '점검 중: 안내만(예외 명단의 계정은 들어감)', async (cx, ck) => {
        await pause('maintenance-on', { exception: 'fast' }, { needsRevert: true });
        const page = await cx.page();
        const mark = cx.records.length;
        const r = await doLogin(cx, page, 'std');
        const st = await stateOf(page);
        ck('점검 안내, rejected·maintenance, 화면 0·표 요청 0', r.message === 'maintenance' && st.state === 'rejected' && st.reason === 'maintenance' && !r.schedule && phase(cx, mark).tableReads === 0);
        ck('서버의 답: 503·PT503', cx.records.some((x) => x.target === 'my_profile' && x.status === 503 && x.code === 'PT503'));
        const p2 = await cx.page();
        const e = await doLogin(cx, p2, 'fast');
        ck('예외 명단의 계정: 일정 화면', e.schedule);
        await pause('maintenance-off', {}, { revertOf: 'maintenance-on' });
    });

    // ---- WN. 새 창·탭 복제·탭 닫기 ----
    await runCase('WN', '새 창 셋·이름 있는 창의 재사용·답안 카드·탭 복제(흉내)·다른 화면에서의 복제(흉내)·탭 닫고 새 방문: 보일 수 없는 보관값을 쓰지 않음(다시 로그인)', async (cx, ck) => {
        const A = await cx.page();
        const r = await doLogin(cx, A, 'std');
        ck('원래 창: 로그인, 일정 화면', r.schedule);
        const userA = await userJson(A);
        await A.evaluate(() => window.sessionStorage.setItem('zz_b3b_draft', '작성 중'));
        const openChild = async (from, script) => {
            const got = cx.context.waitForEvent('page', { timeout: 15000 }).catch(() => null);
            await from.evaluate(script).catch(() => {});
            const child = await got;
            if (child) { await child.waitForLoadState('domcontentloaded').catch(() => {}); await until(child, "!!window.EonAuth && window.EonAuth.state() !== 'restoring'", 15000); await sleep(600); }
            return child;
        };
        const foreign = async (name, child, mark) => {
            const st = child ? await stateOf(child) : { state: 'other', reason: 'other' };
            ck(`${name}: 이어받지 않음(signed_out·window_unproven)`, st.state === 'signed_out' && st.reason === 'window_unproven');
            ck(`${name}: 그 창에서 나간 인증 요청 0(복사된 자격의 사용 0·확인 0·갱신 0)`, authCount(cx, mark) === 0);
            ck(`${name}: 일정 화면 0(자동 진입 0)·로그인 화면·안내`, !!child && !(await scheduleShown(child)) && (await loginShown(child)) && (await messageOf(child)) === 'unproven');
            ck(`${name}: 그 창의 사본(새 모듈의 값·currentUser)이 지워짐`, !!child && (await sessionKeys(child)).every((k) => !k.startsWith('tr_auth_v1') && k !== 'currentUser'));
        };
        let mark = cx.records.length;
        const c1 = await openChild(A, "window.open('index.html', 'omrCard', 'width=700,height=800')");
        await foreign('이름 있는 창', c1, mark);
        mark = cx.records.length;
        const c2 = await openChild(A, "window.open('index.html', '_blank')");
        await foreign('_blank', c2, mark);
        mark = cx.records.length;
        const c3 = await openChild(A, "(() => { const w = window.open('about:blank', '_blank'); w.location.href = 'index.html'; })()");
        await foreign('about:blank 뒤 이동', c3, mark);
        // 이름 있는 창의 재사용: 답안 카드(모듈을 싣지 않는 화면 — 복사된 값이 그대로 남는다)를 연 뒤 같은 이름으로 첫 화면을 다시 연다
        mark = cx.records.length;
        const omr = await openChild(A, "window.open('omr-card.html?type=reading&modules=1&week=1&day=%EC%9B%94&userId=x', 'omrCard2', 'width=700,height=800')");
        await sleep(1500);
        ck('답안 카드 창: 복사된 currentUser 를 지금처럼 읽음(기준과 같다)', !!omr && (await userJson(omr)) === userA);
        ck('답안 카드 창: 그 창에서 나간 인증 요청 0·회원 자격 0', authCount(cx, mark) === 0 && phase(cx, mark).member === 0);
        cx.notes = { omrRequests: phase(cx, mark).tableReads, omrWritesBlocked: phase(cx, mark).writesBlocked };
        mark = cx.records.length;
        await A.evaluate("window.open('index.html', 'omrCard2')").catch(() => {});
        if (omr) { await omr.waitForLoadState('domcontentloaded').catch(() => {}); await until(omr, "!!window.EonAuth && window.EonAuth.state() !== 'restoring'", 15000); await sleep(600); }
        await foreign('이름 있는 창의 재사용', omr, mark);
        // 탭 복제의 흉내: 탭 단위 저장값이 복사되고 창 이름이 같고 연 창이 없다
        mark = cx.records.length;
        const dup = await openChild(A, "window.open('index.html', '__b3bDup')");
        await foreign('탭 복제(흉내)', dup, mark);
        // 원래 창은 그대로
        const stA = await stateOf(A);
        ck('원래 창: 로그인·currentUser·작성 중 값이 그대로', stA.state === 'signed_in' && (await userJson(A)) === userA && (await A.evaluate(() => window.sessionStorage.getItem('zz_b3b_draft'))) === '작성 중' && (await scheduleShown(A)));
        ck('창 사이 통로로 오간 것 0', !cx.events.includes('broadcast'));
        for (const c of [c1, c2, c3, omr, dup]) if (c) await c.close().catch(() => {});
        // 원래 창의 새로 고침: 같은 탭에서 바로 앞 문서를 갈아 낀 문서 — 이어받는다
        await A.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
        ck('원래 창의 새로 고침: 다시 확인한 뒤 일정 화면(이어받음)', await until(A, SCHEDULE, 20000) && (await stateOf(A)).state === 'signed_in');
        // 모듈을 싣지 않는 화면에 있는 동안 복제(흉내)된 탭: 복제본이 먼저 돌아오든 원본이 나중에 돌아오든 어느 쪽도 이어받지 않는다
        await A.goto(ON + '/__b3b/blank', { waitUntil: 'domcontentloaded' }).catch(() => {});
        await sleep(1500);
        mark = cx.records.length;
        const first = await openChild(A, "window.open('/index.html', '__b3bDup')");
        await foreign('다른 화면에서 복제(흉내) — 먼저 돌아온 복제본', first, mark);
        await A.goto(ON + '/index.html', { waitUntil: 'domcontentloaded' }).catch(() => {});
        await settled(A, 20000);
        await sleep(1200);
        await foreign('다른 화면에서 복제(흉내) — 나중에 돌아온 원본', A, mark);
        ck('다른 화면에서 복제(흉내): 돌아온 뒤 그 로그인으로 나간 요청 0(갱신 포함)', authCount(cx, mark) === 0);
        // 마지막 탭을 닫고 새로 방문: 로그인이 남지 않는다
        await A.close().catch(() => {});
        if (first) await first.close().catch(() => {});
        const N = await cx.page();
        await N.goto(ON + '/index.html', { waitUntil: 'domcontentloaded' });
        await settled(N, 20000);
        await sleep(500);
        const stN = await stateOf(N);
        ck('탭을 닫고 새로 방문: 로그인 없음(signed_out·로그인 화면·탭 단위 저장값 없음)', stN.state === 'signed_out' && stN.reason === null && (await loginShown(N)) && !(await scheduleShown(N)) && (await sessionKeys(N)).every((k) => !k.startsWith('tr_auth_v1') && k !== 'currentUser'));
        ck('쓰기 전송 0', phase(cx, 0).writesSent === 0);
    });

    // ---- NM. 켜진 화면인데 인증 모듈 파일을 받지 못함: 닫는 쪽(옛 로그인·저장된 값의 복원으로 가지 않는다) ----
    await runCase('NM', '켜진 화면인데 인증 모듈 파일을 받지 못함: 로그인 화면과 안내만(옛 로그인·복원·authReady·Sentry 사용자 지정·업무 요청 0)', async (cx, ck) => {
        // Sentry 대역(이 경우에만): 사용자를 지정하는 호출을 센다(값은 보지 않는다). 실제 Sentry 스크립트는 화면의 내용 보안 정책이 막는다
        await cx.context.addInitScript(() => {
            window.__b3bSentryUser = 0;
            window.__b3bAuthReady = 0;
            window.Sentry = new Proxy({}, { get: (t, k) => (k === 'setUser' ? (u) => { if (u) window.__b3bSentryUser++; } : () => ({})) });
            window.addEventListener('authReady', () => { window.__b3bAuthReady++; }, true);
        });
        const closedChecks = async (name, page, mark) => {
            const ph = phase(cx, mark);
            ck(`${name}: 로그인 화면·안내(로그인 기능을 불러오지 못했습니다)·일정 화면 0`, (await loginShown(page)) && !(await scheduleShown(page)) && (await messageOf(page)) === 'unavailable');
            ck(`${name}: 인증 모듈이 없음(파일을 받지 못함)`, (await page.evaluate(() => typeof window.EonAuth)) === 'undefined' && (cx.withheld || 0) >= 1);
            ck(`${name}: 시험 프로젝트로 가는 요청 0(시도 포함 — 인증·회원 표·표 읽기·쓰기)`, cx.records.slice(mark).filter((r) => r.where === 'test-project').length === 0 && ph.businessTried === 0);
            ck(`${name}: authReady 0·Sentry 사용자 지정 0·currentUser 0`, (await page.evaluate(() => [window.__b3bAuthReady, window.__b3bSentryUser])).every((n) => n === 0) && (await userJson(page)) === null);
        };
        // (1) 먼저 보통의 새 로그인으로 들어간다(모듈을 받는다)
        const page = await cx.page();
        const r = await doLogin(cx, page, 'std');
        ck('먼저: 새 로그인으로 일정 화면', r.schedule);
        // (2) 그 탭을 새로 고치는데 모듈 파일을 받지 못한다: 앞의 currentUser 로 화면·요청이 나가지 않는다
        cx.withholdModule = true;
        await page.evaluate(() => { window.__b3bSentryUser = 0; });
        let mark = cx.records.length;
        await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
        await until(page, "typeof handleLogin === 'function' && !!document.getElementById('loginBtn')", 20000);
        await sleep(2500);
        const during = await marks(page);
        await closedChecks('로그인돼 있던 탭의 새로 고침', page, mark);
        ck('로그인돼 있던 탭의 새로 고침: 화면을 읽는 도중에도 currentUser 가 없고 일정 화면이 한 번도 보이지 않음', !!during && during.userWhileLoading === false && during.userAt < 0 && during.scheduleAt < 0);
        // 로그인 버튼(옛 길의 값·맞는 값·빈 값): 요청 0
        for (const [name, email, pw] of [['옛 길의 값', vault.get('EMAIL_std'), vault.get('LEGACY_PW')], ['맞는 값', vault.get('EMAIL_std'), vault.get('PW')], ['빈 값', '', '']]) {
            mark = cx.records.length;
            await page.fill('#studentEmail', email);
            await page.fill('#studentPassword', pw);
            await page.click('#loginBtn');
            await sleep(1500);
            await closedChecks(`닫힌 화면의 로그인 버튼(${name})`, page, mark);
        }
        // (3) 새 브라우저 탭의 첫 방문에서 모듈을 받지 못한다
        const p2 = await cx.page();
        mark = cx.records.length;
        await p2.goto(ON + '/index.html', { waitUntil: 'domcontentloaded' });
        await until(p2, "typeof handleLogin === 'function' && !!document.getElementById('loginBtn')", 20000);
        await sleep(2000);
        await closedChecks('첫 방문', p2, mark);
        await p2.close().catch(() => {});
        // (4) 다시 모듈을 받는 새로 고침: 닫힌 화면은 쥔 적이 없으므로 이어받지 못한다 → 다시 로그인(자동 진입 0)
        cx.withholdModule = false;
        mark = cx.records.length;
        await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
        await settled(page, 20000);
        await sleep(1500);
        const st = await stateOf(page);
        ck('그 뒤 모듈을 받은 새로 고침: 이어받지 않음(signed_out·window_unproven)·인증 요청 0·일정 화면 0', st.state === 'signed_out' && st.reason === 'window_unproven' && authCount(cx, mark) === 0 && !(await scheduleShown(page)));
        ck('쓰기 전송 0', phase(cx, 0).writesSent === 0);
    });

    // ---- BC. 공식 클라이언트의 창 사이 통로: 자격 전달 0, 닫지 못하면 클라이언트를 쓰지 않는다(자동 갱신 0) ----
    await runCase('BC', '공식 클라이언트의 창 사이 통로(BroadcastChannel): 자격 전달 0, 닫지 못하면 클라이언트를 쓰지 않음(로그인·자동 갱신 0)', async (cx, ck) => {
        // (1) 보통의 화면: 로그인·로그아웃 동안 같은 출처의 다른 창이 그 통로에서 받은 것 0
        const listener = await cx.page();
        await listener.goto(ON + '/__b3b/blank', { waitUntil: 'domcontentloaded' });
        await sleep(300);
        const page = await cx.page();
        const r = await doLogin(cx, page, 'std');
        ck('로그인: 일정 화면', r.schedule);
        ck('이 브라우저에 창 사이 통로(BroadcastChannel)가 있음(통로가 있는 환경에서 잰 것)', await page.evaluate(() => typeof BroadcastChannel === 'function'));
        await page.evaluate(() => window.logout());
        await until(page, "window.EonAuth.state() === 'signed_out'", 15000);
        await sleep(800);
        ck('로그인·로그아웃 동안 다른 창이 그 통로에서 받은 것 0(자격 전달 0)', !cx.events.includes('broadcast'));
        await page.close().catch(() => {});
        // (2) 통로를 닫을 수 없는 브라우저(닫기가 예외를 낸다): 클라이언트를 쓰지 않는다 — 로그인 요청 0·갱신 0
        await cx.context.addInitScript(() => { try { BroadcastChannel.prototype.close = function () { throw new Error('zz-cannot-close'); }; } catch (e) {} });
        const p2 = await cx.page();
        const mark = cx.records.length;
        const bad = await doLogin(cx, p2, 'std');
        const st = await stateOf(p2);
        ck('닫지 못함: 로그인되지 않음(안내·일정 화면 0)', !bad.schedule && st.state !== 'signed_in' && ['unavailable', 'error'].includes(bad.message));
        await sleep(2500);
        ck('닫지 못함: 인증 요청 0(로그인·확인·갱신·종료)', authCount(cx, mark) === 0);
        ck('닫지 못함: 이 탭에 로그인 상태가 저장되지 않음', (await sessionKeys(p2)).every((k) => k !== 'tr_auth_v1' && k !== 'currentUser'));
        ck('쓰기 전송 0', phase(cx, 0).writesSent === 0);
    });

    // ---- OFF. 꺼짐 대조 ----
    await runCase('OFF', '꺼짐 대조: 인증 모듈은 아무것도 하지 않음(늘어난 정적 요청은 js/auth-session.js 1개)', async (cx, ck) => {
        const sdk0 = siteOff.core.counts.sdk;
        const mod0 = siteOff.core.counts.authModule;
        const page = await cx.page();
        await page.goto(OFF + '/index.html?eon_auth=on&auth=on', { waitUntil: 'domcontentloaded' });
        await until(page, "typeof handleLogin === 'function'", 20000);
        await sleep(1200);
        ck('상태 off(주소의 꼬리표로 켜지지 않음)', (await stateOf(page)).state === 'off');
        ck('인증 요청 0, SDK 파일을 받는 요청 0', authCount(cx, 0) === 0 && siteOff.core.counts.sdk === sdk0);
        ck('인증 모듈 파일은 화면마다 1번 받음(지금과 다른 것 — 차이 장부)', siteOff.core.counts.authModule === mod0 + 1);
        ck('새 모듈의 저장 이름 0(탭 단위·브라우저 단위)', (await sessionKeys(page)).every((k) => !k.startsWith('tr_auth_v1')) && (await page.evaluate(() => Object.keys(window.localStorage).filter((k) => k.indexOf('tr_auth_v1') === 0).length)) === 0);
        ck('창 이름을 건드리지 않음', (await page.evaluate(() => window.name)) === '');
        ck('로그인 화면이 보임(기준 그대로)', await loginShown(page));
    });


    return plan;
}

// ---------------------------------------------------------------------------
async function main() {
    console.log(`화면 시험 실행기 — ${FAKE ? '가짜 서버를 상대로(실제 서버의 증거가 아니다)' : '시험 프로젝트를 상대로'}`);
    if (FAKE) setupFake();
    if (FAKE) SYN = fakeSynthetic();
    siteOn = await startSite('on');
    siteOff = await startSite('off');
    ON = siteOn.origin;
    OFF = siteOff.origin;
    for (const site of [siteOn, siteOff]) {
        const scan = site.core.scan();
        if (scan.repoSwitch !== 'off') stop('저장소의 스위치 값이 꺼짐이 아니다');
        if (scan.repoPageSwitch !== 'off') stop('저장소의 화면 머리 스위치 값이 꺼짐이 아니다');
        site.core.counts.sdk = 0;
        site.core.counts.authModule = 0;
    }
    // SDK 파일을 내준 횟수(꺼짐 서버에서는 0 이어야 한다)
    for (const site of [siteOn, siteOff]) {
        const respond = site.core.respond;
        site.core.respond = (req) => {
            const p = String(req.url).split('?')[0];
            if (p === '/vendor/supabase-2.116.0.js') site.core.counts.sdk++;
            if (p === '/js/auth-session.js') site.core.counts.authModule++;
            return respond(req);
        };
    }
    await startControl();
    // 회원 JWT 는 발급자가 시험 프로젝트이고 계정이 이번 실행의 합성 계정일 때만 내보낸다(보관함이 열리기 전에는 어떤 회원 JWT 도 내보내지 않는다)
    decide = makeDecider({
        selfOrigins: [ON, OFF], anonKey: ANON, issuer: ISSUER,
        memberEmails: () => (vault.armed() ? KEYS.map((k) => vault.get('EMAIL_' + k)) : []),
        // 업무 요청은 예행이 통과하고(보관함) 합성 자료의 목록을 확인한 뒤에만 가른다 — 그 전에는 전부 막는다.
        // 그 뒤에는 요청마다 화면(켜짐·꺼짐)과 지금 돌리는 그 합성 학생으로 가른다(handleRoute 가 넘긴다)
        ready: () => vault.armed() && !!SYN,
    });
    if (FAKE) fakeOperator();
    console.log(`  켜짐 ${ON}   꺼짐 ${OFF}   제어 포트 ${control.port}`);

    browser = await chromium.launch({
        executablePath: chromePath,
        headless: !flag('--headed'),
        // 브라우저는 127.0.0.1 말고는 이름을 풀지 못한다(차단기를 거치지 않고 바깥으로 나가는 길을 막는다)
        args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'],
        env: browserEnv(process.env),                              // 필요한 환경 변수만(비밀번호·제어 비밀·공개 키·이메일은 물려지지 않는다)
        ignoreDefaultArgs: ['--disable-back-forward-cache'],      // 보관된 화면이 되살아나는 경우도 재려고
    });

    let stopped = null;
    let seq = { stopped: 'error', started: [] };
    try {
        const plan = await buildCases();
        const first = plan.find((c) => c.id === 'P');
        const rest = plan.filter((c) => c.id !== 'P' && (!ONLY || ONLY.has(c.id)));
        // 예행(P)은 언제나 먼저 돈다. P 의 판정이 전부 참이 아니면 뒤의 경우를 하나도 시작하지 않는다(보관함도 열리지 않는다)
        seq = await runSequence({
            preflight: async () => { await first.run(); return results.find((r) => r.id === 'P'); },
            cases: rest, vault, board, halted: () => HALT,
        });
    } catch (e) {
        stopped = '실행 도중 예외';
    } finally {
        await browser.close().catch(() => {});
    }
    if (seq.stopped === 'preflight') stopped = '차단의 예행(P)이 통과하지 못해 뒤의 경우를 시작하지 않음';
    if (seq.stopped === 'unsafe' || HALT) stopped = '안전 조건을 어긴 요청이 나와(전송 전에 막음) 그 경우를 끝내고 뒤의 경우를 시작하지 않음';
    // 브레인방이 건 DB 변경이 남아 있을 수 있으면 "원복 확인"을 받기 전에는 끝내지 않는다
    if (board.pendingRevert && seq.stopped !== 'revert') await confirmRevert(board);
    if (board.pendingRevert) stopped = (stopped ? stopped + ' / ' : '') + '원복 확인을 받지 못함 — 시험 프로젝트의 합성 행·점검·로그인 기록을 직접 확인해 되돌릴 것';

    const sinkTotal = siteOn.core.counts.sink + siteOff.core.counts.sink;
    const required = results.filter((r) => r.required);
    const totals = { pass: results.filter((r) => r.verdict === 'pass').length, differs: results.filter((r) => r.verdict === 'differs').length, unknown: results.filter((r) => r.verdict === 'unknown').length };
    const expectedIds = EXPECTED_IDS;
    const notRun = expectedIds.filter((id) => !results.some((r) => r.id === id));
    const all = results.flatMap((r) => r.records);
    const controlPass = all.filter((r) => r.how === 'control-pass').length;         // 예행에서 일부러 보낸 대조용 정상 요청(1건)
    const sinkUnexpected = sinkTotal - controlPass;
    const overall = !stopped && notRun.length === 0 && required.every((r) => r.verdict === 'pass') && sinkUnexpected === 0 && controlPass === 1 && egress.blocked === 0 && (!FAKE || egress.testProject === 0);
    const output = {
        tool: 'tests/auth-session/screen.mjs',
        mode: FAKE ? 'fake-server' : 'test-project',
        selftest: SELFTEST,                                 // null 이 아니면 일부러 고장을 낸 대조 실험이다(통과가 아닌 것이 기대)
        vaultOpened: vault.armed(),                         // 예행이 통과해 비밀 보관함이 열렸는가
        started: seq.started,
        note: FAKE ? '가짜 서버를 상대로 돌린 결과다 — 실제 서버·실제 응답의 증거가 아니다' : '시험 프로젝트를 상대로 돌린 결과',
        overall: overall ? 'pass' : 'not-pass',
        stopped,
        haltedByUnsafeRequest: HALT,                        // 안전 조건을 어긴 요청이 나와 멈췄는가
        notRun,
        totals,
        independentEvidence: {
            // 차단기의 결정과 독립된 숫자들
            sinkReceived: sinkTotal,                        // 시험 목적지가 실제로 받은 수
            sinkControlPass: controlPass,                   // 그 가운데 예행이 일부러 보낸 대조용 정상 요청(1 이어야 한다)
            sinkUnexpected,                                 // 그 밖(0 이어야 한다)
            controlArrivals: control.arrivals,
            controlRejected: control.rejected,
            runnerConnections: egress,                      // 실행기가 연 연결: local / testProject / blocked(막은 시도)
            requestsSentToTestProject: all.filter((r) => r.where === 'test-project' && r.sent).length,
            requestsAnsweredByFakeServer: all.filter((r) => r.how && r.how.startsWith('fake-server')).length,
            staticAllowedFulfilledLocally: all.filter((r) => r.where === 'static-allowed').length,
            // 화면의 내용 보안 정책이 요청을 만들기 전에 막은 것(바깥 스크립트 — Sentry 등. 차단기까지 오지 않는다)
            cspBlockedInBrowser: siteOn.core.counts.csp + siteOff.core.counts.csp,
        },
        summary: summarize(all),
        pendingRevert: board.pendingRevert,                 // null 이 아니면 브레인방이 건 DB 변경이 남아 있을 수 있다
        operatorLeftovers: board.leftovers,                 // 브레인방이 만든 것이 남아 있을 수 있음(로그인 기록 — 정리는 브레인방이 DB 로)
        pauses: board.history,
        cases: results,
    };
    const text = JSON.stringify(output, null, 1);
    // 덧붙이는 점검: 결과에 비밀값·JWT 모양이 없는가(주된 보호는 "정해 둔 값만 적는다"이다)
    const leaks = SCAN.filter((s) => s && text.includes(s)).length + (/eyJ[A-Za-z0-9_-]{8,}/.test(text) ? 1 : 0);
    if (leaks) { console.error('중단: 결과에 비밀값의 흔적이 있어 파일을 쓰지 않는다'); process.exitCode = 5; }
    else { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, text); }

    console.log('');
    console.log(`  경우: 통과 ${totals.pass} / 기대와 다름 ${totals.differs} / 미확인 ${totals.unknown}${notRun.length ? ` / 돌리지 않음 ${notRun.length}` : ''}`);
    console.log(`  독립된 증거: 시험 목적지 수신 ${sinkTotal}(대조용 ${controlPass} + 그 밖 ${sinkUnexpected}), 실행기가 연 연결 — 로컬 ${egress.local}·시험 프로젝트 ${egress.testProject}·막은 시도 ${egress.blocked}`);
    console.log(`  시험 프로젝트로 실제 보낸 요청 ${output.independentEvidence.requestsSentToTestProject}건, 가짜 서버가 답한 요청 ${output.independentEvidence.requestsAnsweredByFakeServer}건`);
    if (!leaks) console.log(`  결과: ${OUT}`);
    if (SELFTEST) console.log(`  대조 실험(${SELFTEST}): 일부러 고장을 냈다 — 통과가 아닌 것이 기대다`);
    console.log(`전체 판정: ${overall ? '통과' : '통과 아님'}${FAKE ? '  (가짜 서버 — 실제 서버의 증거가 아니다)' : ''}${stopped ? '  [' + stopped + ']' : ''}`);
    control.server.close();
    control.server = null;
    siteOn.server.close();
    siteOff.server.close();
    if (board.leftovers.length) console.log(`  브레인방이 만든 것이 남아 있을 수 있음: ${board.leftovers.map((x) => x.kind + '(' + x.account + ')').join(', ')}`);
    if (!process.exitCode) process.exitCode = seq.stopped === 'preflight' ? 4 : (board.pendingRevert ? 3 : (HALT ? 6 : (stopped ? 3 : (overall ? 0 : 1))));
    setTimeout(() => process.exit(process.exitCode), 300);
}

main().catch((e) => { console.error('중단: 실행기 오류 — ' + String(e && e.message).split('\n')[0]); process.exit(3); });
