// 합성 학생 유형(전부 지어낸 값이다 — 실제 회원·신청서가 아니다).
// 기준 시각은 가짜 브라우저의 시작 시각 2026-11-24 15:00(한국 시간, 화요일)이다.

export const LEGACY_PW = 'zz-legacy-only-pw';       // 옛 길 전용 합성 값(회원 표의 비밀번호 열). 새 길의 비밀번호와 다르다
export const AUTH_PW = 'zz-auth-only-pw';           // 새 길의 합성 비밀번호(가짜 로그인 서버만 안다)

const APP_BASE = {
    preferred_program: '내벨업챌린지 - Fast', assigned_program: null,
    preferred_start_date: '2026-11-08', schedule_start: '2026-11-08', australia_schedule_start: null,
    current_step: 5, status: 'approved', deposit_confirmed_by_admin: true,
    practice_enabled: false, correction_enabled: false, correction_start_date: null,
    enrollment_no: 1, shipping_completed_at: null, shipping_waived: false, restart_materials: null,
    self_paced: false, self_paced_weeks: null, self_paced_end_date: null, self_paced_schedule: null,
    challenge_pauses: null, correction_pauses: null, service_stops: null, app_status: null, refund_at: null,
    created_at: '2026-10-20T01:00:00+00:00',
};

function member(key, over) {
    return Object.assign({
        id: `zzb3b-m-${key}`, name: `합성학생-${key}`, email: `zzb3b_${key}@member.zz.invalid`, phone: '010-0000-0000',
        role: 'user', blocked: false, timezone: 'Asia/Seoul', nickname: null, password: LEGACY_PW,
    }, over || {});
}
function app(key, n, over) {
    return Object.assign({}, APP_BASE, { id: `zzb3b-a-${key}-${n}`, email: `zzb3b_${key}@member.zz.invalid`, user_id: `zzb3b-m-${key}` }, over || {});
}
// 학습 기록 한 줄(미확정 = locked_auth_rate null)
function rec(key, appN, n, week, day, over) {
    return Object.assign({
        id: `zzb3b-r-${key}-${n}`, user_id: `zzb3b-m-${key}`, enrollment_id: `zzb3b-a-${key}-${appN}`,
        section_type: 'reading', module_number: n, week, day,
        initial_record: null, error_note_submitted: false, completed_at: '2026-11-09T03:00:00+00:00', locked_auth_rate: null,
    }, over || {});
}
// 밀린 것·아직 마감 전인 것·이미 확정된 것이 섞인 기록(시작일 2026-11-08 기준: 1·2주차는 지남, 3주차 화요일은 오늘, 4주차는 앞날)
function mixedRecords(key, appN) {
    return [
        rec(key, appN, 1, 1, '월', { initial_record: { score: 7 }, error_note_submitted: true }),   // 100
        rec(key, appN, 2, 1, '화', { initial_record: { score: 5 } }),                                // 50
        rec(key, appN, 3, 2, '수'),                                                                  // 0
        rec(key, appN, 4, 3, '화', { initial_record: { score: 9 } }),                                // 오늘 — 아직 마감 전
        rec(key, appN, 5, 4, '금', { initial_record: { score: 9 } }),                                // 앞날
        rec(key, appN, 6, 1, '수', { initial_record: { score: 1 }, locked_auth_rate: 50 }),          // 이미 확정
        rec(key, appN, 7, 1, '목', { completed_at: null }),                                          // 끝내지 않음
    ];
}

const dates24 = (first, step) => Array.from({ length: 24 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 10, first) + i * step * 86400000);
    return d.toISOString().slice(0, 10);
});

