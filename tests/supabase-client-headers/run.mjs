// 테스트룸 js/supabase-client.js 헤더 통합 회귀시험 (보안작업 묶음2 계약1-나)
//
// 실행:  node tests/supabase-client-headers/run.mjs      (저장소 폴더에서, Node v26, 설치할 것 없음)
//
// 하는 일
//   1) 변경 전 파일(git show 86af98d:js/supabase-client.js)과 지금 파일을 각각 가짜 브라우저 환경(vm)에 올린다.
//   2) 같은 합성 입력으로 supabaseRequest·supabaseStorageUpload·그것을 거치는 함수 29개를 부르고,
//      가짜 fetch 에 넘어간 주소·메서드·헤더(이름·값·순서)·본문과 반환값·window._sgLastError·console 을 비교한다.
//      시각은 고정한다(원본이 Date.now() 를 기록에 넣기 때문).
//   3) 헤더 2곳과 새 함수를 뺀 나머지 텍스트가 같은지 비교한다.
//   4) 일부러 망가뜨린 사본으로 시험이 차이를 실제로 잡아내는지 확인한다.
// 실제 네트워크 요청은 0건이어야 한다. 공개 키 값은 출력하지 않는다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import {
    installNetworkGuard, verifyNetworkGuard, realNetworkAttempts,
    createEnv, runCall, diffCall, checkExpectations, FIXED_NOW,
} from './harness.mjs';
import {
    uniformResponses, sequenceResponses, requestInputs, uploadInputs, wrapperTargets,
    directNames, pureNames, notCalled,
} from './cases.mjs';

const BASE_COMMIT = '86af98d';
const TARGET_FILE = 'js/supabase-client.js';
const TEST_DIR = 'tests/supabase-client-headers/';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MAX_LISTED = 40;

let secret = null;
const redact = (text) => {
    let s = String(text);
    if (secret) s = s.split(secret).join('<가림>');
    return s.replace(/eyJ[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]+)*/g, '<가림>');
};
const out = (line = '') => console.log(redact(line));

const failures = [];
const fail = (section, items) => {
    const list = Array.isArray(items) ? items : [items];
    for (const item of list) failures.push(`[${section}] ${item}`);
};

const normalize = (text) => text.replace(/\r\n/g, '\n');
const count = (text, needle) => text.split(needle).length - 1;

// ---------------------------------------------------------------------------
// 진입점
// ---------------------------------------------------------------------------
const REQUEST = { name: 'supabaseRequest', kind: 'request', invoke: (f, a) => f.supabaseRequest(...a), inputs: requestInputs };
const UPLOAD = { name: 'supabaseStorageUpload', kind: 'upload', invoke: (f, a) => f.supabaseStorageUpload(...a), inputs: uploadInputs };
const targets = [REQUEST, UPLOAD, ...wrapperTargets];
const wrapperNames = wrapperTargets.map((t) => t.name);
const allFnNames = [...directNames, ...wrapperNames, ...pureNames];
const scenariosFor = (target) => (target.kind === 'wrapper' ? [...uniformResponses, ...sequenceResponses] : uniformResponses);

