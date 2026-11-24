// 시험용 로컬 서버와 회귀시험이 함께 쓰는 "내줄 때 바꾸기"와 "운영 흔적 찾기".
// 저장소의 파일은 바꾸지 않는다 — 내주는 사본(메모리)만 바꾼다.
// (공홈 계약 3A 의 tests/auth-session/rewrite.mjs 를 테스트룸의 설정 모양에 맞게 옮긴 것)

export const PROD_REF = 'qpqjevecjejvbeuogtbx';
export const TEST_REF = 'hmncdheiwqwekdbtijar';
export const TEST_URL = `https://${TEST_REF}.supabase.co`;

export const CONFIG_FILE = 'js/supabase-client.js';
export const AUTH_FILE = 'js/auth-session.js';
export const OMR_FILE = 'omr-card.html';

// js/supabase-client.js 의 SUPABASE_CONFIG = { url: '…', anonKey: '…' }
const URL_LINE = /^( *)url: '([^']*)',(\r?)$/m;
const KEY_LINE = /^( *)anonKey: '([^']*)'(\r?)$/m;
// omr-card.html 은 주소·공개 키를 따로 적어 둔다
const OMR_URL_LINE = /^( *)var SUPABASE_URL = '([^']*)';(\r?)$/m;
const OMR_KEY_LINE = /^( *)var SUPABASE_(?:ANON_)?KEY = '([^']*)';(\r?)$/m;
const SWITCH_LINE = /^( *)const EON_AUTH_SWITCH = '(off|on)';(\r?)$/m;

const countMatches = (text, re) => (text.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')) || []).length;

function exactlyOne(text, re, what) {
    const n = countMatches(text, re);
    if (n !== 1) throw new Error(`${what}: 바꿀 줄을 정확히 1곳 찾지 못함(${n}곳)`);
}

function checkTarget({ testUrl, testKey }) {
    if (testUrl !== TEST_URL) throw new Error('시험 프로젝트의 주소가 아니다');
    if (typeof testKey !== 'string' || !testKey || testKey.includes("'") || testKey.includes('\\')) throw new Error('시험 공개 키의 모양이 맞지 않다');
}

// 저장소의 설정에서 운영 주소·운영 공개 키를 읽는다(값은 어디에도 찍지 않는다 — 흔적을 찾는 데만 쓴다).
export function readProdConfig(configText) {
    exactlyOne(configText, URL_LINE, 'SUPABASE_CONFIG.url');
    exactlyOne(configText, KEY_LINE, 'SUPABASE_CONFIG.anonKey');
    return { url: configText.match(URL_LINE)[2], key: configText.match(KEY_LINE)[2] };
}

// 설정의 주소·공개 키를 시험 프로젝트의 값으로 바꾼다.
export function rewriteConfig(text, target) {
    checkTarget(target);
    exactlyOne(text, URL_LINE, 'SUPABASE_CONFIG.url');
    exactlyOne(text, KEY_LINE, 'SUPABASE_CONFIG.anonKey');
    return text
        .replace(URL_LINE, (m, indent, v, cr) => `${indent}url: '${target.testUrl}',${cr}`)
        .replace(KEY_LINE, (m, indent, v, cr) => `${indent}anonKey: '${target.testKey}'${cr}`);
}

export function rewriteOmr(text, target) {
    checkTarget(target);
    exactlyOne(text, OMR_URL_LINE, 'omr-card.html 의 주소');
    exactlyOne(text, OMR_KEY_LINE, 'omr-card.html 의 공개 키');
    return text
        .replace(OMR_URL_LINE, (m, indent, v, cr) => `${indent}var SUPABASE_URL = '${target.testUrl}';${cr}`)
        .replace(OMR_KEY_LINE, (m) => m.replace(/'[^']*'/, `'${target.testKey}'`));
}

// 스위치: 저장소의 값은 'off' 여야 한다. mode 가 'on' 일 때만 내주는 사본에서 'on' 으로 바꾼다.
export function rewriteSwitch(text, mode) {
    exactlyOne(text, SWITCH_LINE, 'EON_AUTH_SWITCH');
    const current = text.match(SWITCH_LINE)[2];
    if (current !== 'off') throw new Error('저장소의 스위치 값이 꺼짐이 아니다');
    if (mode === 'off') return text;
    if (mode !== 'on') throw new Error('mode 는 on 또는 off');
    return text.replace(SWITCH_LINE, (m, indent, v, cr) => `${indent}const EON_AUTH_SWITCH = 'on';${cr}`);
}

export function switchValue(text) {
    const m = text.match(SWITCH_LINE);
    return m && countMatches(text, SWITCH_LINE) === 1 ? m[2] : null;
}

const JWT_SHAPE = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;

// 응답 본문에 운영 ref·운영 주소·운영 키(또는 시험 프로젝트의 것이 아닌 Supabase 키)가 남아 있는가.
// 돌려주는 값: 흔적의 종류 이름들(값은 돌려주지 않는다).
export function findProdResidue(buffer, { prodKey, prodUrl } = {}) {
    const text = Buffer.isBuffer(buffer) ? buffer.toString('latin1') : String(buffer);
    const found = [];
    if (text.includes(PROD_REF)) found.push('운영 ref');
    if (prodUrl && text.includes(prodUrl)) found.push('운영 주소');
    if (prodKey && text.includes(prodKey)) found.push('운영 키');
    for (const token of text.match(JWT_SHAPE) || []) {
        let claims = null;
        try { claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')); } catch (e) { claims = null; }
        if (claims && typeof claims.ref === 'string' && claims.ref !== TEST_REF) { found.push('시험 프로젝트의 것이 아닌 Supabase 키'); break; }
    }
    return [...new Set(found)];
}

// 한 파일을 내줄 사본으로 바꾸고 운영 흔적을 찾는다.
// 돌려주는 값: { body(Buffer), residue(종류 이름들), changed(바꾼 것) }
export function transformForServe(relPath, buffer, { mode, testUrl, testKey, prodKey, prodUrl }) {
    let body = buffer;
    const changed = [];
    if (relPath === CONFIG_FILE) {
        body = Buffer.from(rewriteConfig(buffer.toString('utf8'), { testUrl, testKey }), 'utf8');
        changed.push('Supabase 주소·공개 키 → 시험 프로젝트');
    } else if (relPath === OMR_FILE) {
        body = Buffer.from(rewriteOmr(buffer.toString('utf8'), { testUrl, testKey }), 'utf8');
        changed.push('답안 카드의 Supabase 주소·공개 키 → 시험 프로젝트');
    } else if (relPath === AUTH_FILE) {
        body = Buffer.from(rewriteSwitch(buffer.toString('utf8'), mode), 'utf8');
        if (mode === 'on') changed.push('새 로그인 스위치 → 켜짐');
    }
    return { body, residue: findProdResidue(body, { prodKey, prodUrl }), changed };
}
