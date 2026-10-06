/**
 * test-pause-core.js — 일시정지 보정·판정 검증 (2026-10-06, 일시정지 2단계)
 *
 *   node scripts/test-pause-core.js
 *
 * 1) timezone-utils.js: normalizePauses / pauseAdjustedYmd / pausedDaysUntil / getChallengeTaskDate·Ymd·Deadline / getChallengeDayPosition
 * 2) supabase-client.js: getActivePauseOn / isChallengePausedNow / isCorrectionPausedNow / refreshPauseState(모의 fetch) / submitCorrectionDraft 가드
 * 3) correction-session.js: getCorrSessionDate 정지 보정(시작일+오프셋만, 확정표는 그대로)
 * 4) 공홈 js/supabase-config.js의 pauseAdjustedYmd / getActivePause와 같은 답인지 (한 규칙, 두 구현)
 *
 * 정지 이력이 없으면 1단계 결과(옛 식)와 완전히 같아야 한다.
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HOME = 'C:/Users/user/orca/workspaces/eontoefl_official_website_9v7g/main-2';   // 공홈 작업 사본(브랜치 일시정지-2단계)

// ── 샌드박스: index.html 로드 순서대로 supabase-client → timezone-utils → correction-session ──
const fetchLog = [];
let fetchReply = () => [];
const sandbox = {
    window: {}, console: { log() {}, warn() {}, error() {} },
    sessionStorage: { _s: {}, getItem(k) { return this._s[k] || null; }, setItem(k, v) { this._s[k] = v; } },
    localStorage: { getItem() { return null; }, setItem() {} },
    fetch: async (url, opts) => { fetchLog.push(url); const data = fetchReply(url); return { ok: true, status: 200, headers: { get: (k) => (k === 'content-type' ? 'application/json' : null) }, json: async () => data, text: async () => JSON.stringify(data) }; }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'supabase-client.js'), 'utf8'), sandbox, { filename: 'supabase-client.js' });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'timezone-utils.js'), 'utf8'), sandbox, { filename: 'timezone-utils.js' });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'correction', 'correction-session.js'), 'utf8'), sandbox, { filename: 'correction-session.js' });
const T = sandbox;

// 공홈 단일 출처(비교용)
const homeCtx = { console: { log() {}, warn() {}, error() {} }, fetch: () => {}, window: {}, document: {}, localStorage: { getItem: () => null, setItem: () => {} } };
vm.createContext(homeCtx);
vm.runInContext(fs.readFileSync(path.join(HOME, 'js', 'supabase-config.js'), 'utf8'), homeCtx, { filename: 'supabase-config.js' });
const H = homeCtx;

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ ' + name + (detail ? '  → ' + detail : '')); }
}
const ymd = (d) => T.fmtYmd(d);
const L = (s) => T.parseYmdLocal(s);

// 2026-09-06(일) 시작. 9/23(수)부터 정지, 10/14(수) 재개(3주=21일)
const P_FIXED = [{ id: 'a', paused_from: '2026-09-23', resume_on: '2026-10-14', shift_days: 21, status: 'open' }];
const P_OPEN = [{ id: 'b', paused_from: '2026-09-23', resume_on: null, shift_days: null, status: 'open' }];
const P_CANCEL = [{ id: 'c', paused_from: '2026-09-23', resume_on: '2026-10-14', shift_days: 21, status: 'canceled' }];
const P_RESUMED = [{ id: 'd', paused_from: '2026-09-23', resume_on: '2026-10-14', shift_days: 21, status: 'resumed' }];
const P_TWO = [
    { id: 'e', paused_from: '2026-09-23', resume_on: '2026-09-30', shift_days: 7, status: 'resumed' },
    { id: 'f', paused_from: '2026-10-11', resume_on: '2026-10-25', shift_days: 14, status: 'open' }
];
const START = '2026-09-06';

console.log('[1] normalizePauses');
check('없음/빈/문자열 "[]" → []', [undefined, null, [], '[]', 'x'].every(p => T.normalizePauses(p).length === 0));
check('JSON 문자열 파싱', T.normalizePauses(JSON.stringify(P_FIXED)).length === 1);
check('paused_from 없는 항목 제외', T.normalizePauses([{ status: 'open' }, P_FIXED[0]]).length === 1);

console.log('[2] pauseAdjustedYmd — 정지 전 불변, 이후 +shift, 무기한 null, 취소 무시, 복수 누적');
check('이력 없음 → 그대로', T.pauseAdjustedYmd('2026-09-23', []) === '2026-09-23' && T.pauseAdjustedYmd('2026-09-23', undefined) === '2026-09-23');
check('정지 전날 그대로', T.pauseAdjustedYmd('2026-09-22', P_FIXED) === '2026-09-22');
check('정지 당일 +21', T.pauseAdjustedYmd('2026-09-23', P_FIXED) === '2026-10-14');
check('정지 후 과제 +21', T.pauseAdjustedYmd('2026-10-03', P_FIXED) === '2026-10-24');
check('resumed도 같은 보정', T.pauseAdjustedYmd('2026-09-23', P_RESUMED) === '2026-10-14');
check('무기한: 정지 전 그대로, 이후 null', T.pauseAdjustedYmd('2026-09-22', P_OPEN) === '2026-09-22' && T.pauseAdjustedYmd('2026-09-23', P_OPEN) === null);
check('취소는 무시', T.pauseAdjustedYmd('2026-09-23', P_CANCEL) === '2026-09-23');
check('두 번 정지: 9/23 → +7 → 9/30(≥10/11 아님) = 9/30', T.pauseAdjustedYmd('2026-09-23', P_TWO) === '2026-09-30');
check('두 번 정지: 10/05 → +7 = 10/12 ≥ 10/11 → +14 = 10/26', T.pauseAdjustedYmd('2026-10-05', P_TWO) === '2026-10-26');
check('null/빈 ymd → 그대로', T.pauseAdjustedYmd(null, P_FIXED) === null && T.pauseAdjustedYmd('', P_FIXED) === '');

console.log('[3] pausedDaysUntil — 경과일에서 뺄 정지 일수');
check('이력 없음 0', T.pausedDaysUntil([], '2026-10-20') === 0);
check('정지 전 0', T.pausedDaysUntil(P_FIXED, '2026-09-22') === 0);
check('정지 당일 0', T.pausedDaysUntil(P_FIXED, '2026-09-23') === 0);
check('정지 중 5일째 → 5', T.pausedDaysUntil(P_FIXED, '2026-09-28') === 5);
check('재개 후 → 21(상한)', T.pausedDaysUntil(P_FIXED, '2026-10-20') === 21);
check('무기한 정지 중 → 경과일 전부', T.pausedDaysUntil(P_OPEN, '2026-10-20') === 27);
check('취소 0', T.pausedDaysUntil(P_CANCEL, '2026-10-20') === 0);
check('두 번 정지 10/20 → 7 + 9 = 16', T.pausedDaysUntil(P_TWO, '2026-10-20') === 16);

console.log('[4] getChallengeTaskDate/Ymd/Deadline — pauses 인자');
check('pauses 없으면 1단계 결과(3주차 수요일 = 9/23)', T.getChallengeTaskYmd(START, 3, 3) === '2026-09-23' && T.getChallengeTaskYmd(START, 3, 3, []) === '2026-09-23');
check('정지 당일 과제 → 재개 주 수요일 10/14', T.getChallengeTaskYmd(START, 3, 3, P_FIXED) === '2026-10-14');
check('정지 전 과제(3주차 화) 그대로 9/22', T.getChallengeTaskYmd(START, 3, 2, P_FIXED) === '2026-09-22');
check('무기한 → Date null, Ymd null', T.getChallengeTaskDate(START, 3, 3, P_OPEN) === null && T.getChallengeTaskYmd(START, 3, 3, P_OPEN) === null);
check('요일 보존(21일 = 7의 배수)', T.getChallengeTaskDate(START, 3, 3, P_FIXED).getDay() === L('2026-09-23').getDay());
const dlNo = T.getChallengeTaskDeadline(START, 3, 3, [], 'Asia/Seoul');
const dlP = T.getChallengeTaskDeadline(START, 3, 3, [], 'Asia/Seoul', P_FIXED);
check('마감도 +21일 (다음날 04:00 유지)', dlP && dlNo && (dlP.getTime() - dlNo.getTime()) === 21 * 86400000);
check('무기한 → 마감 null', T.getChallengeTaskDeadline(START, 3, 3, [], 'Asia/Seoul', P_OPEN) === null);
check('연장(original_date = 보정된 날짜)과 합산', (() => {
    const ext = [{ original_date: '2026-10-14', extra_days: 2 }];
    const d = T.getChallengeTaskDeadline(START, 3, 3, ext, 'Asia/Seoul', P_FIXED);
    return d && (d.getTime() - dlP.getTime()) === 2 * 86400000;
})());

console.log('[5] getChallengeDayPosition — 정지 일수 차감');
check('pauses 없음: 10/20 = 44일째 → 7주차 목(4)', (() => { const p = T.getChallengeDayPosition(START, L('2026-10-20')); return p.diffDays === 44 && p.weekNum === 7 && p.dayIndex === 2; })());
check('재개 후 10/20: 44−21 = 23 → 4주차 화(2)', (() => { const p = T.getChallengeDayPosition(START, L('2026-10-20'), P_FIXED); return p.diffDays === 23 && p.weekNum === 4 && p.dayIndex === 2; })());
check('재개일 10/14 = 정지 당일 위치(17 → 3주차 수(3))', (() => { const p = T.getChallengeDayPosition(START, L('2026-10-14'), P_FIXED); return p.diffDays === 17 && p.weekNum === 3 && p.dayIndex === 3; })());
check('정지 중 9/28: 17(멈춤)', T.getChallengeDayPosition(START, L('2026-09-28'), P_FIXED).diffDays === 17);
check('오늘을 Date로 줘도 됨(ymd 문자열 변환)', T.getChallengeDayPosition(START, '2026-10-20', P_FIXED).diffDays === 23);

console.log('[6] supabase-client: getActivePauseOn / isChallengePausedNow / isCorrectionPausedNow');
check('정지 전날 null', T.getActivePauseOn(P_FIXED, '2026-09-22') === null);
check('정지 당일부터', !!T.getActivePauseOn(P_FIXED, '2026-09-23'));
check('재개 전날까지', !!T.getActivePauseOn(P_FIXED, '2026-10-13'));
check('재개일부터 아님', T.getActivePauseOn(P_FIXED, '2026-10-14') === null);
check('무기한은 계속', !!T.getActivePauseOn(P_OPEN, '2026-12-31'));
check('resumed/canceled는 정지 아님', T.getActivePauseOn(P_RESUMED, '2026-09-30') === null && T.getActivePauseOn(P_CANCEL, '2026-09-30') === null);
check('문자열 JSON도 판정', !!T.getActivePauseOn(JSON.stringify(P_FIXED), '2026-09-30'));
const todayYmd = T.fmtYmd(T.getEffectiveToday('Asia/Seoul'));
const nowPause = [{ id: 'n', paused_from: T.addDaysYmd(todayYmd, -1), resume_on: T.addDaysYmd(todayYmd, 6), shift_days: 7, status: 'open' }];
const pastPause = [{ id: 'p', paused_from: T.addDaysYmd(todayYmd, -14), resume_on: T.addDaysYmd(todayYmd, -7), shift_days: 7, status: 'resumed' }];
check('isChallengePausedNow(user) 오늘 기준(새벽 4시 규칙)', T.isChallengePausedNow({ challengePauses: nowPause, timezone: 'Asia/Seoul' }) === true && T.isChallengePausedNow({ challengePauses: pastPause }) === false && T.isChallengePausedNow({ challengePauses: P_CANCEL }) === false);
check('isCorrectionPausedNow는 correctionPauses만 본다', T.isCorrectionPausedNow({ challengePauses: nowPause, correctionPauses: [] }) === false && T.isCorrectionPausedNow({ correctionPauses: nowPause }) === true);
check('user 없고 로그인도 없으면 false', T.isChallengePausedNow(null) === false);

console.log('[7] refreshPauseState — DB 재조회로 user 갱신 (모의 fetch)');
(async () => {
    fetchReply = (url) => url.includes('/applications?') ? [{ schedule_start: '2026-09-13', australia_schedule_start: null, correction_enabled: true, correction_start_date: '2026-09-13', challenge_pauses: P_FIXED, correction_pauses: P_OPEN, self_paced_end_date: null, self_paced_schedule: null }] : [];
    const u = { id: 'u1', applicationId: 42, startDate: '2026-09-06', challengePauses: [], correctionPauses: [], timezone: 'Asia/Seoul' };
    const r = await T.refreshPauseState(u);
    check('applications를 id로 조회', fetchLog.some(x => x.includes('applications?id=eq.42') && x.includes('challenge_pauses')));
    check('startDate·정지 이력 2종 갱신', r.startDate === '2026-09-13' && r.challengePauses.length === 1 && r.correctionPauses.length === 1 && r.correctionPauses[0].resume_on === null);
    check('sessionStorage에도 저장', JSON.parse(sandbox.sessionStorage.getItem('currentUser')).startDate === '2026-09-13');
    check('applicationId 없으면 그대로', (await T.refreshPauseState({ id: 'x' })).id === 'x');
    fetchReply = () => [];
    const r2 = await T.refreshPauseState({ id: 'u2', applicationId: 43, startDate: '2026-09-06' });
    check('행 없으면 기존 값 유지', r2.startDate === '2026-09-06');

    console.log('[8] submitCorrectionDraft — 정지 중 1차 차단, 2차 허용');
    T.currentUser = { id: 'u1', correctionPauses: nowPause, timezone: 'Asia/Seoul' };
    sandbox.getCurrentUser = () => T.currentUser;
    const r1 = await T.submitCorrectionDraft({ round: 1, userId: 'u1' });
    check('1차 → {ok:false, reason:"paused"}, DB 호출 없음', r1 && r1.ok === false && r1.reason === 'paused');
    const before = fetchLog.length;
    fetchReply = () => [];
    let r2nd = null;
    try { r2nd = await T.submitCorrectionDraft({ round: 2, userId: 'u1', sessionNumber: 1, taskType: 'email', submissionId: 'row-1', fields: { draft_2: 'x' } }); } catch (e) { r2nd = 'threw:' + e.message; }
    check('2차는 가드를 지나 DB 경로로 감(fetch 호출됨)', fetchLog.length > before, String(r2nd));

    console.log('[9] correction-session getCorrSessionDate — 시작일+오프셋만 보정, 확정표는 그대로');
    const S = { start_date: '2026-09-06', duration_weeks: 4 };
    const s1 = { session: 1, phase: 1, dayOffset: 0 }, s7 = { session: 7, phase: 1, dayOffset: 14 }, s12 = { session: 12, phase: 1, dayOffset: 25 };
    check('pauses 없음 = 1단계(세션7 = 9/20)', ymd(T.getCorrSessionDate(S, s7)) === '2026-09-20');
    check('세션7(9/20, 정지 전) 그대로', ymd(T.getCorrSessionDate(S, s7, P_FIXED)) === '2026-09-20');
    check('세션12(10/01, 정지 후) +21 = 10/22', ymd(T.getCorrSessionDate(S, s12, P_FIXED)) === '2026-10-22');
    check('scheduleData.correction_pauses로도 보정', ymd(T.getCorrSessionDate(Object.assign({ correction_pauses: P_FIXED }, S), s12)) === '2026-10-22');
    check('인자 없으면 로그인 사용자 correctionPauses', (() => { T.currentUser = { correctionPauses: P_FIXED }; const v = ymd(T.getCorrSessionDate(S, s12)); T.currentUser = null; return v === '2026-10-22'; })());
    check('무기한 → null', T.getCorrSessionDate(S, s12, P_OPEN) === null);
    const dates = []; for (let i = 0; i < 12; i++) dates.push(T.addDaysYmd('2026-09-06', i * 3));
    const SP = { start_date: '2026-09-06', end_date: dates[11], session_dates: JSON.stringify({ start: '2026-09-06', end: dates[11], dates }) };
    check('자기주도 확정표는 보정 안 함(서버가 밀어 둠)', ymd(T.getCorrSessionDate(SP, s12, P_FIXED)) === dates[11]);

    console.log('[10] 공홈 supabase-config.js와 같은 답 (한 규칙, 두 구현)');
    const cases = ['2026-09-01', '2026-09-22', '2026-09-23', '2026-09-30', '2026-10-05', '2026-10-11', '2026-10-13', '2026-10-14', '2026-11-30'];
    let same = 0, diffs = [];
    for (const P of [[], P_FIXED, P_OPEN, P_CANCEL, P_RESUMED, P_TWO]) {
        for (const c of cases) {
            const a = T.pauseAdjustedYmd(c, P), b = H.pauseAdjustedYmd({ challenge_pauses: P }, 'challenge', c);
            if (a === b) same++; else diffs.push(c + ':' + a + '≠' + b);
            const x = !!T.getActivePauseOn(P, c), y = !!H.getActivePause({ challenge_pauses: P }, 'challenge', c);
            if (x === y) same++; else diffs.push('active ' + c + ':' + x + '≠' + y);
        }
    }
    check('pauseAdjustedYmd·정지 판정 ' + same + '건 일치', diffs.length === 0, diffs.join(', '));
    let sameDays = 0, dd = [];
    for (const P of [[], P_FIXED, P_OPEN, P_TWO]) for (const c of cases) {
        const a = T.pausedDaysUntil(P, c), b = H.getPausedDaysUntil({ challenge_pauses: P }, 'challenge', c);
        if (a === b) sameDays++; else dd.push(c + ':' + a + '≠' + b);
    }
    check('pausedDaysUntil ' + sameDays + '건 일치', dd.length === 0, dd.join(', '));

    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
