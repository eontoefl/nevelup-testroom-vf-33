// 가짜 브라우저: 가짜 탭(탭 단위 저장소·창 이름·연 창)·가짜 화면(DOM 흉내)·가짜 시계·가짜 fetch.
// 실제 브라우저가 아니다 — 여기서 통과한 것은 "실제 화면에서 된다"의 증거가 아니다.
// 화면의 스크립트(js/*.js)와 SDK 사본(vendor/supabase-2.116.0.js)은 실제 파일을 그대로 올린다.
// (공홈 계약 3A 의 tests/auth-session/browser.mjs 를 테스트룸에 맞게 옮긴 것: 탭 단위 저장소, window.open·탭 복제, 떠날 때의 pagehide)

import vm from 'node:vm';

const tick = () => new Promise((resolve) => setImmediate(resolve));

function headerPairs(headers) {
    if (!headers) return [];
    if (typeof headers.forEach === 'function' && typeof headers.get === 'function') {
        const out = [];
        headers.forEach((value, name) => out.push([String(name), String(value)]));
        return out;
    }
    return Reflect.ownKeys(headers).map((name) => [String(name), String(headers[name])]);
}

class FakeEl {
    constructor(page, tag, label) {
        this._page = page;
        this._label = label || tag;
        this._attrs = {};
        this._listeners = [];
        this._html = '';
        this._text = '';
        this._children = [];
        this.tagName = String(tag).toUpperCase();
        this.id = '';
        this.value = '';
        this.disabled = false;
        this.src = '';
        const el = this;
        const style = { _display: '' };
        Object.defineProperty(style, 'display', {
            get() { return style._display; },
            set(v) { style._display = String(v); page.rec({ t: 'style', el: el._label, prop: 'display', value: String(v) }); },
            enumerable: true,
        });
        this.style = style;
        this._class = '';
        this.classList = {
            _set: new Set(),
            add: (c) => { this.classList._set.add(c); },
            remove: (c) => { this.classList._set.delete(c); },
            contains: (c) => this.classList._set.has(c),
        };
    }
    get className() { return this._class; }
    set className(v) { this._class = String(v); this._page.rec({ t: 'class', el: this._label, value: String(v) }); }
    get innerHTML() { return this._html; }
    set innerHTML(v) { this._html = String(v); this._page.rec({ t: 'html', el: this._label, html: String(v).replace(/\s+/g, ' ').trim() }); }
    get textContent() { return this._text; }
    set textContent(v) { this._text = String(v); this._page.rec({ t: 'text', el: this._label, text: String(v) }); }
    getAttribute(name) { return name in this._attrs ? this._attrs[name] : null; }
    setAttribute(name, value) { this._attrs[name] = String(value); }
    addEventListener(type, fn) { this._listeners.push({ type, fn }); }
    removeEventListener(type, fn) { this._listeners = this._listeners.filter((l) => !(l.type === type && l.fn === fn)); }
    appendChild(child) { this._children.push(child); this._page.onAppend(this, child); return child; }
    remove() { this._page.rec({ t: 'remove', el: this._label }); }
    reset() { this._page.rec({ t: 'form-reset', el: this._label }); for (const id of ['studentEmail', 'studentPassword']) if (this._page.byId[id]) this._page.byId[id].value = ''; }
}

// 탭 하나: 탭 단위 저장소·창 이름·연 창. 화면(문서)은 한 번에 하나.
export class FakeTab {
    constructor(browser, name, { session, windowName, opener } = {}) {
        this.browser = browser;
        this.name = name;
        this.session = new Map(session || []);
        this.windowName = windowName || '';
        this.opener = opener || null;           // 이 탭을 연 탭(없으면 null)
        this.page = null;
        this.sessionLog = [];
        this.closed = false;
    }

    // 지금 화면을 떠난다(새로 고침·이동·닫기): pagehide 를 먼저 알린다
    leave() {
        if (this.page && !this.page.closed) {
            this.page.dispatchWindow('pagehide', { persisted: false });
            this.page.closed = true;
        }
    }

    // 이 탭에 화면을 연다(앞의 화면은 떠난다)
    open(opts) {
        this.leave();
        this.page = new FakePage(this.browser, this, opts);
        this.browser.pages.push(this.page);
        return this.page;
    }

