-- 해모닉 ERP — 매장 인터넷 자동 허용 (2026-10-10 사장님 요청: "그냥 주소만 열면 되게")
-- 안산점 주방 포스처럼 브라우저가 껐다 켤 때 저장소를 지우는 기기는 기기 열쇠가 매일 사라진다.
-- 그래서 사장님이 매장에서 기기를 등록하면 서버가 그 매장의 인터넷 주소(공인 IP)를 함께 기억하고,
-- 같은 매장 인터넷에서 오는 요청은 열쇠가 없어도 통과시킨다. 매장 밖(집·LTE)은 전처럼 열쇠(기기 등록)가 있어야 한다.
-- supabase_devices.sql 다음에 한 번 실행. (update 포함 → "Potential issue detected" 창이 뜨면 Run query)

-- 1) 매장 인터넷 표
create table if not exists public.store_nets (
  ip text primary key,
  store text not null,
  name text,
  created_at timestamptz not null default now(),
  last_seen timestamptz,
  active boolean not null default true
);
alter table public.store_nets enable row level security;

-- 2) 이 요청이 온 인터넷 주소 (Supabase 게이트웨이가 x-forwarded-for 에 넣어 준다 — 첫 번째가 실제 기기)
create or replace function public.req_ip() returns text
language plpgsql stable security definer set search_path = public as $$
declare h text;
begin
  begin h := current_setting('request.headers', true)::json->>'x-forwarded-for'; exception when others then h := null; end;
  if coalesce(h, '') = '' then
    begin h := current_setting('request.headers', true)::json->>'cf-connecting-ip'; exception when others then h := null; end;
  end if;
  if coalesce(h, '') = '' then return null; end if;
  return nullif(trim(split_part(h, ',', 1)), '');
end $$;
grant execute on function public.req_ip() to authenticated;

-- 3) 등록된 기기이거나, 등록된 매장 인터넷에서 왔으면 통과
create or replace function public.device_ok() returns boolean
language plpgsql stable security definer set search_path = public as $$
declare k text; h text; v_ip text;
begin
  if not exists (select 1 from public.devices where active) then return true; end if;
  begin k := current_setting('request.headers', true)::json->>'x-device-key'; exception when others then k := null; end;
  if coalesce(k, '') <> '' then
    h := encode(sha256(convert_to(k, 'utf8')), 'hex');
    if exists (select 1 from public.devices where key_hash = h and active) then return true; end if;
  end if;
  v_ip := public.req_ip();
  if v_ip is not null and exists (select 1 from public.store_nets where store_nets.ip = v_ip and active) then return true; end if;
  return false;
end $$;

-- 4) 등록된 기기(매장 소속)가 열 때마다 그 매장 인터넷 주소를 최신으로 — 통신사가 주소를 바꿔도 따라간다.
--    "공용(사장님 기기)"은 매장이 없으므로 집 인터넷이 등록되지 않는다.
create or replace function public.device_touch() returns void
language plpgsql security definer set search_path = public as $$
declare k text; d record; v_ip text;   -- 변수 이름을 열 이름(ip)과 다르게 — 같으면 "column reference ip is ambiguous"
begin
  begin k := current_setting('request.headers', true)::json->>'x-device-key'; exception when others then k := null; end;
  if coalesce(k, '') = '' then return; end if;
  select * into d from public.devices where key_hash = encode(sha256(convert_to(k, 'utf8')), 'hex') and active;
  if d is null then return; end if;
  update public.devices set last_seen = now() where id = d.id;
  v_ip := public.req_ip();
  if d.store is not null and v_ip is not null then
    insert into public.store_nets(ip, store, name, last_seen) values (v_ip, d.store, d.name || ' 접속', now())
      on conflict (ip) do update set last_seen = now(), store = excluded.store, active = true;
  end if;
end $$;

-- 매장 인터넷에서 열쇠 없이 들어온 기기도 "마지막 사용"을 남긴다
create or replace function public.net_touch() returns void
language plpgsql security definer set search_path = public as $$
declare v_ip text;
begin
  v_ip := public.req_ip();
  if v_ip is null then return; end if;
  update public.store_nets set last_seen = now() where store_nets.ip = v_ip and active;
end $$;
grant execute on function public.net_touch() to authenticated;

-- 5) 기기 등록 때 매장 인터넷도 같이 기억한다
create or replace function public.device_register(p_owner_hash text, p_name text, p_store text default null) returns text
language plpgsql security definer set search_path = public as $$
declare v_doc jsonb; v_hash text; v_key text; v_now bigint := (extract(epoch from now()) * 1000)::bigint; v_ip text;
begin
  if coalesce(p_owner_hash, '') = '' then raise exception '비밀번호가 비었습니다'; end if;
  select doc into v_doc from public.docs where key = 'shared:issues';
  v_hash := v_doc->'owner'->>'hash';
  if coalesce(v_hash, '') <> '' then
    if v_hash <> p_owner_hash then raise exception '사장님 비밀번호가 다릅니다'; end if;
  else
    if v_doc is null then v_doc := jsonb_build_object('issues', '[]'::jsonb); end if;
    v_doc := jsonb_set(v_doc, '{owner}', jsonb_build_object('hash', p_owner_hash, 'at', v_now));
    v_doc := jsonb_set(v_doc, '{savedAt}', to_jsonb(v_now));
    insert into public.docs(key, doc, saved_at, updated_at) values ('shared:issues', v_doc, v_now, now())
      on conflict (key) do update set doc = excluded.doc, saved_at = excluded.saved_at, updated_at = now();
  end if;
  v_key := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.devices(key_hash, name, store, last_seen) values (encode(sha256(convert_to(v_key, 'utf8')), 'hex'), left(coalesce(nullif(p_name, ''), '기기'), 40), nullif(p_store, ''), now());
  v_ip := public.req_ip();
  if nullif(p_store, '') is not null and v_ip is not null then
    insert into public.store_nets(ip, store, name, last_seen) values (v_ip, p_store, left(coalesce(nullif(p_name, ''), '기기'), 40) || ' 등록', now())
      on conflict (ip) do update set last_seen = now(), store = excluded.store, active = true;
  end if;
  return v_key;
end $$;

-- 6) 매장 인터넷 표 정책 — 통과된 기기에서 보기·끊기
drop policy if exists nets_read on public.store_nets;
drop policy if exists nets_update on public.store_nets;
create policy nets_read on public.store_nets for select to authenticated using (public.device_ok());
create policy nets_update on public.store_nets for update to authenticated using (public.device_ok()) with check (public.device_ok());

-- 7) 지금까지 등록된 매장 기기 중 매장 소속인 것은 다음에 열 때 자동으로 인터넷이 기억된다.
--    바로 쓰려면: 사장님이 각 매장에서 아무 기기나 한 번 등록하거나, 등록된 포스가 한 번 앱을 열면 된다.

-- 확인
select 'req_ip(지금 요청)' as what, coalesce(public.req_ip(), '(SQL Editor 는 없음)') as value
union all select 'store_nets', count(*)::text from public.store_nets
union all select 'policies', string_agg(policyname, ', ') from pg_policies where schemaname = 'public' and tablename = 'store_nets';
