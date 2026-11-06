-- v3 4단계 되돌리기: 본사 함수만 제거. hq_admins 표·매뉴얼·이력·지점 데이터는 그대로.
begin;
drop function if exists public.hq_manual_restore(bigint);
drop function if exists public.hq_manual_save(uuid, text, text, text);
drop function if exists public.hq_manual_history_body(bigint);
drop function if exists public.hq_manual_page(uuid);
drop function if exists public.hq_manual_list();
drop function if exists public.hq_delete_store(uuid, text);
drop function if exists public.hq_update_store(uuid, text, text, text, text);
drop function if exists public.hq_reset_pin(uuid);
drop function if exists public.hq_create_store(text, text, text);
drop function if exists public.hq_store(uuid, date);
drop function if exists public.hq_overview(date);
drop function if exists public.assert_hq();
drop function if exists public.hq_email();
commit;
