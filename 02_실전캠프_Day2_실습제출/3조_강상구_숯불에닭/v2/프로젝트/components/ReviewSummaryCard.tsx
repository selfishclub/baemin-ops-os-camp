"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useExport } from "@/components/useExport";
import { monthReviewSummary } from "@/lib/reviews/stats";
import type { Month } from "@/lib/types";

// 손익 첫 화면 — 이 달 리뷰 한 줄. 매출 옆에서 손님 반응을 같이 보려고 둔다. 자세한 건 리뷰 탭.
export function ReviewSummaryCard({ month }: { month: Month }) {
  const exp = useExport();
  const s = useMemo(() => (exp.reviews.length ? monthReviewSummary(exp.reviews, month) : null), [exp.reviews, month]);
  if (!exp.loaded) return null;
  return (
    <Link href="/reviews" className="card flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-stone-500">이 달 리뷰</p>
        {s ? (
          <p className="num mt-1 text-sm">
            <b className="text-lg">{s.count}건</b>
            {s.avgRating !== null && <span className="ml-2 text-amber-600">★ {s.avgRating.toFixed(1)}</span>}
            {s.unanswered > 0 ? <span className="ml-2 font-bold text-red-700">답글 대기 {s.unanswered}</span> : <span className="ml-2 text-emerald-700">답글 대기 없음</span>}
            {s.replyUnavailable > 0 && <span className="ml-2 text-stone-500">작성 불가 {s.replyUnavailable}</span>}
            {s.complaints > 0 && <span className="ml-2 text-stone-500">아쉬움 {s.complaints}</span>}
          </p>
        ) : (
          <p className="mt-1 text-sm text-stone-500">리뷰 수집기 파일을 올리면 여기에 보여요</p>
        )}
      </div>
      <span className="shrink-0 text-stone-400">→</span>
    </Link>
  );
}
