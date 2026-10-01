-- =========================================================
-- 매뉴얼별 이해도 퀴즈 - 1회만 실행하면 됩니다.
-- 사용법: Supabase 대시보드 -> SQL Editor -> New query ->
--        이 내용 전체 복사해서 붙여넣기 -> Run
-- =========================================================

-- 매뉴얼마다 "통과해야 확인 인정" 여부
alter table manuals
  add column if not exists quiz_required boolean not null default false;

-- 퀴즈 문제 (O/X 또는 객관식)
create table if not exists manual_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  manual_id uuid not null references manuals(id) on delete cascade,
  type text not null default 'ox',        -- 'ox' | 'mc'
  question text not null,
  options jsonb not null default '[]',    -- mc일 때 보기 배열, ox는 빈 배열
  answer_index int not null default 0,    -- ox: 0=O, 1=X / mc: 보기 인덱스
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table manual_quiz_questions enable row level security;

drop policy if exists "anon full access" on manual_quiz_questions;
create policy "anon full access" on manual_quiz_questions for all using (true) with check (true);

-- 확인 기록에 퀴즈 결과(몇 번 만에 통과) 남기기
alter table manual_confirmations
  add column if not exists quiz_tries int;
