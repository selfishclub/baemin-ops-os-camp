-- v3 1단계 (1/3): 새 표·칸 만들기. 기존 표의 줄·칸은 하나도 지우지 않는다 (추가만).
-- 되돌리기: rollback_step1.sql
begin;

-- 지점
create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  brand text not null default '떡기리',
  name text not null,
  code text not null unique,                 -- 직원 링크/QR 에 들어가는 6자리 (직원이 직접 입력하지 않음)
  owner_name text,
  owner_phone text,
  owner_pin_hash text,                       -- sha256(PIN) hex. 6자리 PIN
  pin_fail_count int not null default 0,
  locked_until timestamptz,
  status text not null default 'active' check (status in ('active','paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 직원 (지점 소속)
create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  name text not null,
  hire_on date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, name)
);

-- 지점 설정 (지점 추가 체크 항목, 떡 종류, 짧은 정보)
create table if not exists public.store_settings (
  store_id uuid primary key references public.stores(id),
  extra_items jsonb not null default '{"open":[],"close":[]}'::jsonb,
  products jsonb not null default '[]'::jsonb,
  info jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 본사 공통 매뉴얼 (머리말 / 장 / 별도 출력물)
create table if not exists public.manual_pages (
  id uuid primary key default gen_random_uuid(),
  section_kind text not null check (section_kind in ('intro','chapter','appendix')),
  chapter_no int,                            -- chapter 일 때 1~12
  group_name text,                           -- 브랜드 교육 / 기본 운영수칙 / 제품관리 / 고객응대 / 위생·포장 / 오픈·마감 원칙
  title text not null,
  body_md text not null default '',
  sort int not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- 공통 매뉴얼 수정 이력 (저장할 때마다 이전 본문을 남김 → 되돌리기)
create table if not exists public.manual_history (
  id bigserial primary key,
  page_id uuid not null references public.manual_pages(id) on delete cascade,
  title text not null,
  body_md text not null,
  saved_at timestamptz not null default now(),
  saved_by text,
  reason text
);

create or replace function public.manual_pages_keep_history() returns trigger
language plpgsql as $$
begin
  if (old.body_md is distinct from new.body_md) or (old.title is distinct from new.title) then
    insert into public.manual_history(page_id, title, body_md, saved_by, reason)
    values (old.id, old.title, old.body_md, old.updated_by, 'before update');
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists manual_pages_history on public.manual_pages;
create trigger manual_pages_history before update on public.manual_pages
for each row execute function public.manual_pages_keep_history();

-- 지점별 추가사항 (공통 매뉴얼의 "장 + 소제목" 아래에 붙음)
create table if not exists public.store_manual_notes (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  chapter_no int not null,
  section_key text,                          -- 소제목 글자 (예 '② 주방 정리'). 비우면 장 맨 끝
  kind text not null default 'add' check (kind in ('add')),
  body_md text not null,
  sort int not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by text
);
create index if not exists store_manual_notes_store on public.store_manual_notes(store_id, chapter_no);

-- 본사 관리자 (매직링크 로그인 이메일)
create table if not exists public.hq_admins (
  email text primary key,
  name text,
  created_at timestamptz not null default now()
);

-- 기존 표에 칸 추가 (옛 칸 store 글자는 그대로 둔다)
alter table public.checklist_runs add column if not exists store_id uuid references public.stores(id);
create unique index if not exists checklist_runs_store_id_date_kind
  on public.checklist_runs(store_id, run_date, kind) where store_id is not null;

alter table public.training_progress add column if not exists store_id uuid references public.stores(id);
alter table public.training_progress add column if not exists staff_id uuid references public.staff(id);
create unique index if not exists training_progress_staff_id_step
  on public.training_progress(staff_id, step) where staff_id is not null;

alter table public.sales add column if not exists store_id uuid references public.stores(id);

-- 새 표는 RLS 켜고 정책을 두지 않는다 → 익명(anon)은 읽지도 쓰지도 못함. (2단계에서 서버 함수로만 연다)
alter table public.stores enable row level security;
alter table public.staff enable row level security;
alter table public.store_settings enable row level security;
alter table public.manual_pages enable row level security;
alter table public.manual_history enable row level security;
alter table public.store_manual_notes enable row level security;
alter table public.hq_admins enable row level security;

commit;
