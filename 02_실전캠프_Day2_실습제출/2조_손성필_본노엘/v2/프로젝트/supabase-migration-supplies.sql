-- =========================================================
-- 포장 비품 사진 라이브러리 추가 - 1회만 실행하면 됩니다.
-- 사용법: Supabase 대시보드 -> SQL Editor -> New query ->
--        이 내용 전체 복사해서 붙여넣기 -> Run
-- =========================================================

create table if not exists manual_supplies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  photo_path text not null,
  photo_url text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table manual_supplies enable row level security;

drop policy if exists "anon full access" on manual_supplies;
create policy "anon full access" on manual_supplies for all using (true) with check (true);

alter table manuals
  add column if not exists supply_ids uuid[] not null default '{}';
