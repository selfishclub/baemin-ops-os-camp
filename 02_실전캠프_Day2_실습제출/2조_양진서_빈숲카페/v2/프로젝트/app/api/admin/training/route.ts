import { requireOwnerApi } from "../../../auth";
import { readTraining, readTrainingOverview, toggleConfirmed } from "../../../../db/training-store";

export const dynamic = "force-dynamic";

// 사장용: ?user=<id> 면 그 직원의 체크리스트, 없으면 직원별 진행률 요약
export async function GET(request: Request) {
  const ctx = await requireOwnerApi();
  if ("error" in ctx) return ctx.error;
  const userId = new URL(request.url).searchParams.get("user");
  try {
    if (userId) return Response.json(await readTraining(ctx.db, userId));
    return Response.json(await readTrainingOverview(ctx.db));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "교육 현황을 읽지 못했습니다." }, { status: 503 });
  }
}

// 사장이 "확인함" 누름/취소
export async function POST(request: Request) {
  const ctx = await requireOwnerApi();
  if ("error" in ctx) return ctx.error;
  const body = await request.json() as { userId?: string; recipeId?: string };
  if (!body.userId || !body.recipeId) return Response.json({ error: "직원과 메뉴가 필요합니다." }, { status: 400 });
  try {
    await toggleConfirmed(ctx.db, ctx.actor.id, body.userId, body.recipeId);
    return Response.json(await readTraining(ctx.db, body.userId));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "확인을 저장하지 못했습니다." }, { status: 503 });
  }
}
