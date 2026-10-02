"use client";

import { useEffect, useState } from "react";
import type { Pnl } from "@/lib/pnl";
import { normalizeLimits, RATIO_LIMITS_KEY, type RatioLimits } from "@/lib/ratios";
import { getStore } from "@/lib/storage";
import { monthSummaryText, type SummaryTextInput } from "@/lib/summaryText";

// 한 달 요약을 카톡용 글로 복사 — 보내는 건 사장님이 직접 (자동 전송 없음)
export function SummaryCopyCard(props: Omit<SummaryTextInput, "limits"> & { pnl: Pnl }) {
  const [limits, setLimits] = useState<RatioLimits | undefined>(undefined);
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getStore()
      .getSetting<RatioLimits>(RATIO_LIMITS_KEY)
      .then((v) => setLimits(normalizeLimits(v)))
      .catch(() => {});
  }, []);

  const text = monthSummaryText({ ...props, limits });

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setFailed(false);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 복사가 막힌 브라우저면 글을 펼쳐서 직접 길게 눌러 복사하게
      setFailed(true);
      setShow(true);
    }
  }

  return (
    <section className="card space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold">💬 카톡으로 보낼 요약</p>
          <p className="text-xs text-stone-500">매출·영업이익·비율·큰 비용 몇 줄 · 거래처·직원 이름은 안 들어가요</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost whitespace-nowrap text-sm" onClick={() => setShow(!show)}>
            {show ? "접기" : "미리 보기"}
          </button>
          <button className="btn-primary whitespace-nowrap text-sm" onClick={() => void copy()}>
            {copied ? "복사했어요 ✓" : "복사"}
          </button>
        </div>
      </div>
      {show && <pre className="num whitespace-pre-wrap rounded-lg bg-stone-50 px-3 py-2 text-xs leading-5 text-stone-700">{text}</pre>}
      {failed && <p className="text-xs text-amber-800">이 브라우저에서는 바로 복사가 안 돼요. 위 글을 길게 눌러 복사해 주세요.</p>}
      {copied && <p className="text-xs text-stone-500">카톡 방에 붙여 넣어 보내 주세요. 보내기는 사장님이 직접 해요.</p>}
    </section>
  );
}
