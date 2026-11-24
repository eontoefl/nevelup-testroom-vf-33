-- =====================================================================
-- 보안작업 묶음 2 — 계약 3B 합성 학생 자료 올리기 (시험 프로젝트 hmncdheiwqwekdbtijar 전용)
--
-- ★★★ 운영 경고 ★★★
--   운영(qpqjevecjejvbeuogtbx)에서 실행하지 않는다(회원 표·신청서 표·학습 기록에 합성 행이 생긴다).
--   실행 직전에 절차.md 의 대상 확인을 한다: SQL 통로가 가리키는 프로젝트의 ref 가 hmncdheiwqwekdbtijar 여야 한다.
--   아래의 대상 확인 값(set b3b.test_project_ref)은 그 확인을 대신하지 않는다 — DB 는 자기 ref 를 스스로 알지 못한다.
--
-- 이 파일은 작업방이 실행해 보지 않았다(문법 확인도 하지 못했다). 열의 이름·형은 2026-11-21 의 구조 목록
-- (묶음0\구조추출\결과\목록_시험_적용후.json)에서 읽은 것이다 — 그 뒤 바뀌었으면 맞지 않는다.
--
-- ★ 신청서 표에는 트리거가 셋 있다(applications_protect_resume_approval_fields, applications_start_notice,
--   applications_sync_correction_schedule). 브레인방이 2026-11-24 에 시험 프로젝트에서 읽었다(b3B_결과\신청서표_트리거_확인_2026-11-24.json):
--   재개 승인 두 열의 보호(바깥 호출 없음) / 시작 알림은 시험 프로젝트에서 꺼져 있음(tgenabled = D) / 첨삭 날짜 네 열이 고쳐질 때만 correction_schedules 를 맞춤.
--   이 파일은 그 읽은 상태가 지금도 같은지 넣기 전에 다시 본다: 트리거가 그 셋뿐이고 시작 알림이 꺼져 있어야 한다(아니면 멈춘다).
--   같은 요청의 맨 앞에 set b3b.app_triggers_reviewed = 'yes'; 를 둔다(없으면 멈춘다).
--   (첨삭 일정 동기화를 피하려고 합성 신청서는 전부 correction_enabled = false 로 넣는다.)
--
-- 받는 값(같은 요청의 맨 앞에서 정한다)
--     set b3b.test_project_ref = 'hmncdheiwqwekdbtijar';
--     set b3b.app_triggers_reviewed = 'yes';
--     set b3b.legacy_pw = '<옛 길 전용의 일회성 합성 값>';      -- 회원 표의 비밀번호 열에 들어간다. 로그인 계정(Auth)의 비밀번호와 달라야 한다.
--                                                              -- 회원 표는 공개 키로 읽힌다 — Auth 비밀번호를 여기에 두지 않는다. 이 파일에 적지 않는다.
--     set b3b.acct_<유형> = '<로그인 계정 번호>';               -- 유형 14개: fast std spold spoldx spv2new spv2ok spv2chg restart restart2 paused refund noapp unconf blocked
--   로그인 계정은 브레인방이 로그인 서버로 먼저 만든다. 이메일은 아래의 합성 이메일과 글자까지 같아야 한다:
--     zzb3b_<유형>@member.zzb3b.invalid
--
-- 만드는 것(전부 새로 만든 번호 — 시험 프로젝트에 있는 운영에서 복사된 행은 읽지도 고치지도 않는다)
--   public.users 14행, security_private.member_identity 14행, public.applications 14행(restart·restart2 는 2행씩, noapp 은 0행),
--   public.study_results_v3 유형마다 6행(noapp·unconf·blocked 제외), public.tr_deadline_extensions 1행(std), public.tr_user_map 1행(std — 옛 이름)
-- 넣기 전에: 합성 이메일·넘겨받은 계정 번호·tr_user_map 의 충돌이 하나라도 있으면 아무것도 넣지 않고 멈춘다.
--
-- 날짜는 실행하는 날을 기준으로 잡는다: 시작일 = 이번 주 일요일의 2주 전(1·2주차는 지남, 4주차는 앞날).
--
-- 마지막 결과(한 칸 jsonb)
--   students     실행기의 'fixtures' 멈춤에 그대로 준다: { 유형: { memberId, appIds, recordIds } }
--   created      만든 행의 정확한 번호·주인(회원번호·이메일·신청서 번호)과, 옛 길이 고치는 칸의 처음 값·그 밖의 칸의 지문
--                (회원 표의 비밀번호 열은 어디에도 내보내지 않는다)
--   down_input   created 를 한 줄 글자로 쓴 것 — fixtures_reset.sql · fixtures_down.sql 에 그대로 넘긴다(set b3b.created = '…')
--   counts       넣은 수
-- =====================================================================

