// 합성 입력과 가짜 응답. 전부 지어낸 값이며 실제 학생·회원 자료가 아니다.
// args 는 호출할 때마다 새로 만든다(변경 전·후가 같은 입력을 받도록).

import { FIXED_NOW } from './harness.mjs';

// ---------------------------------------------------------------------------
// 가짜 응답
// ---------------------------------------------------------------------------
const JSON_TYPE = { 'Content-Type': 'application/json' };

const richRow = {
    id: 'row-1', name: '가나다', email: 'student+tag@example.com', phone: '010-0000-0000', role: 'student',
    blocked: false, timezone: 'Asia/Seoul', password: 'pw-1234',
    preferred_program: '내벨업챌린지 - Fast', assigned_program: null, preferred_start_date: '2026-11-01',
    schedule_start: '2026-11-02', australia_schedule_start: null, current_step: 3, status: 'draft1_submitted',
    deposit_confirmed_by_admin: true, practice_enabled: true, correction_enabled: true, correction_start_date: '2026-11-09',
    enrollment_no: 2, shipping_completed_at: '2026-11-03T01:00:00Z', shipping_waived: false, restart_materials: ['vocab'],
    self_paced: true, self_paced_weeks: 6, self_paced_end_date: '2026-12-31', self_paced_schedule: { w1: ['a', 'b'] },
    challenge_pauses: [{ paused_from: '2026-11-10', resume_on: null, shift_days: 0, status: 'open' }],
    correction_pauses: '[{"paused_from":"2026-11-12","status":"resumed"}]',
    service_stops: [], app_status: null, refund_at: null,
    original_date: '2026-11-20', extra_days: 2,
    enrollment_id: 'app-1', section_type: 'reading', module_number: 1, week: 1, day: '월', practice_number: null,
    initial_record: null, first: { fillblanks_set13: 1, daily1_set13: 1 }, retake: null,
    session_number: 1, task_type: 'writing_email', task_number: 2, extended_hours: 24,
    created_at: '2026-11-22T00:00:00Z', draft_round: 1,
    draft_1_submitted_at: new Date(FIXED_NOW - 30 * 1000).toISOString(), draft_2_submitted_at: null, start_date: '2026-11-09',
};

const otherRow = {
    id: 'row-2', name: '라 & 마', email: 'other@example.com', role: 'student', blocked: true, timezone: null, password: '다른 비밀번호',
    preferred_program: '내벨업챌린지 - Standard', assigned_program: '내벨업챌린지 - Standard', schedule_start: null,
    preferred_start_date: '2026-10-05', deposit_confirmed_by_admin: false, practice_enabled: false, correction_enabled: false,
    self_paced: false, challenge_pauses: null, correction_pauses: 'JSON 아님',
    service_stops: [{ kind: 'refund', target: 'both', requested_on: '2026-11-15', status: 'active' }], app_status: 'refunded', refund_at: 1763000000000,
    original_date: '2026-11-21', extra_days: 1,
    enrollment_id: 'other-app', section_type: 'listening', module_number: 2, week: '2', day: '화', practice_number: 3,
    initial_record: { done: 1 }, first: null, retake: { daily2_set7: 1 },
    session_number: 2, task_type: 'speaking_interview', task_number: 1, extended_hours: 12,
    created_at: null, draft_round: null, status: 'draft2_submitted',
    draft_1_submitted_at: '2026-11-01T00:00:00Z', draft_2_submitted_at: new Date(FIXED_NOW - 10 * 1000).toISOString(),
};

