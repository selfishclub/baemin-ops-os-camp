-- v3 2단계 (1/1): 직원 앱용 서버 함수. 앱은 표를 직접 읽지 않고 이 함수만 부른다.
-- 모든 함수는 "지점 코드"를 받아 그 지점 것만 돌려준다. 코드가 틀리면 null 또는 오류.
-- v2 호환: 기록을 쓸 때 옛 칸(store 글자)도 같이 채워서 v2 점검표에 그대로 보인다.
-- 되돌리기: rollback_step2.sql
begin;

-- 코드 → 지점 (사용 중지된 지점은 없음 취급)
create or replace function public.store_by_code(p_code text)
returns public.stores language sql stable security definer set search_path = public as $$
  select * from public.stores where code = upper(trim(p_code)) and status = 'active' limit 1
$$;

-- 직원 앱이 열릴 때 한 번: 지점·직원·설정·지점 추가사항·공통 매뉴얼
create or replace function public.staff_bundle(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare st public.stores;
begin
  st := public.store_by_code(p_code);
  if st.id is null then return null; end if;
  return jsonb_build_object(
    'store', jsonb_build_object('id', st.id, 'name', st.name, 'brand', st.brand),
    'staff', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'hire_on', s.hire_on) order by s.created_at, s.name)
                       from public.staff s where s.store_id = st.id and s.active), '[]'::jsonb),
    'settings', coalesce((select jsonb_build_object('extra_items', ss.extra_items, 'products', ss.products, 'info', ss.info)
                          from public.store_settings ss where ss.store_id = st.id),
                         '{"extra_items":{"open":[],"close":[]},"products":[],"info":{}}'::jsonb),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'chapter_no', n.chapter_no, 'section_key', n.section_key, 'body_md', n.body_md, 'sort', n.sort) order by n.chapter_no, n.sort, n.updated_at)
                       from public.store_manual_notes n where n.store_id = st.id and n.active), '[]'::jsonb),
    'manual', coalesce((select jsonb_agg(jsonb_build_object('section_kind', p.section_kind, 'chapter_no', p.chapter_no, 'group_name', p.group_name, 'title', p.title, 'body_md', p.body_md, 'sort', p.sort) order by p.sort)
                        from public.manual_pages p), '[]'::jsonb)
  );
end $$;

-- 오늘(또는 어느 날짜) 이 지점의 오픈·마감 기록
create or replace function public.runs_for_date(p_code text, p_date date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare st public.stores;
begin
  st := public.store_by_code(p_code);
  if st.id is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(to_jsonb(r)) from public.checklist_runs r where r.store_id = st.id and r.run_date = p_date), '[]'::jsonb);
end $$;

create or replace function public.get_run(p_code text, p_date date, p_kind text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare st public.stores;
begin
  st := public.store_by_code(p_code);
  if st.id is null then return null; end if;
  return (select to_jsonb(r) from public.checklist_runs r where r.store_id = st.id and r.run_date = p_date and r.kind = p_kind limit 1);
end $$;

-- 체크 저장 (항목 누를 때마다). 이름은 그 지점에 등록된 직원이어야 한다.
create or replace function public.save_run(p_code text, p_date date, p_kind text, p_staff text, p_items jsonb, p_total int, p_done int,
                                           p_note text, p_waste jsonb, p_first timestamptz, p_completed timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare st public.stores; r public.checklist_runs;
begin
  st := public.store_by_code(p_code);
  if st.id is null then raise exception 'store not found'; end if;
  if p_kind not in ('open','close') then raise exception 'bad kind'; end if;
  if not exists (select 1 from public.staff s where s.store_id = st.id and s.name = p_staff and s.active) then raise exception 'staff not registered'; end if;
  insert into public.checklist_runs (run_date, store, store_id, kind, staff, items, total, done_count, note, waste, first_completed_at, completed_at, updated_at)
  values (p_date, st.name, st.id, p_kind, p_staff, coalesce(p_items, '{}'::jsonb), coalesce(p_total, 0), coalesce(p_done, 0), coalesce(p_note, ''), coalesce(p_waste, '{}'::jsonb), p_first, p_completed, now())
  on conflict (run_date, store, kind) do update
    set store_id = excluded.store_id, staff = excluded.staff, items = excluded.items, total = excluded.total, done_count = excluded.done_count,
        note = excluded.note, waste = excluded.waste, first_completed_at = excluded.first_completed_at, completed_at = excluded.completed_at, updated_at = now()
  returning * into r;
  return to_jsonb(r);
end $$;

-- 신입 교육 진도
create or replace function public.get_training(p_code text, p_staff text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare st public.stores;
begin
  st := public.store_by_code(p_code);
  if st.id is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(to_jsonb(t)) from public.training_progress t
                   where t.staff = p_staff and (t.store_id = st.id or (t.store_id is null and t.store = st.name))), '[]'::jsonb);
end $$;

create or replace function public.save_training(p_code text, p_staff text, p_step text, p_read_at timestamptz, p_confirmed_at timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare st public.stores; sf public.staff; t public.training_progress;
begin
  st := public.store_by_code(p_code);
  if st.id is null then raise exception 'store not found'; end if;
  select * into sf from public.staff s where s.store_id = st.id and s.name = p_staff and s.active limit 1;
  if sf.id is null then raise exception 'staff not registered'; end if;
  insert into public.training_progress (staff, store, store_id, staff_id, step, read_at, confirmed_at, updated_at)
  values (p_staff, st.name, st.id, sf.id, p_step, p_read_at, p_confirmed_at, now())
  on conflict (staff, step) do update
    set store = excluded.store, store_id = excluded.store_id, staff_id = excluded.staff_id, read_at = excluded.read_at,
        confirmed_at = coalesce(public.training_progress.confirmed_at, excluded.confirmed_at), updated_at = now()
  returning * into t;
  return to_jsonb(t);
end $$;

-- 익명(직원 앱)이 부를 수 있게. 표 자체는 여전히 닫혀 있다.
revoke all on function public.store_by_code(text) from public, anon, authenticated;
grant execute on function public.staff_bundle(text) to anon, authenticated;
grant execute on function public.runs_for_date(text, date) to anon, authenticated;
grant execute on function public.get_run(text, date, text) to anon, authenticated;
grant execute on function public.save_run(text, date, text, text, jsonb, int, int, text, jsonb, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.get_training(text, text) to anon, authenticated;
grant execute on function public.save_training(text, text, text, timestamptz, timestamptz) to anon, authenticated;

commit;
