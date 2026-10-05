import { requireViewerApi } from "../../auth";
import { allowedSections } from "../../../db/portal-store";
import { readPublishedContent } from "../../../db/recipe-store";
import { confirmMission, readDoneSets, readMissions, readQuestProgress, recordAnswer, saveMission } from "../../../db/quest-store";
import { manualSectionIds, readableManuals } from "../../manual/manual-data";
import { buildWeeklyQuests, countCleared, isCorrect, mergeProgress, previousWeekStart, weekStartSeoul, type Quest } from "../../quest/quest-data";

export const dynamic = "force-dynamic";

// 이번 주 퀘스트. 퀘스트는 저장하지 않고 "직원 ID + 주 시작일" 씨앗으로 서버가 매번 같은 걸 만든다 — 정답은 서버에만 있다.
async function weeklyQuests(ctx: { db: Parameters<typeof readPublishedContent>[0] & object; viewer: { id: string; role: "owner" | "staff" } }, weekStart: string, lastWeek?: string) {
  const db = ctx.db as NonNullable<Parameters<typeof readPublishedContent>[0]>;
  const content = await readPublishedContent(db);
  const allowed = await allowedSections({ mode: "auth", viewer: { ...ctx.viewer, loginId: "", displayName: "", active: true }, db }, [...manualSectionIds]);
  const docs = readableManuals(content).filter((doc) => allowed.has(doc.sectionId));
  const done = await readDoneSets(db, ctx.viewer.id);
  const quests = buildWeeklyQuests({ userId: ctx.viewer.id, weekStart, content, docs, practicedRecipeIds: done.practicedRecipeIds, readDocIds: done.readDocIds });
  const lastQuests = lastWeek ? buildWeeklyQuests({ userId: ctx.viewer.id, weekStart: lastWeek, content, docs, practicedRecipeIds: done.practicedRecipeIds, readDocIds: done.readDocIds }) : [];
  return { quests, lastQuests, done };
}

export async function GET() {
  const ctx = await requireViewerApi();
  if ("error" in ctx) return ctx.error;
  try {
    const weekStart = weekStartSeoul();
    const lastWeek = previousWeekStart(weekStart);
    const [{ quests, lastQuests, done }, rows, lastRows] = await Promise.all([weeklyQuests(ctx, weekStart, lastWeek), readQuestProgress(ctx.db, ctx.viewer.id, weekStart), readQuestProgress(ctx.db, ctx.viewer.id, lastWeek)]);
    const views = mergeProgress(quests, rows, done);
    const body: Record<string, unknown> = {
      weekStart,
      quests: views,
      cleared: countCleared(views),
      lastWeek: { weekStart: lastWeek, cleared: countCleared(mergeProgress(lastQuests, lastRows, done)), total: lastQuests.length },
    };
    if (ctx.viewer.role === "owner") body.missions = await readMissions(ctx.db, [weekStart, lastWeek]);
    return Response.json(body);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "퀘스트를 읽지 못했습니다." }, { status: 503 });
  }
}

// action: answer(문제 풀기) · mission(미션 글 저장) · claim(해냈어요) · confirm(사장이 미션 확인)
export async function POST(request: Request) {
  const ctx = await requireViewerApi();
  if ("error" in ctx) return ctx.error;
  const body = await request.json().catch(() => ({})) as { action?: string; questId?: string; choice?: string; note?: string; userId?: string; weekStart?: string };
  const weekStart = weekStartSeoul();
  try {
    if (body.action === "answer") {
      const { quests } = await weeklyQuests(ctx, weekStart);
      const quest: Quest | undefined = quests.find((item) => item.id === body.questId && item.kind === "quiz");
      if (!quest) return Response.json({ error: "이번 주 퀘스트에 없는 문제예요." }, { status: 404 });
      const choice = String(body.choice ?? "");
      if (!quest.choices?.includes(choice)) return Response.json({ error: "보기 중에서 골라 주세요." }, { status: 400 });
      const correct = isCorrect(quest, choice);
      await recordAnswer(ctx.db, ctx.viewer.id, weekStart, quest.id, correct, choice);
      return Response.json({ correct });
    }
    if (body.action === "mission" || body.action === "claim") {
      await saveMission(ctx.db, ctx.viewer.id, weekStart, String(body.note ?? ""), body.action === "claim");
      return Response.json({ ok: true });
    }
    if (body.action === "confirm") {
      if (ctx.viewer.role !== "owner") return Response.json({ error: "사장님만 확인할 수 있어요." }, { status: 403 });
      const target = String(body.userId ?? "");
      const week = String(body.weekStart ?? weekStart);
      if (!target) return Response.json({ error: "누구 미션인지 없어요." }, { status: 400 });
      await confirmMission(ctx.db, ctx.viewer.id, target, week);
      return Response.json({ ok: true });
    }
    return Response.json({ error: "알 수 없는 요청이에요." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "저장하지 못했습니다." }, { status: 503 });
  }
}