    close() { this.leave(); this.closed = true; }
}

export class FakePage {
    constructor(browser, tab, opts) {
        this.browser = browser;
        this.tab = tab;
        this.name = tab.name;
        this.closed = false;
        this.trace = [];
        this.confirmAnswer = opts.confirmAnswer !== false;
        this.files = opts.files;                    // (경로) → 글자 또는 null
        this.winListeners = [];
        this.docListeners = [];
        this.byId = {};
        this.scriptLoads = [];
        this.search = opts.search || '';
        this.hash = opts.hash || '';
        this.pageFile = opts.pageFile;
        this.locks = opts.locks !== false;          // navigator.locks 를 줄 것인가
        this._buildDom(opts.ids || []);
        this._buildContext();
    }

    rec(entry) {
        entry.page = this.name;
        this.browser.log(entry);
        this.trace.push(entry);
        return entry;
    }

    el(tag, label, id) {
        const e = new FakeEl(this, tag, label);
        if (id) { e.id = id; this.byId[id] = e; }
        return e;
    }

    _buildDom(ids) {
        const page = this;
        this.head = this.el('head', 'head');
        this.body = this.el('body', 'body');
        for (const id of ids) this.el(id === 'loginForm' ? 'form' : 'div', '#' + id, id);
        this.document = {
            readyState: 'loading',
            visibilityState: 'visible',
            hidden: false,
            title: 'fake',
            head: this.head,
            body: this.body,
            documentElement: this.el('html', 'html'),
            getElementById: (id) => page.byId[id] || null,
            querySelector: () => null,
            querySelectorAll: (sel) => (sel === '.screen' ? Object.values(page.byId).filter((e) => /Screen$/.test(e.id)) : []),
            createElement: (tag) => page.el(tag, 'created-' + tag),
            addEventListener: (type, fn) => { page.docListeners.push({ type, fn }); },
            removeEventListener: (type, fn) => { page.docListeners = page.docListeners.filter((l) => !(l.type === type && l.fn === fn)); },
        };
        Object.defineProperty(this.document, 'cookie', {
            get() { page.rec({ t: 'cookie', op: 'read' }); return ''; },
            set() { page.rec({ t: 'cookie', op: 'write' }); },
        });
    }

    onAppend(parent, child) {
        if (child.id) { this.byId[child.id] = child; child._label = '#' + child.id; }
        if (child.tagName === 'SCRIPT' && child.src) {
            const src = String(child.src);
            this.scriptLoads.push(src);
            this.rec({ t: 'script', src });
            const source = this.files(src.split('?')[0]);
            this.browser.setTimer(this, () => {
                if (source === null || source === undefined) { if (child.onerror) child.onerror(new Error('load')); return; }
                vm.runInContext(source, this.context, { filename: 'page:' + src });
                if (child.onload) child.onload();
            }, 0);
        } else {
            this.rec({ t: 'append', el: child._label, to: parent._label });
        }
    }

