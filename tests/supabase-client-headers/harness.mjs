// 회귀시험 공통 도구: 네트워크 차단, 가짜 브라우저 환경(vm), 시각 고정, 호출 기록, 기록 비교.
// 공개 키 값은 어디에도 출력하지 않는다. 차이는 "어느 호출의 어느 항목(헤더 이름)"만 남긴다.

import vm from 'node:vm';
import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import http2 from 'node:http2';
import dgram from 'node:dgram';

// 시험 안의 "지금". 원본이 Date.now() / new Date() 로 남기는 값이 변경 전후로 같도록 고정한다.
export const FIXED_NOW = Date.UTC(2026, 10, 23, 3, 0, 0);

// ---------------------------------------------------------------------------
// 1. 실제 네트워크 차단
//    시험은 가짜 fetch 만 쓴다. 그 밖의 길로 요청이 나가려 하면 여기 기록되고 예외가 난다.
// ---------------------------------------------------------------------------
export const realNetworkAttempts = [];

function blocker(label) {
    return function blockedNetworkCall() {
        realNetworkAttempts.push(label);
        throw new Error(`실제 네트워크 요청 시도 차단: ${label}`);
    };
}

function defineGlobal(name, value) {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

export function installNetworkGuard() {
    net.Socket.prototype.connect = blocker('net.Socket.connect');
    net.connect = blocker('net.connect');
    net.createConnection = blocker('net.createConnection');
    tls.connect = blocker('tls.connect');
    http.request = blocker('http.request');
    http.get = blocker('http.get');
    https.request = blocker('https.request');
    https.get = blocker('https.get');
    http2.connect = blocker('http2.connect');
    dns.lookup = blocker('dns.lookup');
    dns.resolve = blocker('dns.resolve');
    dns.promises.lookup = blocker('dns.promises.lookup');
    dgram.createSocket = blocker('dgram.createSocket');
    defineGlobal('fetch', blocker('Node 전역 fetch'));
    defineGlobal('WebSocket', blocker('Node 전역 WebSocket'));
    defineGlobal('EventSource', blocker('Node 전역 EventSource'));
}

// 차단 장치가 실제로 막는지 스스로 확인한다(막힌 호출은 연결을 열기 전에 예외로 끝난다).
export function verifyNetworkGuard() {
    const probes = [
        () => new net.Socket().connect(80, '127.0.0.1'),
        () => net.connect(80, '127.0.0.1'),
        () => net.createConnection(80, '127.0.0.1'),
        () => tls.connect(443, '127.0.0.1'),
        () => http.request('http://127.0.0.1/'),
        () => http.get('http://127.0.0.1/'),
        () => https.request('https://127.0.0.1/'),
        () => https.get('https://127.0.0.1/'),
        () => http2.connect('https://127.0.0.1/'),
        () => dns.lookup('localhost', () => {}),
        () => dns.resolve('localhost', () => {}),
        () => dns.promises.lookup('localhost'),
        () => dgram.createSocket('udp4'),
        () => globalThis.fetch('http://127.0.0.1/'),
        () => new globalThis.WebSocket('ws://127.0.0.1/'),
        () => new globalThis.EventSource('http://127.0.0.1/'),
    ];
    realNetworkAttempts.length = 0;
    let verified = 0;
    for (const probe of probes) {
        const before = realNetworkAttempts.length;
        let threw = false;
        try { probe(); } catch (e) { threw = true; }
        if (!threw || realNetworkAttempts.length !== before + 1) {
            throw new Error(`네트워크 차단 장치 자체 점검 실패: ${verified + 1}번째 경로가 막히지 않음`);
        }
        verified++;
    }
    realNetworkAttempts.length = 0;
    return verified;
}

// ---------------------------------------------------------------------------
// 2. 값 직렬화 (반환값·console 인자·기록 비교용)
// ---------------------------------------------------------------------------
export function serialize(value) {
    return JSON.stringify(value, (key, v) => {
        if (v === undefined) return '__undefined__';
        if (typeof v === 'number' && !Number.isFinite(v)) return `__number:${String(v)}__`;
        if (typeof v === 'function') return '__function__';
        if (v instanceof Blob) return `__blob:${v.size}:${v.type}__`;
        if (v instanceof ArrayBuffer) return `__bytes:${v.byteLength}__`;
        if (ArrayBuffer.isView(v)) return `__bytes:${v.byteLength}__`;
        return v;
    });
}

function describeConsoleArg(arg) {
    if (arg && typeof arg === 'object' && typeof arg.message === 'string' && typeof arg.name === 'string') {
        return `오류객체:${arg.name}:${arg.message}`;
    }
    return `${typeof arg}:${serialize(arg)}`;
}

// ---------------------------------------------------------------------------
// 3. fetch 에 넘어온 것 기록
// ---------------------------------------------------------------------------
function describeHeaders(headers, plainProto) {
    if (headers === null || typeof headers !== 'object') return { kind: headers === null ? 'null' : typeof headers };
    return {
        kind: 'object',
        plain: Object.getPrototypeOf(headers) === plainProto,
        entries: Reflect.ownKeys(headers).map((name) => {
            const desc = Object.getOwnPropertyDescriptor(headers, name);
            const v = desc.value;
            const isObj = v !== null && (typeof v === 'object' || typeof v === 'function');
            return {
                name: String(name),
                value: isObj ? `객체:${serialize(v)}` : v,
                valueType: typeof v,
                enumerable: desc.enumerable,
                isData: 'value' in desc,
            };
        }),
    };
}

async function describeBody(init, args) {
    if (!init || typeof init !== 'object' || !('body' in init)) return { kind: '없음' };
    const body = init.body;
    const sameAsArg = args.some((a) => a === body && a !== null && typeof a === 'object');
    if (body === undefined) return { kind: 'undefined' };
    if (typeof body === 'string') return { kind: 'string', text: body };
    if (body instanceof Blob) {
        const bytes = Buffer.from(await body.arrayBuffer());
        const isFile = body instanceof File;
        return { kind: isFile ? 'file' : 'blob', type: body.type, size: body.size, hex: bytes.toString('hex'), name: isFile ? body.name : undefined, sameAsArg };
    }
    if (body instanceof ArrayBuffer) {
        return { kind: 'bytes:ArrayBuffer', type: undefined, size: body.byteLength, hex: Buffer.from(body).toString('hex'), sameAsArg };
    }
    if (ArrayBuffer.isView(body)) {
        return { kind: `bytes:${body.constructor.name}`, type: undefined, size: body.byteLength, hex: Buffer.from(body.buffer, body.byteOffset, body.byteLength).toString('hex'), sameAsArg };
    }
    return { kind: `기타:${body === null ? 'null' : typeof body}`, text: serialize(body), sameAsArg };
}

// 가짜 응답. desc = { status, body, headers } 또는 { reject: 'TypeError' | 'string', message }
function respondWith(desc) {
    if (desc.reject === 'TypeError') throw new TypeError(desc.message);
    if (desc.reject === 'string') throw desc.message;
    return new Response(desc.body, { status: desc.status, headers: desc.headers || {} });
}

// ---------------------------------------------------------------------------
// 4. 가짜 브라우저 환경에 파일 올리기
// ---------------------------------------------------------------------------
const TIME_PRELUDE = `(function () {
    const RealDate = Date;
    const FIXED = ${FIXED_NOW};
    class FixedDate extends RealDate {
        constructor(...args) { if (args.length === 0) super(FIXED); else super(...args); }
        static now() { return FIXED; }
    }
    globalThis.Date = FixedDate;
})();`;

export function createEnv(source, label, fnNames) {
    const env = { label, current: null, fakeFetchCount: 0, forbidden: [], loadConsole: [] };

    const trap = (name) => function forbiddenChannel() {
        env.forbidden.push(name);
        throw new Error(`가짜 fetch 가 아닌 통신 시도: ${name}`);
    };

    function fakeFetch(...fetchArgs) {
        env.fakeFetchCount++;
        const call = env.current;
        if (!call) {
            env.forbidden.push('호출 구간 밖의 fetch');
            return Promise.reject(new Error('호출 구간 밖의 fetch'));
        }
        const index = call.fetches.length;
        const [url, init] = fetchArgs;
        const isObj = init !== null && typeof init === 'object';
        const record = {
            argCount: fetchArgs.length,
            urlType: typeof url,
            url: String(url),
            initType: init === null ? 'null' : typeof init,
            initKeys: isObj ? Reflect.ownKeys(init).map(String) : null,
            method: isObj ? init.method : undefined,
            methodType: isObj ? typeof init.method : 'undefined',
            headers: describeHeaders(isObj ? init.headers : undefined, env.plainProto),
            body: null,
        };
        call.fetches.push(record);
        const done = describeBody(init, call.args).then((body) => { record.body = body; });
        call.pending.push(done);
        return done.then(() => respondWith(call.scenario.respond(index)));
    }

    const fakeConsole = {};
    for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
        fakeConsole[level] = (...args) => {
            const entry = { level, args: args.map(describeConsoleArg) };
            (env.current ? env.current.console : env.loadConsole).push(entry);
        };
    }

    const store = new Map();
    const sessionStorage = {
        getItem: (k) => (store.has(String(k)) ? store.get(String(k)) : null),
        setItem: (k, v) => { store.set(String(k), String(v)); },
        removeItem: (k) => { store.delete(String(k)); },
        clear: () => { store.clear(); },
    };

    const sandbox = {
        fetch: fakeFetch,
        console: fakeConsole,
        sessionStorage,
        Blob,
        File,
        XMLHttpRequest: trap('XMLHttpRequest'),
        WebSocket: trap('WebSocket'),
        EventSource: trap('EventSource'),
        navigator: { sendBeacon: trap('navigator.sendBeacon') },
    };
    sandbox.window = sandbox;
    sandbox.self = sandbox;

    const context = vm.createContext(sandbox);
    vm.runInContext(TIME_PRELUDE, context);
    const propsBeforeLoad = new Set(Object.getOwnPropertyNames(sandbox));
    env.plainProto = vm.runInContext('Object.prototype', context);
    vm.runInContext(source, context, { filename: `${label}/supabase-client.js` });

    env.sandbox = sandbox;
    env.store = store;
    env.fns = {};
    for (const name of fnNames) {
        env.fns[name] = vm.runInContext(`typeof ${name} === 'function' ? ${name} : undefined`, context);
    }
    env.key = vm.runInContext('SUPABASE_CONFIG.anonKey', context);
    env.baseUrl = vm.runInContext('SUPABASE_CONFIG.url', context);
    env.nowInside = vm.runInContext('[Date.now(), new Date().getTime()]', context);
    // 파일이 window(전역 객체)에 새로 붙인 이름들 — function/var 선언은 여기 잡히고 const/let 은 안 잡힌다.
    env.windowAdded = Object.getOwnPropertyNames(sandbox).filter((n) => !propsBeforeLoad.has(n)).sort();
    env.typeOf = (name) => vm.runInContext(`typeof ${name}`, context);
    return env;
}

