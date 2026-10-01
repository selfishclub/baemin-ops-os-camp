-- =========================================================
-- 매장(지점) 기능 추가 - 1회만 실행하면 됩니다.
-- 사용법: Supabase 대시보드 -> SQL Editor -> New query ->
--        이 내용 전체 복사해서 붙여넣기 -> Run
-- =========================================================

create table if not exists manual_branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table manual_branches enable row level security;

drop policy if exists "anon full access" on manual_branches;
create policy "anon full access" on manual_branches for all using (true) with check (true);

alter table manual_staff
  add column if not exists branch_id uuid references manual_branches(id) on delete set null;
