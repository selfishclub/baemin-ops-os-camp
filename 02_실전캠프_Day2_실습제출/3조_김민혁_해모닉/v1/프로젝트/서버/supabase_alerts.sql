-- 해모닉 ERP — 서버 알림 (텔레그램) 설치 SQL
-- Supabase › SQL Editor 에 통째로 붙여 넣고 Run. supabase.sql 을 먼저 실행한 뒤에 한 번만 실행합니다.
-- 하는 일:
--   1) events 표: 앱이 "알릴 일"을 한 줄 넣으면 서버가 텔레그램으로 보냅니다 (즉시).
--   2) 1분마다 실패한 건을 다시 보냅니다 (최대 3회).
--   3) 매일 21:30(한국 시간)에 매장별 마감 리포트를 서버가 만들어 보냅니다 — 매장 PC가 꺼져 있어도.
-- 봇 토큰·대화방 ID는 앱 설정(docs 표의 settings)에 있는 값을 그대로 씁니다. 여기에 적을 것은 없습니다.

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
create extension if not exists pg_net with schema extensions;

create table if not exists public.events (
  id bigserial primary key,
  store text not null,                    -- 'ansan' | 'anyang'
  kind text not null,                     -- done · late · issue · notice · report · test
  text text not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  request_id bigint,
  tries int not null default 0,
  err text
);
alter table public.events enable row level security;
drop policy if exists "events auth all" on public.events;
create policy "events auth all" on public.events for all to authenticated using (true) with check (true);

-- 매장 문서에서 텔레그램 설정 읽기
create or replace function public.tg_cfg(p_store text, out token text, out chat text)
language sql security definer set search_path = public as $$
  select doc->'settings'->>'tgToken', doc->'settings'->>'tgChat' from public.docs where key = 'state:' || p_store;
$$;

