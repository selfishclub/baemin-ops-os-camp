import { requireOwnerApi } from "../../../auth";
import { readExamOverview, readExamStatus } from "../../../../db/exam-store";
import { readPublishedContent } from "../../../../db/recipe-store";
import { toggleConfirmed } from "../../../../db/training-store";
import { examCheckKey, getExams } from "../../../exam/exam-data";

export const dynamic = "force-dynamic";

// 사장용: ?user=<id> 면 그 직원의 시험 상태, 없으면 직원별 요약
export async function GET(request: Request) {
  const ctx = await requireOwnerApi();
  if ("error" in ctx) return ctx.error;
  const userId = new URL(request.url).searchParams.get("user");
  try {
    return Response.json(userId ? await readExamStatus(ctx.db, userId) : await readExamOverview(ctx.db));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "시험 현황을 읽지 못했습니다." }, { status: 503 });
  }
}

// 사장이 실기 항목을 직접 보고 합격 처리 (다시 누르면 취소). 자동 합격은 없다.
export async function POST(request: Request) {
  const ctx = await requireOwnerApi();
  if ("error" in ctx) return ctx.error;
  const body = await request.json().catch(() => ({})) as { userId?: string; examId?: string; itemId?: string };
  if (!body.userId || !body.examId || !body.itemId) return Response.json({ error: "직원·시험·실기 항목이 필요합니다." }, { status: 400 });
  try {
    const exam = getExams(await readPublishedContent(ctx.db)).find((item) => item.id === body.examId);
    if (!exam?.practicalItems.some((item) => item.id === body.itemId)) return Response.json({ error: "어떤 실기 항목인지 없습니다." }, { status: 400 });
    await toggleConfirmed(ctx.db, ctx.actor.id, body.userId, examCheckKey(exam.id, body.itemId));
    return Response.json(await readExamStatus(ctx.db, body.userId));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "합격 처리를 저장하지 못했습니다." }, { status: 503 });
  }
}
