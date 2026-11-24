// 화면 시험 실행기(screen.mjs)의 판단 부분 — 브라우저 없이 시험할 수 있게 따로 둔다(run.mjs 가 변조까지 본다).
//
//   * 차단의 예행(P)이 전부 참이 아니면 뒤의 경우를 하나도 시작하지 않는다. 그 전에는 비밀을 꺼낼 수 없다(보관함).
//   * DB 변경이 남을 수 있는 멈춤은 "멈춤을 내놓는 순간" 원복 대상으로 표시한다.
//     원복 확인(브레인방이 DB 를 직접 대조했다는 답)을 받기 전에는 다음 경우를 시작하지 않는다.
//   * 제어 포트로 받은 로그인 상태는 넣기 전에 출처를 확인한다(발급자·합성 계정·aal·로그인 기록 번호·만료·키).
//   * 브라우저를 띄울 때는 필요한 환경 변수만 넘긴다.

import { TEST_URL } from './rewrite.mjs';

export const ISSUER = TEST_URL + '/auth/v1';
export class PauseTimeout extends Error {}

export const allTrue = (checks) => Array.isArray(checks) && checks.length > 0 && checks.every((c) => c.ok === true);

// 비밀 보관함: 예행이 통과해 "열림"이 되기 전에는 아무것도 꺼낼 수 없다
export function makeVault(values) {
    let armed = false;
    return {
        arm() { armed = true; },
        armed: () => armed,
        get(name) {
            if (!armed) throw new Error('b3b: 차단의 예행(P)이 통과하기 전에는 비밀을 꺼낼 수 없다');
            if (!Object.prototype.hasOwnProperty.call(values, name)) throw new Error('b3b: 보관함에 없는 이름');
            return values[name];
        },
    };
}

// 멈춤의 장부. 제어 포트(HTTP)는 이 장부의 view·answer 만 부른다.
export class PauseBoard {
    constructor({ timeoutMs, randomStep, onOpen }) {
        this.timeoutMs = timeoutMs;
        this.randomStep = randomStep;
        this.onOpen = onOpen || (() => {});
        this.current = null;
        this.pendingRevert = null;      // 브레인방이 건 DB 변경이 남아 있을 수 있는 멈춤의 이름
        this.leftovers = [];            // 브레인방이 만든 것이 남아 있을 수 있음(로그인 기록 등 — 정리는 끝에서 브레인방이 DB 로)
        this.history = [];              // 멈춤마다: 이름과 결과(answered / timeout)
    }

    // kind: 정해 둔 이름. info: 비밀이 아닌 식별값.
    //   needsRevert: DB 변경이 남을 수 있는 멈춤 — 내놓는 순간 원복 대상으로 표시한다(답을 받았는지와 무관)
    //   revertOf: 그 변경을 되돌렸다는 확인을 받는 멈춤 — 본문이 { "reverted": true } 일 때만 표시를 지운다
    //   leaves: 브레인방이 만든 것이 남을 수 있는 멈춤(계정 이름표)
    open(kind, info, { needsRevert = false, revertOf = null, leaves = null } = {}) {
        if (needsRevert) this.pendingRevert = kind;
        if (leaves) this.leftovers.push({ kind, account: leaves });
        return new Promise((resolve, reject) => {
            const step = this.randomStep();
            const entry = { kind, result: 'waiting' };
            this.history.push(entry);
            const timer = setTimeout(() => {
                if (this.current && this.current.step === step) this.current = null;
                entry.result = 'timeout';
                reject(new PauseTimeout(kind));
            }, this.timeoutMs);
            this.current = {
                step, kind, info: info || {}, needsRevert,
                finish: (body) => {
                    clearTimeout(timer);
                    entry.result = 'answered';
                    if (revertOf && this.pendingRevert === revertOf && body && body.reverted === true) this.pendingRevert = null;
                    resolve(body);
                },
            };
            this.onOpen(this.current);
        });
    }

    view() {
        const w = this.current;
        return w ? { step: w.step, kind: w.kind, info: w.info, needsRevert: w.needsRevert } : null;
    }

    // 그 멈춤의 일회용 단계 번호가 맞을 때만 받는다
    answer(step, body) {
        const w = this.current;
        if (!w || String(w.step) !== String(step)) return false;
        this.current = null;
        w.finish(body === undefined ? null : body);
        return true;
    }
}

// 원복 확인을 받는다. 돌려주는 값: 참(확인됨 — 표시가 지워짐) / 거짓(받지 못함)
export async function confirmRevert(board, tries = 3) {
    for (let i = 0; i < tries && board.pendingRevert; i++) {
        const of = board.pendingRevert;
        try { await board.open('revert-confirm', { of }, { revertOf: of }); } catch (e) { return false; }
    }
    return board.pendingRevert === null;
}

