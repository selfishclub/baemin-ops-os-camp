import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActivityCounts } from "../app/score/score-data";

// 점수판용 집계 (표 activity_counts 함수). since 가 null 이면 전체 기간.
export async function readActivityCounts(db: SupabaseClient, since: string | null): Promise<ActivityCounts[]> {
  const { data, error } = await db.rpc("activity_counts", { since });
  if (error) throw new Error(`점수판을 계산하지 못했습니다: ${error.message}`);
  return ((data ?? []) as ActivityCounts[]).map((row) => ({ ...row, role: row.role === "owner" ? "owner" : "staff" }));
}