// ---------------------------------------------------------------------------
// 5. 호출 한 번 실행하고 기록
// ---------------------------------------------------------------------------
const STATE_NAMES = ['_sgLastError', 'currentUser', 'courseMode'];

export async function runCall(env, label, target, input, scenario) {
    const args = input.args();
    const call = { fetches: [], console: [], pending: [], scenario, args };

    for (const name of STATE_NAMES) delete env.sandbox[name];
    env.store.clear();
    if (input.setup) input.setup(env.sandbox, env.store);

    env.current = call;
    let outcome;
    try {
        const value = await target.invoke(env.fns, args);
        outcome = { type: '반환', value: serialize(value) };
    } catch (e) {
        const isObj = e !== null && typeof e === 'object';
        outcome = { type: '오류', name: String(isObj ? e.name : typeof e), message: String(isObj ? e.message : e) };
    }
    await Promise.allSettled(call.pending);
    env.current = null;

    const record = {
        label,
        fetches: call.fetches,
        outcome,
        console: call.console,
        sg: { has: Object.prototype.hasOwnProperty.call(env.sandbox, '_sgLastError'), value: serialize(env.sandbox._sgLastError) },
        argsAfter: serialize(args),
        session: serialize([...env.store.entries()]),
        windowUser: serialize(env.sandbox.currentUser),
    };
    for (const name of STATE_NAMES) delete env.sandbox[name];
    env.store.clear();
    return record;
}

