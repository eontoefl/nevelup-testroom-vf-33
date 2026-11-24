// 가짜 표 요청(REST): 프로세스 안에서만 돈다 — 실제 서버가 아니다.
// 테스트룸의 로그인이 쓰는 조건만 흉내 낸다(eq·neq·gt·is.null·not.is.null, order=…desc, limit, select, on_conflict).
// 응답의 모양은 화면의 코드가 기대하는 것(JSON 배열)을 따랐다. 실제 서버의 오류 모양은 확인하지 못한 것이다.

const json = (status, body) => ({ status, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
const clone = (v) => JSON.parse(JSON.stringify(v));

function matches(row, col, cond) {
    const v = row[col];
    if (cond === 'is.null') return v === null || v === undefined;
    if (cond === 'not.is.null') return !(v === null || v === undefined);
    const dot = cond.indexOf('.');
    const op = cond.slice(0, dot);
    const want = cond.slice(dot + 1);
    const text = v === null || v === undefined ? null : String(v);
    if (op === 'eq') return text !== null && text === want;
    if (op === 'neq') return text === null ? false : text !== want;     // 값이 없으면 걸리지 않는다(실제 서버와 같다)
    if (op === 'gt') return text !== null && text > want;
    throw new Error('가짜 표 요청: 모르는 조건 ' + op);
}

export class FakeRest {
    constructor(tables) {
        this.tables = clone(tables || {});
        this.log = [];          // 받은 요청(정해 둔 칸만)
        this.writes = [];       // 쓰기 요청(표·조건·본문)
        this.faults = [];       // (요청, 주소) → 응답 | 'network' | null
        this.hooks = [];        // (요청, 주소) → 응답 뒤에
        this.missingColumns = {};   // 표 → 없는 것으로 칠 열(조회하면 400)
    }

    table(name) {
        if (!this.tables[name]) this.tables[name] = [];
        return this.tables[name];
    }

    async handle(req, u) {
        const table = u.pathname.replace('/rest/v1/', '');
        const method = req.method.toUpperCase();
        const entry = { method, table, search: decodeURIComponent(u.search), body: req.bodyText, headers: req.headers.map(([n, v]) => [n, v]) };
        this.log.push(entry);
        for (const fault of this.faults) {
            const forced = await fault(req, u, entry);
            if (forced === 'network') throw new TypeError('Failed to fetch');
            if (forced) return forced;
        }
        const res = this.answer(method, table, u, req);
        for (const hook of this.hooks) await hook(req, u, entry, res);
        return res;
    }

    answer(method, table, u, req) {
        const rows = this.table(table);
        const params = [...u.searchParams.entries()];
        const special = new Set(['select', 'order', 'limit', 'on_conflict']);
        const conds = params.filter(([k]) => !special.has(k));
        const select = u.searchParams.get('select');
        const cols = select && select !== '*' ? select.split(',') : null;
        const missing = this.missingColumns[table] || [];
        if (cols && cols.some((c) => missing.includes(c))) return json(400, { code: '42703', message: 'column does not exist' });
        let hit;
        try { hit = rows.filter((r) => conds.every(([k, c]) => matches(r, k, c))); } catch (e) { return json(400, { code: 'PGRST100', message: String(e.message) }); }
        const project = (list) => list.map((r) => {
            if (!cols) return clone(r);
            const o = {};
            for (const c of cols) o[c] = r[c] === undefined ? null : clone(r[c]);
            return o;
        });

        if (method === 'GET') {
            let out = hit.slice();
            const order = u.searchParams.get('order');
            if (order) {
                const [col, dir] = order.split('.');
                out.sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (dir === 'desc' ? -1 : 1));
            }
            const limit = u.searchParams.get('limit');
            if (limit !== null) out = out.slice(0, Number(limit));
            return json(200, project(out));
        }
        let body = null;
        try { body = req.bodyText ? JSON.parse(req.bodyText) : null; } catch (e) { return json(400, { code: 'PGRST102', message: 'bad json' }); }
        this.writes.push({ method, table, search: decodeURIComponent(u.search), body: clone(body) });
        if (method === 'PATCH') {
            for (const r of hit) Object.assign(r, clone(body));
            return json(200, project(hit));
        }
        if (method === 'POST') {
            const key = u.searchParams.get('on_conflict');
            const old = key ? rows.find((r) => key.split(',').every((k) => String(r[k]) === String(body[k]))) : null;
            if (old) { Object.assign(old, clone(body)); return json(200, [clone(old)]); }
            rows.push(clone(body));
            return json(201, [clone(body)]);
        }
        if (method === 'DELETE') {
            this.tables[table] = rows.filter((r) => !hit.includes(r));
            return json(200, project(hit));
        }
        return json(405, { code: 'PGRST', message: 'method not allowed' });
    }
}