// 유형마다: 표의 내용 + 로그인에 쓸 값 + 새 길의 계정 상태
export const STUDENTS = [
    { key: 'fast', label: '정규 Fast', tables: () => ({ users: [member('fast')], applications: [app('fast', 1)], study_results_v3: mixedRecords('fast', 1) }) },
    {
        key: 'std', label: '정규 Standard',
        tables: () => ({
            users: [member('std', { timezone: 'America/New_York', phone: null })],
            applications: [app('std', 1, { preferred_program: '내벨업챌린지 - Standard', assigned_program: '내벨업챌린지 - Standard', schedule_start: '2026-10-25', practice_enabled: true, correction_enabled: true, correction_start_date: '2026-11-20', shipping_completed_at: '2026-10-22T02:00:00+00:00', restart_materials: ['vocab'] })],
            study_results_v3: mixedRecords('std', 1),
            tr_deadline_extensions: [{ enrollment_id: 'zzb3b-a-std-1', original_date: '2026-11-10', extra_days: 2 }],
            tr_user_map: [{ user_id: 'zzb3b-m-std', email: 'zzb3b_std@member.zz.invalid', name: '옛 이름', updated_at: '2026-10-01T00:00:00.000Z' }],
        }),
    },
    {
        key: 'spold', label: '자기주도 구(기한 내)',
        tables: () => ({ users: [member('spold')], applications: [app('spold', 1, { self_paced: true, self_paced_weeks: 8 })], study_results_v3: mixedRecords('spold', 1) }),
    },
    {
        key: 'spoldx', label: '자기주도 구(기한 만료)',
        tables: () => ({ users: [member('spoldx')], applications: [app('spoldx', 1, { self_paced: true, self_paced_weeks: 1, schedule_start: '2026-10-04', preferred_start_date: '2026-10-04' })], study_results_v3: mixedRecords('spoldx', 1) }),
    },
    {
        key: 'spv2new', label: '자기주도 v2(저장표 없음)',
        tables: () => ({ users: [member('spv2new')], applications: [app('spv2new', 1, { self_paced: true, self_paced_end_date: '2026-12-20' })], study_results_v3: mixedRecords('spv2new', 1) }),
    },
    {
        key: 'spv2ok', label: '자기주도 v2(저장표 있음)',
        tables: () => ({ users: [member('spv2ok')], applications: [app('spv2ok', 1, { self_paced: true, self_paced_end_date: '2026-12-20', self_paced_schedule: JSON.stringify({ end: '2026-12-20', dates: dates24(8, 1) }) })], study_results_v3: mixedRecords('spv2ok', 1) }),
    },
    {
        key: 'spv2chg', label: '자기주도 v2(종료일 바뀜)',
        tables: () => ({ users: [member('spv2chg')], applications: [app('spv2chg', 1, { self_paced: true, self_paced_end_date: '2027-01-10', self_paced_schedule: { end: '2026-12-20', dates: dates24(8, 1) } })], study_results_v3: mixedRecords('spv2chg', 1) }),
    },
    {
        key: 'restart', label: '재시작(최신 미입금 + 과거 입금 확인)',
        tables: () => ({
            users: [member('restart')],
            applications: [
                app('restart', 1, { created_at: '2026-08-01T01:00:00+00:00', schedule_start: '2026-11-08' }),
                app('restart', 2, { created_at: '2026-11-20T01:00:00+00:00', deposit_confirmed_by_admin: false, enrollment_no: 2, schedule_start: null, preferred_start_date: '2026-12-06' }),
            ],
            study_results_v3: mixedRecords('restart', 1).concat([rec('restart', 2, 9, 1, '월', { initial_record: { score: 3 } })]),
        }),
    },
    {
        key: 'restart2', label: '재시작(둘 다 입금 확인 — 최신이 지금 수강)',
        tables: () => ({
            users: [member('restart2')],
            applications: [
                app('restart2', 1, { created_at: '2026-08-01T01:00:00+00:00', schedule_start: '2026-08-09' }),
                app('restart2', 2, { created_at: '2026-11-01T01:00:00+00:00', enrollment_no: 2, schedule_start: '2026-11-08' }),
            ],
            study_results_v3: mixedRecords('restart2', 2).concat([rec('restart2', 1, 9, 1, '월', { initial_record: { score: 3 } })]),
        }),
    },
    {
        key: 'paused', label: '정지 중',
        tables: () => ({ users: [member('paused')], applications: [app('paused', 1, { challenge_pauses: [{ status: 'open', paused_from: '2026-11-16', resume_on: null }], correction_pauses: [] })], study_results_v3: mixedRecords('paused', 1) }),
    },
    {
        key: 'refund', label: '환불·중도포기',
        tables: () => ({ users: [member('refund')], applications: [app('refund', 1, { service_stops: [{ status: 'active', target: 'both', kind: 'refunded', requested_on: '2026-11-18' }], app_status: 'refunded', refund_at: 1795000000000 })], study_results_v3: mixedRecords('refund', 1) }),
    },
    { key: 'noapp', label: '신청 없음', expect: 'no_application', tables: () => ({ users: [member('noapp')] }) },
    { key: 'unconf', label: '입금 미확인', expect: 'not_confirmed', tables: () => ({ users: [member('unconf')], applications: [app('unconf', 1, { deposit_confirmed_by_admin: false })] }) },
    { key: 'blocked', label: '차단', expect: 'blocked', member: 'blocked', tables: () => ({ users: [member('blocked', { blocked: true })], applications: [app('blocked', 1)] }) },
];

// 로그인하면 일정 화면까지 가는 유형
export const ENTERING = STUDENTS.filter((s) => !s.expect).map((s) => s.key);

export const student = (key) => STUDENTS.find((s) => s.key === key);
export const emailOf = (key) => `zzb3b_${key}@member.zz.invalid`;
export const memberIdOf = (key) => `zzb3b-m-${key}`;

// 가짜 로그인 서버의 계정(새 길)
export function authAccount(s) {
    const t = s.tables();
    const u = t.users[0];
    return {
        email: u.email, password: AUTH_PW, authId: `zzb3b-auth-${s.key}`, member: s.member || 'ok', admin: false,
        profile: { id: u.id, name: u.name, nickname: u.nickname, email: u.email, phone: u.phone, timezone: u.timezone },
    };
}

// 책 연결 주소의 일회용 표(합성)
export function bookToken(key, { confirmed }) {
    return {
        tr_auth_tokens: [{ id: `zzb3b-t-${key}`, token: `zzb3b-token-${key}`, user_id: memberIdOf(key), expires_at: '2026-11-25T00:00:00.000Z' }],
        applications: confirmed ? [Object.assign({}, APP_BASE, { id: `zzb3b-a-${key}-c`, email: emailOf(key), user_id: memberIdOf(key), application_type: 'challenge', deleted: false, withdrawn_at: null })] : [],
    };
}
