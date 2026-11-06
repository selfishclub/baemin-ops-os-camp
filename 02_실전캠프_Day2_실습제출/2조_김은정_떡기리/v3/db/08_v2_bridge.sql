-- v3 전환기 다리: v2 앱(옛 링크)으로 들어온 기록은 store_id 가 비어 있어 v3 점주·본사 화면에 안 보인다.
-- ① 트리거: checklist_runs / training_progress 에 줄이 들어오거나 바뀔 때 store_id(·staff_id)가 비어 있으면 지점 이름으로 자동으로 채운다.
-- ② 지금까지 쌓인 빈 줄을 한 번 채운다. (줄을 지우거나 내용을 바꾸지 않음. 빈 칸만 채움)
-- v2 가 쓰는 옛 칸·정책은 그대로. 되돌리기: 아래 두 트리거·함수만 drop 하면 됨.
begin;

create or replace function public.runs_fill_store_id() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.store_id is null and coalesce(new.store, '') <> '' then
    select id into new.store_id from public.stores where name = new.store limit 1;
  end if;
  return new;
end $$;
drop trigger if exists checklist_runs_fill_store on public.checklist_runs;
create trigger checklist_runs_fill_store before insert or update on public.checklist_runs
for each row execute function public.runs_fill_store_id();

create or replace function public.training_fill_ids() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.store_id is null and coalesce(new.store, '') <> '' then
    select id into new.store_id from public.stores where name = new.store limit 1;
  end if;
  if new.staff_id is null and coalesce(new.staff, '') <> '' then
    select f.id into new.staff_id from public.staff f
     where f.name = new.staff and (new.store_id is null or f.store_id = new.store_id) and f.active
     order by (f.store_id = new.store_id) desc nulls last limit 1;
    if new.store_id is null and new.staff_id is not null then
      select store_id into new.store_id from public.staff where id = new.staff_id;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists training_progress_fill_ids on public.training_progress;
create trigger training_progress_fill_ids before insert or update on public.training_progress
for each row execute function public.training_fill_ids();

-- 지금까지 비어 있던 줄 채우기
update public.checklist_runs r set store_id = st.id from public.stores st where r.store_id is null and r.store = st.name;
update public.training_progress t set store_id = st.id from public.stores st where t.store_id is null and t.store = st.name;
update public.training_progress t set staff_id = f.id from public.staff f
 where t.staff_id is null and f.name = t.staff and (t.store_id is null or f.store_id = t.store_id);
update public.training_progress t set store_id = f.store_id from public.staff f where t.store_id is null and t.staff_id = f.id;

commit;

-- 확인: 비어 있는 줄 수 (0, 0 이면 정상)
select (select count(*) from public.checklist_runs where store_id is null) as runs_without_store,
       (select count(*) from public.training_progress where store_id is null) as training_without_store,
       (select count(*) from public.checklist_runs) as runs_total;
