-- v3 1단계 검증: 숫자가 맞는지 본다 (아무것도 바꾸지 않음)
select '지점' as 항목, count(*)::text as 값 from public.stores
union all select '지점 코드 6자리·중복 없음', (count(*) = count(distinct code) and bool_and(length(code) = 6))::text from public.stores
union all select '직원(매장별)', string_agg(st.name || ' ' || c, ', ') from (select store_id, count(*) c from public.staff group by store_id) x join public.stores st on st.id = x.store_id
union all select '체크 기록 전체', count(*)::text from public.checklist_runs
union all select '체크 기록 store_id 비어 있음(0이어야)', count(*)::text from public.checklist_runs where store_id is null
union all select '체크 기록 이름≠지점 불일치(0이어야)', count(*)::text from public.checklist_runs r join public.stores st on st.id = r.store_id where r.store <> st.name
union all select '교육 진도 전체 / staff_id 비어 있음', count(*)::text || ' / ' || count(*) filter (where staff_id is null)::text from public.training_progress
union all select '지점 설정 줄', count(*)::text from public.store_settings
union all select '공통 매뉴얼 줄(17이어야: 머리말1+장12+출력물4)', count(*)::text from public.manual_pages
union all select '옛 settings 줄 그대로(4)', count(*)::text from public.settings
union all select 'anon 이 새 표 못 읽음(정책 0)', count(*)::text from pg_policies where schemaname = 'public' and tablename in ('stores','staff','store_settings','manual_pages','manual_history','store_manual_notes','hq_admins');
