-- v3 1단계 되돌리기: 1단계에서 "추가"한 것만 제거. 기존 표(checklist_runs·settings·training_progress·sales)의 원래 줄·칸은 그대로.
begin;
alter table public.checklist_runs    drop column if exists store_id;
alter table public.training_progress drop column if exists staff_id;
alter table public.training_progress drop column if exists store_id;
alter table public.sales             drop column if exists store_id;
drop table if exists public.store_manual_notes;
drop table if exists public.manual_history;
drop trigger if exists manual_pages_history on public.manual_pages;
drop function if exists public.manual_pages_keep_history();
drop table if exists public.manual_pages;
drop table if exists public.hq_admins;
drop table if exists public.store_settings;
drop table if exists public.staff;
drop table if exists public.stores;
drop function if exists public.gen_store_code();
commit;
