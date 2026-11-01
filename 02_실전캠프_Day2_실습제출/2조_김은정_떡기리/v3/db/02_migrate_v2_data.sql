-- v3 1단계 (2/3): 직영 3개점 v2 데이터를 새 칸에 "채운다" (옮기지 않음, 지우지 않음).
-- 전체가 한 트랜잭션: 중간에 실패하면 아무것도 바뀌지 않는다.
begin;

-- 지점 코드 생성 (헷갈리는 글자 0 O 1 I 제외, 6자리, 중복 없음)
create or replace function public.gen_store_code() returns text
language plpgsql as $$
declare chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text; i int;
begin
  loop
    c := '';
    for i in 1..6 loop c := c || substr(chars, 1 + floor(random() * length(chars))::int, 1); end loop;
    exit when not exists (select 1 from public.stores where code = c);
  end loop;
  return c;
end $$;

-- ① 지점 3줄: settings.stores 이름 그대로. 현재 사장 PIN 해시를 3곳에 복사 (6자리 PIN은 점주 화면에서 바꿈)
insert into public.stores (name, code, owner_name, owner_pin_hash)
select s.name, public.gen_store_code(), '김은정',
       (select value #>> '{}' from public.settings where key = 'owner_pin_hash')
from jsonb_array_elements_text((select value from public.settings where key = 'stores')) as s(name)
where not exists (select 1 from public.stores st where st.name = s.name);

-- ② 직원 13명: settings.staff + staff_meta(소속·입사일) → staff 표
insert into public.staff (store_id, name, hire_on)
select st.id, n.name, nullif(meta.value -> n.name ->> 'hire_on', '')::date
from jsonb_array_elements_text((select value from public.settings where key = 'staff')) as n(name)
cross join (select value from public.settings where key = 'staff_meta') as meta
join public.stores st on st.name = meta.value -> n.name ->> 'store'
on conflict (store_id, name) do nothing;

-- ③ 체크 기록: store 글자 = 지점 이름 → store_id 채움
update public.checklist_runs r
set store_id = st.id
from public.stores st
where r.store_id is null and r.store = st.name;

-- ④ 교육 진도: 직원 이름 + 소속으로 staff_id, store_id 채움
update public.training_progress t
set store_id = st.id, staff_id = sf.id
from public.staff sf
join public.stores st on st.id = sf.store_id
where t.staff_id is null and t.staff = sf.name
  and (coalesce(t.store, '') = '' or t.store = st.name);

-- ⑤ 지점 설정: settings.store_items(지점별 추가 항목) + products(떡 종류, 전 지점 공통 복사)
insert into public.store_settings (store_id, extra_items, products)
select st.id,
       coalesce((select value from public.settings where key = 'store_items') -> st.name, '{"open":[],"close":[]}'::jsonb),
       coalesce((select value from public.settings where key = 'products'), '[]'::jsonb)
from public.stores st
on conflict (store_id) do nothing;

commit;
