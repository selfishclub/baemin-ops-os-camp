import { getSettings, listReviews, saveWeekly } from "../db";
import { WeeklySummarySchema, type Review, type WeeklyRow, type WeeklySummary } from "../types";
import { weekEndOf } from "../week";
import { generateStructured, hasAnyProvider } from "./client";
import { WEEKLY_SYSTEM, weeklyUserPrompt } from "./prompts/weekly";

/** AI 없이도 동작하는 규칙 기반 선정 (점수순) */
export function pickByScore(reviews: Review[]): WeeklySummary {
  const sorted = [...reviews].filter((r) => r.review_text.trim().length >= 8).sort((a, b) => b.score - a.score);
  const picks = sorted.slice(0, 5).map((r, i) => ({
    review_id: r.id,
    rank: i + 1,
    reason: `${r.categories.filter((c) => c !== "불만").join("·") || "리뷰"} 언급${r.has_photo ? " + 사진" : ""} (점수 ${r.score})`,
    suggested_format: (r.has_photo ? "carousel" : r.review_text.length > 80 ? "reels" : "news") as "carousel" | "reels" | "news",
  }));
  const praise = new Map<string, number>();
  const concern = new Map<string, number>();
  for (const r of reviews) {
    for (const c of r.categories) {
      if (c === "불만") continue;
      if (r.sentiment === "negative" || r.sentiment === "mixed") concern.set(c, (concern.get(c) || 0) + 1);
      else praise.set(c, (praise.get(c) || 0) + 1);
    }
  }
  const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} (${v}건)`);
  return {
    headline: `리뷰 ${reviews.length}개 · 긍정 ${reviews.filter((r) => r.sentiment === "positive").length}개 · 불만 신호 ${reviews.filter((r) => r.categories.includes("불만")).length}개`,
    praise_points: top(praise),
    concern_points: top(concern),
    picks: picks.length ? picks : [],
  };
}

export async function buildWeeklyBest(weekStart: string, opts: { useAi?: boolean } = {}): Promise<WeeklyRow> {
  const weekEnd = weekEndOf(weekStart);
  const { items } = await listReviews({ from: weekStart, to: weekEnd, limit: 500, sort: "score" });
  if (!items.length) throw new Error("이 주에 수집된 리뷰가 없습니다. 먼저 리뷰를 수집해주세요.");

  const useAi = opts.useAi !== false && hasAnyProvider();
  let summary: WeeklySummary;
  let model = "rule-based";

  if (useAi) {
    const candidates = items.filter((r) => r.review_text.trim().length >= 8).slice(0, 40);
    if (!candidates.length) {
      summary = pickByScore(items);
    } else {
      const settings = await getSettings();
      const res = await generateStructured({
        system: WEEKLY_SYSTEM,
        user: weeklyUserPrompt(candidates, settings, weekStart, weekEnd),
        schema: WeeklySummarySchema,
        schemaName: "weekly_summary",
      });
      const valid = new Set(candidates.map((r) => r.id));
      const picks = res.data.picks.filter((p) => valid.has(p.review_id));
      summary = { ...res.data, picks: picks.length ? picks : pickByScore(items).picks };
      model = res.model;
    }
  } else {
    summary = pickByScore(items);
  }

  // 중복 제거 + 순위 재정렬
  const seen = new Set<number>();
  summary.picks = summary.picks
    .filter((p) => (seen.has(p.review_id) ? false : (seen.add(p.review_id), true)))
    .slice(0, 5)
    .map((p, i) => ({ ...p, rank: i + 1 }));

  return saveWeekly(weekStart, weekEnd, summary, items.length, model);
}
