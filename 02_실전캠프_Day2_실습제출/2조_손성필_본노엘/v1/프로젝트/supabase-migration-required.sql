-- =========================================================
-- 신입 필수 매뉴얼 + 직원 ID 기반 확인 기록 - 1회만 실행하면 됩니다.
-- 사용법: Supabase 대시보드 -> SQL Editor -> New query ->
--        이 내용 전체 복사해서 붙여넣기 -> Run
-- (supabase-setup.sql, supabase-migration-branches.sql 을 먼저 실행한 상태여야 합니다)
-- =========================================================

-- 1. 매뉴얼에 "신입 필수" 표시
alter table manuals
  add column if not exists is_required boolean not null default false;

-- 2. 확인 기록을 이름 문자열이 아니라 직원 ID로 연결
--    (기존 staff_name 열은 옛 기록 표시용으로 그대로 둡니다)
alter table manual_confirmations
  add column if not exists staff_id uuid references manual_staff(id) on delete set null;

-- 3. 옛 기록 중 이름이 명단과 정확히 일치하는 것만 직원 ID 연결
update manual_confirmations c
set staff_id = s.id
from manual_staff s
where c.staff_id is null
  and c.staff_name = s.name;

-- 4. 같은 직원이 같은 매뉴얼을 두 번 확인한 옛 기록은 첫 기록만 남김
delete from manual_confirmations c
using manual_confirmations d
where c.staff_id is not null
  and c.staff_id = d.staff_id
  and c.manual_id = d.manual_id
  and c.confirmed_at > d.confirmed_at;

-- 5. 앞으로는 같은 직원이 같은 매뉴얼을 두 번 확인할 수 없게 (DB에서 막음)
create unique index if not exists manual_confirmations_manual_staff_uniq
  on manual_confirmations (manual_id, staff_id)
  where staff_id is not null;

-- 6. 진행률 화면이 빠르게 읽도록
create index if not exists manual_confirmations_staff_idx
  on manual_confirmations (staff_id);
