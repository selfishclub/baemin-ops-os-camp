import type { NextRequest } from "next/server";
import { createCrawlJob, getCrawlJob, updateCrawlJob, type CrawlStatus } from "@/lib/db";
import { errorMessage, fail, ok } from "@/lib/http";

export const runtime = "nodejs";

/** 노트북 수집기가 진행 상황을 보고합니다. id 가 없으면 새 작업으로 기록하고 id 를 돌려줍니다 */
export async function POST(req: NextRequest) {
  const expected = process.env.INGEST_TOKEN?.trim();
  if (expected && (req.headers.get("x-extension-token") || "") !== expected) return fail("연동 토큰이 올바르지 않습니다.", 401);
  try {
    const body = (await req.json()) as { id?: number | null; platform?: string; status?: CrawlStatus; log?: string[]; result?: { inserted: number; updated: number; total: number } | null; startedAt?: string; finishedAt?: string | null };
    const status = (["running", "done", "error", "stopped"] as const).includes(body.status as never) ? body.status! : "running";
    let id = typeof body.id === "number" ? body.id : null;
    if (id && !(await getCrawlJob(id))) id = null;
    if (!id) {
      if (!body.platform) return fail("platform이 필요합니다.");
      id = (await createCrawlJob(body.platform, "running")).id;
    }
    await updateCrawlJob(id, {
      status,
      log: Array.isArray(body.log) ? body.log.map(String) : undefined,
      result: body.result === undefined ? undefined : body.result,
      startedAt: body.startedAt ?? undefined,
      finishedAt: body.finishedAt === undefined ? undefined : body.finishedAt,
    });
    return ok({ id });
  } catch (e) {
    return fail(errorMessage(e), 500);
  }
}