// ---------------------------------------------------------------------------
// 6. 두 기록 비교 — 값은 남기지 않고 위치만 남긴다
// ---------------------------------------------------------------------------
export function diffCall(a, b) {
    const diffs = [];
    const at = (what) => diffs.push(`${a.label} › ${what}`);

    if (a.label !== b.label) at('호출 이름');
    if (a.fetches.length !== b.fetches.length) at('fetch 횟수');

    const n = Math.min(a.fetches.length, b.fetches.length);
    for (let i = 0; i < n; i++) {
        const x = a.fetches[i];
        const y = b.fetches[i];
        const p = `fetch#${i + 1} `;
        const simple = [
            ['argCount', '인자 수'], ['urlType', '주소 자료형'], ['url', '주소'],
            ['initType', '옵션 자료형'], ['method', '메서드'], ['methodType', '메서드 자료형'],
        ];
        for (const [field, name] of simple) if (x[field] !== y[field]) at(p + name);
        if (JSON.stringify(x.initKeys) !== JSON.stringify(y.initKeys)) at(p + '옵션 이름·순서');

        if (x.headers.kind !== y.headers.kind) {
            at(p + '헤더 자료형');
        } else if (x.headers.kind === 'object') {
            if (x.headers.plain !== y.headers.plain) at(p + '헤더 객체 종류');
            const xn = x.headers.entries.map((e) => e.name);
            const yn = y.headers.entries.map((e) => e.name);
            const sameOrder = xn.length === yn.length && xn.every((v, k) => v === yn[k]);
            const sameSet = JSON.stringify([...xn].sort()) === JSON.stringify([...yn].sort());
            if (!sameOrder && sameSet) at(p + `헤더 순서 [${xn.join(', ')}]`);
            for (const e of x.headers.entries) {
                const o = y.headers.entries.find((z) => z.name === e.name);
                if (!o) { at(p + `헤더 빠짐 [${e.name}]`); continue; }
                if (e.value !== o.value || e.valueType !== o.valueType) at(p + `헤더 값 [${e.name}]`);
                if (e.enumerable !== o.enumerable || e.isData !== o.isData) at(p + `헤더 속성 [${e.name}]`);
            }
            for (const e of y.headers.entries) {
                if (!x.headers.entries.some((z) => z.name === e.name)) at(p + `헤더 추가됨 [${e.name}]`);
            }
        }

        if (x.body.kind !== y.body.kind) {
            at(p + '본문 종류');
        } else {
            if (x.body.type !== y.body.type) at(p + '본문 MIME');
            if (x.body.size !== y.body.size) at(p + '본문 크기');
            if (x.body.hex !== y.body.hex) at(p + '본문 바이트');
            if (x.body.name !== y.body.name) at(p + '본문 파일 이름');
            if (x.body.text !== y.body.text) at(p + '본문');
        }
        if (x.body.sameAsArg !== y.body.sameAsArg) at(p + '본문이 넘겨받은 파일 그대로인지');
    }

    if (a.outcome.type !== b.outcome.type) {
        at('결과 종류(반환/오류)');
    } else if (a.outcome.type === '반환') {
        if (a.outcome.value !== b.outcome.value) at('반환값');
    } else {
        if (a.outcome.name !== b.outcome.name) at('오류 종류');
        if (a.outcome.message !== b.outcome.message) at('오류 메시지');
    }

    if (JSON.stringify(a.console) !== JSON.stringify(b.console)) at('console 출력');
    if (a.sg.has !== b.sg.has || a.sg.value !== b.sg.value) at('window._sgLastError 기록');
    if (a.argsAfter !== b.argsAfter) at('호출 뒤 인자 상태');
    if (a.session !== b.session) at('sessionStorage 상태');
    if (a.windowUser !== b.windowUser) at('window.currentUser 상태');
    return diffs;
}