const R = {
    rows: { status: 200, body: JSON.stringify([richRow, otherRow]), headers: JSON_TYPE },
    rowsOtherFirst: { status: 200, body: JSON.stringify([otherRow, richRow]), headers: JSON_TYPE },
    object: { status: 200, body: JSON.stringify({ ok: true, id: 'obj-1', message: '본문 안의 message' }), headers: JSON_TYPE },
    empty: { status: 200, body: '[]', headers: JSON_TYPE },
    jsonNull: { status: 200, body: 'null', headers: JSON_TYPE },
    created: { status: 201, body: JSON.stringify([richRow]), headers: { 'Content-Type': 'application/json; charset=utf-8' } },
    noContent: { status: 204, body: null },
    text: { status: 200, body: 'OK 처리됨', headers: { 'Content-Type': 'text/plain' } },
    bare: { status: 200, body: null },
    badJson: { status: 200, body: '{깨진 JSON', headers: JSON_TYPE },
    e400: { status: 400, body: JSON.stringify({ message: '중복된 값 & 오류', code: '23505' }), headers: JSON_TYPE },
    e401: { status: 401, body: JSON.stringify({ message: 'JWT expired' }), headers: JSON_TYPE },
    e404: { status: 404, body: '<html>Not Found</html>', headers: { 'Content-Type': 'text/html' } },
    e409: { status: 409, body: null },
    e500: { status: 500, body: JSON.stringify({ message: '서버 오류' }), headers: JSON_TYPE },
    netType: { reject: 'TypeError', message: 'Failed to fetch' },
    netString: { reject: 'string', message: '오프라인 & 끊김' },
};

const uniform = (name, desc, extra) => ({ name, respond: () => desc, status: desc.status, body: desc.body, ...extra });

// 호출 안의 모든 요청에 같은 응답을 주는 17종
export const uniformResponses = [
    uniform('정상 JSON 배열', R.rows, { kind: 'json', uploadOk: true }),
    uniform('정상 JSON 배열(다른 행 먼저)', R.rowsOtherFirst, { kind: 'json', uploadOk: true }),
    uniform('정상 JSON 객체', R.object, { kind: 'json', uploadOk: true }),
    uniform('정상 JSON 빈 배열', R.empty, { kind: 'json', uploadOk: true }),
    uniform('정상 JSON null', R.jsonNull, { kind: 'json', uploadOk: true }),
    uniform('201 JSON(charset 붙음)', R.created, { kind: 'json', uploadOk: true }),
    uniform('204 빈 응답', R.noContent, { kind: 'true', uploadOk: true }),
    uniform('200 JSON 아닌 본문', R.text, { kind: 'true', uploadOk: true }),
    uniform('200 본문·content-type 없음', R.bare, { kind: 'true', uploadOk: true }),
    uniform('200 JSON 표시인데 깨진 본문', R.badJson, { kind: 'network', uploadOk: true }),
    uniform('400 JSON 오류 본문', R.e400, { kind: 'server', uploadOk: false }),
    uniform('401 JSON 오류 본문', R.e401, { kind: 'server', uploadOk: false }),
    uniform('404 JSON 아닌 오류 본문', R.e404, { kind: 'server', uploadOk: false }),
    uniform('409 빈 오류 본문', R.e409, { kind: 'server', uploadOk: false }),
    uniform('500 JSON 오류 본문', R.e500, { kind: 'server', uploadOk: false }),
    uniform('네트워크 오류(TypeError)', R.netType, { kind: 'network', uploadOk: false, networkMessage: 'TypeError: Failed to fetch' }),
    uniform('네트워크 오류(문자열로 거절)', R.netString, { kind: 'network', uploadOk: false, networkMessage: '오프라인 & 끊김' }),
];

const sequence = (name, list) => ({ name, respond: (i) => list[Math.min(i, list.length - 1)] });

// 요청마다 응답이 달라지는 7종 — 요청을 여러 번 보내는 함수의 뒤쪽 갈래(재조회·재시도)까지 태운다.
export const sequenceResponses = [
    sequence('순서: 빈 배열 → 정상 행', [R.empty, R.rows]),
    sequence('순서: 400 → 정상 행', [R.e400, R.rows]),
    sequence('순서: 400 → 다른 행 먼저', [R.e400, R.rowsOtherFirst]),
    sequence('순서: 400 → 빈 배열 → 정상 행', [R.e400, R.empty, R.rows]),
    sequence('순서: 정상 행 → 500', [R.rows, R.e500]),
    sequence('순서: 네트워크 오류 → 정상 행', [R.netType, R.rows]),
    sequence('순서: 204 → 빈 배열', [R.noContent, R.empty]),
];

// ---------------------------------------------------------------------------
// supabaseRequest 직접 호출 입력
// ---------------------------------------------------------------------------
const EP = '/rest/v1/tr_sample?id=eq.abc';
const req = (label, options, extra) => ({ label, args: () => [EP, options()], ...extra });