    _buildContext() {
        const page = this;
        const tab = this.tab;
        const browser = this.browser;
        const sb = {};
        const trap = (label) => function () { page.rec({ t: 'forbidden', what: label }); throw new Error('가짜 fetch 가 아닌 통신 시도: ' + label); };

        const fakeConsole = {};
        for (const level of ['log', 'info', 'warn', 'error', 'debug', 'trace']) {
            fakeConsole[level] = (...args) => page.rec({
                t: 'console', level,
                text: args.map((a) => (a && typeof a === 'object' && typeof a.message === 'string' ? `${a.name}:${a.message}` : (a && typeof a === 'object' ? JSON.stringify(a) : String(a)))).join(' '),
            });
        }
        const loc = {
            origin: 'http://127.0.0.1:8787', protocol: 'http:', host: '127.0.0.1:8787', hostname: '127.0.0.1', port: '8787',
            pathname: '/' + this.pageFile, search: this.search, hash: this.hash,
            reload() { page.rec({ t: 'reload' }); },
            assign(v) { page.rec({ t: 'nav', to: String(v) }); },
            replace(v) { page.rec({ t: 'nav', to: String(v) }); },
        };
        Object.defineProperty(loc, 'href', {
            get() { return loc.origin + loc.pathname + loc.search + loc.hash; },
            set(v) { page.rec({ t: 'nav', to: String(v) }); },
            enumerable: true,
        });
        const note = (op, key) => tab.sessionLog.push({ op, key, n: ++browser.seq });
        const navigatorObj = { userAgent: 'fake-browser', sendBeacon: trap('navigator.sendBeacon') };
        if (this.locks) navigatorObj.locks = browser.locks;

        Object.assign(sb, {
            console: fakeConsole,
            document: this.document,
            navigator: navigatorObj,
            localStorage: browser.makeLocalStorage(this),
            sessionStorage: {
                getItem: (k) => { k = String(k); note('get', k); return tab.session.has(k) ? tab.session.get(k) : null; },
                setItem: (k, v) => { k = String(k); note('set', k); tab.session.set(k, String(v)); },
                removeItem: (k) => { k = String(k); note('remove', k); tab.session.delete(k); },
            },
            history: { replaceState: (s, t, url) => { page.rec({ t: 'replaceState', url: String(url) }); }, length: 1 },
            fetch: (url, init) => browser.doFetch(this, url, init),
            setTimeout: (fn, ms, ...a) => browser.setTimer(this, () => fn(...a), ms, false),
            clearTimeout: (id) => browser.clearTimer(id),
            setInterval: (fn, ms, ...a) => browser.setTimer(this, () => fn(...a), ms, true),
            clearInterval: (id) => browser.clearTimer(id),
            alert: (m) => { page.rec({ t: 'alert', text: String(m) }); },
            confirm: (m) => { page.rec({ t: 'confirm', text: String(m) }); return page.confirmAnswer; },
            addEventListener: (type, fn) => { page.winListeners.push({ type, fn }); },
            removeEventListener: (type, fn) => { page.winListeners = page.winListeners.filter((l) => !(l.type === type && l.fn === fn)); },
            dispatchEvent: (ev) => { page.rec({ t: 'event', type: String(ev && ev.type) }); page.dispatchWindow(String(ev && ev.type), ev); return true; },
            Event: class FakeEvent { constructor(type) { this.type = String(type); } },
            open: (url, target) => { page.rec({ t: 'window-open', url: String(url), target: target === undefined ? '' : String(target) }); return null; },
            BroadcastChannel: browser.makeBroadcastChannel(this),
            XMLHttpRequest: trap('XMLHttpRequest'),
            WebSocket: trap('WebSocket'),
            EventSource: trap('EventSource'),
            URL, URLSearchParams, Headers, Response, AbortController, Blob, TextEncoder, TextDecoder,
            atob, btoa, queueMicrotask, structuredClone, Intl,
            crypto: globalThis.crypto,
            innerWidth: 1280,
            __now: () => browser.now,
            __rec: (entry) => { page.rec(JSON.parse(JSON.stringify(entry))); },
        });
        Object.defineProperty(sb, 'location', {
            get() { return loc; },
            set(v) { page.rec({ t: 'nav', to: String(v) }); },
            enumerable: true,
        });
        Object.defineProperty(sb, 'name', {
            get() { return tab.windowName; },
            set(v) { tab.windowName = String(v); page.rec({ t: 'window-name' }); },
            enumerable: true,
        });
        Object.defineProperty(sb, 'opener', {
            get() { return tab.opener && !tab.opener.closed ? { closed: false } : null; },
            enumerable: true,
        });
        sb.window = sb;
        sb.self = sb;
        sb.globalThis = sb;
        this.context = vm.createContext(sb);
        vm.runInContext(
            '(() => { const R = Date; class D extends R { constructor(...a) { if (a.length === 0) super(__now()); else super(...a); } static now() { return __now(); } } globalThis.Date = D; })();',
            this.context,
        );
        this.sandbox = sb;
    }

    run(source, filename) {
        vm.runInContext(source, this.context, { filename: 'page:' + filename });
    }

    evaluate(code) {
        return vm.runInContext(code, this.context);
    }

