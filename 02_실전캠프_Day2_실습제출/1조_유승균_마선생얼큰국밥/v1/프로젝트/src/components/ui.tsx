"use client";

import { useState } from "react";
import { PLATFORM_LABEL, SENTIMENT_LABEL, type Platform, type Sentiment } from "@/lib/types";

export function PlatformBadge({ platform }: { platform: Platform }) {
  const color: Record<Platform, string> = {
    baemin: "bg-[#2ac1bc] text-white",
    coupangeats: "bg-[#0074e4] text-white",
    yogiyo: "bg-[#fa0050] text-white",
    naver: "bg-[#03c75a] text-white",
  };
  return <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${color[platform]}`}>{PLATFORM_LABEL[platform]}</span>;
}

export function SentimentTag({ sentiment }: { sentiment: Sentiment }) {
  const cls = sentiment === "positive" ? "tag tag-pos" : sentiment === "negative" ? "tag tag-neg" : sentiment === "mixed" ? "tag tag-mix" : "tag";
  return <span className={cls}>{SENTIMENT_LABEL[sentiment]}</span>;
}

export function Stars({ rating }: { rating: number | null }) {
  if (rating === null) return null;
  return (
    <span className="text-[13px] text-[#e6a400]" title={`별점 ${rating}`}>
      {"★".repeat(Math.max(0, Math.min(5, Math.round(rating))))}
      <span className="text-[#ddd]">{"★".repeat(5 - Math.max(0, Math.min(5, Math.round(rating))))}</span>
    </span>
  );
}

export function CopyButton({ text, label = "복사", className = "" }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={`btn btn-sm ${className}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          alert("복사에 실패했습니다. 직접 드래그해서 복사해주세요.");
        }
      }}
    >
      {done ? "복사됨 ✓" : label}
    </button>
  );
}

export function maskName(name: string): string {
  const n = (name || "").trim();
  if (!n) return "손님";
  if (n.length <= 1) return n + "*";
  return n[0] + "*".repeat(Math.min(n.length - 1, 3));
}
