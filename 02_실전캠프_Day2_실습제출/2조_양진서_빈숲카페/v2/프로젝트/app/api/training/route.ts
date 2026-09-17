import { requireViewerApi } from "../../auth";
import { readMyQuizHistory, readTraining, togglePracticed } from "../../../db/training-store";

export const dynamic = "force-dynamic";

// 직원용: 내 체크리스트 + 최근 퀴즈 점수
export async function GET() {
  const ctx = await requireViewerApi();
  if ("error" in ctx) return ctx.error;
  try {
    const [training, quiz] = await Promise.all([readTraining(ctx.db, ctx.viewer.id), readMyQuizHistory(ctx.db, ctx.viewer.id)]);
    return Response.json({ ...training, quiz });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "체크리스트를 읽지 못했습니다." }, { status: 503 });
  }
}

// 직원이 "만들어 봤음" 누름/취소
export async function POST(request: Request) {
  const ctx = await requireViewerApi();
  if ("error" in ctx) return ctx.error;
  const body = await request.json() as { recipeId?: string };
  if (!body.recipeId) return Response.json({ error: "어떤 메뉴인지 없습니다." }, { status: 400 });
  try {
    await togglePracticed(ctx.db, ctx.viewer.id, body.recipeId);
    const [training, quiz] = await Promise.all([readTraining(ctx.db, ctx.viewer.id), readMyQuizHistory(ctx.db, ctx.viewer.id)]);
    return Response.json({ ...training, quiz });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "기록하지 못했습니다." }, { status: 503 });
  }
}
