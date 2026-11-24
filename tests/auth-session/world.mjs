// 시험 한 번의 "가짜 세계": 가짜 브라우저(탭) + 가짜 표 요청 + (켜짐일 때) 가짜 로그인 서버.
// 화면의 스크립트는 실제 파일이다. 화면 전체(index.html 의 스크립트 100여 개)를 올리지는 않는다 —
// 로그인에 관여하는 넷(js/supabase-client.js, js/timezone-utils.js, js/auth-session.js, js/auth.js)만 화면에 적힌 순서대로 올리고,
// 화면 전환(showScreen)은 호출을 적는 대역으로 본다. 그 뒤 일정 화면이 내는 요청은 여기에 없다(실행기가 실제 화면으로 본다).

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FakeBrowser } from './browser.mjs';
import { FakeSupabase, readFakeJwt } from './fake-supabase.mjs';
import { FakeRest } from './fake-rest.mjs';
import { TEST_URL, CONFIG_FILE, AUTH_FILE, PAGE_FILE, readProdConfig, rewriteConfig, rewriteSwitch, rewritePageSwitch } from './rewrite.mjs';
import { STUDENTS, authAccount } from './fixtures.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const BASE = 'cd66fcf';
export const FAKE_ANON = 'zz-fake-anon-key-b3b';                  // 가짜 공개 키(실제 키가 아니다)
export const SDK_FILE = 'vendor/supabase-2.116.0.js';
export { TEST_URL, CONFIG_FILE, AUTH_FILE };

