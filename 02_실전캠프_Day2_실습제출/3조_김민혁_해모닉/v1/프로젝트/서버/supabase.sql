-- 해모닉 운영 ERP · Supabase 표 만들기 (SQL Editor 에 통째로 붙여넣고 Run)
-- 문서 하나 = 한 줄. key 예: state:ansan · state:anyang · shared:issues

create table if not exists public.docs (
  key        text primary key,
  doc        jsonb not null,
  saved_at   bigint not null default 0,
  updated_at timestamptz not null default now()
);

-- 로그인한 사람(매장 공용 계정)만 읽고 쓸 수 있다
alter table public.docs enable row level security;

drop policy if exists "docs_read"  on public.docs;
drop policy if exists "docs_write" on public.docs;
drop policy if exists "docs_update" on public.docs;
create policy "docs_read"   on public.docs for select to authenticated using (true);
create policy "docs_write"  on public.docs for insert to authenticated with check (true);
create policy "docs_update" on public.docs for update to authenticated using (true) with check (true);

-- 실시간(바뀌면 다른 기기에 알림) 켜기
alter publication supabase_realtime add table public.docs;
-- 실시간 알림에 saved_at 이 실리도록
alter table public.docs replica identity full;
