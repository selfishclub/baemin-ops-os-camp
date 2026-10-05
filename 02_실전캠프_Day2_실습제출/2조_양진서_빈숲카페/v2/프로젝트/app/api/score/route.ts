import { requireViewerApi } from "../../auth";
import { readActivityCounts } from "../../../db/score-store";
import { breakdown, buildBoard, defaultLevels, emptyCounts, highlights, levelFor, periodStart, totalPoints, type Period } from "../../score/score-data";

export const dynamic = "force-dynamic";

// 점수판·레벨. 직원: 내 점수 내역 + 직원 점수판. 사장: 여기에 사람별 통계(항목별 건수, 제일 많이 한 사람)까지.
export async function GET(request: Request) {
  const ctx = await requireViewerApi();
  if ("error" in ctx) return ctx.error;
  const raw = new URL(request.url).searchParams.get("period");
  const period: Period = raw === "week" || raw === "all" ? raw : "month";
  try {
    const since = periodStart(period);
    const [allTime, inPeriod] = await Promise.all([readActivityCounts(ctx.db, null), since ? readActivityCounts(ctx.db, since) : null]);
    const periodRows = inPeriod ?? allTime;
    const mine = allTime.find((row) => row.user_id === ctx.viewer.id) ?? emptyCounts({ id: ctx.viewer.id, display_name: ctx.viewer.displayName, login_id: ctx.viewer.loginId, role: ctx.viewer.role, active: true });
    const minePeriod = periodRows.find((row) => row.user_id === ctx.viewer.id) ?? mine;
    const total = totalPoints(mine);
    const body: Record<string, unknown> = {
      period,
      levels: defaultLevels,
      me: { id: ctx.viewer.id, name: ctx.viewer.displayName, role: ctx.viewer.role, allTime: total, period: totalPoints(minePeriod), level: levelFor(total), breakdown: breakdown(minePeriod), breakdownAll: breakdown(mine) },
      board: buildBoard(allTime, periodRows),
    };
    if (ctx.viewer.role === "owner") body.stats = { rows: periodRows.filter((row) => row.active), highlights: highlights(periodRows) };
    return Response.json(body);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "점수판을 읽지 못했습니다." }, { status: 503 });
  }
}