    // 리스너 하나를 부른다. 비동기 리스너가 실패로 끝나면 그것도 적는다(화면에서는 콘솔 오류로 남는 것)
    call(fn, event) {
        try {
            const r = fn(event);
            if (r && typeof r.then === 'function') r.then(null, (e) => { this.rec({ t: 'listener-rejected', text: String(e && e.message) }); });
        } catch (e) { this.rec({ t: 'listener-error', text: String(e && e.message) }); }
    }

    dispatchWindow(type, event) {
        for (const l of this.winListeners.filter((x) => x.type === type)) this.call(l.fn, event);
    }

    // DOMContentLoaded: 문서의 리스너 다음에 창의 리스너(실제 브라우저에서 문서 → 창으로 올라간다)
    fireDomContentLoaded() {
        this.document.readyState = 'interactive';
        for (const l of this.docListeners.filter((x) => x.type === 'DOMContentLoaded')) this.call(l.fn, {});
        this.dispatchWindow('DOMContentLoaded', {});
        this.document.readyState = 'complete';
    }

    async domContentLoaded() {
        this.fireDomContentLoaded();
        await this.browser.idle();
    }
}

export class FakeBrowser {
    // net: async (요청, 쪽) → { status, headers, body } 또는 예외(네트워크 오류)
    constructor({ startMs, net }) {
        this.now = startMs || 1795500000000;
        this.net = net;
        this.timers = [];
        this.timerSeq = 0;
        this.local = new Map();
        this.storageLog = [];
        this.pages = [];
        this.tabs = [];
        this.channels = [];
        this.channelLog = [];        // 만든 통로
        this.channelPosts = [];      // 통로로 보낸 것(이름만 — 내용은 시험이 따로 본다)
        this.requests = [];
        this.pending = 0;
        this.events = [];
        this.seq = 0;
        // navigator.locks 흉내: 이름마다 차례로
        const chains = new Map();
        this.locks = {
            request: (name, a, b) => {
                const fn = typeof a === 'function' ? a : b;
                const prev = chains.get(name) || Promise.resolve();
                const run = prev.then(() => fn({ name }));
                chains.set(name, run.then(() => {}, () => {}));
                return run;
            },
            query: async () => ({ held: [], pending: [] }),
        };
    }

    log(entry) { entry.n = ++this.seq; this.events.push(entry); return entry; }

    newTab(name, opts) {
        const tab = new FakeTab(this, name, opts);
        this.tabs.push(tab);
        return tab;
    }

    // window.open 으로 연 창: 탭 단위 저장값이 복사되고, 연 창을 가리킨다. 이름은 지정한 이름(_blank 면 빈 이름)
    windowOpen(from, name, target) {
        return this.newTab(name, { session: from.session, windowName: target && target !== '_blank' ? target : '', opener: from });
    }

    // 탭 복제: 탭 단위 저장값과 창 이름이 복사된다(연 창은 없다)
    duplicate(from, name) {
        return this.newTab(name, { session: from.session, windowName: from.windowName, opener: null });
    }

    setTimer(page, fn, ms, repeat) {
        const id = ++this.timerSeq;
        const delay = Math.max(0, Number(ms) || 0);
        this.timers.push({ id, at: this.now + delay, fn, every: repeat ? Math.max(1, delay) : 0, page });
        return id;
    }
    clearTimer(id) { this.timers = this.timers.filter((t) => t.id !== id); }

    runDue() {
        let ran = 0;
        for (;;) {
            const due = this.timers.filter((t) => t.at <= this.now).sort((a, b) => a.at - b.at || a.id - b.id)[0];
            if (!due) break;
            if (due.every) due.at = this.now + due.every; else this.clearTimer(due.id);
            if (!due.page.closed) {
                try { due.fn(); } catch (e) { this.log({ t: 'timer-error', text: String(e && e.message) }); }
            }
            if (++ran > 5000) throw new Error('가짜 시계: 타이머가 끝없이 돈다');
        }
        return ran;
    }

    // 할 일이 없어질 때까지(지금 시각의 타이머·진행 중인 가짜 요청)
    async idle() {
        let quiet = 0;
        for (let i = 0; i < 5000 && quiet < 5; i++) {
            await tick();
            const ran = this.runDue();
            if (ran === 0 && this.pending === 0) quiet++; else quiet = 0;
        }
        if (quiet < 5) throw new Error('가짜 브라우저가 잠잠해지지 않음');
    }