-- 텔레그램으로 보내기 (비동기 요청 번호를 돌려준다. 설정 없으면 null)
create or replace function public.tg_send(p_store text, p_text text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_token text; v_chat text; v_id bigint;
begin
  select token, chat into v_token, v_chat from public.tg_cfg(p_store);
  if coalesce(v_token, '') = '' or coalesce(v_chat, '') = '' then return null; end if;
  select net.http_post(
    url := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
    body := jsonb_build_object('chat_id', v_chat, 'text', p_text),
    headers := '{"Content-Type": "application/json"}'::jsonb
  ) into v_id;
  return v_id;
end $$;

-- events 에 줄이 들어오면 바로 보낸다
create or replace function public.events_send() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.request_id := public.tg_send(new.store, new.text);
  new.tries := 1;
  if new.request_id is null then new.err := '텔레그램 설정 없음 (앱 설정에서 봇 토큰·대화방을 넣으세요)'; end if;
  return new;
end $$;
drop trigger if exists events_send_tr on public.events;
create trigger events_send_tr before insert on public.events for each row execute function public.events_send();

-- 응답 확인 · 재시도 (1분마다). 200이면 보낸 것으로 기록, 실패면 최대 3회 다시 보낸다
create or replace function public.events_check() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select e.id, e.store, e.text, e.request_id, e.tries, resp.status_code, resp.error_msg, left(resp.content::text, 200) as content
    from public.events e
    left join net._http_response resp on resp.id = e.request_id
    where e.sent_at is null and e.tries <= 3 and e.created_at > now() - interval '1 day'
  loop
    if r.request_id is not null and r.status_code = 200 then
      update public.events set sent_at = now(), err = null where id = r.id;
    elsif r.request_id is null or r.status_code is not null or r.error_msg is not null then
      if r.tries >= 3 then
        update public.events set tries = tries + 1, err = coalesce(r.error_msg, r.content, err, '실패') where id = r.id;
      else
        update public.events set request_id = public.tg_send(r.store, r.text), tries = tries + 1,
          err = coalesce(r.error_msg, r.content, err) where id = r.id;
      end if;
    end if;
    -- 응답이 아직 없으면 다음 분에 다시 본다
  end loop;
end $$;

-- 마감 리포트 문구 만들기 (앱의 buildReport 와 같은 규칙)
create or replace function public.daily_report(p_store text, p_key text default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_doc jsonb; v_day jsonb; v_key text; v_name text; v_now int; v_tpl jsonb; v_rec jsonb; v_id text;
  v_pending int := 0; v_done int := 0; v_skip int := 0; v_total int := 0; v_base int; v_pct int;
  v_crit int := 0; v_crit_done int := 0; v_crit_left text[] := '{}'; v_left text[] := '{}'; v_pend text[] := '{}';
  v_role text; v_sort int; v_s text; v_line text; v_out text[] := '{}';
  v_deaths jsonb := '{}'; v_any_deaths bool := false; v_death_total int := 0; v_sp text; v_parts text[] := '{}';
  v_sales numeric; v_d date; v_wd text[] := '{일,월,화,수,목,금,토}';
begin
  select doc into v_doc from public.docs where key = 'state:' || p_store;
  if v_doc is null then return null; end if;
  v_key := coalesce(p_key, to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM-DD'));
  v_name := case p_store when 'ansan' then '안산점' when 'anyang' then '안양점' else p_store end;
  v_d := v_key::date;
  v_day := v_doc->'days'->v_key;
  if v_day is null then
    return '🦀 해모닉 ' || v_name || ' ' || extract(month from v_d) || '/' || extract(day from v_d) || '(' || v_wd[extract(dow from v_d)::int + 1] || ') 마감 리포트' || E'\n\n' || '오늘 기록이 없습니다 (앱이 열리지 않았습니다).';
  end if;
  v_now := (extract(hour from now() at time zone 'Asia/Seoul') * 60 + extract(minute from now() at time zone 'Asia/Seoul'))::int;
  if v_key <> to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM-DD') then v_now := 24 * 60; end if;

  for v_id, v_rec in select * from jsonb_each(coalesce(v_day->'inst', '{}'::jsonb)) loop
    select t.value into v_tpl from jsonb_array_elements(coalesce(v_doc->'templates', '[]'::jsonb)) t where t.value->>'id' = v_id limit 1;
    if v_tpl is null or coalesce((v_tpl->>'rest')::bool, false) then continue; end if;
    v_s := coalesce(v_rec->>'s', 'todo');
    v_role := coalesce(v_rec->>'role', v_tpl->>'role', '');
    v_sort := null;
    if v_tpl->>'sort' ~ '^\d{1,2}:\d{2}$' then v_sort := split_part(v_tpl->>'sort', ':', 1)::int * 60 + split_part(v_tpl->>'sort', ':', 2)::int; end if;
    v_total := v_total + 1;
    if v_s = 'todo' and v_sort is not null and v_sort >= v_now then
      v_pending := v_pending + 1; v_pend := array_append(v_pend, v_tpl->>'title'); continue;
    end if;
    if v_s = 'done' then v_done := v_done + 1; end if;
    if v_s = 'skip' then v_skip := v_skip + 1; end if;
    if coalesce((v_tpl->>'crit')::bool, false) then
      v_crit := v_crit + 1;
      if v_s = 'done' then v_crit_done := v_crit_done + 1; end if;
      if v_s = 'todo' then v_crit_left := array_append(v_crit_left, '· ' || (v_tpl->>'title') || ' (' || v_role || ')'); end if;
    elsif v_s = 'todo' then
      v_left := array_append(v_left, '· ' || (v_tpl->>'title') || ' (' || v_role || ')');
    end if;
    if v_tpl->>'ev' = 'deaths' and v_s = 'done' and v_rec ? 'ev' then
      v_any_deaths := true;
      if jsonb_typeof(v_rec->'ev') = 'object' then
        for v_sp in select * from jsonb_object_keys(v_rec->'ev') loop
          v_deaths := jsonb_set(v_deaths, array[v_sp], to_jsonb(coalesce((v_deaths->>v_sp)::int, 0) + coalesce((v_rec->'ev'->>v_sp)::int, 0)));
        end loop;
      else
        v_deaths := jsonb_set(v_deaths, array['기타'], to_jsonb(coalesce((v_deaths->>'기타')::int, 0) + coalesce((v_rec->>'ev')::int, 0)));
      end if;
    end if;
    if v_tpl->>'ev' = 'money' and v_s = 'done' and v_rec ? 'ev' and jsonb_typeof(v_rec->'ev') = 'number' then v_sales := (v_rec->>'ev')::numeric; end if;
  end loop;

  v_base := v_total - v_skip - v_pending;
  v_pct := case when v_base > 0 then round(v_done::numeric * 100 / v_base) else 0 end;
  v_out := array_append(v_out, '🦀 해모닉 ' || v_name || ' ' || extract(month from v_d) || '/' || extract(day from v_d) || '(' || v_wd[extract(dow from v_d)::int + 1] || ') 마감 리포트');
  v_out := array_append(v_out, ''::text);
  v_out := array_append(v_out, '전체 ' || v_done || '/' || v_base || '  ' || v_pct || '%');
  v_out := array_append(v_out, case when array_length(v_crit_left, 1) > 0
    then '중요 ' || v_crit_done || '/' || v_crit || '  ⚠️ 미완료 ' || array_length(v_crit_left, 1) || '건'
    else '중요 ' || v_crit_done || '/' || v_crit || '  ✅ 전부 완료' end);
  if array_length(v_crit_left, 1) > 0 then
    v_out := array_cat(v_out, array[''::text, '⚠️ 중요 미완료'::text]); v_out := array_cat(v_out, v_crit_left);
  end if;
  if array_length(v_left, 1) > 0 then
    v_out := array_cat(v_out, array[''::text, ('미완료 ' || array_length(v_left, 1) || '건')::text]); v_out := array_cat(v_out, v_left[1:8]);
    if array_length(v_left, 1) > 8 then v_out := array_append(v_out, '· 외 ' || (array_length(v_left, 1) - 8) || '건'); end if;
  end if;
  if v_skip > 0 then v_out := array_cat(v_out, array[''::text, ('건너뜀 ' || v_skip || '건')::text]); end if;
  if v_pending > 0 then v_out := array_cat(v_out, array[''::text, ('⏳ 이후 예정 ' || v_pending || '건 — ' || array_to_string(v_pend[1:4], ', ') || case when v_pending > 4 then ' 외' else '' end)::text]); end if;
  v_line := '';
  if v_any_deaths then
    for v_sp in select * from jsonb_object_keys(v_deaths) loop
      if (v_deaths->>v_sp)::int > 0 then v_parts := array_append(v_parts, v_sp || ' ' || (v_deaths->>v_sp)); v_death_total := v_death_total + (v_deaths->>v_sp)::int; end if;
    end loop;
    v_line := case when v_death_total > 0 then '폐사 ' || v_death_total || '마리 (' || array_to_string(v_parts, ' · ') || ')' else '폐사 없음 ✅' end;
  end if;
  if v_sales is not null then v_line := v_line || (case when v_line = '' then '' else ' · ' end) || '매출 ' || to_char(v_sales, 'FM999,999,999,999') || '원'; end if;
  if v_line <> '' then v_out := array_cat(v_out, array[''::text, v_line]); end if;
  return array_to_string(v_out, E'\n');
end $$;

-- 매장별로 리포트를 events 에 넣는다 (넣으면 트리거가 보낸다). 텔레그램 설정 없는 매장은 건너뜀
create or replace function public.daily_report_all() returns void
language plpgsql security definer set search_path = public as $$
declare s text; t text; v_token text; v_chat text;
begin
  foreach s in array array['ansan', 'anyang'] loop
    select token, chat into v_token, v_chat from public.tg_cfg(s);
    if coalesce(v_token, '') = '' or coalesce(v_chat, '') = '' then continue; end if;
    t := public.daily_report(s);
    if t is not null then insert into public.events(store, kind, text) values (s, 'report', t); end if;
  end loop;
end $$;

-- 예약: 1분마다 재시도 확인, 매일 21:30 한국 시간(= 12:30 UTC) 리포트
select cron.unschedule(jobid) from cron.job where jobname in ('haemonic-events-check', 'haemonic-daily-report');
select cron.schedule('haemonic-events-check', '* * * * *', $$select public.events_check()$$);
select cron.schedule('haemonic-daily-report', '30 12 * * *', $$select public.daily_report_all()$$);

-- 확인용: 지금 안산점 리포트 문구 미리 보기 (보내지는 않음)
select public.daily_report('ansan');
