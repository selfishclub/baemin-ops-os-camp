-- 빈숲 레시피OS v2 · 데이터 창고(Supabase) 표와 잠금(RLS)
-- Supabase 대시보드 → SQL Editor 에 통째로 붙여넣고 Run. 여러 번 실행해도 안전하다.
--
-- 역할:  owner(사장) = 레시피 편집·게시·직원 관리 / staff(직원) = 보기만
-- 잠금:  로그인 + 재직(active) 인 사람만 읽고, owner 만 쓴다. 로그인 없이는 아무것도 못 본다.

-- 1) 직원 프로필 -------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  login_id text not null unique,
  display_name text not null default '',
  role text not null default 'staff' check (role in ('owner', 'staff')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 계정이 만들어지면 프로필을 자동으로 만든다. 첫 계정은 사장(owner), 그 뒤는 직원(staff).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_count integer;
  base_id text;
begin
  select count(*) into owner_count from public.profiles where role = 'owner';
  base_id := split_part(coalesce(new.email, new.id::text), '@', 1);
  insert into public.profiles (id, login_id, display_name, role)
  values (
    new.id,
    base_id,
    coalesce(new.raw_user_meta_data ->> 'display_name', base_id),
    case when owner_count = 0 then 'owner' else 'staff' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 잠금 규칙에서 쓰는 도우미
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active);
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active and role = 'owner');
$$;

-- 2) 레시피 작업 공간 · 버전 · 기록 ---------------------------------------------
create table if not exists public.recipe_workspaces (
  id text primary key,
  draft_json jsonb not null,
  draft_revision integer not null default 1,
  draft_updated_by text not null,
  draft_updated_at timestamptz not null,
  published_version integer not null default 1,
  published_json jsonb not null,
  published_at timestamptz not null
);

create table if not exists public.recipe_versions (
  id bigserial primary key,
  version integer not null unique,
  content_json jsonb not null,
  change_reason text not null,
  effective_at text not null,
  published_by text not null,
  published_at timestamptz not null
);

create table if not exists public.recipe_audit_log (
  id bigserial primary key,
  action text not null,
  actor_id uuid not null,
  actor_email text not null,
  details_json jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_recipe_audit_created_at on public.recipe_audit_log (created_at);

-- 2-1) 로그인한 사용자 역할에 표 접근 권한 (이게 없으면 잠금 규칙 이전에 "permission denied"가 난다)
grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated, anon;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;
alter default privileges in schema public grant execute on functions to authenticated, anon;

-- 3) 잠금(RLS) ----------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.recipe_workspaces enable row level security;
alter table public.recipe_versions enable row level security;
alter table public.recipe_audit_log enable row level security;

drop policy if exists "profiles_select_self_or_owner" on public.profiles;
create policy "profiles_select_self_or_owner" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_owner());

drop policy if exists "profiles_update_owner" on public.profiles;
create policy "profiles_update_owner" on public.profiles
  for update to authenticated using (public.is_owner()) with check (public.is_owner());

drop policy if exists "workspaces_select_active" on public.recipe_workspaces;
create policy "workspaces_select_active" on public.recipe_workspaces
  for select to authenticated using (public.is_active_user());

drop policy if exists "workspaces_insert_owner" on public.recipe_workspaces;
create policy "workspaces_insert_owner" on public.recipe_workspaces
  for insert to authenticated with check (public.is_owner());

drop policy if exists "workspaces_update_owner" on public.recipe_workspaces;
create policy "workspaces_update_owner" on public.recipe_workspaces
  for update to authenticated using (public.is_owner()) with check (public.is_owner());

drop policy if exists "versions_select_active" on public.recipe_versions;
create policy "versions_select_active" on public.recipe_versions
  for select to authenticated using (public.is_active_user());

drop policy if exists "versions_insert_owner" on public.recipe_versions;
create policy "versions_insert_owner" on public.recipe_versions
  for insert to authenticated with check (public.is_owner());

drop policy if exists "audit_select_owner" on public.recipe_audit_log;
create policy "audit_select_owner" on public.recipe_audit_log
  for select to authenticated using (public.is_owner());

drop policy if exists "audit_insert_owner" on public.recipe_audit_log;
create policy "audit_insert_owner" on public.recipe_audit_log
  for insert to authenticated with check (public.is_owner());

-- 3-1) 바뀐 레시피 알림 · 읽음 확인 (v2 꼭 할 것 2) -------------------------------
create table if not exists public.recipe_change_notices (
  id bigserial primary key,
  version integer not null,
  recipe_id text not null,
  recipe_name text not null,
  change_reason text not null default '',
  published_by text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_change_notices_created on public.recipe_change_notices (created_at desc);

create table if not exists public.recipe_acks (
  notice_id bigint not null references public.recipe_change_notices (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  acked_at timestamptz not null default now(),
  primary key (notice_id, user_id)
);

grant select, insert, update, delete on public.recipe_change_notices, public.recipe_acks to authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter table public.recipe_change_notices enable row level security;
alter table public.recipe_acks enable row level security;

drop policy if exists "notices_select_active" on public.recipe_change_notices;
create policy "notices_select_active" on public.recipe_change_notices
  for select to authenticated using (public.is_active_user());

drop policy if exists "notices_insert_owner" on public.recipe_change_notices;
create policy "notices_insert_owner" on public.recipe_change_notices
  for insert to authenticated with check (public.is_owner());

drop policy if exists "notices_delete_owner" on public.recipe_change_notices;
create policy "notices_delete_owner" on public.recipe_change_notices
  for delete to authenticated using (public.is_owner());

drop policy if exists "acks_select_self_or_owner" on public.recipe_acks;
create policy "acks_select_self_or_owner" on public.recipe_acks
  for select to authenticated using (user_id = auth.uid() or public.is_owner());

drop policy if exists "acks_insert_self" on public.recipe_acks;
create policy "acks_insert_self" on public.recipe_acks
  for insert to authenticated with check (user_id = auth.uid() and public.is_active_user());

-- 빈숲OS 배지용: 로그인 없이 "최근 N일 안에 바뀐 레시피 건수"만 준다 (메뉴 이름은 안 나감)
create or replace function public.recent_change_count(days integer default 14)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from public.recipe_change_notices
  where created_at > now() - make_interval(days => days);
$$;
grant execute on function public.recent_change_count(integer) to anon, authenticated;

-- 4) 사진 파일함 (비공개) -------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('recipe-media', 'recipe-media', false)
on conflict (id) do nothing;

drop policy if exists "media_read_active" on storage.objects;
create policy "media_read_active" on storage.objects
  for select to authenticated using (bucket_id = 'recipe-media' and public.is_active_user());

drop policy if exists "media_write_owner" on storage.objects;
create policy "media_write_owner" on storage.objects
  for insert to authenticated with check (bucket_id = 'recipe-media' and public.is_owner());

drop policy if exists "media_delete_owner" on storage.objects;
create policy "media_delete_owner" on storage.objects
  for delete to authenticated using (bucket_id = 'recipe-media' and public.is_owner());
