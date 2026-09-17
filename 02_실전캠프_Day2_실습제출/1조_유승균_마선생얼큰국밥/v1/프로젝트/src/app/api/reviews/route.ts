import type { NextRequest } from "next/server";
import { listReviews } from "@/lib/db";
import { errorMessage, fail, intParam, ok } from "@/lib/http";
import { handleIngest } from "@/lib/ingest-route";
import { CATEGORIES, PLATFORMS, SENTIMENTS, type Category, type Platform, type Sentiment } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const platform = sp.get("platform");
  const category = sp.get("category");
  const sentiment = sp.get("sentiment");
  try {
    const res = await listReviews({
      platform: platform && (PLATFORMS as readonly string[]).includes(platform) ? (platform as Platform) : undefined,
      category: category && (CATEGORIES as readonly string[]).includes(category) ? (category as Category) : undefined,
      sentiment: sentiment && (SENTIMENTS as readonly string[]).includes(sentiment) ? (sentiment as Sentiment) : undefined,
      bookmarked: sp.get("bookmarked") === "1",
      q: sp.get("q") || undefined,
      from: sp.get("from") || undefined,
      to: sp.get("to") || undefined,
      limit: intParam(sp.get("limit"), 50),
      offset: intParam(sp.get("offset"), 0),
      sort: sp.get("sort") === "score" ? "score" : "date",
    });
    return ok(res);
  } catch (e) {
    return fail(errorMessage(e), 500);
  }
}

/** POST /api/reviews 도 수집 입력을 받습니다 (확장 '전송 URL'에 어느 쪽을 넣어도 동작) */
export async function POST(req: NextRequest) {
  return handleIngest(req);
}
