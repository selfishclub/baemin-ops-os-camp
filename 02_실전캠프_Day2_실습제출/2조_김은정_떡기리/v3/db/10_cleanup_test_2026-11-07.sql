-- 2026-11-07 최종 테스트에서 직영 3개점에 남긴 테스트 기록 3줄만 삭제 (id 로 정확히 지정). 실제 기록은 건드리지 않음.
-- (테스트가맹점 자체는 본사 화면 "지점 삭제"로 지운다)
begin;
delete from public.checklist_runs where id in (1556, 1557, 1558) and note = 'v3 테스트 기록(삭제 예정)';
update public.stores set pin_fail_count = 0, locked_until = null where code in ('N4MRR8', 'EHNSGC', 'MGQS4L');
commit;
select (select count(*) from public.checklist_runs) as runs_total,
       (select count(*) from public.checklist_runs where note = 'v3 테스트 기록(삭제 예정)') as test_rows_left;
