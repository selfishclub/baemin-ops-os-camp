import type { SupabaseClient } from "@supabase/supabase-js";
import type { PraiseRow } from "../app/praise/praise-data";

// 칭찬 릴레이 (표 praises). 재직 직원 모두 읽고, 자기 이름으로만 보낸다. 지우는 건 사장만.

export async function readPraises(db: SupabaseClient, since: string | null, limit = 200): Promise<PraiseRow[]> {
  let query = db.from("praises").select("id, from_user, from_name, to_user, to_name, text, created_at").order("created_at", { ascending: false }).limit(limit);
  if (since) query = query.gte("created_at", since);
  const { data, error } = await query;
  if (error) throw new Error(`칭찬을 읽지 못했습니다: ${error.message}`);
  return (data ?? []) as PraiseRow[];
}

export async function sendPraise(db: SupabaseClient, from: { id: string; displayName: string }, to: { id: string; name: string }, text: string) {
  const { data, error } = await db
    .from("praises")
    .insert({ from_user: from.id, from_name: from.displayName, to_user: to.id, to_name: to.name, text })
    .select("id, from_user, from_name, to_user, to_name, text, created_at")
    .single();
  if (error) throw new Error(`칭찬을 보내지 못했습니다: ${error.message}`);
  return data as PraiseRow;
}

export async function deletePraise(db: SupabaseClient, id: number) {
  const { error } = await db.from("praises").delete().eq("id", id);
  if (error) throw new Error(`칭찬을 지우지 못했습니다: ${error.message}`);
}
