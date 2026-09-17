import { requireViewerApi } from "../../auth";
import { listMyChangeNotices } from "../../../db/recipe-store";

export const dynamic = "force-dynamic";

// 직원용: 바뀐 레시피 목록 + 내가 확인했는지
export async function GET() {
  const ctx = await requireViewerApi();
  if ("error" in ctx) return ctx.error;
  try {
    return Response.json(await listMyChangeNotices(ctx.db, ctx.viewer.id));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "바뀐 레시피 목록을 읽지 못했습니다." }, { status: 503 });
  }
}
