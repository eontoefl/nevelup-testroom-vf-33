// [실험 3D-0 ③] 화면 사이 로그인 유지 — 두 안을 같은 잣대로 잰다. 제품 조각도 인수 대상도 아니다.
//
//   node tests/exp-3d0/run.mjs [--variant base|frame|multi|all] [--out <폴더>] [--refresh-sec 200]
//   환경 변수(3B 의 실행기와 같다): B3B_PLAYWRIGHT(playwright-core 폴더), B3B_CHROMIUM(chrome.exe). 설치·내려받기를 하지 않는다.
//
// 전부 로컬이다: 시험 서버(127.0.0.1)와 가짜 로그인 서버·가짜 표 요청(이 프로세스 안), 지어낸 자격.
// 시험 프로젝트의 주소로 가는 요청은 브라우저를 떠나기 전에 가로채 가짜 서버가 답한다. 이 프로세스가 127.0.0.1 밖으로 여는 연결은 막고 센다.
// 실제 탭 복제·닫은 탭 되살리기는 3B 의 TD 와 같은 방법(임시 폴더에 만든 확장의 chrome.tabs / chrome.sessions)이다.
// 프로필 폴더가 임시 폴더에 생긴다(가짜 서버의 지어낸 로그인 상태만 들어간다) — 끝나면 지운다.

import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import dns from 'node:dns';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import { TEST_URL, TEST_REF, CONFIG_FILE, readProdConfig } from '../auth-session/rewrite.mjs';
import { FakeRest } from '../auth-session/fake-rest.mjs';
import { STUDENTS, authAccount } from '../auth-session/fixtures.mjs';
import { createCore, makeIgnore } from '../auth-session/serve-core.mjs';
import { FakeSupabase, fakeJwt } from '../auth-session/fake-supabase.mjs';
import { browserEnv } from '../auth-session/screen-core.mjs';
import { VARIANTS, makeTransform, headersFor } from './variants.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback; };
function stop(message) { console.error('중단: ' + message); process.exit(2); }

const WANT = arg('--variant', 'all');
const RUN = WANT === 'all' ? VARIANTS : WANT.split(',');
if (!RUN.every((v) => VARIANTS.includes(v))) stop('--variant 는 base·frame·multi·all');
const OUT_DIR = path.resolve(arg('--out', path.join(ROOT, 'tests', 'exp-3d0', '.run')));
const REFRESH_SEC = Number(arg('--refresh-sec', '200'));          // 가짜 서버가 내주는 로그인의 수명(짧게 — 갱신이 실제로 일어나게)
const ONLY_PHASE = arg('--phase', null);                           // (점검용) 1~6 가운데 일부만: 예 --phase 1,3

const pwPath = process.env.B3B_PLAYWRIGHT;
const chromePath = process.env.B3B_CHROMIUM;
if (!pwPath || !fs.existsSync(pwPath)) stop('B3B_PLAYWRIGHT(playwright-core 폴더)가 없음');
if (!chromePath || !fs.existsSync(chromePath)) stop('B3B_CHROMIUM(chrome.exe)이 없음');
let chromium;
try { chromium = createRequire(import.meta.url)(pwPath).chromium; } catch (e) { chromium = null; }
if (!chromium) stop('playwright-core 를 쓸 수 없음');

// ---- 이 프로세스가 여는 연결: 127.0.0.1 만(그 밖은 막고 센다)
const egress = { local: 0, blocked: 0 };
{
    const LOCAL = new Set(['127.0.0.1', 'localhost', '::1']);
    const origConnect = net.Socket.prototype.connect;
    net.Socket.prototype.connect = function (...args) {
        let host = 'localhost';
        let pipe = false;
        const first = Array.isArray(args[0]) ? args[0][0] : args[0];
        if (first && typeof first === 'object') { if (first.path) pipe = true; host = first.host || first.hostname || 'localhost'; } else if (typeof first === 'string') pipe = true; else if (typeof args[1] === 'string') host = args[1];
        if (pipe || LOCAL.has(String(host))) { egress.local++; return origConnect.apply(this, args); }
        egress.blocked++;
        process.nextTick(() => this.destroy(new Error('exp3d0: 허용 밖 연결을 막음')));
        return this;
    };
    const origLookup = dns.lookup;
    dns.lookup = function (hostname, ...rest) {
        if (LOCAL.has(String(hostname))) return origLookup.call(this, hostname, ...rest);
        egress.blocked++;
        const cb = rest[rest.length - 1];
        if (typeof cb === 'function') process.nextTick(() => cb(Object.assign(new Error('exp3d0: 허용 밖 이름 풀이를 막음'), { code: 'ENOTFOUND' })));
        return {};
    };
}

