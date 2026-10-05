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

-- 계정이 만들어지면 프로필을 자동으로 만든다. 첫 계정은 사장(owner)·재직, 그 뒤는 직원(staff)·**중지** 상태.
-- (2026-09-24) 새 계정은 사장이 "직원 계정 관리"에서 켜 주기 전까지 아무것도 못 본다 — 누군가 몰래 가입해도 소용없게.
-- 앱 안에서 사장이 만든 계정은 만드는 순간 앱이 바로 켜 준다.
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
  insert into public.profiles (id, login_id, display_name, role, active)
  values (
    new.id,
    base_id,
    coalesce(new.raw_user_meta_data ->> 'display_name', base_id),
    case when owner_count = 0 then 'owner' else 'staff' end,
    owner_count = 0
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

-- 3-2) 신입 메뉴 체크리스트 · 레시피 퀴즈 (v2 여유 있으면 1순위) ----------------------
create table if not exists public.training_checks (
  user_id uuid not null references public.profiles (id) on delete cascade,
  recipe_id text not null,
  practiced_at timestamptz,
  confirmed_by uuid references public.profiles (id) on delete set null,
  confirmed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

create table if not exists public.quiz_results (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  score integer not null,
  total integer not null,
  detail_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_quiz_results_user on public.quiz_results (user_id, created_at desc);

grant select, insert, update, delete on public.training_checks, public.quiz_results to authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter table public.training_checks enable row level security;
alter table public.quiz_results enable row level security;

-- 직원은 자기 줄만 만들고 고친다. "확인함"(confirmed_*)은 사장만 바꿀 수 있게 트리거로 막는다.
create or replace function public.guard_training_confirm()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_owner() then
    if tg_op = 'INSERT' then
      new.confirmed_by := null;
      new.confirmed_at := null;
    else
      new.confirmed_by := old.confirmed_by;
      new.confirmed_at := old.confirmed_at;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists training_checks_guard on public.training_checks;
create trigger training_checks_guard
  before insert or update on public.training_checks
  for each row execute function public.guard_training_confirm();

drop policy if exists "training_select_self_or_owner" on public.training_checks;
create policy "training_select_self_or_owner" on public.training_checks
  for select to authenticated using (user_id = auth.uid() or public.is_owner());

drop policy if exists "training_insert_self_or_owner" on public.training_checks;
create policy "training_insert_self_or_owner" on public.training_checks
  for insert to authenticated with check ((user_id = auth.uid() and public.is_active_user()) or public.is_owner());

drop policy if exists "training_update_self_or_owner" on public.training_checks;
create policy "training_update_self_or_owner" on public.training_checks
  for update to authenticated using ((user_id = auth.uid() and public.is_active_user()) or public.is_owner());

drop policy if exists "quiz_select_self_or_owner" on public.quiz_results;
create policy "quiz_select_self_or_owner" on public.quiz_results
  for select to authenticated using (user_id = auth.uid() or public.is_owner());

drop policy if exists "quiz_insert_self" on public.quiz_results;
create policy "quiz_insert_self" on public.quiz_results
  for insert to authenticated with check (user_id = auth.uid() and public.is_active_user());

-- 3-3) 영역 잠금 (빈숲 OS 홈에서 사장이 영역을 평상시에 잠가 둔다) -----------------------
create table if not exists public.portal_locks (
  section_id text primary key,
  locked boolean not null default false,
  updated_by text not null default '',
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.portal_locks to authenticated;
alter table public.portal_locks enable row level security;

drop policy if exists "locks_select_active" on public.portal_locks;
create policy "locks_select_active" on public.portal_locks
  for select to authenticated using (public.is_active_user());

drop policy if exists "locks_insert_owner" on public.portal_locks;
create policy "locks_insert_owner" on public.portal_locks
  for insert to authenticated with check (public.is_owner());

drop policy if exists "locks_update_owner" on public.portal_locks;
create policy "locks_update_owner" on public.portal_locks
  for update to authenticated using (public.is_owner()) with check (public.is_owner());

-- 3-5) 오늘 체크 기록 (오픈·마감 체크 등) -----------------------------------------
-- 매뉴얼 문서의 "순서" 각 줄을 그날 누가 언제 했는지. 하루·문서·항목마다 한 줄 (먼저 누른 사람 이름이 남는다).
-- item_key = '__signoff__' 인 줄은 사장이 그날 그 문서를 "확인함" 한 기록 — 사장만 넣고 지울 수 있다.
create table if not exists public.daily_checks (
  id bigserial primary key,
  check_date date not null,
  doc_id text not null,
  item_key text not null,
  item_text text not null default '',
  checked_by uuid not null references public.profiles (id) on delete cascade,
  checked_by_name text not null default '',
  checked_at timestamptz not null default now(),
  unique (check_date, doc_id, item_key)
);
create index if not exists idx_daily_checks_date on public.daily_checks (check_date desc);

grant select, insert, delete on public.daily_checks to authenticated;
grant usage, select on sequence public.daily_checks_id_seq to authenticated;
alter table public.daily_checks enable row level security;

-- 재직 직원은 모두 본다 (앞 근무자가 어디까지 했는지 알아야 하므로)
drop policy if exists "daily_select_active" on public.daily_checks;
create policy "daily_select_active" on public.daily_checks
  for select to authenticated using (public.is_active_user());

-- 직원은 자기 이름으로만, 확인함(__signoff__)은 사장만
drop policy if exists "daily_insert_self_or_owner" on public.daily_checks;
create policy "daily_insert_self_or_owner" on public.daily_checks
  for insert to authenticated with check (
    checked_by = auth.uid() and public.is_active_user() and (item_key <> '__signoff__' or public.is_owner())
  );

-- 체크 취소는 본인 것만, 사장은 모두
drop policy if exists "daily_delete_self_or_owner" on public.daily_checks;
create policy "daily_delete_self_or_owner" on public.daily_checks
  for delete to authenticated using (
    public.is_owner() or (checked_by = auth.uid() and public.is_active_user() and item_key <> '__signoff__')
  );

-- 3-6) 열람 기록 (유출 방지) ----------------------------------------------------
-- 누가 언제 어떤 레시피·매뉴얼·사진을 열었는지, 챗봇에 무엇을 물었는지, 어디서(인터넷 주소·기기) 들어왔는지.
-- 직원은 자기 기록만 남길 수 있고, 아무도 고치거나 지우지 못한다(수정·삭제 정책 없음). 읽는 건 사장뿐.
create table if not exists public.view_logs (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  user_name text not null default '',
  kind text not null check (kind in ('login', 'logout', 'recipe', 'manual', 'media', 'chat', 'blocked')),
  target_id text not null default '',
  target_name text not null default '',
  ip text not null default '',
  outside boolean not null default false,
  device text not null default '',
  viewed_at timestamptz not null default now()
);
create index if not exists idx_view_logs_at on public.view_logs (viewed_at desc);
create index if not exists idx_view_logs_user on public.view_logs (user_id, viewed_at desc);

