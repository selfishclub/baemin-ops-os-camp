import { requireViewerApi } from "../../auth";
import { allowedSections, lockedResponse } from "../../../db/portal-store";
import { readExamStatus, saveWrittenResult } from "../../../db/exam-store";
import { readPublishedContent } from "../../../db/recipe-store";
import { togglePracticed } from "../../../db/training-store";
import { examCheckKey, getExams } from "../../exam/exam-data";
import { manualSectionIds, readableManuals } from "../../manual/manual-data";

export const dynamic = "force-dynamic";

// 직원용 시험 · 인증. 시험 영역이 잠겨 있으면 (사장이 시험 볼 때만 열어 둘 수 있게) 아무것도 나가지 않는다.
export async function GET() {
  const ctx = await requireViewerApi();
  if ("error" in ctx) return ctx.error;
  try {
    const allowed = await allowedSections({ mode: "auth", viewer: ctx.viewer, db: ctx.db }, ["exam", ...manualSectionIds]);
    if (!allowed.has("exam")) return lockedResponse();
    const [status, content] = await Promise.all([readExamStatus(ctx.db, ctx.viewer.id), readPublishedContent(ctx.db)]);
    // 필기 문제를 만들 재료: 이 사람에게 열려 있는 영역의 매뉴얼 (레시피는 화면이 /api/content 에서 따로 읽는다)
    return Response.json({ ...status, manuals: readableManuals(content).filter((doc) => allowed.has(doc.sectionId)) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "시험 정보를 읽지 못했습니다." }, { status: 503 });
  }
}

// action: "written" = 필기 결과 저장, "ready" = 실기 "볼 준비 됐어요" 누름/취소
export async function POST(request: Request) {
  const ctx = await requireViewerApi();
  if ("error" in ctx) return ctx.error;
  const body = await request.json().catch(() => ({})) as { action?: string; examId?: string; itemId?: string; score?: number; total?: number; answers?: unknown[] };
  try {
    const allowed = await allowedSections({ mode: "auth", viewer: ctx.viewer, db: ctx.db }, ["exam", ...manualSectionIds]);
    if (!allowed.has("exam")) return lockedResponse();
    const content = await readPublishedContent(ctx.db);
    const exam = getExams(content).find((item) => item.id === body.examId);
    if (!exam) return Response.json({ error: "어떤 시험인지 없습니다." }, { status: 400 });

    if (body.action === "written") {
      if (!Number.isInteger(body.score) || !Number.isInteger(body.total) || Number(body.total) <= 0 || Number(body.score) > Number(body.total)) return Response.json({ error: "점수 정보가 올바르지 않습니다." }, { status: 400 });
      await saveWrittenResult(ctx.db, ctx.viewer.id, exam.id, Number(body.score), Number(body.total), Array.isArray(body.answers) ? body.answers.slice(0, 60) : []);
    } else if (body.action === "ready") {
      if (!exam.practicalItems.some((item) => item.id === body.itemId)) return Response.json({ error: "어떤 실기 항목인지 없습니다." }, { status: 400 });
      await togglePracticed(ctx.db, ctx.viewer.id, examCheckKey(exam.id, String(body.itemId)));
    } else {
      return Response.json({ error: "무엇을 할지 없습니다." }, { status: 400 });
    }
    const status = await readExamStatus(ctx.db, ctx.viewer.id);
    return Response.json({ ...status, manuals: readableManuals(content).filter((doc) => allowed.has(doc.sectionId)) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "저장하지 못했습니다." }, { status: 503 });
  }
}
