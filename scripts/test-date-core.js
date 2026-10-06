/**
 * test-date-core.js — 일정 계산 단일 출처(timezone-utils.js) 검증 (2026-10-06, 일시정지 1단계)
 *
 *   node scripts/test-date-core.js
 *
 * 통합 전 각 화면이 쓰던 "옛 식"을 그대로 옮겨 적고 새 함수와 결과를 비교한다.
 *   - 한국 시간(Asia/Seoul) PC: 옛 식 == 새 함수 (동작 변경 0)
 *   - 승인된 버그 수정 2개는 따로 표시한다: ② new Date('YYYY-MM-DD') 파싱(미주 시간대에서 하루 밀림),
 *     ③ ms÷86400000 floor 계산(서머타임 전환일에 하루 덜 셈). 이 PC(node가 TZ 환경변수 무시)에서는 재현되지 않으므로
 *     "달력 산술 == UTC 날짜 성분 산술"로 새 함수의 서머타임 안전성을 확인한다.
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const sandbox = { window: {}, console: { log() {}, warn() {}, error() {} }, sessionStorage: { getItem() { return null; } } };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'timezone-utils.js'), 'utf8'), sandbox);
const T = sandbox;

const DAY = 86400000;
const offsetMin = -new Date().getTimezoneOffset();
const isKST = offsetMin === 540;
console.log('실행 시간대 offset ' + offsetMin + '분 → ' + (isKST ? 'Asia/Seoul' : '비-KST(옛 식 비교는 참고용)'));

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ ' + name + (detail ? '  → ' + detail : '')); }
}
const eq = (a, b) => (a == null && b == null) || (a != null && b != null && a.getTime ? a.getTime() === b.getTime() : a === b);

// ───── 옛 식 ─────
const oldTaskDate = (startYmd, w, d) => { const s = new Date(startYmd + 'T00:00:00'); const t = new Date(s); t.setDate(t.getDate() + (w - 1) * 7 + d); return t; };   // main/task-router/auth/mypage 공통
const oldDiffFloor = (startYmd, today) => Math.floor((today - new Date(startYmd + 'T00:00:00')) / DAY);            // mypage renderTodayTasks(③ 대상)
const oldDplusUtcParse = (startYmd, today) => { const s = new Date(startYmd); s.setHours(0, 0, 0, 0); return Math.floor((today - s) / DAY); }; // mypage renderSummaryCards(②③ 대상)
const oldDaysUntil = (startYmd, eff) => { const s = new Date(startYmd); s.setHours(0, 0, 0, 0); return Math.ceil((s - eff) / DAY); };       // mypage getDaysUntilStart(②③ 대상)
const oldDayNumDeadline = (startYmd, dayNum, tz) => { const z = dayNum - 1; const t = new Date(new Date(startYmd + 'T00:00:00')); t.setDate(t.getDate() + Math.floor(z / 6) * 7 + (z % 6)); return T.getTaskDeadline(t, tz); };
const oldExtMapDiff = (startYmd, origYmd) => Math.round((new Date(origYmd + 'T00:00:00') - new Date(startYmd + 'T00:00:00')) / DAY);
const oldCorrAdd = (ymd, n) => { const d = new Date(ymd + 'T00:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const oldCorrDiff = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / DAY);
const oldSelfPacedLast = (startYmd, weeks) => { const s = new Date(startYmd + 'T00:00:00'); const l = new Date(s); l.setDate(l.getDate() + weeks * 7); return l; };
const oldToeflDeadline = (startYmd, days) => { const d = new Date(startYmd + 'T00:00:00'); d.setDate(d.getDate() + days); return d; };
const oldCorrActiveStartStr = (ymd) => { const s = new Date(ymd); s.setDate(s.getDate() - 1); return s.getFullYear() + '-' + String(s.getMonth() + 1).padStart(2, '0') + '-' + String(s.getDate()).padStart(2, '0'); };

const starts = ['2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-02-28', '2026-12-28', '2027-01-01', '2026-10-25', '2026-03-29'];
const tzs = ['Asia/Seoul', 'Australia/Sydney', 'America/New_York', 'Europe/London'];
const todays = []; for (let i = -10; i <= 70; i++) { const d = new Date(2026, 8, 6); d.setDate(d.getDate() + i); todays.push(d); }

console.log('\n[1] 기본 도구');
check('parseYmdLocal == new Date(ymd+"T00:00:00")', starts.every(s => eq(T.parseYmdLocal(s), new Date(s + 'T00:00:00'))));
check('parseYmdLocal(빈값/형식오류) → null', T.parseYmdLocal('') === null && T.parseYmdLocal(null) === null && T.parseYmdLocal('abc') === null);
check('fmtYmd ∘ parseYmdLocal 왕복', starts.every(s => T.fmtYmd(T.parseYmdLocal(s)) === s));
check('addDaysYmd == 옛 _corrAddDaysYmd', starts.every(s => [-7, -1, 0, 1, 25, 27, 56, 365].every(n => T.addDaysYmd(s, n) === oldCorrAdd(s, n))));
check('diffDaysLocal == 옛 _corrDaysDiff(round)', starts.every(a => starts.every(b => T.diffDaysLocal(a, b) === oldCorrDiff(a, b))));
check('diffDaysLocal: 서머타임 전환 구간(시드니 2026-10-04)도 달력 일수', T.diffDaysLocal('2026-10-03', '2026-10-05') === 2 && T.diffDaysLocal('2026-03-28', '2026-03-30') === 2);

console.log('\n[2] 내챌 과제 날짜·마감 (main.js / task-router.js / auth.js / mypage.js / mypage-australia.js 옛 식)');
check('getChallengeTaskDate == 옛 setDate 식 (주1~8 × 요일0~6)', starts.every(s => { for (let w = 1; w <= 8; w++) for (let d = 0; d <= 6; d++) if (!eq(T.getChallengeTaskDate(s, w, d), oldTaskDate(s, w, d))) return false; return true; }));
check('getChallengeTaskDate(시작일 없음/형식오류) → null', T.getChallengeTaskDate('', 1, 0) === null && T.getChallengeTaskDate('x', 1, 0) === null);
check('getChallengeTaskDeadline(연장 없음) == getTaskDeadline(옛 날짜) (시간대 4종)', starts.every(s => tzs.every(tz => { for (let w = 1; w <= 8; w++) for (let d = 0; d <= 6; d++) if (!eq(T.getChallengeTaskDeadline(s, w, d, null, tz), T.getTaskDeadline(oldTaskDate(s, w, d), tz))) return false; return true; })));
check('getChallengeTaskDeadline(연장 +2일) == 옛 마감 + 2×24h', (() => { const s = '2026-09-06'; const ymd = T.getChallengeTaskYmd(s, 2, 3); const exts = [{ original_date: ymd, extra_days: 2 }]; return tzs.every(tz => eq(T.getChallengeTaskDeadline(s, 2, 3, exts, tz), new Date(T.getTaskDeadline(oldTaskDate(s, 2, 3), tz).getTime() + 2 * DAY))); })());
check('getChallengeTaskDeadline(연장 original_date 불일치) == 연장 없음', eq(T.getChallengeTaskDeadline('2026-09-06', 2, 3, [{ original_date: '2000-01-01', extra_days: 9 }], 'Asia/Seoul'), T.getChallengeTaskDeadline('2026-09-06', 2, 3, null, 'Asia/Seoul')));
check('mypage getDeadlineForDayNum 옛 식(dayNum 1~48) == getChallengeTaskDeadline(주, 요일)', starts.every(s => { for (let n = 1; n <= 48; n++) { const z = n - 1; if (!eq(T.getChallengeTaskDeadline(s, Math.floor(z / 6) + 1, z % 6, null, 'Asia/Seoul'), oldDayNumDeadline(s, n, 'Asia/Seoul'))) return false; } return true; }));

console.log('\n[3] 오늘 위치·경과일 (mypage renderTodayTasks / renderSummaryCards / getDaysUntilStart 옛 식)');
check('getChallengeDayPosition.diffDays == 옛 floor 식 (KST, 오늘 81일×시작 12종)', !isKST || starts.every(s => todays.every(t => T.getChallengeDayPosition(s, t).diffDays === oldDiffFloor(s, t))));
check('weekNum/dayIndex == 옛 식(floor/7+1, %7) (오늘 ≥ 시작)', starts.every(s => todays.every(t => { const diff = oldDiffFloor(s, t); if (diff < 0) return true; const p = T.getChallengeDayPosition(s, t); return p.weekNum === Math.floor(diff / 7) + 1 && p.dayIndex === diff % 7; })));
check('D+(renderSummaryCards) == 옛 식 (KST에서는 UTC 파싱 버그가 드러나지 않음 — ② 수정 대상)', !isKST || starts.every(s => todays.every(t => T.diffDaysLocal(s, t) === oldDplusUtcParse(s, t))));
check('getDaysUntilStart == 옛 ceil 식 (KST)', !isKST || starts.every(s => todays.every(t => T.diffDaysLocal(t, s) === oldDaysUntil(s, t))));
check('buildExtendedDeadlineMap 역산 == 옛 round 식', starts.every(s => [0, 1, 6, 7, 13, 27].every(n => T.diffDaysLocal(s, T.addDaysYmd(s, n)) === oldExtMapDiff(s, T.addDaysYmd(s, n)))));

console.log('\n[4] 자기주도·첨삭·토플·첨삭 탭 판정');
check('getSelfPacedDeadlineDay(v1) == 옛 시작+N주', [1, 2, 4, 8].every(w => starts.every(s => eq(T.getSelfPacedDeadlineDay({ selfPaced: true, startDate: s, selfPacedWeeks: w }), oldSelfPacedLast(s, w)))));
check('getSelfPacedDeadlineDay(v2) == 종료일, 정보 부족 → null', eq(T.getSelfPacedDeadlineDay({ selfPaced: true, startDate: '2026-09-06', selfPacedEndDate: '2026-10-10' }), new Date('2026-10-10T00:00:00')) && T.getSelfPacedDeadlineDay({ selfPaced: true, startDate: '2026-09-06' }) === null);
check('getSelfPacedSchedule(v2 실시간) 일수 D == 옛 floor 식', (() => { const u = { selfPaced: true, startDate: '2026-09-06', selfPacedEndDate: '2026-10-25' }; const sch = T.getSelfPacedSchedule(u); return sch.days === Math.floor((new Date('2026-10-25T00:00:00') - new Date('2026-09-06T00:00:00')) / DAY) + 1 && sch.dates.length === 24; })());
check('buildMaterializedSelfPacedSchedule 첫 생성 24개·마지막 세트 ≤ 종료일', (() => { const u = { selfPaced: true, startDate: '2026-09-06', selfPacedEndDate: '2026-10-25' }; const b = T.buildMaterializedSelfPacedSchedule(u, null, new Date(2026, 8, 6)); return b.dates.length === 24 && b.dates[23] <= '2026-10-25' && b.end === '2026-10-25'; })());
check('toefl 등록 마감(시작+28/42) == 옛 식', starts.every(s => [28, 42].every(n => eq(T.addDaysLocal(T.parseYmdLocal(s), n), oldToeflDeadline(s, n)))));
check('첨삭 탭 D-1 문자열 == 옛 식 (KST)', !isKST || starts.every(s => T.addDaysYmd(s, -1) === oldCorrActiveStartStr(s)));

console.log('\n' + pass + ' passed' + (fail ? ', ' + fail + ' FAILED' : ''));
process.exit(fail ? 1 : 0);