grant select, insert on public.view_logs to authenticated;
revoke update, delete on public.view_logs from authenticated;
grant usage, select on sequence public.view_logs_id_seq to authenticated;
alter table public.view_logs enable row level security;

drop policy if exists "views_select_owner" on public.view_logs;
create policy "views_select_owner" on public.view_logs
  for select to authenticated using (public.is_owner());

drop policy if exists "views_insert_self" on public.view_logs;
create policy "views_insert_self" on public.view_logs
  for insert to authenticated with check (user_id = auth.uid() and public.is_active_user());

-- 3-8) 이번 주 퀘스트 (사람마다 다른 문제·미션, 깬 기록만 남긴다) -----------------------
-- 퀘스트 자체는 저장하지 않고 "직원 ID + 주 시작일" 씨앗으로 매번 같은 걸 만든다(app/quest/quest-data.ts). 여기엔 진행만.
-- status: open → done(문제 맞힘·자동 완료) / pending(미션 '해냈어요', 사장 확인 대기) → confirmed(사장 확인). 확인 칸은 사장만(트리거).
create table if not exists public.quest_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  week_start date not null,
  quest_id text not null,
  status text not null default 'open' check (status in ('open', 'done', 'pending', 'confirmed')),
  attempts integer not null default 0,
  note text not null default '',
  done_at timestamptz,
  confirmed_by uuid references public.profiles (id) on delete set null,
  confirmed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, week_start, quest_id)
);
create index if not exists idx_quest_progress_week on public.quest_progress (week_start desc);

grant select, insert, update on public.quest_progress to authenticated;
revoke delete on public.quest_progress from authenticated;
alter table public.quest_progress enable row level security;

create or replace function public.guard_quest_confirm()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_owner() then
    if tg_op = 'INSERT' then
      new.confirmed_by := null;
      new.confirmed_at := null;
      if new.status = 'confirmed' then new.status := 'pending'; end if;
    else
      new.confirmed_by := old.confirmed_by;
      new.confirmed_at := old.confirmed_at;
      if new.status = 'confirmed' and old.status <> 'confirmed' then new.status := 'pending'; end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists quest_progress_guard on public.quest_progress;
create trigger quest_progress_guard
  before insert or update on public.quest_progress
  for each row execute function public.guard_quest_confirm();

drop policy if exists "quest_select_self_or_owner" on public.quest_progress;
create policy "quest_select_self_or_owner" on public.quest_progress
  for select to authenticated using (user_id = auth.uid() or public.is_owner());

drop policy if exists "quest_insert_self" on public.quest_progress;
create policy "quest_insert_self" on public.quest_progress
  for insert to authenticated with check (user_id = auth.uid() and public.is_active_user());

drop policy if exists "quest_update_self_or_owner" on public.quest_progress;
create policy "quest_update_self_or_owner" on public.quest_progress
  for update to authenticated using ((user_id = auth.uid() and public.is_active_user()) or public.is_owner());

