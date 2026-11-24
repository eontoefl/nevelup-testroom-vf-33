-- =====================================================================
-- 보안작업 묶음 2 — 계약 3B 합성 학생 자료 내리기 (시험 프로젝트 hmncdheiwqwekdbtijar 전용)
--
-- ★ 운영에서 실행하지 않는다. 실행 직전에 절차.md 의 대상 확인을 한다.
-- 이 파일은 작업방이 실행해 보지 않았다(문법 확인도 하지 못했다).
--
-- fixtures_up.sql 이 실제로 만든 행(그 결과의 down_input)만 지운다 — 넣은 행의 정확한 번호로만. 이름의 앞부분으로 지우지 않는다.
-- 로그인 계정(Auth)은 이 파일이 지우지 않는다(브레인방이 로그인 서버로 만든 번호 그대로 지운다).
--
-- 받는 값(같은 요청의 맨 앞)
--     set b3b.test_project_ref = 'hmncdheiwqwekdbtijar';
--     set b3b.created = '<fixtures_up.sql 결과의 down_input — 한 줄 글자 그대로>';
--
-- 지우기 전에 확인하는 것(하나라도 다르면 아무것도 지우지 않고 멈춘다)
--   * 옛 길이 고치는 칸이 전부 처음 값이다(= fixtures_reset.sql 로 되돌린 상태). tr_user_map 은 처음부터 있던 행뿐이다
--   * 목록에 겹친 번호가 없고, 행마다 주인(합성 회원·그 회원의 신청서)이 목록 안에서 맞는다
--   * 목록의 행이 전부 **그 주인의 것으로** 있고(마감 연장도 건수가 아니라 행마다), 그 밖의 칸의 지문이 올릴 때와 같다. 합성 회원·합성 이메일의 행 수가 목록과 같다
-- 지우는 문장마다 번호와 함께 회원번호·이메일·신청서 번호·기대 값을 건다.
-- 결과(한 칸 jsonb): 지운 수(올릴 때 넣은 수와 같아야 한다), 끝난 뒤 남은 수(전부 0)
-- =====================================================================

begin;

create temporary table zzb3b_down_result (result pg_catalog.jsonb) on commit preserve rows;

do $zz_b3b$
declare
  j pg_catalog.jsonb;
  v_members pg_catalog.uuid[];
  v_n bigint; v_bad bigint;
  n_recs bigint; n_ext bigint; n_map bigint; n_apps bigint; n_ident bigint; n_users bigint;
  w_recs bigint; w_ext bigint; w_map bigint; w_apps bigint; w_acct bigint;
  left_n bigint;
