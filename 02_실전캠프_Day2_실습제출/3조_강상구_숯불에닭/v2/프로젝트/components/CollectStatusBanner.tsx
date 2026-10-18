"use client";

import { useEffect, useState } from "react";
import { storageMode } from "@/lib/storage";

// 리뷰 수집기가 며칠째 멈춰 있으면 장부 맨 위에 띄운다.
//  밤 수집은 로그인이 풀려도 윈도우 알림만 띄우고 끝난다. 밤에 뜬 알림은 아무도 못 본다.
//  (2026-10-09 배민 로그인이 풀렸는데 9일 뒤에야 알았다. 그동안 답글이 하나도 안 들어왔다.)
//  그래서 사장님이 매일 여는 이 화면에서 묻는다. 도우미가 꺼져 있으면 조용히 넘어간다.
const HELPER = process.env.NEXT_PUBLIC_HELPER_URL || "http://127.0.0.1:4599";
const EVERY_MS = 30 * 60 * 1000;

interface Source {
  id: string;
  name: string;
  lastAt: string | null;
  daysOld: number | null;
  stale: boolean;
}
interface Status {
  ok: boolean;
  logDate: string | null;
  warnings: string[];
  sources: Source[];
}

export function CollectStatusBanner() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    if (storageMode() !== "local") return;
    let stopped = false;

    async function check() {
      try {
        const s = (await (await fetch(`${HELPER}/collect/status`, { cache: "no-store" })).json()) as Status;
        if (!stopped && s.ok) setStatus(s);
      } catch {
        /* 도우미가 꺼져 있으면 아무것도 띄우지 않는다 */
      }
    }

    void check();
    const t = setInterval(check, EVERY_MS);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, []);

  if (!status) return null;
  // 자료가 묵었을 때만 띄운다. 밤 수집 로그의 경고는 고친 뒤에도 그날 하루 남으므로
  // 그것만으로는 띄우지 않는다 — 안 그러면 이미 해결된 일로 매번 놀라게 된다.
  const stale = status.sources.filter((s) => s.stale);
  if (!stale.length) return null;

  // 어느 쪽이 멈췄는지 한 줄로. 며칠째인지가 제일 중요하다
  const 묵은것 = stale.map((s) => (s.daysOld === null ? `${s.name} 아직 없음` : `${s.name} ${s.daysOld}일째`)).join(" · ");
  // 로그 경고는 "[10:00:32] ⚠️ 배달의민족: 로그인 풀림" 모양 — 시각과 기호를 떼고 보여 준다
  const 경고 = status.warnings.map((w) => w.replace(/^\[[\d:]+\]\s*⚠️\s*/, "")).join(" · ");

  return (
    <div role="alert" className="mx-4 mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-300">
      <b>리뷰 수집기가 멈춰 있어요</b>
      {묵은것 && <> — {묵은것}</>}
      {경고 && <div className="mt-1 font-semibold">{경고}</div>}
      <div className="mt-1 text-amber-800">
        로그인이 풀렸을 수 있어요. 수집기 폴더에서 <code className="rounded bg-amber-100 px-1">npm run login -- baemin</code> (또는 coupang · naver) 를 하고, 농협·포스는{" "}
        <code className="rounded bg-amber-100 px-1">npm run login:source -- nh</code> 로 Aside 창에서 로그인하세요.
        {status.logDate && <> · 마지막 밤 수집 {status.logDate}</>}
      </div>
    </div>
  );
}
