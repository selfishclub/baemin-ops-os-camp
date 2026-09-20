import { requireViewerApi } from "../../auth";
import { listVisibleNotices } from "../../../db/notice-view";

export const dynamic = "force-dynamic";

// 직원용: 바뀐 레시피·매뉴얼 문서 목록 + 내가 확인했는지 (잠긴 영역의 것은 빠진다)
export async function GET() {
  const ctx = await requireViewerApi();
  if ("error" in ctx) return ctx.error;
  try {
    return Response.json(await listVisibleNotices(ctx.db, ctx.viewer));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "바뀐 내용 목록을 읽지 못했습니다." }, { status: 503 });
  }
}