// 경우들을 차례로 돈다.
//   preflight(): 예행. { checks } 를 돌려준다 — 전부 참이 아니면 여기서 끝낸다(뒤의 경우는 시작하지 않고, 보관함도 열지 않는다).
//   cases: [{ id, run() }] — run 은 자기 예외를 스스로 처리한다(여기까지 올라온 예외는 그 경우를 끝낸 것으로 본다).
//   원복 대상이 남아 있으면 다음 경우를 시작하기 전에 원복 확인을 받는다. 받지 못하면 전체를 멈춘다.
//   halted(): 안전 조건을 어긴 요청이 있었는가 — 참이면 다음 경우를 시작하지 않는다(남은 원복 확인은 받는다).
export async function runSequence({ preflight, cases, vault, board, halted }) {
    const started = [];
    const isHalted = () => typeof halted === 'function' && halted() === true;
    const p = await preflight();
    if (!p || !allTrue(p.checks)) return { stopped: 'preflight', started };
    if (isHalted()) return { stopped: 'unsafe', started };
    vault.arm();
    for (const c of cases) {
        if (isHalted()) {
            if (board.pendingRevert) await confirmRevert(board);
            return { stopped: 'unsafe', started };
        }
        if (board.pendingRevert && !(await confirmRevert(board))) return { stopped: 'revert', started };
        started.push(c.id);
        try { await c.run(); } catch (e) { /* 경우 하나의 실패는 그 경우의 결과로 남는다 */ }
    }
    if (board.pendingRevert && !(await confirmRevert(board))) return { stopped: isHalted() ? 'unsafe' : 'revert', started };
    return { stopped: isHalted() ? 'unsafe' : null, started };
}

// 합성 명단: 실행기가 받는 이메일(환경 변수)은 정해 둔 합성 이메일과 글자까지 같아야 한다(zzb3b_<유형>@member.zzb3b.invalid)
export const syntheticEmail = (key) => `zzb3b_${key}@member.zzb3b.invalid`;
export function rosterOk(emails, keys) {
    if (!emails || typeof emails !== 'object' || !Array.isArray(keys) || keys.length === 0) return false;
    if (Object.keys(emails).length !== keys.length) return false;
    return keys.every((k) => /^[a-z0-9]+$/.test(k) && emails[k] === syntheticEmail(k));
}

function claimsOf(token) {
    try {
        const parts = String(token).split('.');
        if (parts.length !== 3) return null;
        const c = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        return c && typeof c === 'object' ? c : null;
    } catch (e) { return null; }
}
const lower = (s) => String(s).trim().toLowerCase();

// 회원 JWT 의 출처: 발급자가 시험 프로젝트이고 계정이 이번 실행의 합성 계정 가운데 하나인가
export function memberJwtOrigin(token, { issuer, emails }) {
    const c = claimsOf(token);
    if (!c) return 'unreadable';
    if (c.iss !== issuer) return 'issuer';
    if (c.role !== 'authenticated') return 'role';
    if (typeof c.email !== 'string' || !emails.map(lower).includes(lower(c.email))) return 'account';
    return 'ok';
}

const SESSION_KEYS = ['access_token', 'token_type', 'expires_in', 'expires_at', 'refresh_token', 'user'];
const MIN_LEFT_SEC = 300;

// 제어 포트로 받은 로그인 상태를 브라우저에 넣어도 되는가. 돌려주는 값: { ok } 또는 { ok: false, why(정해 둔 이름) }
//   expect: { email(그 멈춤이 요구한 합성 계정의 이메일), aal }   nowMs: 지금 시각
export function checkProvidedSession(session, expect, nowMs) {
    const no = (why) => ({ ok: false, why });
    if (!session || typeof session !== 'object' || Array.isArray(session)) return no('shape');
    const keys = Object.keys(session);
    if (keys.some((k) => !SESSION_KEYS.includes(k))) return no('extra-keys');
    if (typeof session.access_token !== 'string' || typeof session.refresh_token !== 'string' || !session.refresh_token) return no('shape');
    if (!session.user || typeof session.user !== 'object' || typeof session.user.id !== 'string') return no('shape');
    const c = claimsOf(session.access_token);
    if (!c) return no('jwt-unreadable');
    if (c.iss !== ISSUER) return no('issuer');
    if (c.role !== 'authenticated') return no('role');
    if (typeof c.sub !== 'string' || !c.sub || c.sub !== session.user.id) return no('subject');
    if (typeof c.session_id !== 'string' || !c.session_id) return no('session-id');
    if (typeof expect.email !== 'string' || !expect.email) return no('account');
    if (typeof c.email !== 'string' || lower(c.email) !== lower(expect.email)) return no('account');
    if (typeof session.user.email !== 'string' || lower(session.user.email) !== lower(expect.email)) return no('account');
    if (c.aal !== expect.aal) return no('aal');
    const nowSec = Math.floor(nowMs / 1000);
    if (typeof c.exp !== 'number' || c.exp - nowSec < MIN_LEFT_SEC) return no('expiry');
    if (typeof session.expires_at !== 'number' || session.expires_at - nowSec < MIN_LEFT_SEC) return no('expiry');
    return { ok: true };
}