begin;

create temporary table zzb3b_plan (
  label text primary key,
  auth_id uuid not null,
  member_id uuid not null default pg_catalog.gen_random_uuid(),
  app1 uuid default pg_catalog.gen_random_uuid(),
  app2 uuid default pg_catalog.gen_random_uuid()
) on commit drop;

do $zz_b3b$
declare
  v_labels constant text[] := array['fast','std','spold','spoldx','spv2new','spv2ok','spv2chg','restart','restart2','paused','refund','noapp','unconf','blocked'];
  v_label  text;
  v_raw    text;
  v_n      bigint;
  v_pw     text := coalesce(pg_catalog.current_setting('b3b.legacy_pw', true), '');
begin
  if coalesce(pg_catalog.current_setting('b3b.test_project_ref', true), '') <> 'hmncdheiwqwekdbtijar' then
    raise exception 'zzb3b 합성 자료 중단: 대상 확인 값이 없다. 시험 프로젝트에서만, 같은 요청의 맨 앞에 set b3b.test_project_ref = ''hmncdheiwqwekdbtijar''; 를 둘 것. 아무것도 바꾸지 않았다';
  end if;
  if coalesce(pg_catalog.current_setting('b3b.app_triggers_reviewed', true), '') <> 'yes' then
    raise exception 'zzb3b 합성 자료 중단: 신청서 표의 트리거 셋을 읽었다는 확인(set b3b.app_triggers_reviewed = ''yes'')이 없다. 아무것도 바꾸지 않았다';
  end if;
  -- 신청서 표의 트리거가 브레인방이 읽은 그 셋뿐이고, 시작 알림은 꺼져 있다(켜져 있으면 합성 신청서가 알림 함수를 부를 수 있다)
  select pg_catalog.count(*) into v_n from pg_catalog.pg_trigger tg
   where tg.tgrelid = 'public.applications'::pg_catalog.regclass and not tg.tgisinternal
     and tg.tgname not in ('applications_protect_resume_approval_fields', 'applications_start_notice', 'applications_sync_correction_schedule');
  if v_n <> 0 then
    raise exception 'zzb3b 합성 자료 중단: 신청서 표에 읽지 않은 트리거가 %개 있다. 아무것도 바꾸지 않았다', v_n;
  end if;
  select pg_catalog.count(*) into v_n from pg_catalog.pg_trigger tg
   where tg.tgrelid = 'public.applications'::pg_catalog.regclass and tg.tgname = 'applications_start_notice' and tg.tgenabled <> 'D';
  if v_n <> 0 then
    raise exception 'zzb3b 합성 자료 중단: 신청서 표의 시작 알림 트리거가 켜져 있다(읽었을 때는 꺼져 있었다). 아무것도 바꾸지 않았다';
  end if;
  -- 이 DB 가 운영이 아니라는 DB 안의 증거(3-0 과 같은 방식): 파일 객체가 하나도 없다
  select pg_catalog.count(*) into v_n from storage.objects;
  if v_n <> 0 then
    raise exception 'zzb3b 합성 자료 중단: storage.objects 에 객체가 %개 있다 — 시험 프로젝트의 시작 상태가 아니다(운영일 수 있다). 아무것도 바꾸지 않았다', v_n;
  end if;
  if pg_catalog.to_regclass('security_private.member_identity') is null then
    raise exception 'zzb3b 합성 자료 중단: 2-가(b2a_identity_gate)가 적용돼 있지 않다';
  end if;
  if pg_catalog.length(v_pw) < 12 or v_pw = '999999' then
    raise exception 'zzb3b 합성 자료 중단: b3b.legacy_pw 가 없거나 너무 짧다(12자 이상의 일회성 합성 값). 아무것도 바꾸지 않았다';
  end if;

  foreach v_label in array v_labels loop
    v_raw := coalesce(pg_catalog.current_setting('b3b.acct_' || v_label, true), '');
    if v_raw !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      raise exception 'zzb3b 합성 자료 중단: b3b.acct_% 에 계정 번호가 없다. 아무것도 바꾸지 않았다', v_label;
    end if;
    -- 그 계정이 로그인 계정으로 있고, 이메일이 합성 이메일과 글자까지 같다
    select pg_catalog.count(*) into v_n from auth.users au
     where au.id = v_raw::pg_catalog.uuid and au.email = 'zzb3b_' || v_label || '@member.zzb3b.invalid';
    if v_n <> 1 then
      raise exception 'zzb3b 합성 자료 중단: b3b.acct_% 의 계정이 없거나 이메일이 합성 이메일(zzb3b_%@member.zzb3b.invalid)이 아니다. 아무것도 바꾸지 않았다', v_label, v_label;
    end if;
    insert into zzb3b_plan (label, auth_id) values (v_label, v_raw::pg_catalog.uuid);
  end loop;
  select pg_catalog.count(distinct p.auth_id) into v_n from zzb3b_plan p;
  if v_n <> 14 then
    raise exception 'zzb3b 합성 자료 중단: 넘겨받은 계정 번호가 서로 다르지 않다. 아무것도 바꾸지 않았다';
  end if;

  -- 덮어쓰지 않는다: 합성 이메일·넘겨받은 계정·새 번호의 충돌이 하나라도 있으면 멈춘다
  select pg_catalog.count(*) into v_n from public.users u where u.email like 'zzb3b\_%@member.zzb3b.invalid' escape '\';
  if v_n <> 0 then raise exception 'zzb3b 합성 자료 중단: 합성 이메일의 회원 행이 이미 %개 있다. 덮어쓰지 않는다(fixtures_down.sql 을 먼저)', v_n; end if;
  select pg_catalog.count(*) into v_n from public.applications a where a.email like 'zzb3b\_%@member.zzb3b.invalid' escape '\';
  if v_n <> 0 then raise exception 'zzb3b 합성 자료 중단: 합성 이메일의 신청서 행이 이미 %개 있다. 덮어쓰지 않는다', v_n; end if;
  select pg_catalog.count(*) into v_n from public.tr_user_map m where m.email like 'zzb3b\_%@member.zzb3b.invalid' escape '\';
  if v_n <> 0 then raise exception 'zzb3b 합성 자료 중단: 합성 이메일의 tr_user_map 행이 이미 %개 있다. 덮어쓰지 않는다', v_n; end if;
  select pg_catalog.count(*) into v_n from security_private.member_identity mi where mi.auth_user_id in (select p.auth_id from zzb3b_plan p);
  if v_n <> 0 then raise exception 'zzb3b 합성 자료 중단: 넘겨받은 계정의 대응 행이 이미 %개 있다. 덮어쓰지 않는다', v_n; end if;
  select pg_catalog.count(*) into v_n from public.users u where u.id in (select p.member_id from zzb3b_plan p union all select p.auth_id from zzb3b_plan p);
  if v_n <> 0 then raise exception 'zzb3b 합성 자료 중단: 새 회원번호(또는 계정 번호)와 같은 회원 행이 이미 %개 있다', v_n; end if;
  select pg_catalog.count(*) into v_n from public.applications a where a.id in (select p.app1 from zzb3b_plan p union all select p.app2 from zzb3b_plan p);
  if v_n <> 0 then raise exception 'zzb3b 합성 자료 중단: 새 신청서 번호와 같은 신청서 행이 이미 %개 있다', v_n; end if;
  select pg_catalog.count(*) into v_n from public.tr_user_map m where m.user_id in (select p.member_id from zzb3b_plan p);
  if v_n <> 0 then raise exception 'zzb3b 합성 자료 중단: 새 회원번호의 tr_user_map 행이 이미 %개 있다', v_n; end if;