export const requestInputs = [
    { label: 'GET · options 생략', args: () => [EP] },
    req('GET · 빈 options', () => ({})),
    req('GET · method 명시', () => ({ method: 'GET' })),
    req('POST · 본문 객체(한글, &)', () => ({ method: 'POST', body: { name: '홍길동', note: 'a & b c', n: 1, flag: true, nil: null } })),
    req('POST · 본문 배열', () => ({ method: 'POST', body: [{ a: 1 }, { a: '둘' }] })),
    req('POST · 본문 없음', () => ({ method: 'POST' })),
    req('PATCH · 본문', () => ({ method: 'PATCH', body: { status: '승인 & 완료', nested: { deep: ['"따옴표"', '\n줄바꿈', '웃음😀'] } } })),
    req('PATCH · 본문 null', () => ({ method: 'PATCH', body: null })),
    req('DELETE · 본문 없음', () => ({ method: 'DELETE' })),
    req('DELETE · 본문 있음', () => ({ method: 'DELETE', body: { reason: '삭제' } })),
    req('본문이 빈 문자열·0·false(없는 것으로 처리)', () => ({ method: 'POST', body: '' })),
    req('본문 0', () => ({ method: 'POST', body: 0 })),
    req('본문이 문자열', () => ({ method: 'POST', body: '이미 문자열' })),
    req('소문자 method', () => ({ method: 'post', body: { a: 1 } })),
    req('그 밖의 method(PUT)', () => ({ method: 'PUT', body: { a: 1 } })),
    req('prefer return=minimal', () => ({ method: 'POST', body: { a: 1 }, prefer: 'return=minimal' })),
    req('prefer 병합 저장', () => ({ method: 'POST', body: { a: 1 }, prefer: 'return=representation,resolution=merge-duplicates' })),
    req('prefer count=exact', () => ({ prefer: 'count=exact' })),
    req('prefer 빈 문자열(기본값으로)', () => ({ prefer: '' })),
    req('prefer null(기본값으로)', () => ({ prefer: null })),
    req('headers 빈 객체', () => ({ headers: {} })),
    req('headers undefined', () => ({ headers: undefined })),
    req('headers null', () => ({ headers: null })),
    req('headers 가 Prefer 를 덮어씀', () => ({ headers: { 'Prefer': 'return=minimal' } })),
    req('headers 가 Content-Type 을 덮어씀', () => ({ method: 'POST', body: { a: 1 }, headers: { 'Content-Type': 'text/csv' } })),
    req('headers 가 Authorization 을 덮어씀', () => ({ headers: { 'Authorization': 'Bearer 합성-토큰' } })),
    req('headers 가 apikey 를 덮어씀', () => ({ headers: { 'apikey': '합성-키' } })),
    req('headers 에 새 이름 하나(Range)', () => ({ headers: { 'Range': '0-9' } })),
    req('options.prefer 와 headers.Prefer 가 서로 다른 값', () => ({ method: 'POST', body: { a: 1 }, prefer: 'return=minimal', headers: { 'Prefer': 'count=exact' } })),
    req('새 이름 둘을 기존 이름과 섞음', () => ({ headers: { 'X-B': '2', 'Content-Type': 'text/plain', 'X-A': '1', 'apikey': '합성-키', 'Prefer': 'p=1' } })),
    req('새 이름 둘 + prefer + 기존 이름 뒤섞음', () => ({ method: 'PATCH', body: { a: 1 }, prefer: 'return=minimal', headers: { 'Range-Unit': 'items', 'Authorization': 'Bearer 합성', 'Range': '0-4' } })),
    req('대소문자만 다른 이름(prefer·content-type)', () => ({ headers: { 'prefer': 'count=exact', 'content-type': 'text/plain', 'APIKEY': 'x' } })),
    req('헤더 값이 undefined·null·숫자', () => ({ headers: { 'Prefer': undefined, 'X-Null': null, 'X-Num': 7 } })),
    req('기존 네 개를 전부 다른 순서로 덮어씀', () => ({ headers: { 'Prefer': 'a', 'Content-Type': 'b', 'Authorization': 'c', 'apikey': 'd' } })),
    req('숫자 모양 헤더 이름', () => ({ headers: { 'X-Z': 'z', '2': 'two', '1': 'one' } }), { skipModel: true }),
    req('__proto__ 라는 이름의 헤더(JSON 에서 온 객체)', () => ({ headers: JSON.parse('{"__proto__":"p","X-A":"1"}') }), { skipModel: true }),
    req('headers 가 배열', () => ({ headers: ['x', 'y'] }), { skipModel: true }),
    req('headers 가 문자열', () => ({ headers: 'ab' }), { skipModel: true }),
    {
        label: 'headers 에 읽을 때마다 세는 속성(읽는 횟수)',
        skipModel: true,
        args: () => {
            const counter = { reads: 0 };
            const headers = { 'X-First': '1' };
            Object.defineProperty(headers, 'Prefer', { enumerable: true, get() { counter.reads++; return `읽음-${counter.reads}`; } });
            return [EP, { headers }, counter];
        },
    },
    { label: '주소에 한글·&·공백', args: () => ['/rest/v1/한글 표?이름=eq.홍 길동&메모=like.*a&b*&select=id, name', {}] },
    { label: '주소에 인코딩된 글자·+·#', args: () => ['/rest/v1/users?email=eq.user%2Btag%40example.com&x=a+b#h', { method: 'GET' }] },
    { label: '빈 주소', args: () => ['', {}] },
    { label: '주소 없음(undefined)', args: () => [undefined, {}] },
    { label: 'options 가 null(fetch 전 오류)', args: () => [EP, null], noFetch: '오류' },
];