// ---------------------------------------------------------------------------
// 7. 기록이 계약서의 모양과 맞는지(변경 전·후 각각) 확인
//    비교 대상이 둘 다 같이 틀린 경우나, 시험 도구가 아무것도 못 잡는 경우를 걸러낸다.
// ---------------------------------------------------------------------------
function modelRequest(args, env) {
    const endpoint = args[0];
    const options = args[1] === undefined ? {} : args[1];
    const map = new Map([
        ['apikey', env.key],
        ['Authorization', `Bearer ${env.key}`],
        ['Content-Type', 'application/json'],
        ['Prefer', options.prefer || 'return=representation'],
    ]);
    if (options.headers) for (const k of Object.keys(options.headers)) map.set(k, options.headers[k]);
    return {
        url: env.baseUrl + String(endpoint),
        method: options.method || 'GET',
        headers: [...map],
        body: options.body ? { kind: 'string', text: JSON.stringify(options.body) } : { kind: 'undefined' },
    };
}

function modelUpload(args, env, input) {
    const [bucket, path, file] = args;
    return {
        url: `${env.baseUrl}/storage/v1/object/${bucket}/${path}`,
        method: 'POST',
        headers: [
            ['apikey', env.key],
            ['Authorization', `Bearer ${env.key}`],
            ['Content-Type', file.type || 'application/octet-stream'],
            ['x-upsert', 'true'],
        ],
        mime: input.mime,
        hex: input.hex,
    };
}