end;
$zz_b3b$;

-- 날짜의 기준: 시작일 = (한국 시간) 이번 주 일요일의 2주 전
create temporary table zzb3b_dates on commit drop as
select d.sun0 - 14 as start_day, d.sun0 - 49 as old_start, d.today
  from (select ((pg_catalog.date_trunc('week', (pg_catalog.now() at time zone 'Asia/Seoul') + interval '1 day'))::date - 1) as sun0,
               (pg_catalog.now() at time zone 'Asia/Seoul')::date as today) d;

-- 1. 회원 14행(비밀번호 열 = 옛 길 전용의 합성 값)
insert into public.users (id, email, password, name, nickname, phone, timezone, blocked)
select p.member_id,
       'zzb3b_' || p.label || '@member.zzb3b.invalid',
       pg_catalog.current_setting('b3b.legacy_pw'),
       'zzb3b 합성학생 ' || p.label,
       null,
       case when p.label = 'std' then null else '01000003100' end,
       case when p.label = 'std' then 'America/New_York' else 'Asia/Seoul' end,
       p.label = 'blocked'
  from zzb3b_plan p;

-- 2. 로그인 계정 ↔ 회원 대응 14행
insert into security_private.member_identity (auth_user_id, member_id)
select p.auth_id, p.member_id from zzb3b_plan p;

