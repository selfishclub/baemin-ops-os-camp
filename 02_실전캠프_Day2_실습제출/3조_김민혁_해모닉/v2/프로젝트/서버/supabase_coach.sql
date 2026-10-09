-- 해모닉 ERP — 마감 리포트 "오늘 평가·코칭" (2026-10-08 사장님 요청)
-- 단순 집계 밑에 솔직한 평가와 내일 한 가지를 붙인다. supabase_alerts.sql 다음에 한 번 실행.
-- 앱의 buildCoach 와 같은 규칙. 평가 기준:
--   🟢 잘한 날   전체 90% 이상 · 중요 미완료 0 · 늦게 한 업무 2건 이하
--   🟡 보통      전체 70% 이상 · 중요 미완료 1건 이하
--   🔴 점검 필요 그 밖에

-- 하루 집계: 완료 · 분모(건너뜀 제외) · 폐사 합 (과거 날짜용 — '이후 예정' 없음)
create or replace function public.day_stats(p_doc jsonb, p_key text, out done int, out base int, out deaths int)
language plpgsql immutable as $$
declare v_day jsonb; v_id text; v_rec jsonb; v_tpl jsonb; v_s text; v_sp text;
begin
  done := 0; base := 0; deaths := 0;
  v_day := p_doc->'days'->p_key;
  if v_day is null then done := null; base := null; deaths := null; return; end if;
  for v_id, v_rec in select * from jsonb_each(coalesce(v_day->'inst', '{}'::jsonb)) loop
    select t.value into v_tpl from jsonb_array_elements(coalesce(p_doc->'templates', '[]'::jsonb)) t where t.value->>'id' = v_id limit 1;
    if v_tpl is null or coalesce((v_tpl->>'rest')::bool, false) or coalesce((v_rec->>'auto')::bool, false) then continue; end if;
    v_s := coalesce(v_rec->>'s', 'todo');
    if v_s = 'skip' then continue; end if;
    base := base + 1;
    if v_s = 'done' then
      done := done + 1;
      if v_tpl->>'ev' = 'deaths' and v_rec ? 'ev' then
        if jsonb_typeof(v_rec->'ev') = 'object' then
          for v_sp in select * from jsonb_object_keys(v_rec->'ev') loop deaths := deaths + coalesce((v_rec->'ev'->>v_sp)::int, 0); end loop;
        else deaths := deaths + coalesce((v_rec->>'ev')::int, 0); end if;
      end if;
    end if;
  end loop;
end $$;

