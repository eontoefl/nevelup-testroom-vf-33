-- =====================================================================
-- 보안작업 묶음 2 — 계약 3B: 합성 행의 지금 상태를 읽는다(읽기만 — 아무것도 바꾸지 않는다). 시험 프로젝트 전용.
-- 이 파일은 작업방이 실행해 보지 않았다(문법 확인도 하지 못했다).
--
-- 받는 값(같은 요청의 맨 앞)
--     set b3b.created = '<fixtures_up.sql 결과의 down_input — 한 줄 글자 그대로>';
--
-- 결과(한 칸 jsonb)
--   changes   올릴 때의 값과 달라진 것을 "저장 계획"과 같은 모양으로: [{ table, match, values }]
--             신청서 { table: applications, match: id=eq.<번호>, values: { self_paced_schedule } }
--             tr_user_map { table: tr_user_map, match: on_conflict=user_id, values: { user_id, email, name, updated_at } }(새로 생겼거나 값이 달라진 행)
--             학습 기록 { table: study_results_v3, match: id=eq.<번호>, values: { locked_auth_rate } }
--             → 옛 길 뒤에 읽으면 "옛 길의 실제 DB 변화"다. 실행기의 compare-plan 멈춤이 준 저장 계획과 항목마다 견준다
--               (tr_user_map 의 updated_at 은 그때의 시각이라 값은 견주지 않고 있음만 본다).
--             → 새 길 뒤에 읽으면 빈 목록이어야 한다(대상 행 불변).
--   outside   **합성이 아닌 행의 불변**: 표 여섯(회원·대응·신청서·학습 기록·tr_user_map·마감 연장)마다 합성 밖 행의 수와 md5 집계.
--             시작할 때(올린 직후) 읽어 둔 것과 옛 길 뒤·새 길 뒤·끝에서 읽은 것이 글자까지 같아야 한다
--             ★ 회원 표의 지문은 비밀번호 열을 빼고 뜬다(그 열의 원문을 지문으로도 내보내지 않으려고) —
--               그러므로 이 지문은 **회원 표의 비밀번호 열이 그대로인지는 보이지 않는다**. 그 열까지 불변이라고 읽지 않는다
--             (그 사이 다른 사람이 시험 프로젝트의 그 표들을 쓰지 않았다면. 달라졌으면 누가 썼는지부터 본다)
--   others    합성 행의 다른 칸에 변화가 없는지: 합성 회원·합성 이메일의 행 수(신청서·학습 기록·tr_user_map·마감 연장)와
--             옛 길이 고치는 칸을 뺀 나머지 칸의 지문이 올릴 때와 다른 행의 수(0 이어야 한다 — 비대상 칸 불변)
-- =====================================================================