// ---- 시험 서버(안마다 하나): 3B 의 서버 몸통(두 스위치를 켜고 설정을 시험 주소·가짜 공개 키로 바꾼 사본) + 안의 사본 바꾸기
const tracked = execFileSync('git', ['-c', 'core.quotepath=false', 'ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\0').filter(Boolean);
let ignoreText = '';
try { ignoreText = fs.readFileSync(path.join(ROOT, '.vercelignore'), 'utf8'); } catch (e) { ignoreText = ''; }
const ignored = makeIgnore(ignoreText);
const files = tracked.filter((f) => !ignored(f) && !f.startsWith('.'));
const prod = readProdConfig(fs.readFileSync(path.join(ROOT, CONFIG_FILE), 'utf8'));
const readFile = (rel) => { try { return fs.readFileSync(path.join(ROOT, rel)); } catch (e) { return null; } };
const ANON = fakeJwt({ role: 'anon', ref: TEST_REF, fake: true });
const PW = 'zz-' + crypto.randomBytes(9).toString('hex');           // 지어낸 비밀번호(가짜 로그인 서버만 안다)

async function startSite(variant) {
    const server = http.createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const core = createCore({ files, readFile, mode: 'on', testKey: ANON, port, prod, log: null });
    const scan = core.scan();
    if (scan.repoSwitch !== 'off' || scan.repoPageSwitch !== 'off') stop('저장소의 스위치 값이 꺼짐이 아니다');
    const transform = makeTransform(variant);
    server.on('request', (req, res) => {
        const chunks = [];
        req.on('data', (c) => { if (chunks.length < 64) chunks.push(c); });
        req.on('end', () => {
            let out;
            try {
                out = core.respond({ method: req.method, url: req.url, body: Buffer.concat(chunks) });
                if (out.status === 200) {
                    const body = transform(String(req.url).split('?')[0].split('#')[0], out.body);
                    const headers = headersFor(variant, out.headers);
                    if (body !== out.body) { headers['Content-Length'] = String(body.length); }
                    out = { status: 200, headers, body };
                }
            } catch (e) { out = { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: Buffer.from('exp3d0: ' + String(e && e.message), 'utf8') }; }
            res.writeHead(out.status, out.headers);
            res.end(out.body);
        });
    });
    return { server, origin: `http://127.0.0.1:${port}` };
}

// ---- 가짜 로그인 서버·가짜 표 요청(안마다 새로)
const clone = (x) => JSON.parse(JSON.stringify(x));
function makeFake() {
    const tables = {};
    for (const s of STUDENTS) { const t = s.tables(); for (const [name, rows] of Object.entries(t)) tables[name] = (tables[name] || []).concat(clone(rows)); }
    const rest = new FakeRest(tables);
    const fake = new FakeSupabase({ origin: TEST_URL, anonKey: ANON, now: () => Date.now() });
    for (const s of STUDENTS) fake.addAccount(Object.assign(authAccount(s), { password: PW }));
    fake.business = (req, u) => rest.handle(req, u);
    const create = fake.createSession.bind(fake);
    fake.createSession = (email, o) => create(email, Object.assign({}, o, { expiresIn: REFRESH_SEC }));      // 로그인의 수명을 짧게
    return { fake, rest };
}
const emailOf = (key) => `zzb3b_${key}@member.zz.invalid`;
const NAME = { '합성학생-std': 'A', '합성학생-fast': 'B' };        // 화면에 보인 이름 → 누구(이름 글자는 결과에 적지 않는다)
const who = (name) => (name === null || name === undefined ? null : (NAME[name] || 'other'));

// ---- 브라우저 안의 관찰 장치(모든 문서·모든 iframe): 읽힌 순간의 표식, 브라우저가 준 탐색 종류, 화면에 보인 이름·초안(값은 보지 않는다)
const INIT_SCRIPT = `(() => {
  if (window.__exp) return;
  const rawGet = Storage.prototype.getItem;
  const b = window.__exp = { docKey: Math.random().toString(36).slice(2), start: { holder: 'none', named: false, stored: false, intent: false }, names: [], draftSeen: false };
  try { const h = JSON.parse(rawGet.call(window.sessionStorage, 'tr_auth_v1:holder')); if (h && (h.state === 'held' || h.state === 'released')) b.start.holder = h.state; } catch (e) {}
  try { b.start.stored = rawGet.call(window.sessionStorage, 'tr_auth_v1') !== null; b.start.intent = rawGet.call(window.sessionStorage, 'tr_auth_v1:intent') !== null; b.start.named = window.name !== ''; } catch (e) {}
  b.nav = () => { try { const v = performance.getEntriesByType('navigation')[0].type; return ['reload', 'navigate', 'back_forward', 'prerender'].includes(v) ? v : 'other'; } catch (e) { return 'unknown'; } };
  b.act = () => { try { const a = window.navigation && window.navigation.activation; return a ? (['push', 'replace', 'reload', 'traverse'].includes(a.navigationType) ? a.navigationType : 'other') + (a.from ? '+from' : '') : 'none'; } catch (e) { return 'unknown'; } };
  const shown = (el) => { try { if (!el) return false; if (getComputedStyle(document.documentElement).visibility === 'hidden') return false; const fe = window.frameElement; if (fe && getComputedStyle(fe).display === 'none') return false; return el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'; } catch (e) { return false; } };
  b.shown = shown;
  b.reset = () => { b.names = []; b.draftSeen = false; };
  // 화면에 보인 것을 실행기에 바로 알린다(문서가 다시 읽혀도 기록이 남게)
  const note = (k, v) => { try { if (typeof window.__expNote === 'function') window.__expNote(k, v); } catch (e) {} };
  b.left = () => { try { return { stored: rawGet.call(window.sessionStorage, 'tr_auth_v1') !== null, user: rawGet.call(window.sessionStorage, 'currentUser') !== null, holder: rawGet.call(window.sessionStorage, 'tr_auth_v1:holder') !== null }; } catch (e) { return null; } };
  const tick = () => { try {
    const n = document.getElementById('userName'); const main = document.getElementById('mainContent');
    if (n && main && shown(main)) { const t = String(n.textContent || '').trim(); if (t && t !== '-' && b.names.indexOf(t) < 0) { b.names.push(t); note('name', t); } }
    const d = document.getElementById('toeflExamDate'); if (d && d.value && shown(d) && !b.draftSeen) { b.draftSeen = true; note('draft', ''); }
  } catch (e) {} };
  setInterval(tick, 40);
  const frame = () => { tick(); requestAnimationFrame(frame); }; requestAnimationFrame(frame);
  window.addEventListener('pageshow', (ev) => { if (ev.persisted) { b.restored = (b.restored || 0) + 1; b.reset(); } }, true);      // 되살아난 화면에 보이는 것은 다시 센다
})();`;
const NO_LOCKS_SCRIPT = `(() => { try { Object.defineProperty(Navigator.prototype, 'locks', { get() { return undefined; }, configurable: true }); } catch (e) {} })();`;

// 문서 하나의 상태(정해 둔 이름·참/거짓만)
const DOC_INFO = () => {
    const vis = (id) => { const e = document.getElementById(id); return !!e && window.__exp && window.__exp.shown(e); };
    const b = window.__exp || {};
    const file = location.pathname === '/' ? '/index.html' : location.pathname;
    const out = { file, hash: location.hash === '#mypage' ? '#mypage' : (location.hash ? 'other' : ''), docKey: b.docKey || null, nav: b.nav ? b.nav() : 'unknown', act: b.act ? b.act() : 'unknown',
        start: b.start || null, restored: b.restored || 0, module: typeof window.EonAuth !== 'undefined', sdk: !!(window.supabase && window.supabase.AuthClient),
        state: null, reason: null, name: null, notLogged: false, schedule: false, login: false, loginMessage: false, draftDate: null, draftTime: null, modal: false,
        names: (b.names || []).slice(), draftSeen: !!b.draftSeen, childOpen: null, asks: null, hosted: null,
        left: b.left ? b.left() : null,
        why: Array.isArray(window.__trHandoffWhy) ? window.__trHandoffWhy.filter((x) => /^[a-z_:]{1,40}$/.test(x)).slice(-6) : [] };
    try { if (window.EonAuth && window.EonAuth.isOn && window.EonAuth.isOn()) { out.state = String(window.EonAuth.state()); out.reason = window.EonAuth.reason() === null ? null : String(window.EonAuth.reason()); } else if (window.EonAuth) out.state = 'module-off'; } catch (e) {}
    if (file === '/mypage.html') {
        if (vis('mainContent')) { const n = document.getElementById('userName'); out.name = n ? String(n.textContent || '').trim() : null; }
        out.notLogged = vis('notLoggedScreen');
        const d = document.getElementById('toeflExamDate'); const t = document.getElementById('toeflExamTime'); const o = document.getElementById('toeflExamModalOverlay');
        out.draftDate = d ? d.value : null; out.draftTime = t ? t.value : null; out.modal = !!o && o.classList.contains('show');
        if (window.__trChild) out.hosted = window.__trChild.hosted === true;
    } else if (file === '/index.html') {
        out.schedule = vis('scheduleScreen'); out.login = vis('loginScreen');
        const m = document.getElementById('loginMessage'); out.loginMessage = !!m && getComputedStyle(m).display !== 'none' && String(m.textContent || '').trim() !== '';
        if (out.schedule) { try { const u = JSON.parse(Storage.prototype.getItem.call(window.sessionStorage, 'currentUser')); out.name = u && u.name ? String(u.name) : null; } catch (e) {} }
        if (window.TrHost) { out.childOpen = window.TrHost.childOpen(); out.asks = window.TrHost.asks().reduce((a, x) => { const k = x.name + (x.ok ? '' : '(거절)'); a[k] = (a[k] || 0) + 1; return a; }, {}); }
    }
    return out;
};
const READY = `(() => { const p = location.pathname; const vis = (id) => { const e = document.getElementById(id); return !!e && getComputedStyle(e).display !== 'none'; };
  if (p.endsWith('/mypage.html')) return !vis('loadingScreen');
  if (p.endsWith('/index.html') || p === '/') { if (typeof window.EonAuth === 'undefined' || !window.EonAuth.isOn()) return typeof window.handleLogin === 'function'; if (window.EonAuth.state() === 'restoring') return false; return vis('scheduleScreen') || vis('loginScreen'); }
  return true; })()`;
const DRAFT = { date: '2026-12-20', time: '09:30' };
const AUTH_TARGETS = ['login', 'refresh', 'logout', 'my_profile', 'my_site_access'];
function targetOf(method, u) {
    const k = `${method} ${u.pathname}${u.search}`;
    if (k === 'POST /auth/v1/token?grant_type=password') return 'login';
    if (k === 'POST /auth/v1/token?grant_type=refresh_token') return 'refresh';
    if (k === 'POST /auth/v1/logout?scope=local') return 'logout';
    if (k === 'POST /rest/v1/rpc/my_profile') return 'my_profile';
    if (k === 'POST /rest/v1/rpc/my_site_access') return 'my_site_access';
    if (u.pathname.startsWith('/auth/v1/')) return 'auth-other';
    return method === 'GET' || method === 'HEAD' ? 'read' : 'write';
}

// ---- 안 하나를 잰다
async function measure(variant) {
    const site = await startSite(variant);
    const { fake } = makeFake();
    const extDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exp3d0-ext-'));
    const profiles = [];
    const result = { variant, steps: [], facts: {}, leftFolders: 0 };
    const der = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'der' });       // 확장의 번호를 미리 알려고(비공개 키는 버린다)
    const extId = [...crypto.createHash('sha256').update(der).digest().subarray(0, 16)].map((x) => String.fromCharCode(97 + (x >> 4)) + String.fromCharCode(97 + (x & 15))).join('');
    fs.writeFileSync(path.join(extDir, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'exp3d0 tab duplication (local test only)', version: '1', key: der.toString('base64'), permissions: ['tabs', 'sessions'] }));
    fs.writeFileSync(path.join(extDir, 'page.html'), '<!doctype html><meta charset="utf-8"><title>exp3d0</title>');

    const tabNo = new WeakMap();
    let tabSeq = 0;
    const tabOf = (page) => { if (!tabNo.has(page)) tabNo.set(page, ++tabSeq); return tabNo.get(page); };

    async function openBrowser({ noLocks = false, noBfcache = false } = {}) {
        const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'exp3d0-profile-'));
        profiles.push(profile);
        const context = await chromium.launchPersistentContext(profile, {
            executablePath: chromePath, headless: false,
            args: ['--headless=new', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--disable-extensions-except=' + extDir, '--load-extension=' + extDir],
            env: browserEnv(process.env), serviceWorkers: 'block', ignoreDefaultArgs: noBfcache ? [] : ['--disable-back-forward-cache'],
        });
        const cx = { context, records: [], seen: [], outside: 0, withholdModule: false, origin: site.origin };
        await context.exposeBinding('__expNote', (source, kind, value) => { try { cx.seen.push({ tab: tabOf(source.page), kind: kind === 'draft' ? 'draft' : 'name', who: kind === 'name' ? who(String(value)) : null }); } catch (e) { /* 기록일 뿐 */ } });
        if (noLocks) await context.addInitScript(NO_LOCKS_SCRIPT);
        await context.addInitScript(INIT_SCRIPT);
        await context.route('**/*', (route) => handleRoute(route, cx).catch(() => route.abort('blockedbyclient').catch(() => {})));
        context.on('page', (page) => page.on('dialog', (d) => { d.accept().catch(() => {}); }));
        cx.ext = await context.newPage();
        await cx.ext.goto('chrome-extension://' + extId + '/page.html');
        return cx;
    }
    async function handleRoute(route, cx) {
        const r = route.request();
        let u;
        try { u = new URL(r.url()); } catch (e) { cx.outside++; return route.abort('blockedbyclient'); }
        if (u.protocol === 'data:' || u.protocol === 'blob:' || u.protocol === 'about:') return route.continue();
        if (u.origin === cx.origin) {
            if (cx.withholdModule && u.pathname === '/js/auth-session.js') return route.fulfill({ status: 404, contentType: 'text/plain', body: '' });
            const resp = await route.fetch({ maxRedirects: 0 });
            return route.fulfill({ response: resp });
        }
        if (u.origin === TEST_URL && !r.isNavigationRequest()) {
            // 시험 프로젝트의 주소: 내보내지 않고 가짜 서버가 답한다
            let tab = 0; let kind = 'top'; let file = '?';
            try { const f = r.frame(); const p = f.page(); tab = tabOf(p); kind = f === p.mainFrame() ? 'top' : 'child'; const fp = new URL(f.url()).pathname; file = fp === '/' ? '/index.html' : fp; } catch (e) { /* 모름 */ }
            let headers;
            try { headers = await r.allHeaders(); } catch (e) { headers = r.headers(); }
            const auth = String(headers.authorization || '');
            const rec = { tab, frame: kind, file, target: targetOf(r.method(), u), member: auth.startsWith('Bearer ') && auth.slice(7) !== ANON, at: Date.now() };
            cx.records.push(rec);
            const res = await fake.handle({ url: r.url(), method: r.method(), headers: Object.entries(headers), bodyText: r.postData(), page: `${tab}/${kind}${file}` });
            rec.status = res.status;
            return route.fulfill({ status: res.status, headers: Object.assign({}, res.headers, { 'access-control-allow-origin': '*', 'access-control-expose-headers': '*' }), body: res.body === null || res.body === undefined ? '' : res.body });
        }
        cx.outside++;                                             // 그 밖(글꼴·CDN·Sentry·바깥): 전부 막는다
        return route.abort('blockedbyclient');
    }

    // ---- 화면을 다루는 도구
    const childFrame = (page) => page.frames().find((f) => f.parentFrame() === page.mainFrame() && (() => { try { return new URL(f.url()).pathname === '/mypage.html'; } catch (e) { return false; } })()) || null;
    const fileOf = (page) => { try { const p = new URL(page.url()).pathname; return p === '/' ? '/index.html' : p; } catch (e) { return '?'; } };
    // 지금 마이페이지를 그리고 있는 문서(없으면 null): (가)는 자식 iframe, 그 밖은 탭의 문서
    const mypageFrame = (page) => (variant === 'frame' ? childFrame(page) : (fileOf(page) === '/mypage.html' ? page.mainFrame() : null));
    async function quiet(cx, pages, ms = 25000) {
        const end = Date.now() + ms;
        let last = -1; let stable = 0;
        for (;;) {
            await sleep(250);
            let ready = true;
            for (const p of pages) {
                if (!p || p.isClosed()) continue;
                try { if (!(await p.evaluate(READY))) ready = false; const c = childFrame(p); if (c && !(await c.evaluate(READY))) ready = false; } catch (e) { ready = false; }
            }
            if (ready && cx.records.length === last) stable++; else stable = 0;
            last = cx.records.length;
            if (stable >= 5 || Date.now() > end) return ready;
        }
    }
    async function login(cx, page, key) {
        if (fileOf(page) !== '/index.html') await page.goto(site.origin + '/index.html', { waitUntil: 'domcontentloaded' });
        await quiet(cx, [page]);
        await page.fill('#studentEmail', emailOf(key));
        await page.fill('#studentPassword', PW);
        await page.click('#loginBtn');
        const end = Date.now() + 25000;
        while (Date.now() < end) { if (await page.evaluate(() => { const e = document.getElementById('scheduleScreen'); return !!e && getComputedStyle(e).display !== 'none'; }).catch(() => false)) break; await sleep(200); }
        await quiet(cx, [page]);
    }
    async function goMypage(cx, page) {
        await page.click('button[title="마이페이지"]').catch(() => page.evaluate(() => window.goToMyPage()).catch(() => {}));
        await sleep(600);
        await quiet(cx, [page]);
    }
    async function typeDraft(page) {
        const f = mypageFrame(page);
        if (!f) return false;
        try {
            await f.evaluate(() => window.goToToeflAndRegister());
            await sleep(500);
            await f.fill('#toeflExamDate', DRAFT.date);
            await f.fill('#toeflExamTime', DRAFT.time);
            return true;
        } catch (e) { return false; }
    }
    // 브라우저의 뒤로·앞으로(주소창 옆 단추와 같은 길 — 화면의 history.back() 이 아니다)
    async function traverse(cx, page, delta) {
        try {
            const client = await cx.context.newCDPSession(page);
            const h = await client.send('Page.getNavigationHistory');
            const target = h.entries[h.currentIndex + delta];
            if (!target) { await client.detach().catch(() => {}); return false; }
            await client.send('Page.navigateToHistoryEntry', { entryId: target.id });
            await client.detach().catch(() => {});
        } catch (e) { return false; }
        await sleep(900);
        await quiet(cx, [page]);
        return true;
    }
    const tabsWith = (cx, prefix) => cx.ext.evaluate(async (o) => (await chrome.tabs.query({})).filter((x) => (x.url || '').startsWith(o)).map((x) => x.id), prefix).catch(() => []);
    async function duplicate(cx, prefix, { whileDoing = null } = {}) {
        const ids = await tabsWith(cx, prefix);
        if (ids.length !== 1) return null;
        const got = cx.context.waitForEvent('page', { timeout: 15000 }).catch(() => null);
        if (whileDoing) await Promise.all([whileDoing(), cx.ext.evaluate((t) => chrome.tabs.duplicate(t), ids[0]).catch(() => {})]);
        else await cx.ext.evaluate((t) => chrome.tabs.duplicate(t), ids[0]).catch(() => {});
        const p = await got;
        if (p) await p.waitForLoadState('domcontentloaded').catch(() => {});
        return p;
    }

    // ---- 기록
    const counts = (list) => { const o = {}; for (const r of list) if (AUTH_TARGETS.includes(r.target)) o[r.target] = (o[r.target] || 0) + 1; return o; };
    async function docRow(cx, label, page, frame, mark) {
        if (!page || page.isClosed() || !frame) return { label, gone: true };
        let info;
        try { info = await frame.evaluate(DOC_INFO); } catch (e) { return { label, unreadable: true }; }
        const tab = tabOf(page);
        const kind = frame === page.mainFrame() ? 'top' : 'child';
        const mine = cx.records.slice(mark).filter((r) => r.tab === tab && r.frame === kind && r.file === info.file);
        const person = who(info.name);
        const seen = info.names.map(who);
        return {
            label, tab, frame: kind, file: info.file, hash: info.hash, doc: info.docKey, nav: info.nav, activation: info.act, restored: info.restored,
            startHolder: info.start ? info.start.holder : null, startStored: info.start ? info.start.stored : null, startNamed: info.start ? info.start.named : null, startIntent: info.start ? info.start.intent : null,
            module: info.module, sdkLoaded: info.sdk, state: info.state, reason: info.reason, person, notLogged: info.notLogged, schedule: info.schedule, loginScreen: info.login,
            draft: info.file === '/mypage.html' ? (info.draftDate === DRAFT.date && info.draftTime === DRAFT.time ? 'kept' : (info.draftDate || info.draftTime ? 'other' : 'empty')) : null, modalOpen: info.modal,
            peopleSeen: seen, draftSeen: info.draftSeen, childOpen: info.childOpen, asks: info.asks, hosted: info.hosted, why: info.why,
            leftStored: info.left ? info.left.stored : null, leftUser: info.left ? info.left.user : null, leftHolder: info.left ? info.left.holder : null,
            auth: counts(mine), memberRequests: mine.filter((r) => r.member).length, businessReads: mine.filter((r) => r.target === 'read').length, businessWrites: mine.filter((r) => r.target === 'write').length,
        };
    }
    // 탭 하나의 문서들(맨 위 문서 + (가)의 자식)
    async function rowsOf(cx, label, page, mark) {
        const rows = [await docRow(cx, label, page, page && !page.isClosed() ? page.mainFrame() : null, mark)];
        if (page && !page.isClosed()) { const c = childFrame(page); if (c) rows.push(await docRow(cx, label + ' › 자식', page, c, mark)); }
        return rows;
    }
    function pushStep(id, title, rows, extra) {
        const step = Object.assign({ id, title, docs: rows }, extra || {});
        result.steps.push(step);
        const brief = rows.map((r) => (r.gone ? `${r.label}: 없음` : `${r.label}[${r.file}${r.hash || ''} ${r.nav}/${r.activation} 시작:${r.startHolder}${r.restored ? ' 되살아남' : ''}] ${r.state || (r.module ? '?' : '모듈 없음')}${r.reason ? '·' + r.reason : ''} 사람:${r.person || '-'}${r.draft ? ' 초안:' + r.draft + (r.draftSeen ? '(보임)' : '') : ''} 남은값:${r.leftStored ? '로그인' : ''}${r.leftUser ? '+화면값' : ''}${!r.leftStored && !r.leftUser ? '없음' : ''} 인증:${JSON.stringify(r.auth)}${r.why && r.why.length ? ' 승계:' + r.why.join('>') : ''}`)).join('\n        ');
        console.log(`  [${variant}] ${id} ${title}\n        ${brief}${extra && extra.shownDuringStep ? '\n        · 이 단계에서 화면에 보인 것: ' + (extra.shownDuringStep.join(', ') || '없음') : ''}`);
        return step;
    }
    const refreshDocs = (cx, mark) => [...new Set(cx.records.slice(mark).filter((r) => r.target === 'refresh' && r.status === 200).map((r) => `${r.tab}/${r.frame}${r.file}`))];
    const phaseOn = (n) => !ONLY_PHASE || ONLY_PHASE.split(',').includes(String(n));

    let cx = null;
    try {
        cx = await openBrowser();
        let T1 = await cx.context.newPage();
        let mark = 0;
        const stepMark = () => { mark = cx.records.length; };
        // 원본을 "로그인돼 있고 마이페이지에 초안이 적힌" 상태로 만든다(이미 그렇다면 그대로)
        async function ensureDrafted(page, key = 'std') {
            let top = null;
            try { top = await page.mainFrame().evaluate(DOC_INFO); } catch (e) { top = null; }
            const mf0 = mypageFrame(page);
            let ok = false;
            if (mf0) { try { const i = await mf0.evaluate(DOC_INFO); ok = who(i.name) === (key === 'std' ? 'A' : 'B') && i.draftDate === DRAFT.date; } catch (e) { ok = false; } }
            if (ok) return true;
            if (!top || top.file !== '/index.html' || !top.schedule) { await page.goto(site.origin + '/index.html', { waitUntil: 'domcontentloaded' }).catch(() => {}); await quiet(cx, [page]); const t2 = await page.mainFrame().evaluate(DOC_INFO).catch(() => null); if (!t2 || !t2.schedule) await login(cx, page, key); }
            await goMypage(cx, page);
            return typeDraft(page);
        }

        // ================= 1. 이동 → 뒤로 → 앞으로 → 새로 고침 =================
        if (phaseOn(1)) {
            stepMark();
            await T1.goto(site.origin + '/index.html', { waitUntil: 'domcontentloaded' });
            await login(cx, T1, 'std');
            pushStep('1.0', '첫 화면에서 A 로 로그인', await rowsOf(cx, '원본', T1, mark));
            stepMark();
            await goMypage(cx, T1);
            const typed = await typeDraft(T1);
            pushStep('1.1', '이동(첫 화면의 마이페이지 단추) — 그 화면에 값을 적음', await rowsOf(cx, '원본', T1, mark), { typed });
            stepMark();
            await traverse(cx, T1, -1);
            pushStep('1.2', '뒤로(브라우저의 단추)', await rowsOf(cx, '원본', T1, mark));
            stepMark();
            await traverse(cx, T1, +1);
            pushStep('1.3', '앞으로(브라우저의 단추)', await rowsOf(cx, '원본', T1, mark));
            stepMark();
            await T1.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
            await sleep(800);
            await quiet(cx, [T1]);
            pushStep('1.4', '새로 고침', await rowsOf(cx, '원본', T1, mark));
            // 화면의 "테스트룸으로" 단추로 돌아갔다가 다시 가기(지금의 제품은 뒤로 가기가 아니라 새 이동이다)
            await ensureDrafted(T1);
            stepMark();
            const mf = mypageFrame(T1);
            if (mf) await mf.evaluate(() => window.goBackToTestroom()).catch(() => {});
            await sleep(800);
            await quiet(cx, [T1]);
            pushStep('1.5', '화면의 "테스트룸으로" 단추', await rowsOf(cx, '원본', T1, mark));
            stepMark();
            await goMypage(cx, T1);
            pushStep('1.6', '다시 마이페이지 단추', await rowsOf(cx, '원본', T1, mark));
        }

        // ================= 2. 원본이 실제로 갱신에 성공하는가 =================
        if (phaseOn(2)) {
            await ensureDrafted(T1);
            stepMark();
            const start = Date.now();
            let refreshed = [];
            while (Date.now() - start < (REFRESH_SEC + 60) * 1000) { refreshed = refreshDocs(cx, mark); if (refreshed.length) break; await sleep(1000); }
            await sleep(1500);
            const rotated = [...fake.sessions.values()].filter((s) => s.alive && s.prevRefresh !== null).length;
            pushStep('2.1', `기다림(로그인의 수명 ${REFRESH_SEC}초 — 갱신이 일어날 때까지)`, await rowsOf(cx, '원본', T1, mark), { waitedSec: Math.round((Date.now() - start) / 1000), refreshedBy: refreshDocs(cx, mark), serverRotatedSessions: rotated });
        }

        // ================= 3. 복제·새 탭·되살리기·직접 주소 =================
        if (phaseOn(3)) {
            // 3.1 이동 직전(이동을 시작하는 순간)의 복제
            await ensureDrafted(T1);
            { const mf = mypageFrame(T1); if (mf) await mf.evaluate(() => window.goBackToTestroom()).catch(() => {}); await sleep(800); await quiet(cx, [T1]); }
            const t1ok = await T1.mainFrame().evaluate(DOC_INFO).catch(() => null);
            if (!t1ok || !t1ok.schedule) { await login(cx, T1, 'std'); }
            stepMark();
            const d31 = await duplicate(cx, site.origin + '/index.html', { whileDoing: () => T1.click('button[title="마이페이지"]').catch(() => {}) });
            await sleep(1200);
            await quiet(cx, [T1, d31]);
            await typeDraft(T1);
            pushStep('3.1', '이동을 시작하는 순간의 탭 복제(브라우저의 명령)', [...await rowsOf(cx, '원본', T1, mark), ...await rowsOf(cx, '복제본', d31, mark)]);
            if (d31) await d31.close().catch(() => {});

            // 3.2 이동 직후의 복제, 그리고 그 복제본의 새로 고침
            await ensureDrafted(T1);
            stepMark();
            const d32 = await duplicate(cx, site.origin + (variant === 'frame' ? '/index.html' : '/mypage.html'));
            await sleep(1200);
            await quiet(cx, [T1, d32]);
            pushStep('3.2', '이동 직후의 탭 복제', [...await rowsOf(cx, '원본', T1, mark), ...await rowsOf(cx, '복제본', d32, mark)]);
            stepMark();
            if (d32) { await d32.reload({ waitUntil: 'domcontentloaded' }).catch(() => {}); await sleep(800); await quiet(cx, [d32]); }
            pushStep('3.3', '그 복제본의 새로 고침', [...await rowsOf(cx, '원본', T1, mark), ...await rowsOf(cx, '복제본', d32, mark)]);
            if (d32) await d32.close().catch(() => {});

            // 3.4 같은 목적지를 동시에 여는 탭: window.open / target=_blank 링크 / ctrl 클릭
            await ensureDrafted(T1);
            await T1.evaluate(() => { for (const [id, target] of [['expBlank', '_blank'], ['expPlain', '']]) { if (document.getElementById(id)) continue; const a = document.createElement('a'); a.id = id; a.href = 'mypage.html'; if (target) a.target = target; a.textContent = id; a.style.cssText = 'position:fixed;left:0;top:' + (target ? 0 : 24) + 'px;z-index:2147483647;background:#fff;padding:2px;font-size:10px;'; document.body.appendChild(a); } }).catch(() => {});
            for (const [name, act] of [
                ['window.open(_blank)', () => T1.evaluate(() => { window.open('mypage.html', '_blank'); })],
                ['target=_blank 링크', () => T1.click('#expBlank')],
                ['ctrl 클릭(새 탭)', () => T1.click('#expPlain', { modifiers: ['Control'] })],
            ]) {
                stepMark();
                const got = cx.context.waitForEvent('page', { timeout: 8000 }).catch(() => null);
                await act().catch(() => {});
                const n = await got;
                if (n) { await n.waitForLoadState('domcontentloaded').catch(() => {}); await sleep(1500); await quiet(cx, [n, T1]); }
                pushStep('3.4', `같은 목적지를 새 탭으로 — ${name}`, [...await rowsOf(cx, '원본', T1, mark), ...(n ? await rowsOf(cx, '새 탭', n, mark) : [{ label: '새 탭', gone: true }])]);
                if (n) await n.close().catch(() => {});
            }
            await T1.evaluate(() => { for (const id of ['expBlank', 'expPlain']) { const e = document.getElementById(id); if (e) e.remove(); } }).catch(() => {});

            // 3.5 모듈을 받지 못한 복제본의 새로 고침
            await ensureDrafted(T1);
            stepMark();
            cx.withholdModule = true;
            const d35 = await duplicate(cx, site.origin + (variant === 'frame' ? '/index.html' : '/mypage.html'));
            await sleep(2500);
            const first35 = d35 ? await rowsOf(cx, '복제본(모듈 없이 읽힘)', d35, mark) : [{ label: '복제본', gone: true }];
            cx.withholdModule = false;
            if (d35) { await d35.reload({ waitUntil: 'domcontentloaded' }).catch(() => {}); await sleep(800); await quiet(cx, [d35, T1]); }
            pushStep('3.5', '첫 읽기에서 모듈을 받지 못한 복제본 → 그 새로 고침', [...await rowsOf(cx, '원본', T1, mark), ...first35, ...await rowsOf(cx, '복제본(새로 고침 뒤)', d35, mark)]);
            if (d35) await d35.close().catch(() => {});

            // 3.6 주소창에 과제 화면 주소를 직접 넣음(다른 탭에서 / 같은 탭에서)
            await ensureDrafted(T1);
            stepMark();
            const fresh = await cx.context.newPage();
            await fresh.goto(site.origin + '/mypage.html', { waitUntil: 'domcontentloaded' }).catch(() => {});
            await sleep(1500);
            await quiet(cx, [fresh, T1]);
            pushStep('3.6', '새 탭의 주소창에 과제 화면 주소를 직접 넣음', [...await rowsOf(cx, '원본', T1, mark), ...await rowsOf(cx, '새 탭', fresh, mark)]);
            await fresh.close().catch(() => {});
            stepMark();
            await T1.goto(site.origin + '/mypage.html', { waitUntil: 'domcontentloaded' }).catch(() => {});
            await sleep(1500);
            await quiet(cx, [T1]);
            pushStep('3.7', '원본 탭의 주소창에 과제 화면 주소를 직접 넣음(원본이 그 주소로 떠남)', await rowsOf(cx, '원본', T1, mark));

            // 3.8 닫았다 되살리기(= (가)에서는 부모인 첫 화면을 닫는 것)
            await ensureDrafted(T1);
            stepMark();
            const ids = await tabsWith(cx, site.origin + (variant === 'frame' ? '/index.html' : '/mypage.html'));
            if (ids.length === 1) await cx.ext.evaluate((t) => chrome.tabs.remove(t), ids[0]).catch(() => {});
            await sleep(1500);
            const gotR = cx.context.waitForEvent('page', { timeout: 15000 }).catch(() => null);
            await cx.ext.evaluate(async () => { try { await chrome.sessions.restore(); } catch (e) {} }).catch(() => {});
            const R = await gotR;
            if (R) { await R.waitForLoadState('domcontentloaded').catch(() => {}); await sleep(1500); await quiet(cx, [R]); }
            pushStep('3.8', '원본 탭을 닫았다가 되살림(닫는 순간 그 탭의 문서는 전부 사라진다)', R ? await rowsOf(cx, '되살린 탭', R, mark) : [{ label: '되살린 탭', gone: true }], { tabsMatched: ids.length });
            if (R) T1 = R; else T1 = await cx.context.newPage();
        }

        // ================= 4. 다른 계정 =================
        if (phaseOn(4)) {
            await ensureDrafted(T1);
            // 4.1 다른 탭에서 B 로 로그인
            stepMark();
            const T2 = await cx.context.newPage();
            await T2.goto(site.origin + '/index.html', { waitUntil: 'domcontentloaded' });
            await login(cx, T2, 'fast');
            await goMypage(cx, T2);
            const bTab = tabOf(T2);
            result.facts.otherTabBSawA = cx.seen.some((s) => s.tab === bTab && (s.who === 'A' || s.kind === 'draft'));
            pushStep('4.1', '다른 탭에서 B 로 로그인하고 그 화면으로', [...await rowsOf(cx, 'A 의 탭', T1, mark), ...await rowsOf(cx, 'B 의 탭', T2, mark)], { bTabSawA: result.facts.otherTabBSawA });
            await T2.close().catch(() => {});
            // 4.2 같은 탭에서: A 가 값을 적어 둔 채 로그아웃 → B 로 로그인 → 그 화면으로
            await ensureDrafted(T1);
            { const mf = mypageFrame(T1); if (mf) await mf.evaluate(() => window.goBackToTestroom()).catch(() => {}); await sleep(800); await quiet(cx, [T1]); }
            stepMark();
            await T1.evaluate(() => window.logout()).catch(() => {});
            await sleep(1500);
            await quiet(cx, [T1]);
            const afterLogout = await rowsOf(cx, '같은 탭(A 로그아웃 뒤)', T1, mark);
            await login(cx, T1, 'fast');
            for (const f of T1.frames()) await f.evaluate(() => { if (window.__exp) window.__exp.reset(); }).catch(() => {});     // 여기서부터 보이는 것은 B 의 것이어야 한다
            const seenFrom = cx.seen.length;
            // A 때 열었던 화면의 항목이 앞쪽에 남아 있으면(문서를 떠나지 않는 안) 그리로 앞으로 가 본다
            const fwdMark = cx.records.length;
            if (await traverse(cx, T1, +1)) {
                await sleep(700);
                pushStep('4.2b', 'B 로그인 직후 앞으로(A 때 열었던 화면의 항목으로)', await rowsOf(cx, '같은 탭(B)', T1, fwdMark), { shownDuringStep: [...new Set(cx.seen.slice(seenFrom).map((s) => (s.kind === 'draft' ? 'A 의 초안' : s.who)))] });
            }
            await goMypage(cx, T1);
            pushStep('4.2', '같은 탭에서 A 로그아웃 → B 로그인 → 그 화면으로', [...afterLogout, ...await rowsOf(cx, '같은 탭(B)', T1, mark)]);
            // 4.3 그 탭에서 뒤로 여러 번(A 때의 항목까지): A 의 이름·초안이 B 에게 보이는가
            const seenAll = [];
            const stepStart = {};
            const before0 = (i) => stepStart[i];
            for (let i = 1; i <= 4; i++) {
                stepMark();
                stepStart[i] = cx.seen.length;
                const moved = await traverse(cx, T1, -1);
                if (!moved) break;
                await sleep(700);
                const rows = await rowsOf(cx, `같은 탭(B) — 뒤로 ${i}번`, T1, mark);
                seenAll.push(...rows);
                const during = cx.seen.slice(before0(i));
                pushStep('4.3', `B 로 로그인한 탭에서 뒤로 ${i}번째`, rows, { shownDuringStep: [...new Set(during.map((s) => (s.kind === 'draft' ? 'A 의 초안' : s.who)))] });
            }
            const after = cx.seen.slice(seenFrom);
            result.facts.aSeenAfterB = after.some((s) => s.who === 'A') || seenAll.some((r) => (r.peopleSeen || []).includes('A') || r.person === 'A');
            result.facts.aDraftSeenAfterB = after.some((s) => s.kind === 'draft') || seenAll.some((r) => r.draftSeen === true);
            result.facts.aDraftValueLeftInInputs = seenAll.some((r) => r.draft === 'kept');
        }
        await cx.context.close().catch(() => {});
        cx = null;

        // ================= 5. 잠금이 없는 브라우저(흉내) =================
        if (phaseOn(5)) {
            cx = await openBrowser({ noLocks: true });
            const P = await cx.context.newPage();
            let m5 = 0;
            await P.goto(site.origin + '/index.html', { waitUntil: 'domcontentloaded' });
            await login(cx, P, 'std');
            m5 = cx.records.length;
            await goMypage(cx, P);
            await typeDraft(P);
            pushStep('5.1', '잠금(navigator.locks)이 없는 브라우저(흉내): 로그인 → 이동', await rowsOf(cx, '원본', P, m5));
            m5 = cx.records.length;
            await P.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
            await sleep(800);
            await quiet(cx, [P]);
            pushStep('5.2', '잠금이 없는 브라우저(흉내): 새로 고침', await rowsOf(cx, '원본', P, m5));
            await cx.context.close().catch(() => {});
            cx = null;
        }
        // ================= 6. 화면 보관(뒤로 가기용 보관)이 꺼진 브라우저 =================
        if (phaseOn(6)) {
            cx = await openBrowser({ noBfcache: true });
            const P = await cx.context.newPage();
            await P.goto(site.origin + '/index.html', { waitUntil: 'domcontentloaded' });
            await login(cx, P, 'std');
            let m6 = cx.records.length;
            await goMypage(cx, P);
            await typeDraft(P);
            pushStep('6.1', '화면 보관이 꺼진 브라우저: 로그인 → 이동 → 값을 적음', await rowsOf(cx, '원본', P, m6));
            m6 = cx.records.length;
            await traverse(cx, P, -1);
            pushStep('6.2', '화면 보관이 꺼진 브라우저: 뒤로', await rowsOf(cx, '원본', P, m6));
            m6 = cx.records.length;
            await traverse(cx, P, +1);
            pushStep('6.3', '화면 보관이 꺼진 브라우저: 앞으로', await rowsOf(cx, '원본', P, m6));
            await cx.context.close().catch(() => {});
            cx = null;
        }
    } catch (e) {
        result.error = String(e && e.message).split('\n')[0];
        console.log(`  [${variant}] 실행 도중 예외: ${result.error}`);
    } finally {
        if (cx) await cx.context.close().catch(() => {});
        site.server.close();
        for (const d of [extDir, ...profiles]) { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 }); } catch (e) { result.leftFolders++; } }
    }
    // 가짜 서버가 받은 것(문서별): 누가 갱신했는가
    result.server = {
        requests: fake.log.length,
        refreshOk: fake.log.filter((e) => e.route === 'POST /auth/v1/token' && e.search === '?grant_type=refresh_token').length,
        refreshBy: [...new Set(fake.log.filter((e) => e.route === 'POST /auth/v1/token' && e.search === '?grant_type=refresh_token').map((e) => e.page))],
        sessions: fake.sessions.size,
        sessionsAlive: [...fake.sessions.values()].filter((s) => s.alive).length,
    };
    return result;
}

