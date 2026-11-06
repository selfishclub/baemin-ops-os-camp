-- v3 3단계 (1/1): 점주 화면용 서버 함수. "지점 코드 + PIN" 으로 로그인하면 12시간짜리 세션 토큰을 주고,
-- 그 뒤 모든 점주 함수는 토큰으로 "그 지점"만 읽고 쓴다. 다른 지점은 토큰으로는 닿을 수 없다.
-- PIN 은 v2 와 같은 sha256(hex) 로 저장 → 기존 PIN 그대로 열림. 5번 틀리면 10분 잠금.
-- 되돌리기: rollback_step3.sql
begin;

create extension if not exists pgcrypto with schema extensions;

-- 점주 세션 (RLS 켜고 정책 없음 → 함수로만)
create table if not exists public.owner_sessions (
  token uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '12 hours'
);
alter table public.owner_sessions enable row level security;

create or replace function public.pin_hash(p_pin text) returns text
language sql immutable security definer set search_path = public, extensions as $$
  select encode(digest(convert_to(trim(p_pin), 'UTF8'), 'sha256'), 'hex')
$$;
revoke all on function public.pin_hash(text) from public, anon, authenticated;

-- 토큰 → 지점 (만료면 null). 쓸 때마다 12시간 연장.
create or replace function public.store_by_token(p_token uuid) returns public.stores
language plpgsql security definer set search_path = public as $$
declare st public.stores;
begin
  if p_token is null then return null; end if;
  select s.* into st from public.owner_sessions o join public.stores s on s.id = o.store_id
   where o.token = p_token and o.expires_at > now() and s.status = 'active' limit 1;
  if st.id is null then return null; end if;
  update public.owner_sessions set expires_at = now() + interval '12 hours' where token = p_token;
  return st;
end $$;
revoke all on function public.store_by_token(uuid) from public, anon, authenticated;

-- 로그인: 코드 + PIN → 토큰. 틀리면 'wrong pin', 5번 틀리면 'locked'(10분).
create or replace function public.owner_login(p_code text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare st public.stores; tk uuid;
begin
  select * into st from public.stores where code = upper(trim(p_code)) and status = 'active' limit 1;
  if st.id is null then raise exception 'store not found'; end if;
  if st.locked_until is not null and st.locked_until > now() then raise exception 'locked'; end if;
  if st.owner_pin_hash is null or public.pin_hash(p_pin) <> st.owner_pin_hash then
    update public.stores set
      locked_until = case when st.pin_fail_count + 1 >= 5 then now() + interval '10 minutes' else null end,
      pin_fail_count = case when st.pin_fail_count + 1 >= 5 then 0 else st.pin_fail_count + 1 end
      where id = st.id;
    if st.pin_fail_count + 1 >= 5 then raise exception 'locked'; end if;
    raise exception 'wrong pin';
  end if;
  update public.stores set pin_fail_count = 0, locked_until = null where id = st.id;
  delete from public.owner_sessions where expires_at < now();
  insert into public.owner_sessions (store_id) values (st.id) returning token into tk;
  return jsonb_build_object('token', tk, 'store', jsonb_build_object('id', st.id, 'name', st.name, 'code', st.code, 'brand', st.brand));
end $$;

create or replace function public.owner_logout(p_token uuid) returns void
language sql security definer set search_path = public as $$
  delete from public.owner_sessions where token = p_token
$$;

-- 점주 화면이 열릴 때: 직원(퇴사 포함)·지점 설정·추가사항(꺼진 것 포함)·교육 진도 전부. 이 지점 것만.
create or replace function public.owner_bundle(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare st public.stores;
begin
  st := public.store_by_token(p_token);
  if st.id is null then raise exception 'session expired'; end if;
  return jsonb_build_object(
    'store', jsonb_build_object('id', st.id, 'name', st.name, 'code', st.code, 'brand', st.brand, 'owner_name', st.owner_name),
    'staff', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'hire_on', s.hire_on, 'active', s.active) order by s.active desc, s.created_at, s.name)
                       from public.staff s where s.store_id = st.id), '[]'::jsonb),
    'settings', coalesce((select jsonb_build_object('extra_items', ss.extra_items, 'products', ss.products, 'info', ss.info)
                          from public.store_settings ss where ss.store_id = st.id),
                         '{"extra_items":{"open":[],"close":[]},"products":[],"info":{}}'::jsonb),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'chapter_no', n.chapter_no, 'section_key', n.section_key, 'body_md', n.body_md, 'sort', n.sort, 'active', n.active, 'updated_at', n.updated_at) order by n.chapter_no, n.sort, n.updated_at)
                       from public.store_manual_notes n where n.store_id = st.id), '[]'::jsonb),
    'training', coalesce((select jsonb_agg(to_jsonb(t)) from public.training_progress t
                          where t.store_id = st.id or (t.store_id is null and t.store = st.name)), '[]'::jsonb)
  );
