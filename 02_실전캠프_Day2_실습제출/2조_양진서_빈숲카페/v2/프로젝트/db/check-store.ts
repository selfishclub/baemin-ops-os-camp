import type { SupabaseClient } from "@supabase/supabase-js";
import type { DailyRow } from "../app/checks/check-data";

// 오늘 체크 기록 저장 층. 표: daily_checks (하루·문서·항목마다 한 줄, 먼저 누른 사람 이름이 남는다)

const columns = "check_date, doc_id, item_key, item_text, checked_by, checked_by_name, checked_at";

export async function readDailyRows(db: SupabaseClient, date: string): Promise<DailyRow[]> {
  const { data, error } = await db.from("daily_checks").select(columns).eq("check_date", date);
  if (error) throw new Error(`체크 기록을 읽지 못했습니다: ${error.message}`);
  return (data ?? []) as DailyRow[];
}

export async function readDailyRowsSince(db: SupabaseClient, fromDate: string) {
  const { data, error } = await db.from("daily_checks").select(columns).gte("check_date", fromDate).limit(5000);
  if (error) throw new Error(`체크 기록을 읽지 못했습니다: ${error.message}`);
  return (data ?? []) as (DailyRow & { check_date: string })[];
}

// 체크: 이미 누가 했으면 그대로 둔다 (먼저 한 사람의 기록을 덮어쓰지 않는다)
export async function addCheck(db: SupabaseClient, row: { date: string; docId: string; itemKey: string; itemText: string; userId: string; userName: string }) {
  const { error } = await db.from("daily_checks").upsert(
    { check_date: row.date, doc_id: row.docId, item_key: row.itemKey, item_text: row.itemText, checked_by: row.userId, checked_by_name: row.userName },
    { onConflict: "check_date,doc_id,item_key", ignoreDuplicates: true },
  );
  if (error) throw new Error(`체크를 저장하지 못했습니다: ${error.message}`);
}

// 체크 취소: 창고 규칙(RLS)이 본인 것만 지우게 한다. 사장은 모두 지울 수 있다
export async function removeCheck(db: SupabaseClient, date: string, docId: string, itemKey: string) {
  const { error } = await db.from("daily_checks").delete().eq("check_date", date).eq("doc_id", docId).eq("item_key", itemKey);
  if (error) throw new Error(`체크를 취소하지 못했습니다: ${error.message}`);
}