// 예행(P)의 "정상 1건" 예외로 내보내도 되는 요청인가.
//   record: 차단기(request-log.mjs)의 판정 기록, req: { method, postData }
//   자격 위반 판정이 먼저다 — 차단기가 자격·비밀번호·갱신값의 위반으로 본 요청은 이 예외로 나갈 수 없다.
//   그 다음: 시험 목적지로 가는, 화면 이동이 아닌, 자격 없는(Authorization·apikey 없음)·본문 없는 GET 만.
export function controlPassOk(record, req) {
    if (!record || !req) return false;
    if (record.leak !== false || !Array.isArray(record.leakKinds) || record.leakKinds.length !== 0) return false;
    if (record.where !== 'sink' || record.nav !== false) return false;
    if (record.method !== 'GET' || String(req.method || '').toUpperCase() !== 'GET') return false;
    if (record.credential !== 'none' || record.apikey !== false) return false;
    if (record.password !== false || record.refreshToken !== false) return false;
    if (req.postData !== null && req.postData !== undefined && req.postData !== '') return false;
    return true;
}

// 브라우저(자식 프로세스)에 넘길 환경 변수: 실행에 필요한 것만. 비밀번호·제어 비밀·공개 키·이메일은 물려지지 않는다.
const ENV_ALLOW = ['SYSTEMROOT', 'WINDIR', 'SYSTEMDRIVE', 'TEMP', 'TMP', 'TMPDIR', 'PATH', 'PATHEXT', 'COMSPEC', 'OS',
    'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'HOME', 'LOCALAPPDATA', 'APPDATA', 'PROGRAMDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)',
    'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'LANG', 'LC_ALL', 'TZ', 'DISPLAY', 'XDG_RUNTIME_DIR'];
export function browserEnv(env) {
    const out = {};
    for (const [k, v] of Object.entries(env || {})) {
        if (ENV_ALLOW.includes(k.toUpperCase()) && typeof v === 'string') out[k] = v;
    }
    return out;
}