    // 몇 번만 돌린다(응답을 일부러 붙잡아 둔 동안 — idle 은 끝나지 않는다)
    async spin(times) {
        for (let i = 0; i < times; i++) { await tick(); this.runDue(); }
    }

    // 가짜 시계를 앞으로(다음 타이머 시각마다 멈춰 처리)
    async advance(ms) {
        const end = this.now + ms;
        await this.idle();
        while (this.now < end) {
            const next = this.timers.filter((t) => !t.page.closed && t.at > this.now).map((t) => t.at).sort((a, b) => a - b)[0];
            this.now = Math.min(end, next === undefined ? end : next);
            await this.idle();
        }
    }

    makeLocalStorage(page) {
        const b = this;
        const note = (op, key) => b.storageLog.push({ op, key, page: page.name, n: ++b.seq });
        return {
            getItem(k) { k = String(k); note('get', k); return b.local.has(k) ? b.local.get(k) : null; },
            setItem(k, v) { k = String(k); note('set', k); b.local.set(k, String(v)); },
            removeItem(k) { k = String(k); note('remove', k); b.local.delete(k); },
            key(i) { note('key', String(i)); return [...b.local.keys()][i] ?? null; },
            get length() { note('length', ''); return b.local.size; },
            clear() { note('clear', ''); b.local.clear(); },
        };
    }

    makeBroadcastChannel(page) {
        const b = this;
        return class FakeBroadcastChannel {
            constructor(name) {
                this.name = String(name);
                this.onmessage = null;
                this._listeners = [];
                this._closed = false;
                this._page = page;
                b.channels.push(this);
                b.channelLog.push({ page: page.name, name: this.name });
            }
            postMessage(data) {
                if (this._closed) return;
                const copy = JSON.parse(JSON.stringify(data));
                b.channelPosts.push({ page: page.name, name: this.name, text: JSON.stringify(copy) });
                for (const c of b.channels) {
                    if (c === this || c._closed || c.name !== this.name || c._page.closed) continue;
                    b.setTimer(c._page, () => {
                        const ev = { data: copy };
                        c._listeners.forEach((fn) => fn(ev));
                        if (typeof c.onmessage === 'function') c.onmessage(ev);
                    }, 0);
                }
            }
            addEventListener(type, fn) { if (type === 'message') this._listeners.push(fn); }
            removeEventListener(type, fn) { this._listeners = this._listeners.filter((f) => f !== fn); }
            close() { this._closed = true; }
        };
    }

    doFetch(page, url, init) {
        const opt = init && typeof init === 'object' ? init : {};
        const first = {
            page: page.name,
            url: String(url),
            method: opt.method === undefined ? 'GET' : String(opt.method),
            headers: headerPairs(opt.headers),
            body: opt.body,
            bodyText: typeof opt.body === 'string' ? opt.body : (opt.body === undefined || opt.body === null ? null : '[본문:' + typeof opt.body + ']'),
            redirect: opt.redirect === undefined ? 'follow' : opt.redirect,
            credentials: opt.credentials,
            viaRedirect: false,
            n: ++this.seq,
        };
        this.pending++;
        const send = async (req, hops) => {
            this.requests.push(req);
            page.rec({ t: 'fetch', url: req.url, method: req.method });
            const r = await this.net(req, page);
            if (r && r.status >= 300 && r.status < 400 && r.headers && r.headers.Location) {
                if (req.redirect === 'error') throw new TypeError('Failed to fetch (redirect blocked)');
                if (req.redirect !== 'manual' && hops < 3) {
                    return send(Object.assign({}, req, { url: String(r.headers.Location), viaRedirect: true, n: ++this.seq }), hops + 1);
                }
            }
            const status = r.status;
            const nullBody = status === 204 || status === 304 || (status >= 300 && status < 400);
            return new Response(nullBody ? null : (r.body === undefined ? '' : r.body), { status, headers: r.headers || {} });
        };
        return send(first, 0).finally(() => { this.pending--; });
    }
}
