-- v3 2단계 되돌리기: 직원 앱용 서버 함수만 제거. 표·데이터는 그대로.
begin;
drop function if exists public.save_training(text, text, text, timestamptz, timestamptz);
drop function if exists public.get_training(text, text);
drop function if exists public.save_run(text, date, text, text, jsonb, int, int, text, jsonb, timestamptz, timestamptz);
drop function if exists public.get_run(text, date, text);
drop function if exists public.runs_for_date(text, date);
drop function if exists public.staff_bundle(text);
drop function if exists public.store_by_code(text);
commit;
