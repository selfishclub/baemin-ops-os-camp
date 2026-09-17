"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CONTENT_KIND_LABEL, type Review, type WeeklyRow } from "@/lib/types";
import { weekLabel } from "@/lib/week";
import { ReviewCard } from "./ReviewCard";

interface WeeklyData {
  week: string;
  weekEnd: string;
  weekly: WeeklyRow | null;
  reviews: Review[];
  reviewCount: number;
}

export function WeeklyPanel({ weeks, aiReady }: { weeks: string[]; aiReady: boolean }) {
  const [week, setWeek] = useState(weeks[0]);
  const [data, setData] = useState<WeeklyData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (w: string) => {
    const res = await fetch(`/api/weekly?week=${w}`);
    const d = await res.json();
    if (d.ok) setData(d);
  }, []);

  useEffect(() => {
    load(week);
  }, [week, load]);

  async function build(useAi: boolean) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/weekly", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ week, useAi }) });
      const d = await res.json();
      if (!d.ok) throw new Error(d.message);
      await load(week);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const reviewMap = new Map((data?.reviews || []).map((r) => [r.id, r]));
  const w = data?.weekly;

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <div>
          <h2 className="text-lg font-bold">이번 주 베스트 리뷰 Top 5</h2>
          <p className="text-xs text-[var(--muted)]">월요일마다 지난주 리뷰를 분석해 콘텐츠 소재를 골라줍니다.</p>
        </div>
        <select className="select !w-auto" value={week} onChange={(e) => setWeek(e.target.value)}>
          {weeks.map((s, i) => (
            <option key={s} value={s}>
              {i === 0 ? "이번 주 · " : i === 1 ? "지난주 · " : ""}{weekLabel(s)}
            </option>
          ))}
        </select>
        <span className="text-sm text-[var(--muted)]">리뷰 {data?.reviewCount ?? "-"}개</span>
        <span className="ml-auto flex gap-2">
          <button type="button" className="btn btn-primary" disabled={busy || !aiReady || !data?.reviewCount} onClick={() => build(true)}>
            {busy ? "분석 중…" : w ? "AI로 다시 선정" : "AI로 Top 5 선정"}
          </button>
          <button type="button" className="btn" disabled={busy || !data?.reviewCount} onClick={() => build(false)} title="AI 없이 소재 점수만으로 고릅니다">
            점수순으로 선정
          </button>
        </span>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {!w ? (
        <div className="card p-10 text-center text-sm text-[var(--muted)]">
          {data && data.reviewCount === 0 ? "이 주에는 수집된 리뷰가 없어요. 먼저 대시보드에서 리뷰를 수집해주세요." : "아직 선정하지 않았어요. 위 버튼을 눌러 이번 주 베스트를 뽑아보세요."}
        </div>
      ) : (
        <>
          <div className="card p-4">
            <p className="text-base font-bold">{w.summary.headline}</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold text-green-800">칭찬 포인트</p>
                <ul className="mt-1 list-disc pl-5 text-sm">{w.summary.praise_points.map((p, i) => <li key={i}>{p}</li>)}</ul>
              </div>
              <div>
                <p className="text-xs font-semibold text-red-800">개선 신호</p>
                <ul className="mt-1 list-disc pl-5 text-sm">
                  {w.summary.concern_points.length ? w.summary.concern_points.map((p, i) => <li key={i}>{p}</li>) : <li className="text-[var(--muted)]">없음</li>}
                </ul>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-[var(--muted)]">
              리뷰 {w.review_count}개 분석 · {w.model} · {w.created_at.slice(0, 16).replace("T", " ")}
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {w.summary.picks.map((p) => {
              const r = reviewMap.get(p.review_id);
              if (!r) return null;
              return (
                <div key={p.review_id} className="grid gap-2 md:grid-cols-[64px_1fr]">
                  <div className="text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--ink)] text-lg font-extrabold text-white">{p.rank}</div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <ReviewCard
                      review={r}
                      extra={
                        <Link href={`/reviews/${r.id}`} className="tag">
                          추천: {CONTENT_KIND_LABEL[p.suggested_format]}
                        </Link>
                      }
                    />
                    <p className="px-1 text-sm text-[var(--muted)]">💡 {p.reason}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
