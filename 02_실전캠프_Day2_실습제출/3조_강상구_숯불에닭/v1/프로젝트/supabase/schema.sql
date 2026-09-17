-- 숯불에닭 한눈 손익 장부 · v1 시연 모드용 테이블
-- Supabase > SQL Editor 에 붙여넣고 Run. 시연 모드에는 가짜 데이터만 넣는다(로그인 없음).

create table if not exists transactions (
  id text primary key,
  month text not null,
  date date not null,
  payee text not null,
  out_amount bigint not null default 0,
  in_amount bigint not null default 0,
  source text not null default 'bank',      -- bank | manual(직접 추가한 지출)
  major text,
  minor text,
  channel text,
  review text,
  pay_method text
);
create index if not exists transactions_month_idx on transactions (month);

create table if not exists rules (
  id text primary key,
  keyword text not null,
  direction text not null,                   -- in | out
  major text not null,
  minor text not null,
  channel text,
  ambiguous boolean not null default false
);

create table if not exists channel_sales (
  month text not null,
  channel text not null,
  name text not null,
  orders bigint not null default 0,          -- 주문금액 (주문일 기준)
  deposit bigint not null default 0,         -- 정산금액 (이 달 주문분, 수수료 뺀 금액)
  order_count integer not null default 0,
  unsettled bigint,                          -- 월말 미입금액 (안 넣었으면 null)
  primary key (month, channel)
);
alter table channel_sales add column if not exists unsettled bigint;

create table if not exists month_closings (
  month text primary key,
  closed_at timestamptz,
  edits jsonb not null default '[]'
);

create table if not exists uploads (
  id text primary key,
  month text not null,
  from_date date not null,
  to_date date not null,
  row_count integer not null,
  uploaded_at timestamptz not null default now()
);

-- 잠금(RLS)을 켜고, 시연용으로 공개 열쇠(anon)의 읽기·쓰기를 허용한다.
-- 그래서 이 창고에는 가짜 데이터만 넣는다. 실제 숫자는 "내 PC 모드"에서만.
alter table transactions enable row level security;
alter table rules enable row level security;
alter table channel_sales enable row level security;
alter table month_closings enable row level security;
alter table uploads enable row level security;

drop policy if exists "demo anon all" on transactions;
drop policy if exists "demo anon all" on rules;
drop policy if exists "demo anon all" on channel_sales;
drop policy if exists "demo anon all" on month_closings;
drop policy if exists "demo anon all" on uploads;

create policy "demo anon all" on transactions for all to anon using (true) with check (true);
create policy "demo anon all" on rules for all to anon using (true) with check (true);
create policy "demo anon all" on channel_sales for all to anon using (true) with check (true);
create policy "demo anon all" on month_closings for all to anon using (true) with check (true);
create policy "demo anon all" on uploads for all to anon using (true) with check (true);