end $$;

-- 직원 추가·수정(이름·입사일)·퇴사/복귀. 이름을 바꾸면 그 직원의 교육 진도 이름도 같이 바뀐다.
create or replace function public.owner_staff_save(p_token uuid, p_id uuid, p_name text, p_hire_on date, p_active boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare st public.stores; sf public.staff; nm text;
begin
  st := public.store_by_token(p_token);
  if st.id is null then raise exception 'session expired'; end if;
  nm := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  if nm = '' then raise exception 'name required'; end if;
  if length(nm) > 20 then raise exception 'name too long'; end if;
  if p_id is null then
    if exists (select 1 from public.staff s where s.store_id = st.id and s.name = nm) then raise exception 'duplicate name'; end if;
    insert into public.staff (store_id, name, hire_on, active) values (st.id, nm, p_hire_on, coalesce(p_active, true)) returning * into sf;
  else
    select * into sf from public.staff s where s.id = p_id and s.store_id = st.id;
    if sf.id is null then raise exception 'staff not found'; end if;
    if nm <> sf.name and exists (select 1 from public.staff s where s.store_id = st.id and s.name = nm and s.id <> sf.id) then raise exception 'duplicate name'; end if;
    update public.staff set name = nm, hire_on = p_hire_on, active = coalesce(p_active, active), updated_at = now() where id = sf.id returning * into sf;
    update public.training_progress set staff = nm where staff_id = sf.id and staff <> nm;
  end if;
  return jsonb_build_object('id', sf.id, 'name', sf.name, 'hire_on', sf.hire_on, 'active', sf.active);
end $$;

-- 사수 확인 (교육 진도). 다른 지점의 같은 이름 줄은 절대 건드리지 않는다.
create or replace function public.owner_confirm_training(p_token uuid, p_staff_id uuid, p_step text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare st public.stores; sf public.staff; t public.training_progress;
begin
  st := public.store_by_token(p_token);
  if st.id is null then raise exception 'session expired'; end if;
  select * into sf from public.staff s where s.id = p_staff_id and s.store_id = st.id;
  if sf.id is null then raise exception 'staff not found'; end if;
  update public.training_progress set confirmed_at = coalesce(confirmed_at, now()), read_at = coalesce(read_at, now()),
         store = st.name, store_id = st.id, staff_id = sf.id, updated_at = now()
   where step = p_step and (staff_id = sf.id or (staff_id is null and staff = sf.name and coalesce(store, '') in ('', st.name)))
   returning * into t;
  if t.id is null then
    begin
      insert into public.training_progress (staff, store, store_id, staff_id, step, read_at, confirmed_at, updated_at)
      values (sf.name, st.name, st.id, sf.id, p_step, now(), now(), now()) returning * into t;
    exception when unique_violation then raise exception 'name used by another store';
    end;
  end if;
  return to_jsonb(t);
end $$;

-- 우리 지점 추가사항 저장(새로/수정) · 삭제
create or replace function public.owner_note_save(p_token uuid, p_id uuid, p_chapter_no int, p_section_key text, p_body_md text, p_active boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare st public.stores; n public.store_manual_notes;
begin
  st := public.store_by_token(p_token);
  if st.id is null then raise exception 'session expired'; end if;
  if p_chapter_no is null or p_chapter_no < 1 or p_chapter_no > 99 then raise exception 'bad chapter'; end if;
  if trim(coalesce(p_body_md, '')) = '' then raise exception 'body required'; end if;
  if p_id is null then
    insert into public.store_manual_notes (store_id, chapter_no, section_key, body_md, sort, active, updated_by)
    values (st.id, p_chapter_no, nullif(trim(coalesce(p_section_key, '')), ''), p_body_md,
            coalesce((select max(sort) + 1 from public.store_manual_notes where store_id = st.id and chapter_no = p_chapter_no), 0),
            coalesce(p_active, true), 'owner') returning * into n;
  else
    update public.store_manual_notes set chapter_no = p_chapter_no, section_key = nullif(trim(coalesce(p_section_key, '')), ''),
           body_md = p_body_md, active = coalesce(p_active, active), updated_at = now(), updated_by = 'owner'
     where id = p_id and store_id = st.id returning * into n;
    if n.id is null then raise exception 'note not found'; end if;
  end if;
  return jsonb_build_object('id', n.id, 'chapter_no', n.chapter_no, 'section_key', n.section_key, 'body_md', n.body_md, 'sort', n.sort, 'active', n.active);
end $$;

create or replace function public.owner_note_delete(p_token uuid, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare st public.stores;
begin
  st := public.store_by_token(p_token);
  if st.id is null then raise exception 'session expired'; end if;
  delete from public.store_manual_notes where id = p_id and store_id = st.id;
end $$;

-- 지점 설정: 오픈·마감 추가 항목, 떡 종류 (null 이면 그 칸은 그대로)
create or replace function public.owner_settings_save(p_token uuid, p_extra_items jsonb, p_products jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare st public.stores; ss public.store_settings;
begin
  st := public.store_by_token(p_token);
  if st.id is null then raise exception 'session expired'; end if;
  insert into public.store_settings (store_id, extra_items, products)
  values (st.id, coalesce(p_extra_items, '{"open":[],"close":[]}'::jsonb), coalesce(p_products, '[]'::jsonb))
  on conflict (store_id) do update
    set extra_items = coalesce(excluded.extra_items, public.store_settings.extra_items),
        products = coalesce(excluded.products, public.store_settings.products), updated_at = now()
  returning * into ss;
  return jsonb_build_object('extra_items', ss.extra_items, 'products', ss.products, 'info', ss.info);
end $$;

-- PIN 바꾸기: 지금 PIN 확인 → 새 PIN(숫자 6자리) 저장 → 다른 기기의 점주 세션은 모두 끊음
create or replace function public.owner_change_pin(p_token uuid, p_old_pin text, p_new_pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare st public.stores;
begin
  st := public.store_by_token(p_token);
  if st.id is null then raise exception 'session expired'; end if;
  if st.owner_pin_hash is not null and public.pin_hash(p_old_pin) <> st.owner_pin_hash then raise exception 'wrong pin'; end if;
  if trim(coalesce(p_new_pin, '')) !~ '^\d{6}$' then raise exception 'pin must be 6 digits'; end if;
  update public.stores set owner_pin_hash = public.pin_hash(p_new_pin), pin_fail_count = 0, locked_until = null, updated_at = now() where id = st.id;
  delete from public.owner_sessions where store_id = st.id and token <> p_token;
  return jsonb_build_object('ok', true);
end $$;

-- 직원 앱의 교육 저장도 같은 원칙으로 고침: 다른 지점의 같은 이름 줄을 덮어쓰지 않는다 (05 의 on conflict 대신 update→insert)
create or replace function public.save_training(p_code text, p_staff text, p_step text, p_read_at timestamptz, p_confirmed_at timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare st public.stores; sf public.staff; t public.training_progress;
begin
  st := public.store_by_code(p_code);
  if st.id is null then raise exception 'store not found'; end if;
  select * into sf from public.staff s where s.store_id = st.id and s.name = p_staff and s.active limit 1;
  if sf.id is null then raise exception 'staff not registered'; end if;
  update public.training_progress set store = st.name, store_id = st.id, staff_id = sf.id, read_at = p_read_at,
         confirmed_at = coalesce(confirmed_at, p_confirmed_at), updated_at = now()
   where step = p_step and (staff_id = sf.id or (staff_id is null and staff = sf.name and coalesce(store, '') in ('', st.name)))
   returning * into t;
  if t.id is null then
    begin
      insert into public.training_progress (staff, store, store_id, staff_id, step, read_at, confirmed_at, updated_at)
      values (p_staff, st.name, st.id, sf.id, p_step, p_read_at, p_confirmed_at, now()) returning * into t;
    exception when unique_violation then raise exception 'name used by another store';
    end;
  end if;
  return to_jsonb(t);
end $$;

grant execute on function public.owner_login(text, text) to anon, authenticated;
grant execute on function public.owner_logout(uuid) to anon, authenticated;
grant execute on function public.owner_bundle(uuid) to anon, authenticated;
grant execute on function public.owner_staff_save(uuid, uuid, text, date, boolean) to anon, authenticated;
grant execute on function public.owner_confirm_training(uuid, uuid, text) to anon, authenticated;
grant execute on function public.owner_note_save(uuid, uuid, int, text, text, boolean) to anon, authenticated;
grant execute on function public.owner_note_delete(uuid, uuid) to anon, authenticated;
grant execute on function public.owner_settings_save(uuid, jsonb, jsonb) to anon, authenticated;
grant execute on function public.owner_change_pin(uuid, text, text) to anon, authenticated;
grant execute on function public.save_training(text, text, text, timestamptz, timestamptz) to anon, authenticated;

commit;
