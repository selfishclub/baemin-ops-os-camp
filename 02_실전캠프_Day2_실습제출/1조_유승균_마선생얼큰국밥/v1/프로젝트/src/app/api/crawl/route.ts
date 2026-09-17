import type { NextRequest } from "next/server";
import { cloudBase } from "@/lib/crawler/cloud";
import { buildCrawlArgs, currentJob, recentJobs, startCrawl, stopCrawl, type CrawlPlatform } from "@/lib/crawler/runner";
import { createCrawlJob, hasActiveCrawlJob, listCrawlJobs, requestCrawlStop } from "@/lib/db";
import { errorMessage, fail, ok } from "@/lib/http";
import { isCloudRuntime } from "@/lib/runtime";

export const runtime = "nodejs";

/** 화면이 보는 공통 작업 형태 */
interface JobView {
  id: number;
  platform: string;
  status: "pending" | "running" | "done" | "error" | "stopped";
  log: string[];
  result: { inserted: number; updated: number; total: number } | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export async function GET() {
  try {
    // 클라우드 화면이거나, 노트북이 클라우드와 연동돼 있으면 DB의 기록을 보여줌 (양쪽 화면이 같은 로그를 봄)
    if (isCloudRuntime() || cloudBase()) {
      const jobs = await listCrawlJobs(6);
      const views: JobView[] = jobs.map((j) => ({ id: j.id, platform: j.platform, status: j.status, log: j.log, result: j.result, startedAt: j.startedAt ?? j.requestedAt, finishedAt: j.finishedAt }));
      const active = views.find((v) => v.status === "pending" || v.status === "running") || null;
      return ok({ job: active, recent: views.filter((v) => v !== active), cloud: isCloudRuntime() });
    }
    const cur = currentJob();
    return ok({ job: cur, recent: recentJobs(), cloud: false });
  } catch (e) {
    return fail(errorMessage(e), 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { platform?: string; mode?: string };
    const platform = body.platform as CrawlPlatform;
    if (!["baemin", "coupangeats", "naver"].includes(platform)) return fail("platform은 baemin / coupangeats / naver 중 하나여야 합니다.");

    if (isCloudRuntime()) {
      // 인터넷 서버는 크롬을 못 여니, 요청만 남기고 노트북 앱이 8초 안에 가져가 실행합니다
      if (await hasActiveCrawlJob()) return fail("이미 수집이 진행 중이거나 대기 중입니다.", 409);
      const job = await createCrawlJob(platform, "pending");
      return ok({ job: { id: job.id, platform: job.platform, status: job.status, log: ["노트북 앱이 요청을 받아가길 기다리는 중… (노트북에서 review-studio-start.bat 이 켜져 있어야 합니다)"], result: null, startedAt: job.requestedAt, finishedAt: null } });
    }

    const origin = req.nextUrl.origin.replace("localhost", "127.0.0.1");
    const ingestUrl = process.env.STUDIO_INGEST_URL?.trim() || `${origin}/api/reviews/ingest`;
    const extra = await buildCrawlArgs(platform, body.mode);
    const job = startCrawl(platform, { ingestUrl, extra });
    return ok({ job });
  } catch (e) {
    return fail(errorMessage(e), 409);
  }
}

export async function DELETE() {
  try {
    if (isCloudRuntime()) return ok({ stopped: (await requestCrawlStop()) > 0 });
    return ok({ stopped: stopCrawl() });
  } catch (e) {
    return fail(errorMessage(e), 500);
  }
}