// ---------------------------------------------------------------------------
// supabaseStorageUpload 입력
// ---------------------------------------------------------------------------
const hex = (bytes) => Buffer.from(bytes).toString('hex');
const mp3A = Uint8Array.from([0x49, 0x44, 0x33, 0x04, 0x00, 0xff, 0xfb, 0x90, 0x00, 0x7f, 0x80, 0x01]);
const mp3B = Uint8Array.from([0x49, 0x44, 0x33, 0x04, 0x00, 0xff, 0xfb, 0x90, 0x00, 0x7f, 0x80, 0x02]);
const allBytes = Uint8Array.from({ length: 256 }, (_, i) => i);
const bigBytes = (() => {
    const out = new Uint8Array(64 * 1024);
    let x = 12345;
    for (let i = 0; i < out.length; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; out[i] = (x >>> 16) & 0xff; }
    return out;
})();
const none = new Uint8Array(0);

const up = (label, bucket, path, make, mime, bytes, bodyType) => ({ label, args: () => [bucket, path, make()], mime, hex: bytes ? hex(bytes) : undefined, bodyType });
const OCTET = 'application/octet-stream';

export const uploadInputs = [
    up('type 있음 · mp3', 'speaking-files', 'u1/answer_1.mp3', () => new File([mp3A], 'answer_1.mp3', { type: 'audio/mpeg' }), 'audio/mpeg', mp3A, 'audio/mpeg'),
    up('type 있음 · 같은 경로, 마지막 바이트만 다른 파일', 'speaking-files', 'u1/answer_1.mp3', () => new File([mp3B], 'answer_1.mp3', { type: 'audio/mpeg' }), 'audio/mpeg', mp3B, 'audio/mpeg'),
    up('type 있음 · webm(코덱 표시)', 'speaking-files', 'u1/rec.webm', () => new Blob([allBytes], { type: 'audio/webm;codecs=opus' }), 'audio/webm;codecs=opus', allBytes, 'audio/webm;codecs=opus'),
    up('type 있음 · 대문자로 준 MIME', 'speaking-files', 'u1/upper.MP3', () => new File([mp3A], 'upper.MP3', { type: 'Audio/MPEG' }), 'audio/mpeg', mp3A, 'audio/mpeg'),
    up('type 있음 · 64KB 파일', 'speaking-files', 'u1/big.wav', () => new File([bigBytes], 'big.wav', { type: 'audio/wav' }), 'audio/wav', bigBytes, 'audio/wav'),
    up('type 있음 · 0바이트 파일', 'docs', 'empty.txt', () => new File([none], 'empty.txt', { type: 'text/plain' }), 'text/plain', none, 'text/plain'),
    up('type 빈 문자열 · File', 'speaking-files', 'u1/no-type.bin', () => new File([allBytes], 'no-type.bin'), OCTET, allBytes, ''),
    up('type 빈 문자열 · Blob, 다른 바이트', 'speaking-files', 'u1/no-type-2.bin', () => new Blob([mp3B]), OCTET, mp3B, ''),
    up('type 없음 · Uint8Array', 'speaking-files', 'u1/raw.bin', () => Uint8Array.from(mp3A), OCTET, mp3A, undefined),
    up('type 없음 · ArrayBuffer', 'speaking-files', 'u1/raw-2.bin', () => Uint8Array.from(allBytes).buffer, OCTET, allBytes, undefined),
    up('type 없음 · 속성 없는 객체', 'docs', 'obj.bin', () => ({ name: 'obj.bin', size: 3 }), OCTET, null, undefined),
    up('경로·버킷에 한글·&·공백', '한글 버킷', '폴더 이름/파일&이름 1.mp3', () => new File([mp3A], '파일&이름 1.mp3', { type: 'audio/mpeg' }), 'audio/mpeg', mp3A, 'audio/mpeg'),
    { label: 'file 이 null(fetch 전 오류 처리)', args: () => ['speaking-files', 'u1/none.mp3', null], noFetch: '반환' },
    { label: 'file 이 undefined(fetch 전 오류 처리)', args: () => ['speaking-files', 'u1/none.mp3'], noFetch: '반환' },
];

