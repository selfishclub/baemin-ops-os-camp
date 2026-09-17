-- 근무·급여 원터치 v1 — 데이터 창고 표 만들기
-- Supabase 대시보드 → SQL Editor 에 통째로 붙여넣고 Run.
-- 실제 직원 이름·연락처는 넣지 않습니다. 별칭(가상 직원 A 등)만 저장합니다.

create table if not exists employees (
  id text primary key,
  alias text not null,            -- 별칭
  store text not null,            -- 'hall' | 'delivery'
  role text not null default '',  -- 자리
  wage integer not null,          -- 시급
  pay_cycle text not null,        -- 'weekly' | 'monthly'
  plan jsonb not null default '{}'::jsonb,  -- 요일별 기본 근무
  updated_at timestamptz not null default now()
);

create table if not exists day_records (
  id text primary key,            -- '<employee_id>_<YYYY-MM-DD>'
  employee_id text not null,
  date date not null,
  kind text not null,             -- 'work' | 'absent'
  start text,                     -- 실제 출근 'HH:MM'
  "end" text,                     -- 실제 퇴근
  break_min integer,              -- 실제 휴게(분)
  decision text,                  -- 'accepted' | 'adjusted'
  adj_start text,
  adj_end text,
  reason text,
  confirmed boolean,
  updated_at timestamptz not null default now()
);
create index if not exists day_records_date_idx on day_records (date);

create table if not exists settings (
  id text primary key,
  min_wage integer not null
);

-- 잠금(RLS) 켜기
alter table employees enable row level security;
alter table day_records enable row level security;
alter table settings enable row level security;

-- v1은 사장님 로그인이 없어 공개 열쇠(anon)로 읽고 씁니다.
-- 시연용 가상 데이터만 넣고, 실제 직원 데이터를 넣기 전(v2)에 로그인·권한을 붙입니다.
drop policy if exists "v1 anon all" on employees;
create policy "v1 anon all" on employees for all to anon using (true) with check (true);
drop policy if exists "v1 anon all" on day_records;
create policy "v1 anon all" on day_records for all to anon using (true) with check (true);
drop policy if exists "v1 anon all" on settings;
create policy "v1 anon all" on settings for all to anon using (true) with check (true);
