import { requireViewerApi, type Viewer } from "../../auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import { allowedSections } from "../../../db/portal-store";
import { manualSectionIds } from "../../manual/manual-data";
import { readMyQuizHistory, readTraining, togglePracticed } from "../../../db/training-store";

export const dynamic = "force-dynamic";

// 이 사람에게 열려 있는 매뉴얼 영역 (잠긴 영역의 문서는 교육 화면에도 나가지 않는다)
function openManualSections(db: SupabaseClient, viewer: Viewer) {
  return allowedSections({ mode: "auth", viewer, db }, [...manualSectionIds]);
}

// 직원용: 내 체크리스트 + 교육 경로 + 최근 퀴즈 점수
export async function GET() {
  const ctx = await requireViewerApi();
  if ("error" in ctx) return ctx.error;
  try {
    const [training, quiz] = await Promise.all([readTraining(ctx.db, ctx.viewer.id, await openManualSections(ctx.db, ctx.viewer)), readMyQuizHistory(ctx.db, ctx.viewer.id)]);
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
    const [training, quiz] = await Promise.all([readTraining(ctx.db, ctx.viewer.id, await openManualSections(ctx.db, ctx.viewer)), readMyQuizHistory(ctx.db, ctx.viewer.id)]);
    return Response.json({ ...training, quiz });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "기록하지 못했습니다." }, { status: 503 });
  }
}
