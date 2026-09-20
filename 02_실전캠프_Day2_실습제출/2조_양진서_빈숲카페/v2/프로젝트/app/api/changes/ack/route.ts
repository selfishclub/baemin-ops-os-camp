import { requireViewerApi } from "../../../auth";
import { ackChangeNotice } from "../../../../db/recipe-store";
import { listVisibleNotices } from "../../../../db/notice-view";

export const dynamic = "force-dynamic";

// 직원이 "확인했어요"를 누르면 기록한다 (사람이 직접 누른다 — 자동 처리 없음)
export async function POST(request: Request) {
  const ctx = await requireViewerApi();
  if ("error" in ctx) return ctx.error;
  const body = await request.json() as { noticeId?: number };
  if (!Number.isInteger(body.noticeId)) return Response.json({ error: "어떤 알림인지 없습니다." }, { status: 400 });
  try {
    await ackChangeNotice(ctx.db, ctx.viewer.id, Number(body.noticeId));
    return Response.json(await listVisibleNotices(ctx.db, ctx.viewer));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "확인을 저장하지 못했습니다." }, { status: 503 });
  }
}
