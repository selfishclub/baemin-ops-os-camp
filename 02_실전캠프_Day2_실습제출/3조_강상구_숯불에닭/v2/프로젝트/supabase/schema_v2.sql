-- 한눈 손익 장부 · v2 인터넷 모드(폰·공유용) 표
-- Supabase > SQL Editor 에 통째로 붙여넣고 Run.
--
-- v1(schema.sql)은 "시연용"이라 로그인 없이 누구나 읽고 쓸 수 있었다. 그래서 가짜 자료만 넣었다.
-- v2는 가게마다 따로 쓴다: 모든 줄에 user_id(로그인한 사람)가 붙고, 잠금(RLS)이 "내 줄"만 보이게 막는다.
-- 시연용 표를 지우고 다시 만든다 — 시연 자료는 전부 가짜였으니 잃는 것이 없다.
-- 전제: Authentication > Providers > Email 켜기(비밀번호 없는 이메일 링크). 자세한 순서는 docs/인터넷모드_준비.md

drop table if exists transactions cascade;
drop table if exists rules cascade;
drop table if exists channel_sales cascade;
drop table if exists month_closings cascade;
drop table if exists uploads cascade;
drop table if exists daily_sales cascade;
drop table if exists staff cascade;
drop table if exists shifts cascade;
drop table if exists settings cascade;
drop table if exists daily_weather cascade;

create table transactions (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
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
  pay_method text,
  splits jsonb,                              -- 한 줄에 성격이 다른 돈이 섞였을 때 나눠 적은 몫 (없으면 null)
  primary key (user_id, id)
);
create index transactions_user_month_idx on transactions (user_id, month);

create table rules (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  keyword text not null,
  direction text not null,                   -- in | out
  major text not null,
  minor text not null,
  channel text,
  ambiguous boolean not null default false,
  prev_month boolean not null default false, -- 급여·거래처 대금처럼 다음 달에 내는 돈: 지난달 비용으로 잡는다
  amount bigint,                             -- '이 금액일 때만' 조건 (없으면 null) — 열 이름이 앱의 Rule.amount 와 같아야 한다
  primary key (user_id, id)
);

create table channel_sales (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  month text not null,
  channel text not null,
  name text not null,
  orders bigint not null default 0,          -- 주문금액 (주문일 기준)
  deposit bigint not null default 0,         -- 정산금액 (이 달 주문분, 수수료 뺀 금액)
  order_count integer not null default 0,
  unsettled bigint,                          -- 월말 미입금액 (안 넣었으면 null)
  primary key (user_id, month, channel)
);

create table month_closings (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  month text not null,
  closed_at timestamptz,
  edits jsonb not null default '[]',
  primary key (user_id, month)
);

create table uploads (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  month text not null,
  from_date date not null,
  to_date date not null,
  row_count integer not null,
  uploaded_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table daily_sales (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  channel text not null,
  amount bigint not null default 0,
  source text not null default '',           -- '' 보통 줄 | 'pos_easy' 포스 간편결제승인현황에서 온 줄. 같은 날·같은 카드사에 둘이 같이 있을 수 있다
  primary key (user_id, date, channel, source)
);

create table staff (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  alias text not null,                       -- 별칭만 (실명 금지)
  wage integer not null default 0,           -- 시급
  active boolean not null default true,
  primary key (user_id, id)
);

create table shifts (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  staff_id text not null,
  hours double precision not null default 0, -- 분 단위 그대로 (10분 = 0.1666…) 라서 자릿수를 안 자른다
  start_time text,
  end_time text,
  primary key (user_id, date, staff_id)
);

create table settings (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null,
  value jsonb not null,
  primary key (user_id, key)
);

create table daily_weather (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  kind text not null,                        -- 맑음 | 흐림 | 비 | 눈
  temp_max numeric(4,1) not null default 0,
  temp_min numeric(4,1) not null default 0,
  rain_mm numeric(6,1) not null default 0,
  source text not null default 'open-meteo',
  primary key (user_id, date)
);

-- 잠금(RLS): 로그인한 사람(authenticated)이 자기 user_id 줄만 읽고 쓴다. 공개 열쇠(anon)로는 아무것도 못 본다.
do $$
declare t text;
begin
  foreach t in array array['transactions','rules','channel_sales','month_closings','uploads','daily_sales','staff','shifts','settings','daily_weather']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "owner all" on %I', t);
    execute format('create policy "owner all" on %I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('revoke all on %I from anon', t);
  end loop;
end $$;
