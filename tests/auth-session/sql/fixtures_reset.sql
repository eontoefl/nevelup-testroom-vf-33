-- =====================================================================
-- 보안작업 묶음 2 — 계약 3B: 옛 길(꺼짐의 로그인)이 일으킨 쓰기를 되돌린다 (시험 프로젝트 hmncdheiwqwekdbtijar 전용)
--
-- ★ 운영에서 실행하지 않는다. 실행 직전에 절차.md 의 대상 확인을 한다.
-- 이 파일은 작업방이 실행해 보지 않았다(문법 확인도 하지 못했다).
--
-- 옛 길의 로그인은 세 가지를 쓴다: 신청서의 self_paced_schedule, tr_user_map(넣기·고치기), study_results_v3 의 locked_auth_rate.
-- 이 파일은 fixtures_up.sql 이 실제로 만든 행(그 결과의 down_input)만 다룬다. 이름의 앞부분으로 찾아 고치지 않는다.
--
-- 받는 값(같은 요청의 맨 앞)
--     set b3b.test_project_ref = 'hmncdheiwqwekdbtijar';
--     set b3b.created = '<fixtures_up.sql 결과의 down_input — 한 줄 글자 그대로>';
--     set b3b.reset_mode = 'check';     -- 'check' = 보기만(아무것도 바꾸지 않는다) / 'apply' = 되돌린다
--
-- 되돌리기 전에 확인하는 것(하나라도 다르면 아무것도 바꾸지 않고 멈춘다 — 무엇이 달랐는지 수로 알린다)
--   * 목록에 겹친 번호가 없고, 행마다 주인(합성 회원·그 회원의 신청서)이 목록 안에서 맞는다
--   * 목록의 신청서·학습 기록 행이 전부 **그 주인의 것으로** 있고, 옛 길이 고치는 칸을 뺀 나머지 칸의 지문이 올릴 때와 같다
--   * 합성 회원·합성 이메일의 신청서·학습 기록 행의 수가 목록과 같다(그 사이 생기거나 사라진 행이 없다)
--   * 옛 길이 고치는 칸의 지금 값이 정해 둔 모양 안에 있다: 일정표는 글자(또는 처음 값), 인증률은 0·50·100(또는 처음 값)
--   * tr_user_map 에서 합성 회원의 행은 "처음부터 있던 행" 아니면 "그 회원번호·그 합성 이메일의 한 행"뿐이다
-- 되돌리는 것(한 트랜잭션 — 고치고 지우는 문장마다 번호와 함께 회원번호·이메일·신청서 번호·기대 값을 건다)
--   * 신청서의 self_paced_schedule → 처음 값 / study_results_v3 의 locked_auth_rate → 처음 값
--   * tr_user_map: 옛 길이 새로 만든 행은 지운다(그 합성 회원번호의 그 한 행만 — "원래 없음"으로), 처음부터 있던 행은 처음 값으로
-- 결과(한 칸 jsonb): mode, 달라져 있던 수(applications·records·user_map_new·user_map_changed), 되돌린 수, 끝난 뒤 다시 본 수(전부 0 이어야 한다)
-- =====================================================================

begin;

create temporary table zzb3b_reset_result (result pg_catalog.jsonb) on commit preserve rows;

do $zz_b3b$
declare
  j        pg_catalog.jsonb;
  v_mode   text := coalesce(pg_catalog.current_setting('b3b.reset_mode', true), '');
  v_members pg_catalog.uuid[];
  v_n bigint; v_missing bigint; v_changed_rest bigint; v_extra bigint; v_bad_value bigint; v_bad_map bigint;
  d_apps bigint; d_recs bigint; d_new bigint; d_map bigint;
  r_apps bigint := 0; r_recs bigint := 0; r_new bigint := 0; r_map bigint := 0;
  a_apps bigint; a_recs bigint; a_new bigint; a_map bigint;
