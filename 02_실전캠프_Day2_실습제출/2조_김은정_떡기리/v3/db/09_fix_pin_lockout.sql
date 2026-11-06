-- v3 수정: 점주 PIN 5회 틀림 잠금이 작동하지 않던 문제.
-- 원인: 틀렸을 때 raise exception 으로 끝내면 그 안에서 올린 실패 횟수도 같이 취소된다.
-- 고침: 틀렸을 때는 예외 대신 {"error": "wrong pin"} / {"error": "locked"} 를 돌려준다(실패 횟수·잠금은 저장됨). 앱은 error 가 있으면 오류로 처리.
begin;

create or replace function public.owner_login(p_code text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare st public.stores; tk uuid; fails int;
begin
  select * into st from public.stores where code = upper(trim(p_code)) and status = 'active' limit 1;
  if st.id is null then return jsonb_build_object('error', 'store not found'); end if;
  if st.locked_until is not null and st.locked_until > now() then return jsonb_build_object('error', 'locked'); end if;
  if st.owner_pin_hash is null or public.pin_hash(p_pin) <> st.owner_pin_hash then
    fails := st.pin_fail_count + 1;
    if fails >= 5 then
      update public.stores set pin_fail_count = 0, locked_until = now() + interval '10 minutes' where id = st.id;
      return jsonb_build_object('error', 'locked');
    end if;
    update public.stores set pin_fail_count = fails where id = st.id;
    return jsonb_build_object('error', 'wrong pin', 'left', 5 - fails);
  end if;
  update public.stores set pin_fail_count = 0, locked_until = null where id = st.id;
  delete from public.owner_sessions where expires_at < now();
  insert into public.owner_sessions (store_id) values (st.id) returning token into tk;
  return jsonb_build_object('token', tk, 'store', jsonb_build_object('id', st.id, 'name', st.name, 'code', st.code, 'brand', st.brand));
end $$;
grant execute on function public.owner_login(text, text) to anon, authenticated;

commit;