create or replace function public.daily_coach(p_store text, p_key text default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_doc jsonb; v_day jsonb; v_key text; v_now int; v_id text; v_rec jsonb; v_tpl jsonb; v_s text;
  v_total int := 0; v_done int := 0; v_skip int := 0; v_pending int := 0; v_base int; v_pct int;
  v_crit int := 0; v_crit_done int := 0; v_crit_left int := 0;
  v_sort int; v_due int; v_at int; v_grace int; v_late int := 0; v_late_max int := 0; v_late_title text := ''; v_late_list text[] := '{}';
  v_memo int := 0; v_memo_mode text; v_noname int := 0; v_by jsonb := '{}'; v_who text; v_who_line text := '';
  v_deaths int := 0; v_sp text;
  v_hist_done int := 0; v_hist_base int := 0; v_hist_days int := 0; v_hist_deaths int := 0; v_hist_ddays int := 0; v_avg int; v_davg numeric;
  st record; i int; v_d date;
  v_fb int := 0;
  v_grade text; v_sum text; v_good text[] := '{}'; v_bad text[] := '{}'; v_tip text := ''; v_out text[] := '{}';
begin
  select doc into v_doc from public.docs where key = 'state:' || p_store;
  if v_doc is null then return null; end if;
  v_key := coalesce(p_key, to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM-DD'));
  v_day := v_doc->'days'->v_key;
  if v_day is null then return null; end if;
  v_d := v_key::date;
  v_now := (extract(hour from now() at time zone 'Asia/Seoul') * 60 + extract(minute from now() at time zone 'Asia/Seoul'))::int;
  if v_key <> to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM-DD') then v_now := 24 * 60; end if;
  v_memo_mode := coalesce(nullif(v_doc->'settings'->>'doneMemo', ''), 'req');

  for v_id, v_rec in select * from jsonb_each(coalesce(v_day->'inst', '{}'::jsonb)) loop
    select t.value into v_tpl from jsonb_array_elements(coalesce(v_doc->'templates', '[]'::jsonb)) t where t.value->>'id' = v_id limit 1;
    if v_tpl is null or coalesce((v_tpl->>'rest')::bool, false) or coalesce((v_rec->>'auto')::bool, false) then continue; end if;
    v_s := coalesce(v_rec->>'s', 'todo');
    v_sort := null; v_due := null; v_at := null;
    if v_tpl->>'sort' ~ '^\d{1,2}:\d{2}$' then v_sort := split_part(v_tpl->>'sort', ':', 1)::int * 60 + split_part(v_tpl->>'sort', ':', 2)::int; end if;
    if v_tpl->>'due' ~ '^\d{1,2}:\d{2}$' then v_due := split_part(v_tpl->>'due', ':', 1)::int * 60 + split_part(v_tpl->>'due', ':', 2)::int; else v_due := v_sort; end if;
    if v_rec->>'at' ~ '^\d{1,2}:\d{2}$' then v_at := split_part(v_rec->>'at', ':', 1)::int * 60 + split_part(v_rec->>'at', ':', 2)::int; end if;
    v_grace := coalesce((v_tpl->>'grace')::int, 30);
    v_total := v_total + 1;
    if v_s = 'todo' and v_sort is not null and v_sort >= v_now then v_pending := v_pending + 1; continue; end if;
    if v_s = 'skip' then v_skip := v_skip + 1; continue; end if;
    if coalesce((v_tpl->>'crit')::bool, false) then
      v_crit := v_crit + 1;
      if v_s = 'done' then v_crit_done := v_crit_done + 1; elsif v_s = 'todo' then v_crit_left := v_crit_left + 1; end if;
    end if;
    if v_s = 'done' then
      v_done := v_done + 1;
      if coalesce(v_rec->>'note', '') <> '' then v_memo := v_memo + 1; end if;
      v_who := coalesce(nullif(v_rec->>'by', ''), '');
      if v_who = '' then v_noname := v_noname + 1;
      else v_by := jsonb_set(v_by, array[v_who], to_jsonb(coalesce((v_by->>v_who)::int, 0) + 1)); end if;
      if v_at is not null and v_due is not null and v_at > v_due + v_grace then
        v_late := v_late + 1;
        if v_at - v_due > v_late_max then v_late_max := v_at - v_due; v_late_title := v_tpl->>'title'; end if;
        if array_length(v_late_list, 1) is null or array_length(v_late_list, 1) < 3 then
          v_late_list := array_append(v_late_list, (v_tpl->>'title') || '(+' || (v_at - v_due) || '분)');
        end if;
      end if;
      if v_tpl->>'ev' = 'deaths' and v_rec ? 'ev' then
        if jsonb_typeof(v_rec->'ev') = 'object' then
          for v_sp in select * from jsonb_object_keys(v_rec->'ev') loop v_deaths := v_deaths + coalesce((v_rec->'ev'->>v_sp)::int, 0); end loop;
        else v_deaths := v_deaths + coalesce((v_rec->>'ev')::int, 0); end if;
      end if;
    end if;
  end loop;

  v_base := v_total - v_skip - v_pending;
  v_pct := case when v_base > 0 then round(v_done::numeric * 100 / v_base) else 0 end;

  -- 지난 7일 평균 (오늘 제외, 기록 있는 날만)
  for i in 1..7 loop
    select * into st from public.day_stats(v_doc, to_char(v_d - i, 'YYYY-MM-DD'));
    if st.base is not null and st.base > 0 then
      v_hist_done := v_hist_done + st.done; v_hist_base := v_hist_base + st.base; v_hist_days := v_hist_days + 1;
      v_hist_deaths := v_hist_deaths + st.deaths; v_hist_ddays := v_hist_ddays + 1;
    end if;
  end loop;
  v_avg := case when v_hist_base > 0 then round(v_hist_done::numeric * 100 / v_hist_base) else null end;
  v_davg := case when v_hist_ddays > 0 then round(v_hist_deaths::numeric / v_hist_ddays, 1) else null end;

  -- 오늘 접수된 앱 오류·건의 (두 매장 공용 게시판)
  select count(*) into v_fb from public.docs d, jsonb_array_elements(coalesce(d.doc->'issues', '[]'::jsonb)) x
    where d.key = 'shared:issues' and x->>'cat' in ('앱 오류', '앱 건의')
      and to_char(to_timestamp((x->>'createdAt')::bigint / 1000) at time zone 'Asia/Seoul', 'YYYY-MM-DD') = v_key;

  -- 등급
  if v_pct >= 90 and v_crit_left = 0 and v_late <= 2 then v_grade := '🟢 잘한 날';
  elsif v_pct >= 70 and v_crit_left <= 1 then v_grade := '🟡 보통';
  else v_grade := '🔴 점검 필요'; end if;

  -- 솔직한 한 줄
  if v_base = 0 then v_sum := '평가할 업무가 없었습니다.';
  elsif v_crit_left > 0 then v_sum := '중요 업무 ' || v_crit_left || '건이 끝까지 안 됐습니다. 다른 게 아무리 잘 돼도 이건 오늘의 구멍입니다.';
  elsif v_pct >= 95 and v_late = 0 then v_sum := '시간 안에 거의 다 해냈습니다. 이 정도면 체크리스트가 아니라 습관입니다.';
  elsif v_pct >= 90 then v_sum := '큰 틀은 잘 돌아갔습니다. 남은 건 "제시간에"입니다.';
  elsif v_pct >= 70 then v_sum := '절반 이상은 했지만 빠진 게 눈에 띕니다. 바쁜 날일수록 체크리스트를 먼저 열어야 합니다.';
  else v_sum := '오늘은 체크리스트가 거의 안 돌았습니다. 앱을 안 연 건지, 일을 안 한 건지부터 확인이 필요합니다.'; end if;

  -- 잘한 것
  if v_crit > 0 and v_crit_left = 0 then v_good := array_append(v_good, '중요 업무 ' || v_crit || '건 전부 완료'); end if;
  if v_avg is not null and v_pct >= v_avg + 10 then v_good := array_append(v_good, '7일 평균(' || v_avg || '%)보다 ' || (v_pct - v_avg) || '%p 높음'); end if;
  if v_done > 0 and v_memo_mode <> 'off' and v_memo >= v_done * 0.8 then v_good := array_append(v_good, '메모 ' || v_memo || '/' || v_done || '건 — 어떻게 했는지 잘 남겼음'); end if;
  if v_done >= 5 and v_late = 0 then v_good := array_append(v_good, '늦게 한 업무 없음'); end if;
  if v_davg is not null and v_deaths = 0 and v_davg >= 1 then v_good := array_append(v_good, '폐사 0 (평소 하루 ' || v_davg || '마리)'); end if;

  -- 아쉬운 것
  if v_late > 0 then v_bad := array_append(v_bad, '늦게 한 업무 ' || v_late || '건 — ' || array_to_string(v_late_list, ', ')); end if;
  if v_done > 0 and v_memo_mode = 'req' and v_memo < v_done * 0.5 then v_bad := array_append(v_bad, '메모가 ' || v_done || '건 중 ' || v_memo || '건뿐 — 체크만 하고 넘어감'); end if;
  if v_noname > 0 then v_bad := array_append(v_bad, '이름 없이 완료 ' || v_noname || '건 — 누가 했는지 모름'); end if;
  if v_skip >= 3 then v_bad := array_append(v_bad, '건너뜀 ' || v_skip || '건 — 사유 확인 필요'); end if;
  if v_avg is not null and v_pct <= v_avg - 10 then v_bad := array_append(v_bad, '7일 평균(' || v_avg || '%)보다 ' || (v_avg - v_pct) || '%p 낮음'); end if;
  if v_davg is not null and v_deaths >= 3 and v_deaths > v_davg * 1.5 then v_bad := array_append(v_bad, '폐사 ' || v_deaths || '마리 — 평소(' || v_davg || ')보다 많음, 수조 온도·염도 확인'); end if;

  -- 내일 한 가지 (가장 급한 것 하나)
  if v_crit_left > 0 then v_tip := '시간대 시작할 때 "중요" 표시부터 끝내기. 중요 업무는 미루면 다음 날 손님이 느낍니다.';
  elsif v_late >= 3 then v_tip := '알림이 울리면 그 자리에서 처리하기. 가장 많이 늦은 건 ' || v_late_title || '(+' || v_late_max || '분)입니다.';
  elsif v_done > 0 and v_memo_mode = 'req' and v_memo < v_done * 0.5 then v_tip := '완료할 때 "어떻게 했나요"에 한 줄이라도. 테스트 기간엔 이 메모가 제일 중요한 자료입니다.';
  elsif v_noname > 0 then v_tip := '완료할 때 이름을 고르기. 누가 했는지 남아야 잘한 사람을 챙길 수 있습니다.';
  elsif v_pct < 90 then v_tip := '오픈 때 오늘 할 일을 한 번 훑고 시작하기. 빠지는 건 대부분 "몰라서"가 아니라 "잊어서"입니다.';
  elsif v_davg is not null and v_deaths > v_davg * 1.5 and v_deaths >= 3 then v_tip := '내일 아침 수조 온도·염도·산소 먼저 확인하고 폐사 기록 남기기.';
  else v_tip := '오늘처럼. 내일은 메모를 한 줄 더 구체적으로 적어 보세요.'; end if;

  -- 사람별
  for v_who in select key from jsonb_each(v_by) order by (value)::int desc, key loop
    v_who_line := v_who_line || case when v_who_line = '' then '' else ' · ' end || v_who || ' ' || (v_by->>v_who);
  end loop;
  if v_noname > 0 then v_who_line := v_who_line || case when v_who_line = '' then '' else ' · ' end || '이름 없음 ' || v_noname; end if;

  v_out := array_append(v_out, '━━━━━━━━━━━━');
  v_out := array_append(v_out, '📊 오늘 평가 · ' || v_grade || case when v_avg is not null then ' (7일 평균 ' || v_avg || '% → 오늘 ' || v_pct || '%)' else ' (오늘 ' || v_pct || '%)' end);
  v_out := array_append(v_out, v_sum);
  if array_length(v_good, 1) > 0 then v_out := array_append(v_out, ''); v_out := array_append(v_out, '👍 잘한 것'); v_out := array_cat(v_out, (select array_agg('· ' || g) from unnest(v_good[1:3]) g)); end if;
  if array_length(v_bad, 1) > 0 then v_out := array_append(v_out, ''); v_out := array_append(v_out, '👀 아쉬운 것'); v_out := array_cat(v_out, (select array_agg('· ' || b) from unnest(v_bad[1:3]) b)); end if;
  v_out := array_append(v_out, ''); v_out := array_append(v_out, '🎯 내일 한 가지'); v_out := array_append(v_out, '· ' || v_tip);
  if v_who_line <> '' then v_out := array_append(v_out, ''); v_out := array_append(v_out, '👥 오늘 손: ' || v_who_line); end if;
  if v_fb > 0 then v_out := array_append(v_out, '🧪 오늘 접수된 앱 오류·건의 ' || v_fb || '건 — 테스트 안내 페이지에서 확인'); end if;
  return array_to_string(v_out, E'\n');
end $$;

-- daily_report 에 평가 구간을 붙인다. 기존 집계 본문은 daily_report_plain 으로 한 번만 복사해 보존한다
-- (supabase_alerts.sql 을 다시 실행하면 daily_report 가 집계만 하는 옛 판으로 돌아가므로, 그 뒤엔 이 파일을 다시 실행)
do $$
declare v_def text;
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'daily_report_plain') then
    v_def := pg_get_functiondef('public.daily_report(text, text)'::regprocedure);
    if position('daily_coach' in v_def) > 0 then raise exception 'daily_report 가 이미 평가 판입니다 — daily_report_plain 이 없는데 복사할 원본이 없습니다'; end if;
    execute replace(v_def, 'FUNCTION public.daily_report(', 'FUNCTION public.daily_report_plain(');
  end if;
end $$;

create or replace function public.daily_report(p_store text, p_key text default null) returns text
language plpgsql security definer set search_path = public as $$
declare v_base text; v_coach text;
begin
  v_base := public.daily_report_plain(p_store, p_key);
  if v_base is null then return null; end if;
  v_coach := public.daily_coach(p_store, p_key);
  if v_coach is null then return v_base; end if;
  return v_base || E'\n\n' || v_coach;
end $$;

-- 확인용 미리 보기 (보내지 않음)
select public.daily_report('ansan');
