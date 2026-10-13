-- 해모닉 ERP — 기기 등록제 (2026-10-08 사장님 요청)
-- 사장님이 등록한 기기만 매장 기록(docs·events)을 읽고 쓸 수 있다. 등록 안 된 기기는 교육 자료 전용 RPC만 쓴다.
-- SQL Editor에 통째로 붙여 넣고 Run. (update/delete 포함 → "Potential issue detected" 창이 뜨면 Run query)

create extension if not exists pgcrypto with schema extensions;

-- 1) 기기 표 — 열쇠는 해시만 저장
create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  key_hash text unique not null,
  name text not null,
  store text,
  created_at timestamptz not null default now(),
  last_seen timestamptz,
  active boolean not null default true
);
alter table public.devices enable row level security;

-- 2) 이 요청이 등록된 기기에서 왔는가 — 헤더 x-device-key 의 해시가 devices 에 있으면 true.
--    등록된 기기가 하나도 없는 동안(첫 등록 전)은 모두 허용한다.
create or replace function public.device_ok() returns boolean
language plpgsql stable security definer set search_path = public as $$
declare k text; h text;
begin
  if not exists (select 1 from public.devices where active) then return true; end if;
  begin k := current_setting('request.headers', true)::json->>'x-device-key'; exception when others then k := null; end;
  if coalesce(k, '') = '' then return false; end if;
  h := encode(sha256(convert_to(k, 'utf8')), 'hex');
  return exists (select 1 from public.devices where key_hash = h and active);
end $$;

-- 마지막 사용 시각 (앱이 켜질 때 한 번)
create or replace function public.device_touch() returns void
language plpgsql security definer set search_path = public as $$
declare k text;
begin
  begin k := current_setting('request.headers', true)::json->>'x-device-key'; exception when others then k := null; end;
  if coalesce(k, '') = '' then return; end if;
  update public.devices set last_seen = now() where key_hash = encode(sha256(convert_to(k, 'utf8')), 'hex') and active;
end $$;

-- 3) 기기 등록 — 사장님 비밀번호 해시(앱과 같은 방식: sha256('haemonic-owner:' || 비밀번호))가 맞으면 새 열쇠를 만들어 돌려준다.
--    사장님 비밀번호가 아직 없으면(첫 등록) 지금 넣은 것을 비밀번호로 저장한다. 비밀번호는 두 매장 공용 문서 shared:issues 의 owner.hash 에 있다.
create or replace function public.device_register(p_owner_hash text, p_name text, p_store text default null) returns text
language plpgsql security definer set search_path = public as $$
declare v_doc jsonb; v_hash text; v_key text; v_now bigint := (extract(epoch from now()) * 1000)::bigint;
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
  return v_key;
end $$;

-- 4) 기기 표 정책 — 등록된 기기에서만 목록 보기·끊기(active=false)
drop policy if exists devices_read on public.devices;
drop policy if exists devices_update on public.devices;
create policy devices_read on public.devices for select to authenticated using (public.device_ok());
create policy devices_update on public.devices for update to authenticated using (public.device_ok()) with check (public.device_ok());

-- 5) 매장 기록(docs)·알림(events)은 등록된 기기에서만
drop policy if exists docs_read on public.docs;
drop policy if exists docs_update on public.docs;
drop policy if exists docs_write on public.docs;
create policy docs_read on public.docs for select to authenticated using (public.device_ok());
create policy docs_write on public.docs for insert to authenticated with check (public.device_ok());
create policy docs_update on public.docs for update to authenticated using (public.device_ok()) with check (public.device_ok());
drop policy if exists "events auth all" on public.events;
create policy "events auth all" on public.events for all to authenticated using (public.device_ok()) with check (public.device_ok());

-- 6) 실시간은 내용 없이 "바뀌었다" 신호만 — docs_poke (키 · 저장 시각). 앱은 신호를 받으면 기기 열쇠로 다시 읽는다.
create table if not exists public.docs_poke (key text primary key, saved_at bigint, updated_at timestamptz not null default now());
alter table public.docs_poke enable row level security;
drop policy if exists poke_read on public.docs_poke;
create policy poke_read on public.docs_poke for select to authenticated using (true);
create or replace function public.docs_poke_tr() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.docs_poke(key, saved_at, updated_at) values (new.key, new.saved_at, now())
    on conflict (key) do update set saved_at = excluded.saved_at, updated_at = now();
  return new;
end $$;
drop trigger if exists docs_poke_t on public.docs;
create trigger docs_poke_t after insert or update on public.docs for each row execute function public.docs_poke_tr();
insert into public.docs_poke(key, saved_at) select key, saved_at from public.docs on conflict (key) do update set saved_at = excluded.saved_at;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'docs_poke') then
    alter publication supabase_realtime add table public.docs_poke;
  end if;
end $$;

-- 7) 등록 안 된 기기용 교육 자료 — 직원 이름 · 교육 진도 · 미션만 오간다 (매출·급여·계약서는 절대 안 나간다)
create or replace function public.training_doc(p_store text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'staff', coalesce((select jsonb_agg(jsonb_build_object('id', s->>'id', 'name', s->>'name', 'roles', s->'roles', 'active', s->'active'))
                       from jsonb_array_elements(coalesce(doc->'staff', '[]'::jsonb)) s), '[]'::jsonb),
    'trainDone', coalesce(doc->'trainDone', '{}'::jsonb),
    'trainQuiz', coalesce(doc->'trainQuiz', '{}'::jsonb),
    'missions', coalesce(doc->'missions', '[]'::jsonb),
    'trainSeen', coalesce(doc->'trainSeen', '[]'::jsonb),
    'savedAt', doc->'savedAt')
  from public.docs where key = 'state:' || p_store;
$$;
create or replace function public.training_save(p_store text, p_patch jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_doc jsonb; k text; v_now bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  select doc into v_doc from public.docs where key = 'state:' || p_store;
  if v_doc is null then raise exception '매장 기록이 없습니다'; end if;
  foreach k in array array['trainDone', 'trainQuiz', 'missions', 'trainSeen'] loop
    if p_patch ? k then v_doc := jsonb_set(v_doc, array[k], p_patch->k, true); end if;
  end loop;
  v_doc := jsonb_set(v_doc, '{savedAt}', to_jsonb(v_now), true);
  update public.docs set doc = v_doc, saved_at = v_now, updated_at = now() where key = 'state:' || p_store;
  return v_now;
end $$;

-- 확인
select 'device_ok(지금 요청)' as what, public.device_ok()::text as value
union all select 'devices', count(*)::text from public.devices
union all select 'poke rows', count(*)::text from public.docs_poke
union all select 'policies', string_agg(tablename || '.' || policyname, ', ') from pg_policies where schemaname = 'public';
