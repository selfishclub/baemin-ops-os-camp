import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { getSettings, saveSettings } from "../db";
import type { Platform } from "../types";
import { reportToCloud } from "./cloud";

export type CrawlPlatform = Extract<Platform, "baemin" | "coupangeats" | "naver">;

export interface CrawlJob {
  id: number;
  cloudId: number | null;
  platform: CrawlPlatform;
  status: "running" | "done" | "error" | "stopped";
  stopRequested?: boolean;
  log: string[];
  startedAt: string;
  finishedAt: string | null;
  exitCode: number | null;
  result: { inserted: number; updated: number; total: number } | null;
}

interface RunnerState {
  seq: number;
  current: CrawlJob | null;
  child: ChildProcess | null;
  history: CrawlJob[];
}

const g = globalThis as unknown as { __crawlRunner?: RunnerState };
function state(): RunnerState {
  if (!g.__crawlRunner) g.__crawlRunner = { seq: 0, current: null, child: null, history: [] };
  return g.__crawlRunner;
}

const SCRIPT: Record<CrawlPlatform, string> = {
  baemin: "crawl-baemin.mjs",
  coupangeats: "crawl-coupang.mjs",
  naver: "crawl-naver.mjs",
};

export function currentJob(): CrawlJob | null {
  return state().current;
}

export function recentJobs(): CrawlJob[] {
  return state().history.slice(-5).reverse();
}

export function isRunning(): boolean {
  return state().current?.status === "running";
}

/** 플랫폼별 크롤러 인자(설정에 저장된 리뷰 페이지 주소 등)를 만듭니다 */
export async function buildCrawlArgs(platform: CrawlPlatform, mode?: string): Promise<string[]> {
  const settings = await getSettings();
  const extra: string[] = [];
  if (platform === "baemin" && settings.baeminReviewUrl) extra.push("--url", settings.baeminReviewUrl);
  if (platform === "coupangeats" && settings.coupangReviewUrl) extra.push("--url", settings.coupangReviewUrl);
  if (platform === "naver") {
    if (!settings.naverPlaceUrl) throw new Error("설정에서 네이버 플레이스 주소를 먼저 입력해주세요.");
    extra.push("--url", settings.naverPlaceUrl);
  }
  if (mode === "quick") extra.push("--quick");
  if (mode === "all") extra.push("--all");
  if (process.env.INGEST_TOKEN?.trim()) extra.push("--token", process.env.INGEST_TOKEN.trim());
  return extra;
}

export function startCrawl(platform: CrawlPlatform, opts: { ingestUrl: string; extra?: string[]; cloudId?: number | null }): CrawlJob {
  const s = state();
  if (s.current && s.current.status === "running") {
    throw new Error("이미 수집이 진행 중입니다. 끝난 뒤 다시 시도해주세요.");
  }
  const job: CrawlJob = {
    id: ++s.seq,
    cloudId: opts.cloudId ?? null,
    platform,
    status: "running",
    log: [],
    startedAt: new Date().toISOString(),
    finishedAt: null,
    exitCode: null,
    result: null,
  };
  s.current = job;

  const script = path.join(process.cwd(), "scripts", SCRIPT[platform]);
  const args = [script, "--ingest", opts.ingestUrl, ...(opts.extra || [])];
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env: { ...process.env, FORCE_COLOR: "0" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  s.child = child;

  // 클라우드 화면에도 로그가 보이도록 2초마다 보고 (첫 보고에서 클라우드 작업 id 를 받음)
  let reportTimer: NodeJS.Timeout | null = null;
  let reporting = false;
  const report = async (final = false) => {
    if (reporting) return;
    reporting = true;
    try {
      const id = await reportToCloud({
        id: job.cloudId,
        platform: job.platform,
        status: job.status,
        log: job.log,
        result: job.result,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
      });
      if (id && !job.cloudId) job.cloudId = id;
    } finally {
      reporting = false;
    }
    if (final && reportTimer) { clearInterval(reportTimer); reportTimer = null; }
  };
  void report();
  reportTimer = setInterval(() => void report(), 2000);

  const push = (line: string) => {
    const t = line.replace(/\r?\n$/, "");
    if (!t.trim()) return;
    const m = t.match(/^RESULT (\{.*\})$/);
    if (m) {
      try { job.result = JSON.parse(m[1]); } catch { /* ignore */ }
      return;
    }
    const u = t.match(/^REVIEW_URL (\S+)$/);
    if (u) {
      // 리뷰 화면 주소를 기억해 두면 다음부터 로그인 후 바로 그 화면으로 이동합니다
      const key = job.platform === "baemin" ? "baeminReviewUrl" : job.platform === "coupangeats" ? "coupangReviewUrl" : null;
      if (key) void saveSettings({ [key]: u[1] }).catch(() => {});
      return;
    }
    job.log.push(t);
    if (job.log.length > 400) job.log.splice(0, job.log.length - 400);
  };
  const onData = (buf: Buffer) => buf.toString("utf8").split(/\r?\n/).forEach(push);
  child.stdout?.on("data", onData);
  child.stderr?.on("data", onData);
  const finish = (status: CrawlJob["status"], code: number | null) => {
    job.exitCode = code;
    job.status = status;
    job.finishedAt = new Date().toISOString();
    s.child = null;
    s.history.push(job);
    void report(true);
  };
  child.on("error", (err) => {
    push(`[오류] ${err.message}`);
    finish("error", null);
  });
  child.on("close", (code) => {
    if (job.stopRequested) push("[중단] 사용자가 수집을 중단했습니다.");
    finish(job.stopRequested ? "stopped" : code === 0 ? "done" : "error", code);
  });
  return job;
}

export function stopCrawl(): boolean {
  const s = state();
  if (!s.child || !s.child.pid) return false;
  if (s.current) s.current.stopRequested = true;
  if (process.platform === "win32") {
    // 크롬까지 함께 종료되도록 프로세스 트리 전체를 끝냄
    spawn("taskkill", ["/pid", String(s.child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  } else {
    s.child.kill();
  }
  return true;
}
