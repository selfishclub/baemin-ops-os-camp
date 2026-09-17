import type { NextRequest } from "next/server";
import { listExternalIds } from "@/lib/db";
import { errorMessage, fail, ok } from "@/lib/http";
import { PLATFORMS, type Platform } from "@/lib/types";

export const runtime = "nodejs";

/** 크롤러가 중복 수집을 건너뛰도록, 이미 저장된 리뷰 ID 목록을 돌려줍니다 (수집 토큰으로 보호) */
export async function GET(req: NextRequest) {
  const expected = process.env.INGEST_TOKEN?.trim();
  if (expected && (req.headers.get("x-extension-token") || "") !== expected) return fail("연동 토큰이 올바르지 않습니다.", 401);
  const platform = req.nextUrl.searchParams.get("platform") || "";
  if (!(PLATFORMS as readonly string[]).includes(platform)) return fail("platform 값이 올바르지 않습니다.");
  try {
    return ok({ ids: await listExternalIds(platform as Platform) });
  } catch (e) {
    return fail(errorMessage(e), 500);
  }
}