// ---------------------------------------------------------------------------
// supabaseRequest 를 거치는 나머지 함수 29개
// ---------------------------------------------------------------------------
const withUser = (user) => (win) => { win.currentUser = user; };
const enrolled = withUser({ applicationId: 'app-1', timezone: 'Asia/Seoul' });
const australia = (win) => { win.currentUser = { applicationId: 'app-aus & 1' }; win.courseMode = 'australia'; };
const fromSession = (win, store) => { store.set('currentUser', JSON.stringify({ applicationId: 'app-session' })); };
const refunded = withUser({ applicationId: 'app-1', serviceStops: [{ kind: 'refund', target: 'both', requested_on: '2026-11-15', status: 'active' }] });
const paused = withUser({ applicationId: 'app-1', correctionPauses: [{ paused_from: '2026-01-01', resume_on: null, status: 'open' }] });

const w = (name, inputs) => ({ name, kind: 'wrapper', invoke: (f, a) => f[name](...a), inputs });
const draft1 = (extra) => ({ round: 1, userId: 'u1', sessionNumber: 1, taskType: 'writing_email', taskNumber: 2, fields: { draft_1_text: '첫 답안 & 공백', status: 'draft1_submitted' }, ...extra });
const draft2 = (extra) => ({ round: 2, userId: 'u1', sessionNumber: 2, taskType: 'speaking_interview', taskNumber: 1, submissionId: 'row-2', fields: { draft_2_text: '둘째 답안', status: 'draft2_submitted' }, ...extra });

