-- =========================================================
-- 신입 직원용 매뉴얼북 - Supabase 테이블 설정
-- 기존 로그북(caetlljnyxsusswqhtci)과 같은 프로젝트에 새 테이블만 추가합니다.
-- 사용법: Supabase 대시보드 -> 왼쪽 메뉴 SQL Editor -> New query ->
--        이 파일 내용 전체 복사해서 붙여넣기 -> Run
-- =========================================================

-- 1. 카테고리 (포장 방법 / 매장 운영 / 기계 사용법 / 서류·행정 / 손님 응대 ...)
create table if not exists manual_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- 2. 매뉴얼 항목
create table if not exists manuals (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references manual_categories(id) on delete set null,
  title text not null,
  tags text[] not null default '{}',
  youtube_url text,
  photos jsonb not null default '[]',   -- [{ "path": "...", "url": "..." }, ...]
  steps jsonb not null default '[]',    -- ["1단계 설명", "2단계 설명", ...]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. 직원 명단 (관리자가 등록 - "안 본 사람" 비교용)
create table if not exists manual_staff (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- 4. 확인 기록 (직원이 이름 입력 + "확인했어요" 누른 기록)
create table if not exists manual_confirmations (
  id uuid primary key default gen_random_uuid(),
  manual_id uuid not null references manuals(id) on delete cascade,
  staff_name text not null,
  confirmed_at timestamptz not null default now()
);

-- RLS 켜기 + 로그북과 동일한 보안 수준(anon 키로 전체 읽기/쓰기 허용)
alter table manual_categories enable row level security;
alter table manuals enable row level security;
alter table manual_staff enable row level security;
alter table manual_confirmations enable row level security;

drop policy if exists "anon full access" on manual_categories;
create policy "anon full access" on manual_categories for all using (true) with check (true);

drop policy if exists "anon full access" on manuals;
create policy "anon full access" on manuals for all using (true) with check (true);

drop policy if exists "anon full access" on manual_staff;
create policy "anon full access" on manual_staff for all using (true) with check (true);

drop policy if exists "anon full access" on manual_confirmations;
create policy "anon full access" on manual_confirmations for all using (true) with check (true);

-- =========================================================
-- 사진 저장용 Storage 버킷 설정
-- 1) 대시보드 -> Storage -> New bucket
--    이름: manual-photos
--    Public bucket: 켜기(ON)
-- 2) 버킷을 만든 다음 아래 정책을 SQL Editor에서 실행
-- =========================================================

drop policy if exists "anon upload manual photos" on storage.objects;
create policy "anon upload manual photos"
on storage.objects for insert
to anon
with check (bucket_id = 'manual-photos');

drop policy if exists "anon delete manual photos" on storage.objects;
create policy "anon delete manual photos"
on storage.objects for delete
to anon
using (bucket_id = 'manual-photos');
