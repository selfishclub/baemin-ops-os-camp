import type { SupabaseClient } from "@supabase/supabase-js";
import type { Viewer } from "../app/auth";
import type { ViewKind, ViewRow } from "../app/manage/views/view-data";
import type { RequestOrigin } from "../lib/request-origin";

// 열람 기록 (표 view_logs). 누가 언제 어떤 레시피·매뉴얼·사진을 봤는지, 어디서(인터넷 주소·기기) 들어왔는지.
// 직원은 자기 기록만 남길 수 있고 아무도 고치거나 지우지 못한다. 읽는 건 사장뿐.
// 같은 사람이 같은 것을 1분 안에 다시 열면 한 번으로 친다 (사진 여러 장, 화면 새로고침 등).

const dedupeSeconds = 60;

export async function recordView(
  db: SupabaseClient,
  viewer: Pick<Viewer, "id" | "displayName">,
  entry: { kind: ViewKind; targetId?: string; targetName?: string },
  origin: RequestOrigin,
) {
  const targetId = (entry.targetId ?? "").slice(0, 120);
  const targetName = (entry.targetName ?? "").slice(0, 160);
  try {
    if (entry.kind !== "login" && entry.kind !== "logout") {
      const since = new Date(Date.now() - dedupeSeconds * 1000).toISOString();
      const { data } = await db
        .from("view_logs")
        .select("id")
        .eq("user_id", viewer.id)
        .eq("kind", entry.kind)
        .eq("target_id", targetId)
        .gt("viewed_at", since)
        .limit(1);
      if (data?.length) return;
    }
    const { error } = await db.from("view_logs").insert({
      user_id: viewer.id,
      user_name: viewer.displayName,
      kind: entry.kind,
      target_id: targetId,
      target_name: targetName,
      ip: origin.ip,
      outside: origin.outside,
      device: origin.device,
    });
    if (error) console.error("[view] 열람 기록을 남기지 못했습니다:", error.message);
  } catch (error) {
    // 기록이 실패해도 화면은 계속 동작해야 한다
    console.error("[view] 열람 기록 오류:", error instanceof Error ? error.message : error);
  }
}

// 사장용: 최근 N일 기록 (필요하면 한 사람만)
export async function readViewLogs(db: SupabaseClient, options: { days: number; userId?: string; limit?: number }): Promise<ViewRow[]> {
  const since = new Date(Date.now() - options.days * 86_400_000).toISOString();
  let query = db
    .from("view_logs")
    .select("id, user_id, user_name, kind, target_id, target_name, ip, outside, device, viewed_at")
    .gte("viewed_at", since)
    .order("viewed_at", { ascending: false })
    .limit(options.limit ?? 2000);
  if (options.userId) query = query.eq("user_id", options.userId);
  const { data, error } = await query;
  if (error) throw new Error(`열람 기록을 읽지 못했습니다: ${error.message}`);
  return (data ?? []) as ViewRow[];
}