// ---- 실행
console.log('실험 3D-0 ③ 화면 사이 로그인 유지 — 로컬 가짜 서버·지어낸 자격(시험·운영 프로젝트로 가는 요청 0)');
fs.mkdirSync(OUT_DIR, { recursive: true });
const all = [];
for (const v of RUN) {
    console.log(`\n=== ${v === 'base' ? '기준(3B 그대로)' : (v === 'frame' ? '(가) 살아 있는 문서' : '(나) 여러 문서 이동')} ===`);
    const r = await measure(v);
    all.push(r);
    const file = path.join(OUT_DIR, `result-${v}.json`);
    const text = JSON.stringify(Object.assign({ tool: 'tests/exp-3d0/run.mjs', note: '로컬 가짜 서버를 상대로 잰 값이다 — 실제 서버의 증거가 아니다', refreshSec: REFRESH_SEC, runnerConnections: Object.assign({}, egress) }, r), null, 1);
    if (text.includes(PW) || /eyJ[A-Za-z0-9_-]{8,}/.test(text) || /fake-refresh-/.test(text)) { console.error('중단: 결과에 자격의 흔적이 있어 파일을 쓰지 않는다'); process.exitCode = 5; } else { fs.writeFileSync(file, text); console.log(`  결과: ${file}`); }
}
console.log(`\n이 프로세스가 연 연결 — 로컬 ${egress.local} · 막은 시도 ${egress.blocked}. 남은 임시 폴더 ${all.reduce((n, r) => n + r.leftFolders, 0)}`);
setTimeout(() => process.exit(process.exitCode || (all.some((r) => r.error) ? 1 : 0)), 300);