-- 3. 신청서(유형마다. correction_enabled 는 전부 false)
insert into public.applications
  (id, email, user_id, name, phone, program, application_type, preferred_program, assigned_program, preferred_start_date, schedule_start,
   current_step, status, deposit_confirmed_by_admin, practice_enabled, correction_enabled, enrollment_no, shipping_waived,
   restart_materials, reset_history, challenge_pauses, correction_pauses, service_stops,
   self_paced, self_paced_weeks, self_paced_end_date, self_paced_schedule, app_status, refund_at, deleted, created_at)
select t.id, 'zzb3b_' || t.label || '@member.zzb3b.invalid', t.member_id::pg_catalog.text, 'zzb3b 합성학생 ' || t.label, '01000003100',
       t.program, 'challenge', t.program, case when t.label = 'std' then t.program end, t.start_day::pg_catalog.text, case when t.confirmed then t.start_day::pg_catalog.text end,
       5, 'approved', t.confirmed, t.label = 'std', false, t.enrollment_no, false,
       '[]'::pg_catalog.jsonb, '[]'::pg_catalog.jsonb, t.challenge_pauses, '[]'::pg_catalog.jsonb, t.service_stops,
       t.self_paced, t.self_paced_weeks, t.end_day, t.schedule_text, t.app_status, t.refund_at, false, t.created_ms
  from (
    select p.label, p.member_id, p.app1 as id, 1 as enrollment_no, true as confirmed,
           case when p.label = 'std' then '내벨업챌린지 - Standard' else '내벨업챌린지 - Fast' end as program,
           case when p.label = 'spoldx' then d.old_start when p.label = 'restart2' then d.old_start - 56 else d.start_day end as start_day,
           case when p.label = 'paused'
                then pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('status', 'open', 'paused_from', (d.start_day + 8)::pg_catalog.text, 'resume_on', null))
                else '[]'::pg_catalog.jsonb end as challenge_pauses,
           case when p.label = 'refund'
                then pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('status', 'active', 'target', 'both', 'kind', 'refunded', 'requested_on', (d.start_day + 10)::pg_catalog.text))
                else '[]'::pg_catalog.jsonb end as service_stops,
           p.label in ('spold', 'spoldx', 'spv2new', 'spv2ok', 'spv2chg') as self_paced,
           case p.label when 'spold' then 8 when 'spoldx' then 1 end as self_paced_weeks,
           case when p.label in ('spv2new', 'spv2ok') then d.start_day + 42 when p.label = 'spv2chg' then d.start_day + 63 end as end_day,
           case when p.label in ('spv2ok', 'spv2chg')
                then pg_catalog.jsonb_build_object('end', (d.start_day + 42)::pg_catalog.text,
                       'dates', (select pg_catalog.jsonb_agg((d.start_day + g.i)::pg_catalog.text order by g.i) from pg_catalog.generate_series(0, 23) as g(i)))::pg_catalog.text
           end as schedule_text,
           case when p.label = 'refund' then 'refunded' end as app_status,
           case when p.label = 'refund' then ((extract(epoch from pg_catalog.now()))::bigint - 86400) * 1000 end as refund_at,
           ((extract(epoch from pg_catalog.now()))::bigint - 40 * 86400) * 1000 as created_ms
      from zzb3b_plan p cross join zzb3b_dates d
     where p.label not in ('noapp', 'unconf')
    union all
    -- 입금 미확인(unconf), 재시작의 둘째 신청서(restart: 최신 미입금 / restart2: 최신 입금 확인 — 지금 수강)
    select p.label, p.member_id, case when p.label = 'unconf' then p.app1 else p.app2 end, case when p.label = 'unconf' then 1 else 2 end,
           p.label = 'restart2', '내벨업챌린지 - Fast', case when p.label = 'restart' then d.start_day + 28 else d.start_day end,
           '[]'::pg_catalog.jsonb, '[]'::pg_catalog.jsonb, false, null, null, null, null, null,
           ((extract(epoch from pg_catalog.now()))::bigint - 3 * 86400) * 1000
      from zzb3b_plan p cross join zzb3b_dates d
     where p.label in ('unconf', 'restart', 'restart2')
  ) t;