begin
  if coalesce(pg_catalog.current_setting('b3b.test_project_ref', true), '') <> 'hmncdheiwqwekdbtijar' then
    raise exception 'zzb3b 내리기 중단: 대상 확인 값이 없다. 아무것도 지우지 않았다';
  end if;
  begin
    j := pg_catalog.current_setting('b3b.created')::pg_catalog.jsonb;
  exception when others then
    raise exception 'zzb3b 내리기 중단: b3b.created 를 읽지 못했다. 아무것도 지우지 않았다';
  end;
  if pg_catalog.jsonb_typeof(j->'accounts') <> 'array' or pg_catalog.jsonb_typeof(j->'applications') <> 'array' or pg_catalog.jsonb_typeof(j->'records') <> 'array' then
    raise exception 'zzb3b 내리기 중단: b3b.created 의 모양이 다르다. 아무것도 지우지 않았다';
  end if;
  select pg_catalog.array_agg((x->>'member_id')::pg_catalog.uuid) into v_members from pg_catalog.jsonb_array_elements(j->'accounts') x;
  w_acct := pg_catalog.jsonb_array_length(j->'accounts');
  w_apps := pg_catalog.jsonb_array_length(j->'applications');
  w_recs := pg_catalog.jsonb_array_length(j->'records');
  w_ext := pg_catalog.jsonb_array_length(coalesce(j->'extensions', '[]'::pg_catalog.jsonb));
  w_map := pg_catalog.jsonb_array_length(coalesce(j->'user_map', '[]'::pg_catalog.jsonb));

  -- 0) 목록 자체: 겹친 번호가 없고, 행마다 주인(합성 회원·그 회원의 신청서)이 목록 안에서 맞는다
  if pg_catalog.jsonb_typeof(coalesce(j->'extensions', '[]'::pg_catalog.jsonb)) <> 'array' or pg_catalog.jsonb_typeof(coalesce(j->'user_map', '[]'::pg_catalog.jsonb)) <> 'array' then
    raise exception 'zzb3b 내리기 중단: b3b.created 의 extensions·user_map 이 목록이 아니다. 아무것도 지우지 않았다';
  end if;
  select (select pg_catalog.count(*) - pg_catalog.count(distinct x->>'id') from pg_catalog.jsonb_array_elements(j->'applications') x)
       + (select pg_catalog.count(*) - pg_catalog.count(distinct x->>'id') from pg_catalog.jsonb_array_elements(j->'records') x)
       + (select pg_catalog.count(*) - pg_catalog.count(distinct x->>'id') from pg_catalog.jsonb_array_elements(coalesce(j->'extensions', '[]'::pg_catalog.jsonb)) x)
       + (select pg_catalog.count(*) - pg_catalog.count(distinct x->>'user_id') from pg_catalog.jsonb_array_elements(coalesce(j->'user_map', '[]'::pg_catalog.jsonb)) x)
       + (select pg_catalog.count(*) - pg_catalog.count(distinct x->>'member_id') from pg_catalog.jsonb_array_elements(j->'accounts') x)
       + (select pg_catalog.count(*) - pg_catalog.count(distinct x->>'auth_user_id') from pg_catalog.jsonb_array_elements(j->'accounts') x)
       + (select pg_catalog.count(*) - pg_catalog.count(distinct x->>'label') from pg_catalog.jsonb_array_elements(j->'accounts') x)
    into v_n;
  if v_n <> 0 then raise exception 'zzb3b 내리기 중단: 목록에 겹친(또는 빠진) 번호가 %개 있다. 아무것도 지우지 않았다', v_n; end if;
  select pg_catalog.count(*) into v_n from pg_catalog.jsonb_array_elements(j->'applications') x
   where not exists (select 1 from pg_catalog.jsonb_array_elements(j->'accounts') c
                      where c->>'member_id' = x->>'member_id' and x->>'email' = 'zzb3b_' || (c->>'label') || '@member.zzb3b.invalid');
  if v_n <> 0 then raise exception 'zzb3b 내리기 중단: 목록의 신청서 %개가 목록의 합성 회원·합성 이메일의 것이 아니다. 아무것도 지우지 않았다', v_n; end if;
  select pg_catalog.count(*) into v_n from pg_catalog.jsonb_array_elements(j->'records') x
   where not exists (select 1 from pg_catalog.jsonb_array_elements(j->'applications') a
                      where a->>'id' = x->>'enrollment_id' and a->>'member_id' = x->>'user_id');
  if v_n <> 0 then raise exception 'zzb3b 내리기 중단: 목록의 학습 기록 %개가 목록의 합성 회원·그 회원의 신청서의 것이 아니다. 아무것도 지우지 않았다', v_n; end if;
  select pg_catalog.count(*) into v_n from pg_catalog.jsonb_array_elements(coalesce(j->'extensions', '[]'::pg_catalog.jsonb)) x
   where not exists (select 1 from pg_catalog.jsonb_array_elements(j->'applications') a
                      where a->>'id' = x->>'enrollment_id' and a->>'member_id' = x->>'user_id');
  if v_n <> 0 then raise exception 'zzb3b 내리기 중단: 목록의 마감 연장 %개가 목록의 합성 회원·그 회원의 신청서의 것이 아니다. 아무것도 지우지 않았다', v_n; end if;
  select pg_catalog.count(*) into v_n from pg_catalog.jsonb_array_elements(coalesce(j->'user_map', '[]'::pg_catalog.jsonb)) x
   where not exists (select 1 from pg_catalog.jsonb_array_elements(j->'accounts') c
                      where c->>'member_id' = x->>'user_id' and x->>'email' = 'zzb3b_' || (c->>'label') || '@member.zzb3b.invalid');
  if v_n <> 0 then raise exception 'zzb3b 내리기 중단: 목록의 tr_user_map 행 %개가 목록의 합성 회원·합성 이메일의 것이 아니다. 아무것도 지우지 않았다', v_n; end if;

  -- 목록의 행이 전부 있고, 전부 처음 그대로다(옛 길이 고치는 칸 포함 — 되돌린 상태)
  select pg_catalog.count(*) into v_bad from pg_catalog.jsonb_array_elements(j->'applications') x left join public.applications a on a.id = (x->>'id')::pg_catalog.uuid and a.user_id = x->>'member_id' and a.email = x->>'email'
   where a.id is null or a.self_paced_schedule is distinct from (x->>'self_paced_schedule')
      or pg_catalog.md5((pg_catalog.to_jsonb(a) - 'self_paced_schedule')::pg_catalog.text) <> x->>'rest_md5';
  if v_bad <> 0 then raise exception 'zzb3b 내리기 중단: 신청서 %행이 없거나 올릴 때와 다르다(fixtures_reset.sql 을 먼저). 아무것도 지우지 않았다', v_bad; end if;
  select pg_catalog.count(*) into v_bad from pg_catalog.jsonb_array_elements(j->'records') x left join public.study_results_v3 s on s.id = (x->>'id')::pg_catalog.uuid and s.user_id = x->>'user_id' and s.enrollment_id::pg_catalog.text = x->>'enrollment_id'
   where s.id is null or s.locked_auth_rate is distinct from (x->>'locked_auth_rate')::integer
      or pg_catalog.md5((pg_catalog.to_jsonb(s) - 'locked_auth_rate')::pg_catalog.text) <> x->>'rest_md5';
  if v_bad <> 0 then raise exception 'zzb3b 내리기 중단: 학습 기록 %행이 없거나 올릴 때와 다르다(fixtures_reset.sql 을 먼저). 아무것도 지우지 않았다', v_bad; end if;

  -- 합성 회원·합성 이메일의 행 수가 목록과 같다(그 사이 생긴 행이 없다)
  select pg_catalog.count(*) into v_n from public.applications a
   where a.user_id = any (select m::pg_catalog.text from pg_catalog.unnest(v_members) m) or a.email like 'zzb3b\_%@member.zzb3b.invalid' escape '\';
  if v_n <> w_apps then raise exception 'zzb3b 내리기 중단: 합성 신청서 행이 %개다(목록 %개). 아무것도 지우지 않았다', v_n, w_apps; end if;
  select pg_catalog.count(*) into v_n from public.study_results_v3 s where s.user_id = any (select m::pg_catalog.text from pg_catalog.unnest(v_members) m);
  if v_n <> w_recs then raise exception 'zzb3b 내리기 중단: 합성 학습 기록 행이 %개다(목록 %개). 아무것도 지우지 않았다', v_n, w_recs; end if;
  -- 마감 연장: 건수가 아니라 목록의 행 하나하나를 주인과 함께 대조하고, 목록 밖의 합성 행이 없는지 본다
  select pg_catalog.count(*) into v_bad from pg_catalog.jsonb_array_elements(coalesce(j->'extensions', '[]'::pg_catalog.jsonb)) x
    left join public.tr_deadline_extensions e on e.id = x->>'id' and e.user_id = x->>'user_id' and e.enrollment_id::pg_catalog.text = x->>'enrollment_id'
   where e.id is null;
  select pg_catalog.count(*) into v_n from public.tr_deadline_extensions e
   where (e.user_id = any (select m::pg_catalog.text from pg_catalog.unnest(v_members) m)
          or e.enrollment_id::pg_catalog.text in (select x->>'id' from pg_catalog.jsonb_array_elements(j->'applications') x))
     and not exists (select 1 from pg_catalog.jsonb_array_elements(coalesce(j->'extensions', '[]'::pg_catalog.jsonb)) x
                      where e.id = x->>'id' and e.user_id = x->>'user_id' and e.enrollment_id::pg_catalog.text = x->>'enrollment_id');
  if v_bad <> 0 or v_n <> 0 then raise exception 'zzb3b 내리기 중단: 마감 연장 — 목록의 행 %개가 없거나 주인이 다르고, 목록 밖의 합성 행이 %개 있다. 아무것도 지우지 않았다', v_bad, v_n; end if;
  select pg_catalog.count(*) into v_n from public.tr_user_map m where m.user_id = any (v_members) or m.email like 'zzb3b\_%@member.zzb3b.invalid' escape '\';
  select pg_catalog.count(*) into v_bad from pg_catalog.jsonb_array_elements(coalesce(j->'user_map', '[]'::pg_catalog.jsonb)) x
    left join public.tr_user_map m on m.user_id = (x->>'user_id')::pg_catalog.uuid
   where m.user_id is null or m.email is distinct from x->>'email' or m.name is distinct from x->>'name' or m.updated_at is distinct from (x->>'updated_at')::timestamptz;
  if v_n <> w_map or v_bad <> 0 then raise exception 'zzb3b 내리기 중단: tr_user_map 의 합성 행이 %개(목록 %개), 처음 값과 다른 행 %개(fixtures_reset.sql 을 먼저). 아무것도 지우지 않았다', v_n, w_map, v_bad; end if;
  select pg_catalog.count(*) into v_n from public.users u where u.id = any (v_members) and u.email like 'zzb3b\_%@member.zzb3b.invalid' escape '\';
  if v_n <> w_acct then raise exception 'zzb3b 내리기 중단: 합성 회원 행이 %개다(목록 %개). 아무것도 지우지 않았다', v_n, w_acct; end if;

  -- 지운다: 넣은 행의 정확한 번호 + 그 행의 주인(회원번호·이메일·신청서 번호) + 기대 값을 함께 걸어서
  delete from public.study_results_v3 s
   using pg_catalog.jsonb_array_elements(j->'records') x
   where s.id = (x->>'id')::pg_catalog.uuid and s.user_id = x->>'user_id' and s.enrollment_id::pg_catalog.text = x->>'enrollment_id'
     and s.locked_auth_rate is not distinct from (x->>'locked_auth_rate')::integer;
  get diagnostics n_recs = row_count;
  delete from public.tr_deadline_extensions e
   using pg_catalog.jsonb_array_elements(coalesce(j->'extensions', '[]'::pg_catalog.jsonb)) x
   where e.id = x->>'id' and e.user_id = x->>'user_id' and e.enrollment_id::pg_catalog.text = x->>'enrollment_id';
  get diagnostics n_ext = row_count;
  delete from public.tr_user_map m
   using pg_catalog.jsonb_array_elements(coalesce(j->'user_map', '[]'::pg_catalog.jsonb)) x
   where m.user_id = (x->>'user_id')::pg_catalog.uuid and m.user_id = any (v_members) and m.email = x->>'email' and m.name is not distinct from x->>'name';
  get diagnostics n_map = row_count;
  delete from public.applications a
   using pg_catalog.jsonb_array_elements(j->'applications') x
   where a.id = (x->>'id')::pg_catalog.uuid and a.user_id = x->>'member_id' and a.email = x->>'email'
     and a.self_paced_schedule is not distinct from (x->>'self_paced_schedule');
  get diagnostics n_apps = row_count;
  delete from security_private.member_identity mi
   using pg_catalog.jsonb_array_elements(j->'accounts') x
   where mi.auth_user_id = (x->>'auth_user_id')::pg_catalog.uuid and mi.member_id = (x->>'member_id')::pg_catalog.uuid;
  get diagnostics n_ident = row_count;
  delete from public.users u
   using pg_catalog.jsonb_array_elements(j->'accounts') x
   where u.id = (x->>'member_id')::pg_catalog.uuid and u.email = 'zzb3b_' || (x->>'label') || '@member.zzb3b.invalid';
  get diagnostics n_users = row_count;

  if n_recs <> w_recs or n_ext <> w_ext or n_map <> w_map or n_apps <> w_apps or n_ident <> w_acct or n_users <> w_acct then
    raise exception 'zzb3b 내리기 실패: 지운 수가 넣은 수와 다르다(학습 기록 %/% · 마감 연장 %/% · tr_user_map %/% · 신청서 %/% · 대응 %/% · 회원 %/%). 전부 되돌린다',
      n_recs, w_recs, n_ext, w_ext, n_map, w_map, n_apps, w_apps, n_ident, w_acct, n_users, w_acct;
  end if;
  select (select pg_catalog.count(*) from public.users u where u.id = any (v_members))
       + (select pg_catalog.count(*) from public.applications a where a.user_id = any (select m::pg_catalog.text from pg_catalog.unnest(v_members) m))
       + (select pg_catalog.count(*) from public.study_results_v3 s where s.user_id = any (select m::pg_catalog.text from pg_catalog.unnest(v_members) m))
       + (select pg_catalog.count(*) from public.tr_user_map m where m.user_id = any (v_members))
       + (select pg_catalog.count(*) from public.tr_deadline_extensions e where e.user_id = any (select m::pg_catalog.text from pg_catalog.unnest(v_members) m))
       + (select pg_catalog.count(*) from security_private.member_identity mi where mi.member_id = any (v_members))
    into left_n;
  if left_n <> 0 then raise exception 'zzb3b 내리기 실패: 지운 뒤에도 합성 회원번호의 행이 %개 남았다. 전부 되돌린다', left_n; end if;

  insert into zzb3b_down_result values (pg_catalog.jsonb_build_object(
    'marker', 'zzb3b', 'read_at', pg_catalog.now(),
    'deleted', pg_catalog.jsonb_build_object('records', n_recs, 'extensions', n_ext, 'user_map', n_map, 'applications', n_apps, 'mappings', n_ident, 'users', n_users),
    'left', left_n,
    'note', '로그인 계정(Auth)은 지우지 않았다 — 브레인방이 만든 번호 그대로 지운다'));
end;
$zz_b3b$;

commit;

reset b3b.test_project_ref;

select r.result from zzb3b_down_result r;
