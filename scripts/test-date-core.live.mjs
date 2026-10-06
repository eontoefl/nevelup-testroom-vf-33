#!/usr/bin/env node
// test-date-core.live.mjs — 라이브 학생 데이터로 전수 비교 (읽기 전용 REST GET, 2026-10-06 일시정지 1단계)
//   실제 시작일·종료일·시간대 조합 전부에 대해 통합 전 옛 식 vs timezone-utils.js 새 함수를 비교한다.
//   한국 시간 PC에서 실행. 기대: 다른 결과 0건.
//   node scripts/test-date-core.live.mjs
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sandbox = { window: {}, console: { log() {}, warn() {}, error() {} }, sessionStorage: { getItem() { return null; } } };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'timezone-utils.js'), 'utf8'), sandbox);
const T = sandbox;
const DAY = 86400000;
if (new Date().getTimezoneOffset() !== -540) { console.error('한국 시간 PC에서 실행하세요'); process.exit(2); }

const cfg = fs.readFileSync(path.join(__dirname, '..', 'js', 'supabase-client.js'), 'utf8');
const URL_ = /['"](https:\/\/[a-z0-9]+\.supabase\.co)['"]/.exec(cfg)[1];
const KEY = /['"](eyJ[A-Za-z0-9._-]+)['"]/.exec(cfg)[1];
async function get(table, q) {
    const r = await fetch(`${URL_}/rest/v1/${table}?${q}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
    if (!r.ok) throw new Error(`${table} ${r.status} ${await r.text()}`);
    return r.json();
}
const apps = await get('applications', 'select=id,user_id,schedule_start,australia_schedule_start,self_paced,self_paced_weeks,self_paced_end_date,correction_start_date&schedule_start=not.is.null&limit=2000');
const users = await get('users', 'select=id,timezone&limit=5000');
const tzOf = {}; users.forEach(u => { tzOf[u.id] = u.timezone || 'Asia/Seoul'; });
const targets = apps.filter(a => a.schedule_start && String(a.schedule_start).trim());
console.log(`신청서 ${targets.length}건 비교`);

const oldTaskDate = (s, w, d) => { const t = new Date(s + 'T00:00:00'); t.setDate(t.getDate() + (w - 1) * 7 + d); return t; };
const oldDiffFloor = (s, today) => Math.floor((today - new Date(s + 'T00:00:00')) / DAY);
const oldDplus = (s, today) => { const x = new Date(s); x.setHours(0, 0, 0, 0); return Math.floor((today - x) / DAY); };
const oldDaysUntil = (s, eff) => { const x = new Date(s); x.setHours(0, 0, 0, 0); return Math.ceil((x - eff) / DAY); };
const oldSelfPacedLast = (s, weeks) => { const l = new Date(s + 'T00:00:00'); l.setDate(l.getDate() + weeks * 7); return l; };
const oldD = (s, e) => Math.floor((new Date(e + 'T00:00:00') - new Date(s + 'T00:00:00')) / DAY) + 1;
const oldCorrActive = (ymd) => { const x = new Date(ymd); x.setDate(x.getDate() - 1); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };

const diffs = []; let checks = 0;
const eq = (a, b) => (a == null && b == null) || (a != null && b != null && (a.getTime ? a.getTime() === b.getTime() : a === b));
const cmp = (label, a, o, n) => { checks++; if (!eq(o, n)) diffs.push({ label, app: a.id, old: o && o.toString ? o.toString() : o, new: n && n.toString ? n.toString() : n }); };

const todays = []; for (let i = -14; i <= 70; i++) { const d = new Date(2026, 8, 6); d.setDate(d.getDate() + i); todays.push(d); }
for (const a of targets) {
    const tz = tzOf[a.user_id] || 'Asia/Seoul';
    for (const s of [a.schedule_start, a.australia_schedule_start].filter(Boolean)) {
        for (let w = 1; w <= 8; w++) for (let d = 0; d <= 6; d++) {
            cmp(`task w${w}d${d}`, a, oldTaskDate(s, w, d), T.getChallengeTaskDate(s, w, d));
            cmp(`deadline w${w}d${d} ${tz}`, a, T.getTaskDeadline(oldTaskDate(s, w, d), tz), T.getChallengeTaskDeadline(s, w, d, null, tz));
        }
        for (const t of todays) {
            cmp('diffDays', a, oldDiffFloor(s, t), T.getChallengeDayPosition(s, t).diffDays);
            cmp('dplus', a, oldDplus(s, t), T.diffDaysLocal(s, t));
            cmp('daysUntil', a, oldDaysUntil(s, t), T.diffDaysLocal(t, s));
        }
    }
    if (a.self_paced && a.self_paced_end_date) cmp('selfPacedDays', a, oldD(a.schedule_start, a.self_paced_end_date), T.getSelfPacedSchedule({ selfPaced: true, startDate: a.schedule_start, selfPacedEndDate: a.self_paced_end_date }).days);
    if (a.self_paced && !a.self_paced_end_date && a.self_paced_weeks) cmp('selfPacedLast', a, oldSelfPacedLast(a.schedule_start, a.self_paced_weeks), T.getSelfPacedDeadlineDay({ selfPaced: true, startDate: a.schedule_start, selfPacedWeeks: a.self_paced_weeks }));
    if (a.correction_start_date && /^\d{4}-\d{2}-\d{2}/.test(a.correction_start_date)) cmp('corrActiveStart', a, oldCorrActive(a.correction_start_date), T.addDaysYmd(a.correction_start_date, -1));
}
console.log(`비교 ${checks.toLocaleString()}건, 다른 결과 ${diffs.length}건`);
if (diffs.length) { console.table(diffs.slice(0, 40)); process.exit(1); }
console.log('PASS — 통합 전후 전체 학생 날짜 동일');