-- 4. 학습 기록: 지금 수강의 신청서에 6행씩(밀린 것 셋·앞날 하나·이미 확정 하나·끝내지 않은 것 하나)
insert into public.study_results_v3
  (id, user_id, enrollment_id, section_type, module_number, week, day, course_mode, initial_record, error_note_submitted, completed_at, locked_auth_rate)
select pg_catalog.gen_random_uuid(), p.member_id::pg_catalog.text,
       case when p.label = 'restart2' then p.app2 else p.app1 end,
       'reading', r.n, r.week, r.day, 'regular', r.initial, r.note, case when r.done then pg_catalog.now() - interval '10 days' end, r.locked
  from zzb3b_plan p
 cross join (values
   (1, '1', '월', '{"score":7}'::pg_catalog.jsonb, true,  true,  null::integer),
   (2, '1', '화', '{"score":5}'::pg_catalog.jsonb, false, true,  null),
   (3, '2', '수', null,                            false, true,  null),
   (4, '4', '금', '{"score":9}'::pg_catalog.jsonb, false, true,  null),
   (5, '1', '수', '{"score":1}'::pg_catalog.jsonb, false, true,  50),
   (6, '1', '목', null,                            false, false, null)
 ) as r(n, week, day, initial, note, done, locked)
 where p.label not in ('noapp', 'unconf', 'blocked');

-- 5. 마감 연장 1행·tr_user_map 의 옛 행 1행(std)
insert into public.tr_deadline_extensions (id, user_id, original_date, extra_days, reason, enrollment_id)
select 'zzb3b-ext-' || p.app1::pg_catalog.text, p.member_id::pg_catalog.text, (d.start_day + 2)::pg_catalog.text, 2, 'zzb3b 합성', p.app1
  from zzb3b_plan p cross join zzb3b_dates d where p.label = 'std';
insert into public.tr_user_map (user_id, email, name, updated_at)
select p.member_id, 'zzb3b_std@member.zzb3b.invalid', 'zzb3b 옛 이름', pg_catalog.now() - interval '30 days' from zzb3b_plan p where p.label = 'std';

-- 6. 넣은 수 확인(다르면 전체가 되돌아간다)
do $zz_b3b$
declare
  v_users bigint; v_maps bigint; v_apps bigint; v_recs bigint; v_ext bigint; v_um bigint;
