-- 해모닉 ERP — 문서 이력 보관 (안전판, 2026-10-14)
-- ⚠️ 첫 판(10/13)은 저장될 때마다 문서 전체를 복사해 하루 만에 1.4GB 가 쌓였고 서버가 읽기 전용이 됐다. 그 트리거는 제거했다.
-- 이 판은 (1) 문서당 6시간에 한 번만 (2) blobs(사진·도장) 를 빼고 (3) 14일 · 문서당 최대 60개만 남긴다 → 많아야 수십 MB.
-- 아직 서버에 넣지 않았다. 넣으려면 supabase_coach.sql 다음에 한 번 실행. (create trigger 포함 → 경고 창이 뜨면 Run query)

create table if not exists public.docs_history (
  id bigserial primary key,
  key text not null,
  saved_at bigint,                 -- 복사한 문서의 savedAt
  doc jsonb not null,              -- blobs 제외
  replaced_at timestamptz not null default now()
);
create index if not exists docs_history_key_idx on public.docs_history(key, replaced_at desc);
alter table public.docs_history enable row level security;
drop policy if exists hist_read on public.docs_history;
create policy hist_read on public.docs_history for select to authenticated using (public.device_ok());

create or replace function public.docs_keep_history() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_last timestamptz;
begin
  if tg_op <> 'UPDATE' or old.doc is null or old.doc = new.doc then return new; end if;
  select max(replaced_at) into v_last from public.docs_history where key = old.key;
  if v_last is not null and v_last > now() - interval '6 hours' then return new; end if;   -- 6시간에 한 번만
  insert into public.docs_history(key, saved_at, doc) values (old.key, old.saved_at, old.doc - 'blobs');
  delete from public.docs_history h where h.key = old.key and (h.replaced_at < now() - interval '14 days'
    or h.id not in (select id from public.docs_history where key = old.key order by id desc limit 60));
  return new;
end $$;
drop trigger if exists docs_keep_history on public.docs;
create trigger docs_keep_history before update on public.docs for each row execute function public.docs_keep_history();

-- 되돌리기 예시 (SQL Editor): 특정 날짜의 할 일 기록만 이전 판에서 가져오기
--   select id, replaced_at, saved_at from public.docs_history where key = 'state:ansan' order by id desc limit 20;
--   update public.docs d set doc = jsonb_set(d.doc, '{days,2026-10-11}', (select h.doc->'days'->'2026-10-11' from public.docs_history h where h.id = <이력 id>)),
--          saved_at = (extract(epoch from now())*1000)::bigint, updated_at = now() where d.key = 'state:ansan';
-- 서버가 읽기 전용이 됐을 때: SQL 편집기에서 `set transaction read write;` 를 첫 문장으로 두고 정리 SQL 을 같이 실행한다.

select 'docs_history' as what, count(*)::text as value from public.docs_history
union all select 'trigger', count(*)::text from pg_trigger where tgname = 'docs_keep_history';
