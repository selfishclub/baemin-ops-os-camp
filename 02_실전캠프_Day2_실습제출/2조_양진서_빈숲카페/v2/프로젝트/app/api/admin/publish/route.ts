import { requireOwnerApi } from "../../../auth";
import { publishDraft } from "../../../../db/recipe-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ctx = await requireOwnerApi();
  if ("error" in ctx) return ctx.error;
  const body = await request.json() as { revision?: number; changeReason?: string; effectiveAt?: string; notifyStaff?: boolean };
  if (!Number.isInteger(body.revision)) return Response.json({ error: "revision이 없습니다." }, { status: 400 });
  try {
    const result = await publishDraft(ctx.db, ctx.actor, Number(body.revision), body.changeReason ?? "", body.effectiveAt ?? "", body.notifyStaff !== false);
    if ("conflict" in result) return Response.json({ error: "다른 화면에서 먼저 수정했습니다. 최신 초안을 다시 불러와 주세요." }, { status: 409 });
    if ("errors" in result) return Response.json({ error: "게시 전 확인이 필요합니다.", errors: result.errors }, { status: 422 });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "게시하지 못했습니다." }, { status: 503 });
  }
}
