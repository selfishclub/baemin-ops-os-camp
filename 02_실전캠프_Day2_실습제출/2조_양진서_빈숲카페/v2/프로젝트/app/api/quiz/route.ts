import { requireViewerApi } from "../../auth";
import { readMyQuizHistory, saveQuizResult, type QuizAnswer } from "../../../db/training-store";

export const dynamic = "force-dynamic";

// 퀴즈 결과 저장 (문제는 화면에서 레시피 데이터로 만든다)
export async function POST(request: Request) {
  const ctx = await requireViewerApi();
  if ("error" in ctx) return ctx.error;
  const body = await request.json() as { score?: number; total?: number; detail?: QuizAnswer[] };
  if (!Number.isInteger(body.score) || !Number.isInteger(body.total) || Number(body.total) <= 0) {
    return Response.json({ error: "점수 정보가 없습니다." }, { status: 400 });
  }
  try {
    await saveQuizResult(ctx.db, ctx.viewer.id, Number(body.score), Number(body.total), Array.isArray(body.detail) ? body.detail.slice(0, 50) : []);
    return Response.json({ quiz: await readMyQuizHistory(ctx.db, ctx.viewer.id) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "저장하지 못했습니다." }, { status: 503 });
  }
}
