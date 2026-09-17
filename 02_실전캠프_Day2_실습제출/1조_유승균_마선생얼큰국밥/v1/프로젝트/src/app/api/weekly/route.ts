import type { NextRequest } from "next/server";
import { buildWeeklyBest } from "@/lib/ai/weekly";
import { getReviewsByIds, getWeekly, listReviews, listWeekly } from "@/lib/db";
import { errorMessage, fail, ok } from "@/lib/http";
import { weekEndOf, weekRange } from "@/lib/week";

export const runtime = "nodejs";
export const maxDuration = 300;

function weekParam(v: string | null): string {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : weekRange(new Date()).start;
}

export async function GET(req: NextRequest) {
  try {
    const week = weekParam(req.nextUrl.searchParams.get("week"));
    const row = await getWeekly(week);
    const reviews = row ? await getReviewsByIds(row.summary.picks.map((p) => p.review_id)) : [];
    const count = (await listReviews({ from: week, to: weekEndOf(week), limit: 1 })).total;
    return ok({ week, weekEnd: weekEndOf(week), weekly: row, reviews, reviewCount: count, history: await listWeekly(12) });
  } catch (e) {
    return fail(errorMessage(e), 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { week?: string; useAi?: boolean };
    const week = weekParam(body.week ?? null);
    const row = await buildWeeklyBest(week, { useAi: body.useAi });
    const reviews = await getReviewsByIds(row.summary.picks.map((p) => p.review_id));
    return ok({ weekly: row, reviews });
  } catch (e) {
    return fail(errorMessage(e), 500);
  }
}