export const wrapperTargets = [
    w('supabaseSelect', [
        { label: '조건 있음', args: () => ['users', 'email=eq.a%40b.c&select=id,name'] },
        { label: '한글 표·빈 조건', args: () => ['한글 표', ''] },
        { label: '조건 생략', args: () => ['tr_sample'] },
    ]),
    w('supabaseInsert', [
        { label: '객체', args: () => ['tr_sample', { a: 1, '이름': '가 & 나' }] },
        { label: '배열', args: () => ['tr_sample', [{ a: 1 }, { a: 2 }]] },
    ]),
    w('supabaseUpdate', [
        { label: '보통 수정', args: () => ['tr_sample', 'id=eq.abc', { done: true }] },
        { label: '한글·&·공백·빈 객체', args: () => ['한글 표', '이름=eq.가 나&x=1', {}] },
    ]),
    w('supabaseDelete', [
        { label: '보통 삭제', args: () => ['tr_sample', 'id=eq.abc'] },
        { label: '한글·공백', args: () => ['한글 표', 'a=eq.가 나'] },
    ]),
    w('supabaseUpsert', [
        { label: '충돌 열 있음', args: () => ['tr_sample', { user_id: 'u1', v: 1 }, 'user_id,day'] },
        { label: '충돌 열 없음', args: () => ['tr_sample', { v: 2 }] },
    ]),
    w('loginWithCredentials', [
        { label: '맞는 비밀번호', args: () => ['student+tag@example.com', 'pw-1234'] },
        { label: '틀린 비밀번호', args: () => ['student+tag@example.com', '틀림'] },
        { label: '마스터 비밀번호 모양', args: () => ['한글@example.com', '999999'] },
    ]),
    w('getStudentProgram', [
        { label: '보통 이메일', args: () => ['student+tag@example.com'] },
        { label: '한글·&·공백 이메일', args: () => ['가 나&다@example.com'] },
    ]),
    w('_fetchDeadlineExtensions', [
        { label: '신청서 id', args: () => ['app-1'] },
        { label: '한글·&·공백 id', args: () => ['app 가&나'] },
        { label: 'id 없음(요청 없음)', args: () => [''], noFetch: '반환' },
    ]),
    w('refreshPauseState', [
        { label: '자기주도 학생', args: () => [{ id: 'u1', applicationId: 'app-1', selfPaced: true, timezone: 'Asia/Seoul', deadlineExtensions: [{ original_date: '2026-11-01', extra_days: 9 }] }] },
        { label: '일반 학생', args: () => [{ id: 'u2', applicationId: 'app-2', startDate: '2026-10-01' }] },
        { label: '학생 없음(요청 없음)', args: () => [null], noFetch: '반환' },
        { label: '신청서 id 없음(요청 없음)', args: () => [{ id: 'u3' }], noFetch: '반환' },
    ]),
    w('_upsertV3Record', [
        { label: '수강 꼬리표 있음', setup: enrolled, args: () => ['study_results_v3', { user_id: 'u1', section_type: 'reading', module_number: 1, week: '1', day: '월', current_record: { s: 1 } }] },
        { label: '수강 꼬리표 없음', args: () => ['study_results_v3', { user_id: 'u1', section_type: 'reading', module_number: 1, week: '1', day: '월', current_record: { s: 1 } }] },
        { label: '꼬리표를 sessionStorage 에서 읽음', setup: fromSession, args: () => ['aus_study_results', { user_id: 'u 1', section_type: 'ind-spk', module_number: 2, week: 3, day: '수 & 목', current_record: null }] },
    ]),
    w('getStudyResultV3', [
        { label: '꼬리표 있음', setup: enrolled, args: () => ['u1', 'reading', 1, 1, '월'] },
        { label: '꼬리표 없음', args: () => ['u1', 'intro-book', 2, '3', '화'] },
        { label: '호주 과정', setup: australia, args: () => ['u1', 'aus-discussion', 1, 2, '수'] },
    ]),
    w('upsertInitialRecord', [
        { label: '추가 열 있음', setup: enrolled, args: () => ['u1', 'listening', 2, '2', '화', { score: 3, answers: ['a', 'b'] }, { initial_level: 3.5, writing_email_text: '글 & 공백' }] },
        { label: '추가 열 없음·꼬리표 없음', args: () => ['u1', 'vocab', 1, 1, '월', { correct: 10 }] },
    ]),
    w('upsertCurrentRecord', [
        { label: '꼬리표 있음', setup: enrolled, args: () => ['u1', 'writing', 1, 3, '수', { t: '가 & 나' }] },
        { label: '호주 과정', setup: australia, args: () => ['u1', 'intwrt', 1, 3, '수', { t: 'x' }] },
    ]),
    w('upsertRewriteRecord', [
        { label: '꼬리표 있음', setup: enrolled, args: () => ['u1', 'writing', 1, 3, '수', { text: '다시 쓴 글' }] },
        { label: '꼬리표 없음', args: () => ['u1', 'writing', 2, '4', '목', { text: '' }] },
    ]),
    w('upsertRewriteRecordPractice', [
        { label: '보통', args: () => ['u1', 'writing', 1, 4, { text: '연습 다시 쓰기' }] },
    ]),
    w('getCompletedTasksV3', [
        { label: '꼬리표 있음', setup: enrolled, args: () => ['u1'] },
        { label: '호주 과정', setup: australia, args: () => ['u1'] },
        { label: '꼬리표 없음', args: () => ['u 1&2'] },
    ]),
    w('getStudyResultPractice', [
        { label: '보통', args: () => ['u1', 'speaking', 2, 5] },
        { label: '한글 영역 이름', args: () => ['u1', '말하기 & 쓰기', 1, 1] },
    ]),
    w('upsertInitialRecordPractice', [
        { label: '추가 열 있음', args: () => ['u1', 'reading', 1, 2, { s: 1 }, { initial_level: 2 }] },
        { label: '추가 열 없음', args: () => ['u1', 'listening', 3, 1, { s: 0 }] },
    ]),
    w('upsertCurrentRecordPractice', [
        { label: '보통', args: () => ['u1', 'reading', 1, 2, { s: 2 }] },
    ]),
    w('getCompletedTasksPractice', [
        { label: '보통', args: () => ['u1'] },
    ]),
    w('getReadingReceivedSets', [
        { label: '꼬리표 있음', setup: enrolled, args: () => ['u1'] },
        { label: '호주 과정', setup: australia, args: () => ['u1'] },
        { label: '꼬리표 없음', args: () => ['u1'] },
    ]),
    w('getCorrectionSchedule', [
        { label: '보통', args: () => ['u1'] },
    ]),
    w('getCorrectionSubmissions', [
        { label: '보통', args: () => ['u1'] },
    ]),
    w('getCorrectionSubmission', [
        { label: '라이팅', args: () => ['u1', 3, 'writing_email'] },
        { label: '한글·& 과제 이름', args: () => ['u1', 1, '과제 & 이름'] },
    ]),
    w('loadCorrectionSubmissionMap', [
        { label: '보통', args: () => ['u1'] },
    ]),
    w('loadCorrectionExtensionMap', [
        { label: '보통', args: () => ['u1'] },
    ]),
    w('insertCorrectionSubmission', [
        { label: '보통', args: () => [{ user_id: 'u1', session_number: 1, task_type: 'writing_email', draft_1_text: '가 & 나' }] },
    ]),
    w('updateCorrectionSubmission', [
        { label: '보통', args: () => ['sub-1', { draft_2_text: 'x', status: 'draft2_submitted' }] },
    ]),
    w('submitCorrectionDraft', [
        { label: '1차 저장', args: () => [draft1()] },
        { label: '1차 저장·fields 없음', args: () => [draft1({ fields: undefined, sessionNumber: 4 })] },
        { label: '2차 저장', args: () => [draft2()] },
        { label: '2차 저장·다른 줄 id', args: () => [draft2({ submissionId: 'row-9' })] },
        { label: '2차 저장·정지 중에도 허용', setup: paused, args: () => [draft2()] },
        { label: '2차인데 줄 id 없음(요청 없음)', args: () => [draft2({ submissionId: null })], noFetch: '반환' },
        { label: '환불 중 1차(요청 없음)', setup: refunded, args: () => [draft1()], noFetch: '반환' },
        { label: '정지 중 1차(요청 없음)', setup: paused, args: () => [draft1()], noFetch: '반환' },
    ]),
];

