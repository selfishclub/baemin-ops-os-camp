"use client";

import { useEffect, useRef, useState } from "react";

const LABEL: Record<string, string> = { baemin: "배민", coupangeats: "쿠팡이츠", naver: "네이버 플레이스" };

interface JobView {
  id: number;
  platform: string;
  status: "pending" | "running" | "done" | "error" | "stopped";
  log: string[];
  result: { inserted: number; updated: number; total: number } | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export function CrawlPanel({ hasNaver, ingestUrl, cloud = false, cloudDb = false }: { hasNaver: boolean; ingestUrl: string; cloud?: boolean; cloudDb?: boolean }) {
  const [job, setJob] = useState<JobView | null>(null);
  const [recent, setRecent] = useState<JobView[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [showLog, setShowLog] = useState(false);
  const wasActive = useRef(false);

  async function refresh() {
    try {
      const res = await fetch("/api/crawl", { cache: "no-store" });
      const data = await res.json();
      if (!data.ok) return;
      setJob(data.job);
      setRecent(data.recent || []);
      const active = data.job?.status === "running" || data.job?.status === "pending";
      if (wasActive.current && !active) window.dispatchEvent(new Event("reviews:refresh"));
      wasActive.current = active;
    } catch { /* 네트워크 일시 오류 */ }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(() => { if (wasActive.current) refresh(); }, 2000);
    return () => clearInterval(t);
  }, []);

  async function start(platform: string) {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/crawl", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform }) });
      const data = await res.json();
      if (!data.ok) throw new Error(data.message);
      setJob(data.job);
      wasActive.current = true;
      setShowLog(true);
      setMsg(cloud
        ? "노트북 앱에 수집을 요청했어요. 노트북에서 크롬이 열리고 자동으로 진행됩니다. (로그인이 풀렸으면 그 창에서 한 번 로그인해주세요)"
        : "크롬 창이 열립니다. 로그인이 풀렸으면 그 창에서 로그인해주세요. 리뷰 화면은 자동으로 찾아갑니다.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    await fetch("/api/crawl", { method: "DELETE" });
    await refresh();
  }

  const active = job?.status === "running" || job?.status === "pending";
  const last = active ? null : job || recent[0] || null;
  const waitedSec = job?.status === "pending" && job.startedAt ? Math.floor((Date.now() - new Date(job.startedAt).getTime()) / 1000) : 0;

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-bold">리뷰 수집</h2>
        <span className="text-xs text-[var(--muted)]">
          {cloud ? "버튼을 누르면 노트북에서 크롬이 열려 자동으로 읽어옵니다 (노트북 앱이 켜져 있어야 함)" : `버튼을 누르면 크롬이 열리고 자동으로 읽어옵니다${cloudDb ? " · 저장은 클라우드 DB" : ""}`}
        </span>
        <span className="ml-auto flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" disabled={busy || active} onClick={() => start("baemin")}>배민 수집</button>
          <button type="button" className="btn" disabled={busy || active} onClick={() => start("coupangeats")}>쿠팡이츠 수집</button>
          <button type="button" className="btn" disabled={busy || active || !hasNaver} title={hasNaver ? "" : "설정에서 네이버 플레이스 주소를 먼저 넣어주세요"} onClick={() => start("naver")}>
            네이버 수집
          </button>
          {active ? <button type="button" className="btn" onClick={stop}>중단</button> : null}
        </span>
      </div>

      {msg ? <p className="mt-2 text-sm text-[var(--muted)]">{msg}</p> : null}

      {active && job ? (
        <div className="mt-3">
          <p className="mb-1 text-sm font-semibold">
            <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--accent)]" />
            {job.status === "pending" ? `${LABEL[job.platform]} 수집 대기 중… 노트북 앱이 받아가길 기다립니다 (${waitedSec}초)` : `${LABEL[job.platform]} 수집 중…`}
            {job.log.length ? <span className="ml-2 font-normal text-[var(--muted)]">{job.log[job.log.length - 1]}</span> : null}
          </p>
          {job.status === "pending" && waitedSec > 30 ? (
            <p className="mb-1 text-xs text-red-700">30초가 지나도 시작되지 않으면 노트북에서 review-studio-start.bat 이 켜져 있는지 확인해주세요.</p>
          ) : null}
          <pre className="log">{job.log.slice(-40).join("\n") || "시작하는 중…"}</pre>
        </div>
      ) : null}

      {!active && last ? (
        <div className="mt-3 text-sm">
          <span className={last.status === "done" ? "text-green-800" : last.status === "stopped" ? "text-[var(--muted)]" : "text-red-700"}>
            {LABEL[last.platform]} 수집 {last.status === "done" ? "완료" : last.status === "stopped" ? "중단됨" : "실패"}
            {last.result ? ` — 새 리뷰 ${last.result.inserted}개 저장${last.result.updated ? `, 갱신 ${last.result.updated}개` : ""}` : ""}
            {last.finishedAt ? <span className="ml-2 text-xs text-[var(--muted)]">{last.finishedAt.slice(0, 16).replace("T", " ")}</span> : null}
          </span>
          <button type="button" className="ml-2 text-xs text-[var(--muted)] underline" onClick={() => setShowLog((v) => !v)}>
            {showLog ? "기록 닫기" : "기록 보기"}
          </button>
          {showLog ? <pre className="log mt-2">{last.log.slice(-60).join("\n")}</pre> : null}
        </div>
      ) : null}

      {!cloud ? (
        <details className="mt-3 text-xs text-[var(--muted)]">
          <summary className="cursor-pointer">크롬 확장(배달 리뷰 자동답글 도우미)에서 보내는 방법</summary>
          <p className="mt-1">
            확장 팝업의 <b>전송 URL</b>에 <code className="rounded bg-[#f1efe9] px-1">{ingestUrl}</code> 를 넣고, 리뷰 수집 후 <b>어드민으로 전송</b>을 누르면 여기에 저장됩니다.
            연동 토큰은 .env.local의 INGEST_TOKEN과 같게 넣으세요 (비워두면 검사하지 않음).
          </p>
        </details>
      ) : null}
    </section>
  );
}