// ---------------------------------------------------------------------------
// 텍스트 점검
// ---------------------------------------------------------------------------
const BEFORE_REQUEST_BLOCK = [
    '    const headers = {',
    "        'apikey': SUPABASE_CONFIG.anonKey,",
    "        'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,",
    "        'Content-Type': 'application/json',",
    "        'Prefer': options.prefer || 'return=representation',",
    '        ...options.headers',
    '    };',
    '',
].join('\n');
const BEFORE_UPLOAD_BLOCK = [
    '            headers: {',
    "                'apikey': SUPABASE_CONFIG.anonKey,",
    "                'Authorization': 'Bearer ' + SUPABASE_CONFIG.anonKey,",
    "                'Content-Type': file.type || 'application/octet-stream',",
    "                'x-upsert': 'true'",
    '            },',
    '',
].join('\n');
const AFTER_FUNCTION_BLOCK = /(?:\/\/[^\n]*\n)*const supabaseHeaders = function \(extra\) \{\n[\s\S]*?\n\};\n\n/g;
const AFTER_REQUEST_CALL = / {4}const headers = supabaseHeaders\(\{[^{}]*\}\);\n/g;
const AFTER_UPLOAD_CALL = / {12}headers: supabaseHeaders\(\{[^{}]*\}\),\n/g;
const SLOT_REQUEST = '    <요청 헤더 자리>\n';
const SLOT_UPLOAD = '            <올리기 헤더 자리>\n';
const TOP_LEVEL_FUNCTION = /^(?:async )?function (\w+)\s*\(/gm;

function checkText(before, after) {
    const problems = [];
    const info = {};
    if (before === after) problems.push('변경 전과 변경 후 파일이 같다(비교가 의미 없음)');

    info.beforeRequest = count(before, BEFORE_REQUEST_BLOCK);
    info.beforeUpload = count(before, BEFORE_UPLOAD_BLOCK);
    info.afterFunction = (after.match(AFTER_FUNCTION_BLOCK) || []).length;
    info.afterRequest = (after.match(AFTER_REQUEST_CALL) || []).length;
    info.afterUpload = (after.match(AFTER_UPLOAD_CALL) || []).length;
    info.apikeyBefore = count(before, "'apikey'");
    info.apikeyAfter = count(after, "'apikey'");
    info.authBefore = count(before, "'Authorization'");
    info.authAfter = count(after, "'Authorization'");
    info.keyRefBefore = count(before, 'SUPABASE_CONFIG.anonKey');
    info.keyRefAfter = count(after, 'SUPABASE_CONFIG.anonKey');
    info.fetchBefore = count(before, 'fetch(');
    info.fetchAfter = count(after, 'fetch(');
    info.nameAfter = count(after, 'supabaseHeaders');

    if (info.beforeRequest !== 1) problems.push(`변경 전 supabaseRequest 헤더 객체가 1곳이 아님(${info.beforeRequest})`);
    if (info.beforeUpload !== 1) problems.push(`변경 전 supabaseStorageUpload 헤더 객체가 1곳이 아님(${info.beforeUpload})`);
    if (info.afterFunction !== 1) problems.push(`변경 후 헤더 함수 정의가 1곳이 아님(${info.afterFunction})`);
    if (info.afterRequest !== 1) problems.push(`변경 후 supabaseRequest 의 함수 사용이 1곳이 아님(${info.afterRequest})`);
    if (info.afterUpload !== 1) problems.push(`변경 후 supabaseStorageUpload 의 함수 사용이 1곳이 아님(${info.afterUpload})`);
    if (count(before, 'supabaseHeaders') !== 0) problems.push('변경 전 파일에 supabaseHeaders 가 이미 있음');
    if (info.nameAfter !== 3) problems.push(`변경 후 supabaseHeaders 이름이 3번(정의 1 + 사용 2)이 아님(${info.nameAfter})`);
    if (info.apikeyBefore !== 2 || info.authBefore !== 2) problems.push('변경 전 헤더 이름(apikey·Authorization)이 2번씩이 아님');
    if (info.apikeyAfter !== 1 || info.authAfter !== 1) problems.push('변경 후 헤더 이름(apikey·Authorization)이 1번씩이 아님 — 헤더 복사본이 남아 있음');
    if (info.keyRefBefore !== 4) problems.push(`변경 전 공개 키를 읽는 곳이 4번이 아님(${info.keyRefBefore})`);
    if (info.keyRefAfter !== 2) problems.push(`변경 후 공개 키를 읽는 곳이 2번(함수 안)이 아님(${info.keyRefAfter})`);
    if (info.fetchBefore !== 2 || info.fetchAfter !== 2) problems.push('fetch( 가 변경 전후 모두 2곳이 아님');

    // 헤더 2곳과 새 함수를 뺀 나머지
    const restBefore = before.replace(BEFORE_REQUEST_BLOCK, () => SLOT_REQUEST).replace(BEFORE_UPLOAD_BLOCK, () => SLOT_UPLOAD);
    const restAfter = after.replace(AFTER_FUNCTION_BLOCK, '').replace(AFTER_REQUEST_CALL, () => SLOT_REQUEST).replace(AFTER_UPLOAD_CALL, () => SLOT_UPLOAD);
    info.restLines = restBefore.split('\n').length - 1;
    info.restSame = restBefore === restAfter;
    if (!info.restSame) {
        const a = restBefore.split('\n');
        const b = restAfter.split('\n');
        let i = 0;
        while (i < a.length && i < b.length && a[i] === b[i]) i++;
        problems.push(`헤더 2곳·새 함수를 뺀 나머지 텍스트가 다름(나머지 기준 ${i + 1}번째 줄부터)`);
    }
    if (restAfter.includes('supabaseHeaders')) problems.push('나머지 텍스트에 supabaseHeaders 가 남아 있음');

    // 파일 안의 함수가 시험 목록(직접 2 + 거치는 함수 + 계산만 하는 함수 + 부르지 못한 함수)과 정확히 같은지
    const declared = (src) => [...src.matchAll(TOP_LEVEL_FUNCTION)].map((m) => m[1]);
    const fnBefore = declared(before);
    const fnAfter = declared(after);
    const listed = [...allFnNames, ...notCalled.map((n) => n.name)];
    info.functionCount = fnBefore.length;
    if (JSON.stringify(fnBefore) !== JSON.stringify(fnAfter)) problems.push('function 으로 선언된 함수 목록이 변경 전후로 다름');
    if (new Set(listed).size !== listed.length) problems.push('시험의 함수 목록에 겹치는 이름이 있음');
    const missing = fnBefore.filter((n) => !listed.includes(n));
    const extra = listed.filter((n) => !fnBefore.includes(n));
    if (missing.length) problems.push(`파일에 있는데 시험 목록에 없는 함수: ${missing.join(', ')}`);
    if (extra.length) problems.push(`시험 목록에 있는데 파일에 없는 함수: ${extra.join(', ')}`);

    return { problems, info };
}

// ---------------------------------------------------------------------------
// 동작 비교
// ---------------------------------------------------------------------------
async function runAll(env) {
    const results = [];
    for (const target of targets) {
        for (const input of target.inputs) {
            for (const scenario of scenariosFor(target)) {
                const label = `${target.name} › ${input.label} › ${scenario.name}`;
                const record = await runCall(env, label, target, input, scenario);
                results.push({ target, input, scenario, record });
            }
        }
    }
    return results;
}

function compareRuns(a, b) {
    const diffs = [];
    if (a.length !== b.length) diffs.push('호출 수가 다름');
    for (let i = 0; i < Math.min(a.length, b.length); i++) diffs.push(...diffCall(a[i].record, b[i].record));
    return diffs;
}

function checkEnvShape(env) {
    const problems = [];
    for (const name of allFnNames) if (typeof env.fns[name] !== 'function') problems.push(`${env.label}: ${name} 이 함수가 아님`);
    if (env.nowInside[0] !== FIXED_NOW || env.nowInside[1] !== FIXED_NOW) problems.push(`${env.label}: 시각이 고정되지 않음`);
    return problems;
}

// ---------------------------------------------------------------------------
// 감도 점검: 변경 후 파일을 메모리에서만 일부러 바꾼 사본. 시험이 차이를 잡아야 한다.
// ---------------------------------------------------------------------------
const UP = 'supabaseStorageUpload';
const controls = [
    {
        name: '파일 올리기에서 x-upsert 를 뺌',
        from: "                'Content-Type': file.type || 'application/octet-stream',\n                'x-upsert': 'true'\n",
        to: "                'Content-Type': file.type || 'application/octet-stream'\n",
        mustInclude: '헤더 빠짐 [x-upsert]',
        onlyIn: [UP],
    },
    {
        name: 'apikey 와 Authorization 순서를 바꿈',
        from: "        'apikey': SUPABASE_CONFIG.anonKey,\n        'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,\n",
        to: "        'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,\n        'apikey': SUPABASE_CONFIG.anonKey,\n",
        mustInclude: '헤더 순서',
    },
    {
        name: 'options.headers 가 Prefer 를 덮어쓰지 못하게 함',
        from: "        'Prefer': options.prefer || 'return=representation',\n        ...options.headers\n",
        to: "        ...options.headers,\n        'Prefer': options.prefer || 'return=representation'\n",
        mustInclude: '헤더 값 [Prefer]',
        onlyIn: ['supabaseRequest'],
    },
    {
        name: '기본 3개가 extra 를 이기게 함(덮어쓰기 불가)',
        from: "    return {\n        'apikey': SUPABASE_CONFIG.anonKey,\n        'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,\n        'Content-Type': 'application/json',\n        ...extra\n    };",
        to: "    return {\n        ...extra,\n        'apikey': SUPABASE_CONFIG.anonKey,\n        'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,\n        'Content-Type': 'application/json'\n    };",
        mustInclude: '헤더 값 [Content-Type]',
    },
    {
        name: 'Prefer 기본값을 바꿈',
        from: "options.prefer || 'return=representation'",
        to: "options.prefer || 'return=minimal'",
        mustInclude: '헤더 값 [Prefer]',
        notIn: [UP],
    },
    {
        name: '기본 묶음에 Prefer 를 넣음(파일 올리기에 Prefer 가 생김)',
        from: "        'Content-Type': 'application/json',\n        ...extra\n",
        to: "        'Content-Type': 'application/json',\n        'Prefer': 'return=representation',\n        ...extra\n",
        mustInclude: '헤더 추가됨 [Prefer]',
        onlyIn: [UP],
    },
    {
        name: '파일 올리기의 Content-Type 을 고정(file.type 무시)',
        from: "'Content-Type': file.type || 'application/octet-stream',",
        to: "'Content-Type': 'application/octet-stream',",
        mustInclude: '헤더 값 [Content-Type]',
        onlyIn: [UP],
    },
    {
        name: 'Authorization 값에 공백 하나 추가',
        from: "'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,",
        to: "'Authorization': `Bearer  ${SUPABASE_CONFIG.anonKey}`,",
        mustInclude: '헤더 값 [Authorization]',
    },
    {
        name: '올리는 파일의 앞 1바이트를 잘라 보냄',
        from: '            body: file\n',
        to: '            body: file.slice(1)\n',
        mustInclude: '본문 바이트',
        onlyIn: [UP],
    },
    {
        name: '4xx 기록의 kind 를 바꿈',
        from: "kind: 'server'",
        to: "kind: 'srv'",
        mustInclude: 'window._sgLastError 기록',
        notIn: [UP],
    },
    {
        name: '통신 실패 기록의 시각을 1ms 어긋나게 함',
        from: "message: String(error), at: Date.now() }",
        to: "message: String(error), at: Date.now() + 1 }",
        mustInclude: 'window._sgLastError 기록',
        notIn: [UP],
    },
    {
        name: '빈 응답(204 등)의 반환값을 바꿈',
        from: '        return true;\n\n    } catch (error) {',
        to: '        return false;\n\n    } catch (error) {',
        mustInclude: '반환값',
        notIn: [UP],
    },
];

async function runControls(afterSource, beforeRun) {
    const problems = [];
    const lines = [];
    for (const control of controls) {
        if (count(afterSource, control.from) !== 1) {
            problems.push(`감도 점검 "${control.name}": 바꿀 자리를 정확히 1곳 찾지 못함`);
            continue;
        }
        const env = createEnv(afterSource.replace(control.from, () => control.to), `감도:${control.name}`, allFnNames);
        const diffs = compareRuns(beforeRun, await runAll(env));
        if (env.forbidden.length) problems.push(`감도 점검 "${control.name}": 가짜 fetch 밖의 통신 시도`);
        if (diffs.length === 0) { problems.push(`감도 점검 "${control.name}": 차이를 잡지 못함`); continue; }
        if (!diffs.some((d) => d.includes(control.mustInclude))) problems.push(`감도 점검 "${control.name}": 기대한 종류(${control.mustInclude})의 차이가 없음`);
        if (control.onlyIn && !diffs.every((d) => control.onlyIn.some((t) => d.startsWith(`${t} › `)))) {
            problems.push(`감도 점검 "${control.name}": 관계없는 호출에서도 차이가 남`);
        }
        if (control.notIn && diffs.some((d) => control.notIn.some((t) => d.startsWith(`${t} › `)))) {
            problems.push(`감도 점검 "${control.name}": 관계없는 호출(${control.notIn.join(', ')})에서도 차이가 남`);
        }
        const calls = new Set(diffs.map((d) => d.split(' › ').slice(0, 3).join(' › '))).size;
        lines.push(`    - ${control.name}: 호출 ${calls}건에서 차이 ${diffs.length}개 검출`);
    }
    return { problems, lines };
}

// 다른 파일이 새 함수를 부르지 않는지(저장소 안, 로컬 git grep)
function findOutsideUsers() {
    try {
        const text = execFileSync('git', ['grep', '-l', '--untracked', '-I', 'supabaseHeaders', '--', '.'], { cwd: ROOT, encoding: 'utf8' });
        return text.split('\n').map((s) => s.trim()).filter(Boolean)
            .filter((f) => f !== TARGET_FILE && !f.startsWith(TEST_DIR));
    } catch (e) {
        if (e.status === 1) return [];
        throw e;
    }
}

function listSome(items) {
    for (const item of items.slice(0, MAX_LISTED)) out(`    · ${item}`);
    if (items.length > MAX_LISTED) out(`    · … 외 ${items.length - MAX_LISTED}건`);
}

// ---------------------------------------------------------------------------
async function main() {
    installNetworkGuard();
    const guardPaths = verifyNetworkGuard();

    const before = normalize(execFileSync('git', ['show', `${BASE_COMMIT}:${TARGET_FILE}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
    const after = normalize(fs.readFileSync(path.join(ROOT, TARGET_FILE), 'utf8'));

    out('테스트룸 supabase-client.js 헤더 통합 회귀시험');
    out(`  변경 전: git show ${BASE_COMMIT}:${TARGET_FILE} (${before.split('\n').length - 1}줄)`);
    out(`  변경 후: ${TARGET_FILE} (${after.split('\n').length - 1}줄)`);
    out('');

    // [1] 네트워크 차단
    out(`[1] 네트워크 차단 장치 자체 점검: ${guardPaths}개 경로가 막히는 것을 확인`);

    // [2] 텍스트
    const text = checkText(before, after);
    fail('텍스트', text.problems);
    out(`[2] 텍스트 점검: ${text.problems.length === 0 ? '통과' : '실패'}`);
    out(`    - 헤더 객체: 변경 전 ${text.info.beforeRequest + text.info.beforeUpload}곳 → 변경 후 함수 정의 ${text.info.afterFunction}곳 + 사용 ${text.info.afterRequest + text.info.afterUpload}곳`);
    out(`    - 'apikey' 글자: 변경 전 ${text.info.apikeyBefore}번 → 변경 후 ${text.info.apikeyAfter}번 / 공개 키를 읽는 곳: ${text.info.keyRefBefore}번 → ${text.info.keyRefAfter}번 / fetch( : ${text.info.fetchBefore}곳 → ${text.info.fetchAfter}곳`);
    out(`    - 헤더 2곳·새 함수를 뺀 나머지 텍스트(${text.info.restLines}줄): ${text.info.restSame ? '동일' : '다름'}`);
    out(`    - 파일의 함수 ${text.info.functionCount}개 = fetch 를 직접 부르는 ${directNames.length}개 + 그것을 거치는 ${wrapperNames.length}개 + 계산만 하는 ${pureNames.length}개 + 부르지 못한 ${notCalled.length}개`);
    listSome(text.problems);

    // [3] 환경
    const envBefore = createEnv(before, '변경 전', allFnNames);
    const envAfter = createEnv(after, '변경 후', allFnNames);
    secret = envBefore.key;
    const envProblems = [...checkEnvShape(envBefore), ...checkEnvShape(envAfter)];
    if (envBefore.key !== envAfter.key) envProblems.push('공개 키 값이 변경 전후로 다름');
    if (envBefore.baseUrl !== envAfter.baseUrl) envProblems.push('Supabase 주소 값이 변경 전후로 다름');
    if (JSON.stringify(envBefore.windowAdded) !== JSON.stringify(envAfter.windowAdded)) envProblems.push('파일이 window 에 붙이는 이름 목록이 달라짐');
    if (JSON.stringify(envBefore.loadConsole) !== JSON.stringify(envAfter.loadConsole)) envProblems.push('파일을 올릴 때의 console 출력이 달라짐');
    if (envAfter.windowAdded.includes('supabaseHeaders')) envProblems.push('supabaseHeaders 가 window 에 붙음');
    if (envAfter.typeOf('window.supabaseHeaders') !== 'undefined') envProblems.push('window.supabaseHeaders 가 있음');
    if (envAfter.typeOf('supabaseHeaders') !== 'function') envProblems.push('변경 후 파일 안에 supabaseHeaders 함수가 없음');
    if (envBefore.typeOf('supabaseHeaders') !== 'undefined') envProblems.push('변경 전 파일에 supabaseHeaders 가 있음');
    const outsideUsers = findOutsideUsers();
    if (outsideUsers.length) envProblems.push(`다른 파일이 supabaseHeaders 를 씀: ${outsideUsers.join(', ')}`);
    fail('환경', envProblems);
    out(`[3] 올린 환경 점검: ${envProblems.length === 0 ? '통과' : '실패'}`);
    out(`    - 시각 고정 확인(Date.now·new Date), 함수 ${allFnNames.length}개가 변경 전후 모두 있음`);
    out(`    - window 에 붙는 이름 ${envAfter.windowAdded.length}개로 변경 전과 같음, window.supabaseHeaders 없음, 다른 파일의 사용 ${outsideUsers.length}곳`);
    listSome(envProblems);

    // [4] 동작 비교
    const runBefore = await runAll(envBefore);
    const runAfter = await runAll(envAfter);
    const labels = new Set(runBefore.map((r) => r.record.label));
    if (labels.size !== runBefore.length) fail('동작', '호출 이름이 겹침');

    const diffs = compareRuns(runBefore, runAfter);
    fail('동작 비교', diffs);

    const expectProblems = [];
    for (const r of runBefore) expectProblems.push(...checkExpectations(r.record, r.target, r.input, r.scenario, envBefore).map((p) => `변경 전 ${p}`));
    for (const r of runAfter) expectProblems.push(...checkExpectations(r.record, r.target, r.input, r.scenario, envAfter).map((p) => `변경 후 ${p}`));
    fail('기대 모양', expectProblems);

    const stat = (run, pick) => {
        const rows = run.filter(pick);
        const reached = rows.filter((r) => r.record.fetches.length > 0);
        return {
            calls: rows.length,
            reached: reached.length,
            fetches: rows.reduce((n, r) => n + r.record.fetches.length, 0),
            headers: rows.reduce((n, r) => n + r.record.fetches.reduce((m, f) => m + (f.headers.entries ? f.headers.entries.length : 0), 0), 0),
            inputs: new Set(rows.map((r) => r.input)).size,
            reachedInputs: new Set(reached.map((r) => r.input)).size,
        };
    };
    const sReq = stat(runAfter, (r) => r.target === REQUEST);
    const sUp = stat(runAfter, (r) => r.target === UPLOAD);
    const sWrap = stat(runAfter, (r) => r.target.kind === 'wrapper');
    const sAll = stat(runAfter, () => true);
    const fileBodies = runAfter.reduce((n, r) => n + r.record.fetches.filter((f) => f.body.hex !== undefined).length, 0);
    const reachedFns = (run) => wrapperNames.filter((name) => run.some((r) => r.target.name === name && r.record.fetches.length > 0));
    const reachedBefore = reachedFns(runBefore);
    const reachedAfter = reachedFns(runAfter);
    const notReached = wrapperNames.filter((n) => !reachedBefore.includes(n) || !reachedAfter.includes(n));
    const returned = runAfter.filter((r) => r.record.outcome.type === '반환').length;
    const sgSet = runAfter.filter((r) => r.record.sg.has).length;
    const withConsoleError = runAfter.filter((r) => r.record.console.some((c) => c.level === 'error')).length;

    if (sReq.reachedInputs < 20) fail('동작', `supabaseRequest 입력이 20개 미만(${sReq.reachedInputs})`);
    if (reachedAfter.length < 10) fail('동작', `가짜 fetch 에 도달한 "거치는 함수"가 10개 미만(${reachedAfter.length})`);
    if (notReached.length) fail('동작', `가짜 fetch 에 도달하지 못한 함수: ${notReached.join(', ')}`);
    if (sAll.fetches === 0 || fileBodies === 0) fail('동작', 'fetch 기록 또는 파일 본문이 하나도 잡히지 않음');

    out(`[4] 동작 비교: ${diffs.length === 0 ? '차이 0' : `차이 ${diffs.length}건`}`);
    out(`    - 비교한 호출 ${sAll.calls}건(그중 가짜 fetch 에 도달한 호출 ${sAll.reached}건, fetch 요청 ${sAll.fetches}건, 헤더 ${sAll.headers}개 — 이름·값·순서)`);
    out(`    - supabaseRequest 직접: 입력 ${sReq.inputs}개(fetch 도달 ${sReq.reachedInputs}개) × 가짜 응답 ${uniformResponses.length}종 = ${sReq.calls}건`);
    out(`    - supabaseStorageUpload: 입력 ${sUp.inputs}개(fetch 도달 ${sUp.reachedInputs}개) × 가짜 응답 ${uniformResponses.length}종 = ${sUp.calls}건, 파일 본문(MIME·바이트) 대조 ${fileBodies}건`);
    out(`    - supabaseRequest 를 거치는 함수: ${wrapperNames.length}개 중 가짜 fetch 에 도달한 함수 ${reachedAfter.length}개, 입력 ${sWrap.inputs}개 × 가짜 응답 ${uniformResponses.length + sequenceResponses.length}종 = ${sWrap.calls}건(도달 ${sWrap.reached}건)`);
    out(`    - 결과 대조: 반환 ${returned}건·오류 ${runAfter.length - returned}건, _sgLastError 가 남은 호출 ${sgSet}건, console 오류가 있던 호출 ${withConsoleError}건`);
    out(`    - 부르지 못한 함수: ${notCalled.length}개${notCalled.length ? ` (${notCalled.map((n) => `${n.name}: ${n.reason}`).join(' / ')})` : ''}`);
    listSome(diffs);
    out(`[5] 계약서 모양 대조(변경 전·후 각각 — 헤더 이름·값·순서, 덮어쓰기, 204→true, 4xx→kind server, 통신 실패→kind network, 올리기 x-upsert·MIME·바이트): ${expectProblems.length === 0 ? '어긋남 0' : `어긋남 ${expectProblems.length}건`}`);
    listSome(expectProblems);

    // [6] 감도
    const control = await runControls(after, runBefore);
    fail('감도', control.problems);
    out(`[6] 감도 점검(일부러 바꾼 사본 ${controls.length}개): ${control.problems.length === 0 ? '모두 차이로 검출' : '실패'}`);
    for (const line of control.lines) out(line);
    listSome(control.problems);

    // [7] 네트워크
    const forbidden = envBefore.forbidden.length + envAfter.forbidden.length;
    if (realNetworkAttempts.length) fail('네트워크', `실제 네트워크 요청 시도 ${realNetworkAttempts.length}건: ${[...new Set(realNetworkAttempts)].join(', ')}`);
    if (forbidden) fail('네트워크', `가짜 fetch 밖의 통신 시도 ${forbidden}건`);
    if (envBefore.fakeFetchCount !== envAfter.fakeFetchCount) fail('네트워크', '가짜 fetch 호출 수가 변경 전후로 다름');
    out(`[7] 실제 네트워크 요청 ${realNetworkAttempts.length}건, 가짜 fetch 밖의 통신 시도 ${forbidden}건 (가짜 fetch 호출: 변경 전 ${envBefore.fakeFetchCount}건, 변경 후 ${envAfter.fakeFetchCount}건)`);

    out('');
    if (failures.length === 0) {
        out('결과: 통과');
    } else {
        out(`결과: 실패 (${failures.length}건)`);
        process.exitCode = 1;
    }
}

main().catch((e) => {
    // 오류 내용에 소스 줄이 섞여 나올 수 있어 메시지만, 가려서 찍는다.
    out(`결과: 실패 — 시험 도구 오류: ${e && e.message ? e.message : String(e)}`);
    process.exitCode = 1;
});