const norm = (t) => t.replace(/\r\n/g, '\n');
const baseCache = new Map();
export function baseFile(p) {
    if (!baseCache.has(p)) {
        let text = null;
        try { text = norm(execFileSync('git', ['-c', 'core.quotepath=false', 'show', `${BASE}:${p}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })); } catch (e) { text = null; }
        baseCache.set(p, text);
    }
    return baseCache.get(p);
}
const workCache = new Map();
export function workFile(p) {
    if (!workCache.has(p)) {
        let text = null;
        try { text = norm(fs.readFileSync(path.join(ROOT, p), 'utf8')); } catch (e) { text = null; }
        workCache.set(p, text);
    }
    return workCache.get(p);
}

export const PROD = readProdConfig(workFile(CONFIG_FILE));   // 운영 주소·키(값은 찍지 않는다)

// 변형: 기준(cd66fcf) / 꺼짐(작업 파일 그대로) / 켜짐(시험 주소·가짜 공개 키 + 스위치 켬)
export const V = {
    BASE: { name: '기준', base: true, test: false },
    OFF: { name: '꺼짐', base: false, test: false },
    ON: { name: '켜짐', base: false, test: true },
};

export function provider(variant, mutate) {
    return (p) => {
        let text = variant.base ? baseFile(p) : workFile(p);
        if (text === null) return null;
        if (variant.test) {
            if (p === CONFIG_FILE) text = rewriteConfig(text, { testUrl: TEST_URL, testKey: FAKE_ANON });
            if (p === AUTH_FILE) text = rewriteSwitch(text, 'on');
            if (p === PAGE_FILE) text = rewritePageSwitch(text, 'on');
        }
        return mutate ? mutate(p, text) : text;
    };
}

// 화면이 싣는 스크립트 가운데 로그인에 관여하는 것(화면에 적힌 순서대로)
const KEEP = ['js/supabase-client.js', 'js/timezone-utils.js', 'js/auth-session.js', 'js/auth.js'];
export function pageScripts(html) {
    const out = [];
    const re = /<script\b[^>]*\bsrc="([^"]+)"/g;
    let m;
    while ((m = re.exec(html))) {
        const src = m[1].split('?')[0];
        if (KEEP.includes(src)) out.push(src);
    }
    return out;
}
// 화면 머리의 스위치 스크립트(없으면 null)
export function headSwitchOf(html) {
    const m = html.match(/<script id="tr-auth-page">([\s\S]*?)<\/script>/);
    return m ? m[1] : null;
}
// 화면이 싣는 정적 파일 전부(주소 그대로)
export function staticRefs(html) {
    const out = [];
    const re = /<(?:script|link|img|source|audio|video|iframe)\b[^>]*\b(?:src|href)="([^"]+)"/g;
    let m;
    while ((m = re.exec(html))) out.push(m[1]);
    return out;
}

const IDS = ['loginForm', 'studentEmail', 'studentPassword', 'loginBtn', 'loginMessage', 'loginScreen', 'scheduleScreen'];
// 화면 전환의 대역: 호출과 그때의 currentUser 를 적는다(실제 showScreen 은 js/main.js 에 있다)
const GLUE = "function showScreen(id) { __rec({ t: 'screen', id: String(id), user: (typeof currentUser !== 'undefined' && currentUser) ? JSON.stringify(currentUser) : null }); }";

export function makeWorld({ variant, mutate, students, tables } = {}) {
    const w = { outside: [], variant };
    const prodOrigin = new URL(PROD.url).origin;
    const all = {};
    for (const s of students || STUDENTS) {
        const t = s.tables();
        for (const [name, rows] of Object.entries(t)) all[name] = (all[name] || []).concat(rows);
    }
    for (const [name, rows] of Object.entries(tables || {})) all[name] = (all[name] || []).concat(rows);
    w.rest = new FakeRest(all);
    w.browser = new FakeBrowser({
        net: async (req) => {
            let u;
            try { u = new URL(req.url); } catch (e) { w.outside.push('[주소 아님]'); throw new TypeError('Failed to fetch'); }
            if (variant.test) {
                if (u.origin === TEST_URL) return w.auth.handle(req);
                w.outside.push(u.origin === prodOrigin ? '[운영 주소]' : u.origin);
                throw new TypeError('Failed to fetch');
            }
            if (u.origin === prodOrigin && u.pathname.startsWith('/rest/v1/')) return w.rest.handle(req, u);
            w.outside.push(u.origin === prodOrigin ? '[운영 주소의 다른 경로]' : u.origin);
            throw new TypeError('Failed to fetch');
        },
    });
    w.auth = new FakeSupabase({ origin: TEST_URL, anonKey: FAKE_ANON, now: () => w.browser.now });
    w.auth.business = (req, u) => w.rest.handle(req, u);
    for (const s of students || STUDENTS) w.auth.addAccount(authAccount(s));
    w.files = provider(variant, mutate);

    w.tab = (name, opts) => w.browser.newTab(name || 'tab', opts);

    // 탭에 화면 하나 열기: 화면에 적힌 스크립트(로그인에 관여하는 것)를 순서대로 올리고 DOMContentLoaded 까지
    w.open = async (tab, pageFile, opts = {}) => {
        const html = w.files(pageFile);
        if (html === null) throw new Error('없는 화면: ' + pageFile);
        const page = tab.open({ files: w.files, pageFile, search: opts.search, hash: opts.hash, ids: pageFile === 'index.html' ? IDS : [], confirmAnswer: opts.confirmAnswer, locks: opts.locks, noTimeOrigin: opts.noTimeOrigin });
        // 화면 머리의 스위치(index.html 의 head 에 적힌 스크립트 — 다른 스크립트보다 먼저 돈다). 기준에는 없다
        const headSwitch = headSwitchOf(html);
        if (headSwitch !== null) page.run(headSwitch, pageFile + '#tr-auth-page');
        if (opts.afterHead) await opts.afterHead(page);
        if (pageFile === 'index.html') page.run(GLUE, 'glue');
        for (const src of pageScripts(html)) {
            const source = (opts.missing || []).includes(src) ? null : w.files(src);
            if (source === null && (opts.missing || []).includes(src)) { page.rec({ t: 'script-missing', src }); continue; }      // 그 파일을 받지 못한 화면
            if (source === null) throw new Error('없는 스크립트: ' + src);
            page.rec({ t: 'run-script', src });
            page.run(source, src);
        }
        if (opts.beforeLoad) await opts.beforeLoad(page);
        if (opts.noIdle) page.fireDomContentLoaded();
        else await page.domContentLoaded();
        return page;
    };

    // 로그인 화면에서 제출(1.2초 뒤의 화면 전환까지 기다린다)
    w.submit = async (page, email, password, { wait = 1500 } = {}) => {
        page.byId.studentEmail.value = email;
        page.byId.studentPassword.value = password;
        const done = page.evaluate('handleLogin')({ preventDefault() { page.rec({ t: 'preventDefault' }); } });
        await w.browser.idle();
        await done;
        if (wait) await w.browser.advance(wait);
    };

    return w;
}

// ---- 기록에서 꺼내 보는 것들 ----
export const screens = (page) => page.trace.filter((e) => e.t === 'screen');
export const lastScreen = (page) => { const s = screens(page); return s.length ? s[s.length - 1].id : null; };
export const messages = (page) => page.trace.filter((e) => e.t === 'html' && e.el === '#loginMessage').map((e) => e.html.replace(/<[^>]+>/g, '').trim());
export const lastMessage = (page) => { const m = messages(page); return m.length ? m[m.length - 1] : null; };
export const navs = (page) => page.trace.filter((e) => e.t === 'nav').map((e) => e.to);
export const sessionOf = (tab) => Object.fromEntries([...tab.session.entries()].sort());

// 요청의 자격 종류(값은 돌려주지 않는다)
export function credOf(req, anonKey) {
    const h = req.headers.find(([n]) => n.toLowerCase() === 'authorization');
    if (!h) return 'none';
    if (!h[1].startsWith('Bearer ')) return 'other';
    const tok = h[1].slice(7);
    if (tok === anonKey) return 'anon';
    const c = readFakeJwt(tok);
    return c && c.role === 'authenticated' ? 'member' : 'other';
}

// 요청 하나를 견줄 수 있는 모양으로: 출처를 뺀 주소·메서드·머리글(이름·값·순서)·본문
export function shapeOf(req) {
    const u = new URL(req.url);
    return { method: req.method, path: u.pathname + u.search, headers: req.headers.map(([n, v]) => `${n}: ${v}`), body: req.bodyText };
}

export function checker() {
    const problems = [];
    return { problems, ok(cond, text) { if (!cond) problems.push(text); return !!cond; } };
}