function checkHeaders(f, want, at) {
    if (f.headers.kind !== 'object' || !f.headers.plain) { at('헤더가 일반 객체가 아님'); return; }
    const got = f.headers.entries;
    const names = got.map((e) => e.name);
    const wantNames = want.map((w) => w[0]);
    if (JSON.stringify(names) !== JSON.stringify(wantNames)) at(`헤더 이름·순서가 기대(${wantNames.join(', ')})와 다름`);
    for (const [name, value] of want) {
        const e = got.find((z) => z.name === name);
        if (!e) continue;
        const isObj = value !== null && typeof value === 'object';
        const wantValue = isObj ? `객체:${serialize(value)}` : value;
        if (e.value !== wantValue || e.valueType !== typeof value) at(`헤더 값 [${name}]`);
        if (!e.enumerable || !e.isData) at(`헤더 속성 [${name}]`);
    }
}

export function checkExpectations(record, target, input, scenario, env) {
    const problems = [];
    const at = (what) => problems.push(`${record.label} › ${what}`);
    const errors = record.console.filter((c) => c.level === 'error').length;

    if (input.noFetch) {
        if (record.fetches.length !== 0) at('fetch 가 없어야 하는 입력인데 fetch 가 있음');
        if (input.noFetch === '오류' && record.outcome.type !== '오류') at('fetch 전 오류가 나야 하는 입력인데 오류가 없음');
        if (input.noFetch === '반환' && record.outcome.type !== '반환') at('fetch 없이 값을 돌려줘야 하는 입력인데 오류가 남');
        return problems;
    }

    if (target.kind === 'wrapper') {
        if (record.fetches.length < 1) at('가짜 fetch 에 도달하지 못함');
        for (const f of record.fetches) {
            if (!f.url.startsWith(env.baseUrl + '/rest/v1/')) at('주소 앞부분');
            if (f.headers.kind !== 'object') { at('헤더가 객체가 아님'); continue; }
            const names = f.headers.entries.map((e) => e.name);
            if (JSON.stringify(names) !== JSON.stringify(['apikey', 'Authorization', 'Content-Type', 'Prefer'])) at('헤더 이름·순서가 기본 4개와 다름');
        }
        return problems;
    }

    if (record.fetches.length !== 1) { at('fetch 횟수가 기대(1)와 다름'); return problems; }
    const f = record.fetches[0];
    if (f.argCount !== 2) at('fetch 인자 수');
    if (f.urlType !== 'string') at('주소 자료형');
    const sgValue = record.sg.has ? JSON.parse(record.sg.value) : null;

    if (target.kind === 'request') {
        if (JSON.stringify(f.initKeys) !== JSON.stringify(['method', 'headers', 'body'])) at('fetch 옵션 이름·순서');
        if (!input.skipModel) {
            const m = modelRequest(input.args(), env);
            if (f.url !== m.url) at('주소');
            if (f.method !== m.method) at('메서드');
            checkHeaders(f, m.headers, at);
            if (f.body.kind !== m.body.kind || f.body.text !== m.body.text) at('본문');
        }
        if (scenario.kind === 'json') {
            if (record.outcome.type !== '반환' || record.outcome.value !== serialize(JSON.parse(scenario.body))) at('정상 JSON 의 반환값');
            if (record.sg.has || errors) at('정상 응답인데 오류 기록이 남음');
        } else if (scenario.kind === 'true') {
            if (record.outcome.type !== '반환' || record.outcome.value !== 'true') at('빈 응답·JSON 아닌 응답의 반환값이 true 가 아님');
            if (record.sg.has || errors) at('정상 응답인데 오류 기록이 남음');
        } else if (scenario.kind === 'server') {
            if (record.outcome.type !== '반환' || record.outcome.value !== 'null') at('4xx·5xx 의 반환값이 null 이 아님');
            const want = serialize({ kind: 'server', status: scenario.status, body: scenario.body || '', at: FIXED_NOW });
            if (!record.sg.has || record.sg.value !== want) at('4xx·5xx 의 _sgLastError 기록(kind server·status·body·고정 시각)');
            if (errors !== 1) at('4xx·5xx 의 console 오류가 1건이 아님');
        } else if (scenario.kind === 'network') {
            if (record.outcome.type !== '반환' || record.outcome.value !== 'null') at('통신 실패의 반환값이 null 이 아님');
            const ok = sgValue && sgValue.kind === 'network' && typeof sgValue.message === 'string' && sgValue.at === FIXED_NOW
                && JSON.stringify(Object.keys(sgValue)) === JSON.stringify(['kind', 'message', 'at'])
                && (scenario.networkMessage === undefined || sgValue.message === scenario.networkMessage);
            if (!ok) at('통신 실패의 _sgLastError 기록(kind network·message·고정 시각)');
            if (errors !== 1) at('통신 실패의 console 오류가 1건이 아님');
        }
        return problems;
    }

    // 파일 올리기
    const args = input.args();
    const m = modelUpload(args, env, input);
    if (f.url !== m.url) at('주소');
    if (f.method !== m.method) at('메서드');
    if (JSON.stringify(f.initKeys) !== JSON.stringify(['method', 'headers', 'body'])) at('fetch 옵션 이름·순서');
    checkHeaders(f, m.headers, at);
    const ct = f.headers.kind === 'object' ? f.headers.entries.find((e) => e.name === 'Content-Type') : null;
    if (!ct || ct.value !== m.mime) at('Content-Type 이 입력에서 기대한 MIME 과 다름');
    const up = f.headers.kind === 'object' ? f.headers.entries.find((e) => e.name === 'x-upsert') : null;
    if (!up || up.value !== 'true') at('x-upsert 가 true 가 아님');
    if (f.headers.kind === 'object' && f.headers.entries.some((e) => e.name.toLowerCase() === 'prefer')) at('파일 올리기에 Prefer 가 있음');
    if (!f.body.sameAsArg) at('본문이 넘겨받은 파일 그대로가 아님');
    if (m.hex !== undefined) {
        if (f.body.hex !== m.hex) at('본문 바이트가 입력 원본과 다름');
        if (f.body.size !== m.hex.length / 2) at('본문 크기가 입력 원본과 다름');
        if (input.bodyType !== undefined && f.body.type !== input.bodyType) at('본문(파일)의 MIME 이 입력과 다름');
    }
    if (record.sg.has) at('파일 올리기가 _sgLastError 를 남김');
    if (scenario.uploadOk) {
        if (record.outcome.type !== '반환' || record.outcome.value !== serialize(args[1])) at('올리기 성공의 반환값이 경로가 아님');
        if (errors) at('올리기 성공인데 console 오류가 있음');
    } else {
        if (record.outcome.type !== '반환' || record.outcome.value !== 'null') at('올리기 실패의 반환값이 null 이 아님');
        if (errors !== 1) at('올리기 실패의 console 오류가 1건이 아님');
    }
    return problems;
}