with j as (select pg_catalog.current_setting('b3b.created')::pg_catalog.jsonb as v),
acct as (select (x->>'member_id')::pg_catalog.uuid as member_id, x->>'label' as label from j, pg_catalog.jsonb_array_elements(j.v->'accounts') x),
apps as (
  select pg_catalog.jsonb_build_object('table', 'applications', 'match', 'id=eq.' || a.id::pg_catalog.text,
                                       'values', pg_catalog.jsonb_build_object('self_paced_schedule', a.self_paced_schedule)) as item, a.id::pg_catalog.text as k
    from j, pg_catalog.jsonb_array_elements(j.v->'applications') x join public.applications a on a.id = (x->>'id')::pg_catalog.uuid and a.user_id = x->>'member_id' and a.email = x->>'email'
   where a.self_paced_schedule is distinct from (x->>'self_paced_schedule')
),
maps as (
  select pg_catalog.jsonb_build_object('table', 'tr_user_map', 'match', 'on_conflict=user_id',
                                       'values', pg_catalog.jsonb_build_object('user_id', m.user_id, 'email', m.email, 'name', m.name, 'updated_at', m.updated_at)) as item, m.user_id::pg_catalog.text as k
    from j, public.tr_user_map m
   where m.user_id in (select a.member_id from acct a)
     and not exists (select 1 from pg_catalog.jsonb_array_elements(coalesce(j.v->'user_map', '[]'::pg_catalog.jsonb)) x
                      where (x->>'user_id')::pg_catalog.uuid = m.user_id and m.email is not distinct from x->>'email'
                        and m.name is not distinct from x->>'name' and m.updated_at is not distinct from (x->>'updated_at')::timestamptz)
),
recs as (
  select pg_catalog.jsonb_build_object('table', 'study_results_v3', 'match', 'id=eq.' || s.id::pg_catalog.text,
                                       'values', pg_catalog.jsonb_build_object('locked_auth_rate', s.locked_auth_rate)) as item, s.id::pg_catalog.text as k
    from j, pg_catalog.jsonb_array_elements(j.v->'records') x join public.study_results_v3 s on s.id = (x->>'id')::pg_catalog.uuid and s.user_id = x->>'user_id' and s.enrollment_id::pg_catalog.text = x->>'enrollment_id'
   where s.locked_auth_rate is distinct from (x->>'locked_auth_rate')::integer
)
select pg_catalog.jsonb_build_object(
  'marker', 'zzb3b',
  'read_at', pg_catalog.now(),
  'changes', coalesce((select pg_catalog.jsonb_agg(u.item order by u.ord, u.k)
                         from (select 1 as ord, item, k from apps union all select 2, item, k from maps union all select 3, item, k from recs) u), '[]'::pg_catalog.jsonb),
  'others', pg_catalog.jsonb_build_object(
    'applications_rows', (select pg_catalog.count(*) from public.applications a
                           where a.user_id in (select c.member_id::pg_catalog.text from acct c) or a.email like 'zzb3b\_%@member.zzb3b.invalid' escape '\'),
    'applications_expected', (select pg_catalog.jsonb_array_length(j.v->'applications') from j),
    'applications_rest_changed', (select pg_catalog.count(*) from j, pg_catalog.jsonb_array_elements(j.v->'applications') x
                                    left join public.applications a on a.id = (x->>'id')::pg_catalog.uuid and a.user_id = x->>'member_id' and a.email = x->>'email'
                                   where a.id is null or pg_catalog.md5((pg_catalog.to_jsonb(a) - 'self_paced_schedule')::pg_catalog.text) <> x->>'rest_md5'),
    'records_rows', (select pg_catalog.count(*) from public.study_results_v3 s where s.user_id in (select c.member_id::pg_catalog.text from acct c)),
    'records_expected', (select pg_catalog.jsonb_array_length(j.v->'records') from j),
    'records_rest_changed', (select pg_catalog.count(*) from j, pg_catalog.jsonb_array_elements(j.v->'records') x
                               left join public.study_results_v3 s on s.id = (x->>'id')::pg_catalog.uuid and s.user_id = x->>'user_id' and s.enrollment_id::pg_catalog.text = x->>'enrollment_id'
                              where s.id is null or pg_catalog.md5((pg_catalog.to_jsonb(s) - 'locked_auth_rate')::pg_catalog.text) <> x->>'rest_md5'),
    'user_map_rows', (select pg_catalog.count(*) from public.tr_user_map m
                       where m.user_id in (select c.member_id from acct c) or m.email like 'zzb3b\_%@member.zzb3b.invalid' escape '\'),
    'extensions_rows', (select pg_catalog.count(*) from public.tr_deadline_extensions e where e.user_id in (select c.member_id::pg_catalog.text from acct c)),
    'extensions_expected', (select pg_catalog.jsonb_array_length(coalesce(j.v->'extensions', '[]'::pg_catalog.jsonb)) from j)
  ),
  -- 합성이 아닌 행의 불변: 표마다 합성 밖 행의 수와 그 행들의 md5 집계(읽기만 — 행의 내용은 내보내지 않는다. 회원 표는 비밀번호 열을 빼고 센다)
  'outside', pg_catalog.jsonb_build_object(
    'users', (select pg_catalog.jsonb_build_object('rows', pg_catalog.count(*),
                       'md5', pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.md5((pg_catalog.to_jsonb(u) - 'password')::pg_catalog.text), '' order by u.id), '')))
                from public.users u where u.id not in (select c.member_id from acct c)),
    'member_identity', (select pg_catalog.jsonb_build_object('rows', pg_catalog.count(*),
                       'md5', pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.md5(pg_catalog.to_jsonb(mi)::pg_catalog.text), '' order by mi.auth_user_id), '')))
                from security_private.member_identity mi where mi.member_id not in (select c.member_id from acct c)),
    'applications', (select pg_catalog.jsonb_build_object('rows', pg_catalog.count(*),
                       'md5', pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.md5(pg_catalog.to_jsonb(a)::pg_catalog.text), '' order by a.id), '')))
                from j, public.applications a where a.id not in (select (x->>'id')::pg_catalog.uuid from pg_catalog.jsonb_array_elements(j.v->'applications') x)),
    'study_results_v3', (select pg_catalog.jsonb_build_object('rows', pg_catalog.count(*),
                       'md5', pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.md5(pg_catalog.to_jsonb(s)::pg_catalog.text), '' order by s.id), '')))
                from j, public.study_results_v3 s where s.id not in (select (x->>'id')::pg_catalog.uuid from pg_catalog.jsonb_array_elements(j.v->'records') x)),
    'tr_user_map', (select pg_catalog.jsonb_build_object('rows', pg_catalog.count(*),
                       'md5', pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.md5(pg_catalog.to_jsonb(m)::pg_catalog.text), '' order by m.user_id), '')))
                from public.tr_user_map m where m.user_id not in (select c.member_id from acct c)),
    'tr_deadline_extensions', (select pg_catalog.jsonb_build_object('rows', pg_catalog.count(*),
                       'md5', pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.md5(pg_catalog.to_jsonb(e)::pg_catalog.text), '' order by e.id), '')))
                from j, public.tr_deadline_extensions e
               where e.id not in (select x->>'id' from pg_catalog.jsonb_array_elements(coalesce(j.v->'extensions', '[]'::pg_catalog.jsonb)) x))
  )
) as result;