begin
  if coalesce(pg_catalog.current_setting('b3b.test_project_ref', true), '') <> 'hmncdheiwqwekdbtijar' then
    raise exception 'zzb3b 되돌리기 중단: 대상 확인 값이 없다. 아무것도 바꾸지 않았다';
  end if;
  if v_mode not in ('check', 'apply') then
    raise exception 'zzb3b 되돌리기 중단: b3b.reset_mode 는 check 또는 apply. 아무것도 바꾸지 않았다';
  end if;
  begin
    j := pg_catalog.current_setting('b3b.created')::pg_catalog.jsonb;
  exception when others then
    raise exception 'zzb3b 되돌리기 중단: b3b.created 를 읽지 못했다(fixtures_up.sql 결과의 down_input 을 그대로 넘길 것). 아무것도 바꾸지 않았다';
  end;
  if pg_catalog.jsonb_typeof(j->'accounts') <> 'array' or pg_catalog.jsonb_typeof(j->'applications') <> 'array' or pg_catalog.jsonb_typeof(j->'records') <> 'array' then
    raise exception 'zzb3b 되돌리기 중단: b3b.created 의 모양이 다르다. 아무것도 바꾸지 않았다';
  end if;
  select pg_catalog.array_agg((x->>'member_id')::pg_catalog.uuid) into v_members from pg_catalog.jsonb_array_elements(j->'accounts') x;

  -- 0) 목록 자체: 겹친 번호가 없고, 행마다 주인(합성 회원·그 회원의 신청서)이 목록 안에서 맞는다
  if pg_catalog.jsonb_typeof(coalesce(j->'extensions', '[]'::pg_catalog.jsonb)) <> 'array' or pg_catalog.jsonb_typeof(coalesce(j->'user_map', '[]'::pg_catalog.jsonb)) <> 'array' then
    raise exception 'zzb3b 되돌리기 중단: b3b.created 의 extensions·user_map 이 목록이 아니다. 아무것도 바꾸지 않았다';
  end if;
  select (select pg_catalog.count(*) - pg_catalog.count(distinct x->>'id') from pg_catalog.jsonb_array_elements(j->'applications') x)
       + (select pg_catalog.count(*) - pg_catalog.count(distinct x->>'id') from pg_catalog.jsonb_array_elements(j->'records') x)
       + (select pg_catalog.count(*) - pg_catalog.count(distinct x->>'id') from pg_catalog.jsonb_array_elements(coalesce(j->'extensions', '[]'::pg_catalog.jsonb)) x)
       + (select pg_catalog.count(*) - pg_catalog.count(distinct x->>'user_id') from pg_catalog.jsonb_array_elements(coalesce(j->'user_map', '[]'::pg_catalog.jsonb)) x)
       + (select pg_catalog.count(*) - pg_catalog.count(distinct x->>'member_id') from pg_catalog.jsonb_array_elements(j->'accounts') x)
       + (select pg_catalog.count(*) - pg_catalog.count(distinct x->>'auth_user_id') from pg_catalog.jsonb_array_elements(j->'accounts') x)
       + (select pg_catalog.count(*) - pg_catalog.count(distinct x->>'label') from pg_catalog.jsonb_array_elements(j->'accounts') x)
    into v_n;
  if v_n <> 0 then raise exception 'zzb3b 되돌리기 중단: 목록에 겹친(또는 빠진) 번호가 %개 있다. 아무것도 바꾸지 않았다', v_n; end if;
  select pg_catalog.count(*) into v_n from pg_catalog.jsonb_array_elements(j->'applications') x
   where not exists (select 1 from pg_catalog.jsonb_array_elements(j->'accounts') c
                      where c->>'member_id' = x->>'member_id' and x->>'email' = 'zzb3b_' || (c->>'label') || '@member.zzb3b.invalid');
  if v_n <> 0 then raise exception 'zzb3b 되돌리기 중단: 목록의 신청서 %개가 목록의 합성 회원·합성 이메일의 것이 아니다. 아무것도 바꾸지 않았다', v_n; end if;
  select pg_catalog.count(*) into v_n from pg_catalog.jsonb_array_elements(j->'records') x
   where not exists (select 1 from pg_catalog.jsonb_array_elements(j->'applications') a
                      where a->>'id' = x->>'enrollment_id' and a->>'member_id' = x->>'user_id');
  if v_n <> 0 then raise exception 'zzb3b 되돌리기 중단: 목록의 학습 기록 %개가 목록의 합성 회원·그 회원의 신청서의 것이 아니다. 아무것도 바꾸지 않았다', v_n; end if;
  select pg_catalog.count(*) into v_n from pg_catalog.jsonb_array_elements(coalesce(j->'extensions', '[]'::pg_catalog.jsonb)) x
   where not exists (select 1 from pg_catalog.jsonb_array_elements(j->'applications') a
                      where a->>'id' = x->>'enrollment_id' and a->>'member_id' = x->>'user_id');
  if v_n <> 0 then raise exception 'zzb3b 되돌리기 중단: 목록의 마감 연장 %개가 목록의 합성 회원·그 회원의 신청서의 것이 아니다. 아무것도 바꾸지 않았다', v_n; end if;
  select pg_catalog.count(*) into v_n from pg_catalog.jsonb_array_elements(coalesce(j->'user_map', '[]'::pg_catalog.jsonb)) x
   where not exists (select 1 from pg_catalog.jsonb_array_elements(j->'accounts') c
                      where c->>'member_id' = x->>'user_id' and x->>'email' = 'zzb3b_' || (c->>'label') || '@member.zzb3b.invalid');
  if v_n <> 0 then raise exception 'zzb3b 되돌리기 중단: 목록의 tr_user_map 행 %개가 목록의 합성 회원·합성 이메일의 것이 아니다. 아무것도 바꾸지 않았다', v_n; end if;

  -- 1) 목록의 행이 전부 있고 나머지 칸의 지문이 같다
  select pg_catalog.count(*) filter (where a.id is null),
         pg_catalog.count(*) filter (where a.id is not null and pg_catalog.md5((pg_catalog.to_jsonb(a) - 'self_paced_schedule')::pg_catalog.text) <> x->>'rest_md5')
    into v_missing, v_changed_rest
    from pg_catalog.jsonb_array_elements(j->'applications') x left join public.applications a on a.id = (x->>'id')::pg_catalog.uuid and a.user_id = x->>'member_id' and a.email = x->>'email';
  if v_missing <> 0 or v_changed_rest <> 0 then
    raise exception 'zzb3b 되돌리기 중단: 신청서 — 없는 행 %개, 옛 길이 고치는 칸 밖이 달라진 행 %개. 아무것도 바꾸지 않았다(직접 확인할 것)', v_missing, v_changed_rest;
  end if;
  select pg_catalog.count(*) filter (where s.id is null),
         pg_catalog.count(*) filter (where s.id is not null and pg_catalog.md5((pg_catalog.to_jsonb(s) - 'locked_auth_rate')::pg_catalog.text) <> x->>'rest_md5')
    into v_missing, v_changed_rest
    from pg_catalog.jsonb_array_elements(j->'records') x left join public.study_results_v3 s on s.id = (x->>'id')::pg_catalog.uuid and s.user_id = x->>'user_id' and s.enrollment_id::pg_catalog.text = x->>'enrollment_id';
  if v_missing <> 0 or v_changed_rest <> 0 then
    raise exception 'zzb3b 되돌리기 중단: 학습 기록 — 없는 행 %개, 옛 길이 고치는 칸 밖이 달라진 행 %개. 아무것도 바꾸지 않았다(직접 확인할 것)', v_missing, v_changed_rest;
  end if;

  -- 2) 그 사이 생긴 행이 없다
  select pg_catalog.count(*) into v_extra from public.applications a
   where (a.user_id = any (select m::pg_catalog.text from pg_catalog.unnest(v_members) m) or a.email like 'zzb3b\_%@member.zzb3b.invalid' escape '\')
     and a.id not in (select (x->>'id')::pg_catalog.uuid from pg_catalog.jsonb_array_elements(j->'applications') x);
  if v_extra <> 0 then raise exception 'zzb3b 되돌리기 중단: 목록에 없는 합성 신청서 행이 %개 있다. 아무것도 바꾸지 않았다', v_extra; end if;
  select pg_catalog.count(*) into v_extra from public.study_results_v3 s
   where s.user_id = any (select m::pg_catalog.text from pg_catalog.unnest(v_members) m)
     and s.id not in (select (x->>'id')::pg_catalog.uuid from pg_catalog.jsonb_array_elements(j->'records') x);
  if v_extra <> 0 then raise exception 'zzb3b 되돌리기 중단: 목록에 없는 합성 학습 기록 행이 %개 있다. 아무것도 바꾸지 않았다', v_extra; end if;

  -- 3) 옛 길이 고치는 칸의 지금 값이 정해 둔 모양 안에 있다
  select pg_catalog.count(*) into v_bad_value
    from pg_catalog.jsonb_array_elements(j->'records') x join public.study_results_v3 s on s.id = (x->>'id')::pg_catalog.uuid and s.user_id = x->>'user_id' and s.enrollment_id::pg_catalog.text = x->>'enrollment_id'
   where s.locked_auth_rate is distinct from (x->>'locked_auth_rate')::integer and (s.locked_auth_rate is null or s.locked_auth_rate not in (0, 50, 100));
  if v_bad_value <> 0 then raise exception 'zzb3b 되돌리기 중단: 인증률이 0·50·100 이 아닌 값으로 바뀐 행이 %개 있다. 아무것도 바꾸지 않았다', v_bad_value; end if;

  -- 4) tr_user_map: 합성 회원의 행은 처음부터 있던 행이거나, 그 회원번호·그 합성 이메일의 행뿐
  select pg_catalog.count(*) into v_bad_map
    from public.tr_user_map m
   where (m.user_id = any (v_members) or m.email like 'zzb3b\_%@member.zzb3b.invalid' escape '\')
     and not exists (select 1 from pg_catalog.jsonb_array_elements(j->'accounts') x
                      where (x->>'member_id')::pg_catalog.uuid = m.user_id and m.email = 'zzb3b_' || (x->>'label') || '@member.zzb3b.invalid');
  if v_bad_map <> 0 then raise exception 'zzb3b 되돌리기 중단: tr_user_map 에 합성 회원번호·합성 이메일이 서로 맞지 않는 행이 %개 있다. 아무것도 바꾸지 않았다', v_bad_map; end if;

  -- 달라져 있는 수
  select pg_catalog.count(*) into d_apps from pg_catalog.jsonb_array_elements(j->'applications') x join public.applications a on a.id = (x->>'id')::pg_catalog.uuid and a.user_id = x->>'member_id' and a.email = x->>'email'
   where a.self_paced_schedule is distinct from (x->>'self_paced_schedule');
  select pg_catalog.count(*) into d_recs from pg_catalog.jsonb_array_elements(j->'records') x join public.study_results_v3 s on s.id = (x->>'id')::pg_catalog.uuid and s.user_id = x->>'user_id' and s.enrollment_id::pg_catalog.text = x->>'enrollment_id'
   where s.locked_auth_rate is distinct from (x->>'locked_auth_rate')::integer;
  select pg_catalog.count(*) into d_new from public.tr_user_map m
   where m.user_id = any (v_members)
     and m.user_id not in (select (x->>'user_id')::pg_catalog.uuid from pg_catalog.jsonb_array_elements(coalesce(j->'user_map', '[]'::pg_catalog.jsonb)) x);
  select pg_catalog.count(*) into d_map from pg_catalog.jsonb_array_elements(coalesce(j->'user_map', '[]'::pg_catalog.jsonb)) x
    left join public.tr_user_map m on m.user_id = (x->>'user_id')::pg_catalog.uuid
   where m.user_id is null or m.email is distinct from x->>'email' or m.name is distinct from x->>'name' or m.updated_at is distinct from (x->>'updated_at')::timestamptz;

  if v_mode = 'apply' then
    update public.applications a set self_paced_schedule = x->>'self_paced_schedule'
      from pg_catalog.jsonb_array_elements(j->'applications') x
     where a.id = (x->>'id')::pg_catalog.uuid and a.user_id = x->>'member_id' and a.email = x->>'email'
       and a.self_paced_schedule is distinct from (x->>'self_paced_schedule');
    get diagnostics r_apps = row_count;
    update public.study_results_v3 s set locked_auth_rate = (x->>'locked_auth_rate')::integer
      from pg_catalog.jsonb_array_elements(j->'records') x
     where s.id = (x->>'id')::pg_catalog.uuid and s.user_id = x->>'user_id' and s.enrollment_id::pg_catalog.text = x->>'enrollment_id'
       and s.locked_auth_rate in (0, 50, 100)
       and s.locked_auth_rate is distinct from (x->>'locked_auth_rate')::integer;
    get diagnostics r_recs = row_count;
    -- 옛 길이 새로 만든 tr_user_map 행: 그 합성 회원번호의 그 한 행만 지운다("원래 없음"으로)
    delete from public.tr_user_map m
     where m.user_id = any (v_members)
       and exists (select 1 from pg_catalog.jsonb_array_elements(j->'accounts') c
                    where (c->>'member_id')::pg_catalog.uuid = m.user_id and m.email = 'zzb3b_' || (c->>'label') || '@member.zzb3b.invalid')
       and m.user_id not in (select (x->>'user_id')::pg_catalog.uuid from pg_catalog.jsonb_array_elements(coalesce(j->'user_map', '[]'::pg_catalog.jsonb)) x);
    get diagnostics r_new = row_count;
    update public.tr_user_map m set email = x->>'email', name = x->>'name', updated_at = (x->>'updated_at')::timestamptz
      from pg_catalog.jsonb_array_elements(coalesce(j->'user_map', '[]'::pg_catalog.jsonb)) x
     where m.user_id = (x->>'user_id')::pg_catalog.uuid and m.user_id = any (v_members)
       and (m.email is distinct from x->>'email' or m.name is distinct from x->>'name' or m.updated_at is distinct from (x->>'updated_at')::timestamptz);
    get diagnostics r_map = row_count;
    if r_apps <> d_apps or r_recs <> d_recs or r_new <> d_new or r_map > d_map then
      raise exception 'zzb3b 되돌리기 실패: 되돌린 수가 달라져 있던 수와 다르다(신청서 %/% · 학습 기록 %/% · 새 tr_user_map %/% · 고친 tr_user_map %/%). 전부 되돌린다', r_apps, d_apps, r_recs, d_recs, r_new, d_new, r_map, d_map;
    end if;
    -- 신청서를 고치면 트리거가 돈다: 고친 뒤에도 나머지 칸의 지문이 올릴 때와 같아야 한다
    select pg_catalog.count(*) into v_changed_rest
      from pg_catalog.jsonb_array_elements(j->'applications') x join public.applications a on a.id = (x->>'id')::pg_catalog.uuid and a.user_id = x->>'member_id' and a.email = x->>'email'
     where pg_catalog.md5((pg_catalog.to_jsonb(a) - 'self_paced_schedule')::pg_catalog.text) <> x->>'rest_md5';
    if v_changed_rest <> 0 then
      raise exception 'zzb3b 되돌리기 실패: 되돌리는 동안 신청서의 다른 칸이 달라진 행이 %개 있다(트리거). 전부 되돌린다', v_changed_rest;
    end if;
  end if;

  -- 끝난 뒤 다시 본 수(apply 면 전부 0 이어야 한다)
  select pg_catalog.count(*) into a_apps from pg_catalog.jsonb_array_elements(j->'applications') x join public.applications a on a.id = (x->>'id')::pg_catalog.uuid and a.user_id = x->>'member_id' and a.email = x->>'email'
   where a.self_paced_schedule is distinct from (x->>'self_paced_schedule');
  select pg_catalog.count(*) into a_recs from pg_catalog.jsonb_array_elements(j->'records') x join public.study_results_v3 s on s.id = (x->>'id')::pg_catalog.uuid and s.user_id = x->>'user_id' and s.enrollment_id::pg_catalog.text = x->>'enrollment_id'
   where s.locked_auth_rate is distinct from (x->>'locked_auth_rate')::integer;
  select pg_catalog.count(*) into a_new from public.tr_user_map m
   where m.user_id = any (v_members)
     and m.user_id not in (select (x->>'user_id')::pg_catalog.uuid from pg_catalog.jsonb_array_elements(coalesce(j->'user_map', '[]'::pg_catalog.jsonb)) x);
  select pg_catalog.count(*) into a_map from pg_catalog.jsonb_array_elements(coalesce(j->'user_map', '[]'::pg_catalog.jsonb)) x
    left join public.tr_user_map m on m.user_id = (x->>'user_id')::pg_catalog.uuid
   where m.user_id is null or m.email is distinct from x->>'email' or m.name is distinct from x->>'name' or m.updated_at is distinct from (x->>'updated_at')::timestamptz;
  if v_mode = 'apply' and (a_apps <> 0 or a_recs <> 0 or a_new <> 0 or a_map <> 0) then
    raise exception 'zzb3b 되돌리기 실패: 되돌린 뒤에도 다른 것이 남았다(신청서 % · 학습 기록 % · 새 tr_user_map % · tr_user_map %). 전부 되돌린다', a_apps, a_recs, a_new, a_map;
  end if;

  insert into zzb3b_reset_result values (pg_catalog.jsonb_build_object(
    'marker', 'zzb3b', 'mode', v_mode, 'read_at', pg_catalog.now(),
    'differed', pg_catalog.jsonb_build_object('applications', d_apps, 'records', d_recs, 'user_map_new', d_new, 'user_map_changed', d_map),
    'reverted', pg_catalog.jsonb_build_object('applications', r_apps, 'records', r_recs, 'user_map_new', r_new, 'user_map_changed', r_map),
    'after', pg_catalog.jsonb_build_object('applications', a_apps, 'records', a_recs, 'user_map_new', a_new, 'user_map_changed', a_map)));
end;
$zz_b3b$;

commit;

reset b3b.test_project_ref;

select r.result from zzb3b_reset_result r;