begin
  select pg_catalog.count(*) into v_users from public.users u where u.id in (select p.member_id from zzb3b_plan p);
  select pg_catalog.count(*) into v_maps from security_private.member_identity mi where mi.auth_user_id in (select p.auth_id from zzb3b_plan p) and mi.member_id in (select p.member_id from zzb3b_plan p);
  select pg_catalog.count(*) into v_apps from public.applications a where a.email like 'zzb3b\_%@member.zzb3b.invalid' escape '\';
  select pg_catalog.count(*) into v_recs from public.study_results_v3 s where s.user_id in (select p.member_id::pg_catalog.text from zzb3b_plan p);
  select pg_catalog.count(*) into v_ext from public.tr_deadline_extensions e where e.user_id in (select p.member_id::pg_catalog.text from zzb3b_plan p);
  select pg_catalog.count(*) into v_um from public.tr_user_map m where m.user_id in (select p.member_id from zzb3b_plan p);
  if v_users <> 14 or v_maps <> 14 or v_apps <> 15 or v_recs <> 66 or v_ext <> 1 or v_um <> 1 then
    raise exception 'zzb3b 합성 자료 실패: 회원 % (14) · 대응 % (14) · 신청서 % (15) · 학습 기록 % (66) · 마감 연장 % (1) · tr_user_map % (1). 전부 되돌린다', v_users, v_maps, v_apps, v_recs, v_ext, v_um;
  end if;
end;
$zz_b3b$;

-- 7. 만든 것의 정확한 값(같은 트랜잭션 안에서 — 임시 표가 살아 있는 동안)
create temporary table zzb3b_result on commit preserve rows as
with made as (
  select pg_catalog.jsonb_build_object(
    'accounts', (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('label', p.label, 'auth_user_id', p.auth_id, 'member_id', p.member_id) order by p.label) from zzb3b_plan p),
    -- 옛 길이 고치는 칸(self_paced_schedule)의 처음 값과, 그 밖의 칸의 지문
    'applications', (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', a.id, 'member_id', a.user_id, 'email', a.email, 'self_paced_schedule', a.self_paced_schedule,
                              'rest_md5', pg_catalog.md5((pg_catalog.to_jsonb(a) - 'self_paced_schedule')::pg_catalog.text)) order by a.id)
                       from public.applications a where a.email like 'zzb3b\_%@member.zzb3b.invalid' escape '\'),
    -- 옛 길이 고치는 칸(locked_auth_rate)의 처음 값과, 그 밖의 칸의 지문
    'records', (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', s.id, 'user_id', s.user_id, 'enrollment_id', s.enrollment_id, 'locked_auth_rate', s.locked_auth_rate,
                         'rest_md5', pg_catalog.md5((pg_catalog.to_jsonb(s) - 'locked_auth_rate')::pg_catalog.text)) order by s.id)
                  from public.study_results_v3 s where s.user_id in (select p.member_id::pg_catalog.text from zzb3b_plan p)),
    'extensions', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', e.id, 'user_id', e.user_id, 'enrollment_id', e.enrollment_id) order by e.id)
                              from public.tr_deadline_extensions e where e.user_id in (select p.member_id::pg_catalog.text from zzb3b_plan p)), '[]'::pg_catalog.jsonb),
    -- tr_user_map: 처음부터 있던 행(그 밖의 합성 회원의 행은 "원래 없음")
    'user_map', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('user_id', m.user_id, 'email', m.email, 'name', m.name, 'updated_at', m.updated_at) order by m.user_id)
                   from public.tr_user_map m where m.user_id in (select p.member_id from zzb3b_plan p)), '[]'::pg_catalog.jsonb)
  ) as j
)
select pg_catalog.jsonb_build_object(
  'marker', 'zzb3b',
  'read_at', pg_catalog.now(),
  'students', (
    select pg_catalog.jsonb_object_agg(p.label, pg_catalog.jsonb_build_object(
             'memberId', p.member_id,
             'appIds', coalesce((select pg_catalog.jsonb_agg(a.id order by a.created_at) from public.applications a where a.user_id = p.member_id::pg_catalog.text), '[]'::pg_catalog.jsonb),
             'recordIds', coalesce((select pg_catalog.jsonb_agg(s.id order by s.module_number) from public.study_results_v3 s where s.user_id = p.member_id::pg_catalog.text), '[]'::pg_catalog.jsonb)))
      from zzb3b_plan p),
  'counts', pg_catalog.jsonb_build_object('users', 14, 'mappings', 14, 'applications', 15, 'records', 66, 'extensions', 1, 'user_map', 1),
  'created', (select m.j from made m),
  'down_input', (select m.j::pg_catalog.text from made m)
) as result;

commit;

reset b3b.test_project_ref;
reset b3b.legacy_pw;

select r.result from zzb3b_result r;