// ---------------------------------------------------------------------------
// (테스트룸) 새 길의 저장 계획: 화면에서 온 값이다 — 합성 자료라고 믿고 그대로 싣지 않는다.
// 표가 허용한 셋인가, 열이 허용한 열인가, 행이 이번 사례의 합성 행인가, 값의 모양이 정해 둔 형식인가.
// 하나라도 벗어나면 { ok: false, why(정해 둔 이름) } — 넘기지 않는다. 맞으면 정해 둔 모양으로 다시 만든 목록을 돌려준다.
//   expect: { memberId, email, appIds: [], recordIds: [] }
// ---------------------------------------------------------------------------
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;
const onlyKeys = (obj, keys) => !!obj && typeof obj === 'object' && !Array.isArray(obj) && Object.keys(obj).every((k) => keys.includes(k));
// 값의 모양(저장 계획 검사와 차단기가 같은 것을 쓴다 — 옛 길의 쓰기도 보내기 전에 같은 검사를 거친다)
//   자기주도 일정표: 글자이고, 풀면 { end: 날짜, dates: 날짜 24개 } 뿐이다. 맞으면 그 값을, 아니면 null
export function scheduleOf(text) {
    if (typeof text !== 'string') return null;
    let s = null;
    try { s = JSON.parse(text); } catch (e) { s = null; }
    if (!s || typeof s !== 'object' || Array.isArray(s) || Object.keys(s).length !== 2 || !onlyKeys(s, ['end', 'dates'])) return null;
    if (typeof s.end !== 'string' || !YMD.test(s.end) || !Array.isArray(s.dates) || s.dates.length !== 24 || !s.dates.every((d) => typeof d === 'string' && YMD.test(d))) return null;
    return { end: s.end, dates: s.dates };
}
//   tr_user_map: 네 칸이 전부 있고, 회원번호·이메일이 그 학생의 짝이고, 이름은 글자(100자 이하), 시각은 정해 둔 모양
export function userMapOk(v, expect) {
    if (!v || typeof v !== 'object' || Array.isArray(v) || !expect) return false;
    const keys = Object.keys(v);
    if (keys.length !== 4 || !['user_id', 'email', 'name', 'updated_at'].every((k) => keys.includes(k))) return false;
    return v.user_id === expect.memberId && v.email === expect.email && typeof v.name === 'string' && v.name.length <= 100 && typeof v.updated_at === 'string' && ISO.test(v.updated_at);
}
export const RATES = [0, 50, 100];
export function checkPlan(plan, expect) {
    const no = (why) => ({ ok: false, why });
    if (!plan || typeof plan !== 'object' || !Array.isArray(plan.items)) return no('shape');
    if (!['done', 'failed', 'pending'].includes(plan.authRates)) return no('shape');
    if (plan.memberId !== expect.memberId) return no('member');
    if (!expect.appIds.includes(plan.applicationId)) return no('application');
    if (plan.items.length > 200) return no('too_many');
    const items = [];
    const seen = new Set();
    for (const it of plan.items) {
        if (!onlyKeys(it, ['table', 'method', 'match', 'onConflict', 'values']) || !it.values || typeof it.values !== 'object') return no('item_shape');
        if (it.table === 'applications') {
            if (it.method !== 'PATCH' || it.match !== 'id=eq.' + plan.applicationId || !onlyKeys(it.values, ['self_paced_schedule'])) return no('applications_row_or_column');
            const s = scheduleOf(it.values.self_paced_schedule);
            if (!s) return no('schedule_value');
            items.push({ table: 'applications', match: it.match, values: { self_paced_schedule: JSON.stringify({ end: s.end, dates: s.dates }) } });
        } else if (it.table === 'tr_user_map') {
            const v = it.values;
            if (it.method !== 'POST' || it.onConflict !== 'user_id' || !onlyKeys(v, ['user_id', 'email', 'name', 'updated_at'])) return no('user_map_row_or_column');
            if (!userMapOk(v, expect)) return no('user_map_value');
            items.push({ table: 'tr_user_map', match: 'on_conflict=user_id', values: { user_id: v.user_id, email: v.email, name: v.name, updated_at: v.updated_at } });
        } else if (it.table === 'study_results_v3') {
            const id = typeof it.match === 'string' && it.match.startsWith('id=eq.') ? it.match.slice(6) : null;
            if (it.method !== 'PATCH' || !id || !expect.recordIds.includes(id) || !onlyKeys(it.values, ['locked_auth_rate'])) return no('results_row_or_column');
            if (![0, 50, 100].includes(it.values.locked_auth_rate)) return no('rate_value');
            items.push({ table: 'study_results_v3', match: it.match, values: { locked_auth_rate: it.values.locked_auth_rate } });
        } else return no('table');
        const key = items[items.length - 1].table + ' ' + items[items.length - 1].match;
        if (seen.has(key)) return no('duplicate_row');
        seen.add(key);
    }
    return { ok: true, items, authRates: plan.authRates };
}

// 합성 자료의 목록(브레인방이 fixtures_up.sql 의 결과로 준 것)의 모양을 확인한다. 글자는 번호 모양만 받는다
const IDISH = /^[A-Za-z0-9_-]{6,80}$/;
export function checkSynthetic(body, keys) {
    if (!body || typeof body !== 'object' || !body.students || typeof body.students !== 'object') return null;
    const students = {};
    const flat = { memberIds: [], appIds: [], recordIds: [] };
    for (const k of keys) {
        const s = body.students[k];
        if (!onlyKeys(s, ['memberId', 'appIds', 'recordIds']) || !IDISH.test(String(s.memberId)) || !Array.isArray(s.appIds) || !Array.isArray(s.recordIds)) return null;
        if (!s.appIds.every((x) => IDISH.test(String(x))) || !s.recordIds.every((x) => IDISH.test(String(x))) || s.appIds.length > 5 || s.recordIds.length > 50) return null;
        students[k] = { memberId: String(s.memberId), appIds: s.appIds.map(String), recordIds: s.recordIds.map(String) };
        flat.memberIds.push(students[k].memberId);
        flat.appIds.push(...students[k].appIds);
        flat.recordIds.push(...students[k].recordIds);
    }
    if (new Set(flat.memberIds).size !== flat.memberIds.length || new Set(flat.appIds).size !== flat.appIds.length || new Set(flat.recordIds).size !== flat.recordIds.length) return null;
    return { students, flat };
}
