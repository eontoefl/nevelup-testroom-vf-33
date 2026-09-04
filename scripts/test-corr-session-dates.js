/**
 * test-corr-session-dates.js
 * buildCorrSessionDates / _parseCorrSessionDates 단위 테스트 (node로 실행).
 *
 *   node scripts/test-corr-session-dates.js
 *
 * correction-session.js를 vm 샌드박스에 로드해 실제 함수를 그대로 검증한다
 * (정규식 추출이 아니라 파일 원본 실행 — 로직이 바뀌면 이 테스트가 잡는다).
 */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const SRC = path.join(__dirname, '..', 'js', 'correction', 'correction-session.js');
const sandbox = { window: {}, console: { log() {}, warn() {}, error() {} } };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(SRC, 'utf8'), sandbox);

const buildCorrSessionDates = sandbox.buildCorrSessionDates;
const _parseCorrSessionDates = sandbox._parseCorrSessionDates;

if (typeof buildCorrSessionDates !== 'function') {
    console.error('❌ buildCorrSessionDates를 로드하지 못했습니다.');
    process.exit(1);
}

// ── 미니 테스트 러너 ──
let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ ' + name + (detail ? '  → ' + detail : '')); }
}
function isAscendingUnique(arr) {
    for (let i = 1; i < arr.length; i++) {
        if (!(arr[i] > arr[i - 1])) return false;
    }
    return true;
}
function allDifferent(arr) {
    return new Set(arr).size === arr.length;
}
function dayDiff(a, b) {
    return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
}

// ── 케이스 1: 12일 (9/13~9/24) ──
console.log('[1] 12일 창 (9/13~9/24)');
{
    const r = buildCorrSessionDates('2026-09-13', '2026-09-24', null, '2026-09-13');
    check('null 아님', !!r);
    check('12개', r && r.dates.length === 12);
    check('전부 다른 날', r && allDifferent(r.dates), r && r.dates.join(','));
    check('세션1 = 9/13', r && r.dates[0] === '2026-09-13', r && r.dates[0]);
    check('세션12 = 9/24', r && r.dates[11] === '2026-09-24', r && r.dates[11]);
    check('오름차순', r && isAscendingUnique(r.dates));
}

// ── 케이스 2: 18일 (9/13~9/30) ──
console.log('[2] 18일 창 (9/13~9/30)');
let table18 = null;
{
    const r = buildCorrSessionDates('2026-09-13', '2026-09-30', null, '2026-09-13');
    table18 = r ? r.dates : null;
    check('세션1 = 9/13', r && r.dates[0] === '2026-09-13', r && r.dates[0]);
    check('세션12 = 9/30', r && r.dates[11] === '2026-09-30', r && r.dates[11]);
    check('오름차순·중복 없음', r && isAscendingUnique(r.dates), r && r.dates.join(','));
    check('12개', r && r.dates.length === 12);
}

// ── 케이스 3: 26일 (9/13~10/8), 기존 표(dayOffset)와 ±1 이내 ──
console.log('[3] 26일 창 (9/13~10/8) — 기존 표 ±1일 이내');
{
    const OFFSETS = [0, 2, 4, 7, 9, 11, 14, 16, 18, 21, 23, 25];
    const r = buildCorrSessionDates('2026-09-13', '2026-10-08', null, '2026-09-13');
    check('세션1 = 9/13', r && r.dates[0] === '2026-09-13');
    check('세션12 = 10/8', r && r.dates[11] === '2026-10-08', r && r.dates[11]);
    let within = true, worst = '';
    if (r) {
        for (let i = 0; i < 12; i++) {
            const off = dayDiff('2026-09-13', r.dates[i]);
            if (Math.abs(off - OFFSETS[i]) > 1) { within = false; worst = 'i=' + i + ' off=' + off + ' vs ' + OFFSETS[i]; }
        }
    }
    check('각 날짜 기존 표와 ±1일 이내', within, worst);
    check('오름차순·중복 없음', r && isAscendingUnique(r.dates));
}

// ── 케이스 4: 재배분 (prev=18일표, today=9/20, end→10/6) ──
console.log('[4] 재배분 (prev=18일표, today=9/20, end→10/6)');
{
    const r = buildCorrSessionDates('2026-09-13', '2026-10-06', table18, '2026-09-20');
    check('null 아님', !!r);
    // 9/20 이전 날짜(접두구간)는 그대로
    let preserved = true;
    if (r) {
        for (let i = 0; i < 12; i++) {
            if (table18[i] < '2026-09-20') {
                if (r.dates[i] !== table18[i]) { preserved = false; }
            }
        }
    }
    check('9/20 이전 날짜 그대로 보존', preserved, r && r.dates.join(','));
    check('오름차순·중복 없음', r && isAscendingUnique(r.dates), r && r.dates.join(','));
    check('마지막 = 10/6', r && r.dates[11] === '2026-10-06', r && r.dates[11]);
    check('12개', r && r.dates.length === 12);
}

// ── 케이스 5-a: 방어 — end < start → null ──
console.log('[5a] 방어 — end < start → null');
{
    const r = buildCorrSessionDates('2026-09-24', '2026-09-13', null, '2026-09-24');
    check('null 반환', r === null, JSON.stringify(r));
}

// ── 케이스 5-b: 방어 — today > end 재배분 → 남은 세션 전부 end ──
console.log('[5b] 방어 — today > end 재배분 → 남은 세션 전부 end');
{
    // prev=18일표, today=9/28(세션11·12가 9/28·9/30 → 남음), end=9/27(오늘보다 이전)
    const r = buildCorrSessionDates('2026-09-13', '2026-09-27', table18, '2026-09-28');
    check('null 아님', !!r);
    // 9/28 이전 접두구간은 보존
    let preserved = true;
    if (r) {
        for (let i = 0; i < 12; i++) {
            if (table18[i] < '2026-09-28' && r.dates[i] !== table18[i]) preserved = false;
        }
    }
    check('접두구간 보존', preserved);
    check('남은 세션(9/28 이상 자리) 전부 = end(9/27)',
        r && r.dates[10] === '2026-09-27' && r.dates[11] === '2026-09-27',
        r && (r.dates[10] + ',' + r.dates[11]));
    check('12개', r && r.dates.length === 12);
}

// ── 케이스 6: _parseCorrSessionDates 방어 ──
console.log('[6] _parseCorrSessionDates 방어');
{
    const good = buildCorrSessionDates('2026-09-13', '2026-09-24', null, '2026-09-13');
    check('객체 그대로 파싱', !!_parseCorrSessionDates(good));
    check('JSON 문자열 파싱', !!_parseCorrSessionDates(JSON.stringify(good)));
    check('null → null', _parseCorrSessionDates(null) === null);
    check('길이 11 배열 → null', _parseCorrSessionDates({ dates: good.dates.slice(0, 11) }) === null);
    check('잘못된 포맷 → null', _parseCorrSessionDates({ dates: good.dates.slice(0, 11).concat(['2026/09/24']) }) === null);
    check('깨진 JSON → null', _parseCorrSessionDates('{not json') === null);
}

console.log('\n=== 결과: ' + pass + ' PASS / ' + fail + ' FAIL ===');
process.exit(fail === 0 ? 0 : 1);
