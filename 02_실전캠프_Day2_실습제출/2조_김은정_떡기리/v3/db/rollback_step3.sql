-- v3 3단계 되돌리기: 점주 함수·세션 표만 제거. 표·데이터는 그대로.
-- save_training 은 06 에서 고친 것이므로, 되돌린 뒤 05_functions_staff.sql 을 다시 실행하면 2단계 상태로 돌아간다.
begin;
drop function if exists public.owner_change_pin(uuid, text, text);
drop function if exists public.owner_settings_save(uuid, jsonb, jsonb);
drop function if exists public.owner_note_delete(uuid, uuid);
drop function if exists public.owner_note_save(uuid, uuid, int, text, text, boolean);
drop function if exists public.owner_confirm_training(uuid, uuid, text);
drop function if exists public.owner_staff_save(uuid, uuid, text, date, boolean);
drop function if exists public.owner_bundle(uuid);
drop function if exists public.owner_logout(uuid);
drop function if exists public.owner_login(text, text);
drop function if exists public.store_by_token(uuid);
drop function if exists public.pin_hash(text);
drop table if exists public.owner_sessions;
commit;