-- 3-9) 칭찬 릴레이 (하루 한 장, 이름으로) ---------------------------------------------
-- 재직 직원 모두 읽고, 자기 이름으로만 보낸다(자기 자신에게는 못 보냄). 고치기는 없고, 지우기는 사장만.
create table if not exists public.praises (
  id bigserial primary key,
  from_user uuid not null references public.profiles (id) on delete cascade,
  from_name text not null default '',
  to_user uuid not null references public.profiles (id) on delete cascade,
  to_name text not null default '',
  text text not null check (char_length(text) between 1 and 120),
  created_at timestamptz not null default now(),
  check (from_user <> to_user)
);
create index if not exists idx_praises_created on public.praises (created_at desc);
create index if not exists idx_praises_to on public.praises (to_user, created_at desc);

grant select, insert, delete on public.praises to authenticated;
revoke update on public.praises from authenticated;
grant usage, select on sequence public.praises_id_seq to authenticated;
alter table public.praises enable row level security;

drop policy if exists "praise_select_active" on public.praises;
create policy "praise_select_active" on public.praises
  for select to authenticated using (public.is_active_user());

drop policy if exists "praise_insert_self" on public.praises;
create policy "praise_insert_self" on public.praises
  for insert to authenticated with check (from_user = auth.uid() and public.is_active_user());

drop policy if exists "praise_delete_owner" on public.praises;
create policy "praise_delete_owner" on public.praises
  for delete to authenticated using (public.is_owner());

-- 3-7) 점수판·레벨 (재미와 격려용, 급여·승급 자동 반영 없음) ---------------------------
-- 사람별로 "한 일"을 센다: 오늘 체크, 교육 체크(메뉴·매뉴얼), 실기 합격, 퀴즈·필기 통과, 바뀐 내용 확인, 열람.
-- 직원은 남의 교육 기록을 못 읽지만(RLS) 점수판에는 남의 "합계 숫자"가 필요하므로, security definer 함수가 숫자만 준다.
-- since 가 null 이면 전체 기간. 재직 직원(사장 포함)만 부를 수 있다.
create or replace function public.activity_counts(since timestamptz default null)
returns table (
  user_id uuid, display_name text, login_id text, role text, active boolean,
  checks integer, signoffs integer,
  practiced_recipes integer, confirmed_recipes integer,
  docs_read integer, docs_confirmed integer, exam_items integer,
  quiz_passed integer, exam_written integer, acks integer, reads integer,
  quests_done integer, missions_done integer,
  praises_received integer, praises_given integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id, p.display_name, p.login_id, p.role, p.active,
    (select count(*) from public.daily_checks d where d.checked_by = p.id and d.item_key <> '__signoff__' and (since is null or d.checked_at >= since))::integer,
    (select count(*) from public.daily_checks d where d.checked_by = p.id and d.item_key = '__signoff__' and (since is null or d.checked_at >= since))::integer,
    (select count(*) from public.training_checks t where t.user_id = p.id and t.recipe_id not like 'manual:%' and t.recipe_id not like 'exam:%' and t.practiced_at is not null and (since is null or t.practiced_at >= since))::integer,
    (select count(*) from public.training_checks t where t.user_id = p.id and t.recipe_id not like 'manual:%' and t.recipe_id not like 'exam:%' and t.confirmed_at is not null and (since is null or t.confirmed_at >= since))::integer,
    (select count(*) from public.training_checks t where t.user_id = p.id and t.recipe_id like 'manual:%' and t.practiced_at is not null and (since is null or t.practiced_at >= since))::integer,
    (select count(*) from public.training_checks t where t.user_id = p.id and t.recipe_id like 'manual:%' and t.confirmed_at is not null and (since is null or t.confirmed_at >= since))::integer,
    (select count(*) from public.training_checks t where t.user_id = p.id and t.recipe_id like 'exam:%' and t.confirmed_at is not null and (since is null or t.confirmed_at >= since))::integer,
    (select count(*) from public.quiz_results q where q.user_id = p.id and jsonb_typeof(q.detail_json) = 'array' and q.score * 10 >= q.total * 7 and (since is null or q.created_at >= since))::integer,
    (select count(*) from public.quiz_results q where q.user_id = p.id and jsonb_typeof(q.detail_json) = 'object' and q.score * 10 >= q.total * 8 and (since is null or q.created_at >= since))::integer,
    (select count(*) from public.recipe_acks a where a.user_id = p.id and (since is null or a.acked_at >= since))::integer,
    (select count(*) from public.view_logs v where v.user_id = p.id and v.kind in ('recipe', 'manual') and (since is null or v.viewed_at >= since))::integer,
    (select count(*) from public.quest_progress x where x.user_id = p.id and x.status = 'done' and x.quest_id <> 'mission' and (since is null or x.done_at >= since))::integer,
    (select count(*) from public.quest_progress x where x.user_id = p.id and x.status = 'confirmed' and (since is null or x.confirmed_at >= since))::integer,
    (select count(*) from public.praises pr where pr.to_user = p.id and (since is null or pr.created_at >= since))::integer,
    (select count(*) from public.praises pr where pr.from_user = p.id and (since is null or pr.created_at >= since))::integer
  from public.profiles p
  where public.is_active_user()
  order by p.created_at;
$$;
revoke all on function public.activity_counts(timestamptz) from public, anon;
grant execute on function public.activity_counts(timestamptz) to authenticated;

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