// ---------------------------------------------------------------------------
// 파일 안의 함수 분류 — 시험이 빠뜨린 함수가 없는지 확인할 때 쓴다.
// ---------------------------------------------------------------------------
// fetch 를 직접 부르는 함수(계약 대상 2곳)
export const directNames = ['supabaseRequest', 'supabaseStorageUpload'];

// 요청 없이 계산만 하는 함수 — 계약서대로 호출 수에 넣지 않는다(나머지 텍스트 동일로 확인).
export const pureNames = [
    '_pauseEntriesOf', '_pauseTodayYmdFor', 'getActivePauseOn', '_pauseUserOrCurrent',
    'getActiveChallengePause', 'getActiveCorrectionPause', 'isChallengePausedNow', 'isCorrectionPausedNow',
    '_stopEntriesOf', 'getActiveServiceStop', 'isChallengeRefundedNow', 'isCorrectionRefundedNow',
    'isChallengeStoppedNow', 'isCorrectionStoppedNow', 'challengeStopReason', 'correctionStopReason',
    'stopTaskMsgFor', 'isViewOnlyStop', 'getCorrStopCut', 'isCorrRowStopClosed',
    'getCurrentEnrollmentId', 'enrollmentQuery', '_getV3Table', 'buildCorrectionSubmissionMap', 'supabaseStorageUrl',
];

// 인자를 알 수 없어 부르지 못한 함수 — 없다. 생기면 { name, reason } 으로 적는다.
export const notCalled = [];
