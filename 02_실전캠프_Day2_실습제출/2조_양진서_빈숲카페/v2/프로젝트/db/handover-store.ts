import type { SupabaseClient } from "@supabase/supabase-js";
import type { HandoverRow, HandoverShift } from "../app/handover/handover-data";

// 인수인계 (표 handovers + handover_reads). 재직 직원 모두 읽고, 자기 이름으로 쓰고, 읽음은 본인만 남긴다. 지우기는 사장만.

export async function readHandovers(db: SupabaseClient, since: string): Promise<HandoverRow[]> {
  const { data, error } = await db
    .from("handovers")
    .select("id, author_id, author_name, shift, text, created_at, handover_reads (user_id, user_name, read_at)")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`인수인계를 읽지 못했습니다: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id,
    author_id: row.author_id,
    author_name: row.author_name,
    shift: row.shift as HandoverShift,
    text: row.text,
    created_at: row.created_at,
    reads: ((row.handover_reads ?? []) as { user_id: string; user_name: string; read_at: string }[]).map((read) => ({ user_id: read.user_id, user_name: read.user_name, read_at: read.read_at })),
  }));
}

export async function writeHandover(db: SupabaseClient, author: { id: string; displayName: string }, shift: HandoverShift, text: string) {
  const { error } = await db.from("handovers").insert({ author_id: author.id, author_name: author.displayName, shift, text });
  if (error) throw new Error(`인수인계를 남기지 못했습니다: ${error.message}`);
}

export async function markHandoverRead(db: SupabaseClient, handoverId: number, reader: { id: string; displayName: string }) {
  const { error } = await db.from("handover_reads").upsert({ handover_id: handoverId, user_id: reader.id, user_name: reader.displayName }, { onConflict: "handover_id,user_id", ignoreDuplicates: true });
  if (error) throw new Error(`읽음을 남기지 못했습니다: ${error.message}`);
}

export async function deleteHandover(db: SupabaseClient, id: number) {
  const { error } = await db.from("handovers").delete().eq("id", id);
  if (error) throw new Error(`인수인계를 지우지 못했습니다: ${error.message}`);
}
