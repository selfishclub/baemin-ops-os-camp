"use client";

import { useEffect, useMemo, useState } from "react";
import { num } from "@/lib/format";
import type { MarketInflow } from "@/lib/export/types";
import { inflowSummary, type InflowRange } from "@/lib/market/inflow";

import { INFLOW_FIRST_DAY, inflowPeriod, inflowPeriodLabel, inflowYesterday, moveInflowPeriod, type InflowMode } from "@/lib/market/inflowPeriod";

// 손님이 검색해 들어온 말 — 스마트플레이스 통계의 유입키워드 전체 (화면은 5개만 보여 줌).
// 가게 이름 검색은 따로 묶고, 새 손님이 찾은 말을 많은 순으로 보여 준다. 스마트플레이스 숫자만 쓴다(순위 추적과 섞지 않음).
const LIMIT = 20;

export function InflowKeywordsCard({ inflow }: { inflow: MarketInflow | null | undefined }) {
  const [mode, setMode] = useState<InflowMode>("monthly");
  const [anchor, setAnchor] = useState(() => inflowYesterday());
  const [all, setAll] = useState(false);
  const [queried, setQueried] = useState<NonNullable<MarketInflow["periods"]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const period = inflowPeriod(mode, anchor);
  const range = (mode === "monthly" && inflow?.months?.[period.start.slice(0, 7)]?.end === period.end
    ? period.start.slice(0, 7) : period.key) as InflowRange;
  const s = useMemo(() => inflowSummary({ ...inflow, collectedAt: inflow?.collectedAt ?? "", periods: { ...inflow?.periods, ...queried } }, range, new Map()), [inflow, queried, range]);
  const changePeriod = (next: string) => { setAnchor(next); setAll(false); setError(null); };
  const hasPeriod = s !== null;
  const ready = !!inflow;
  useEffect(() => {
    if (!ready || hasPeriod) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true); setError(null);
    // 빠르게 기간을 바꿀 때 중간 선택은 조회하지 않는다.
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(`${process.env.NEXT_PUBLIC_HELPER_URL || "http://127.0.0.1:4599"}/smartplace/inflow`, {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ start: period.start, end: period.end }),
          });
          const result = await response.json();
          if (!response.ok || !result.ok) throw new Error(result.message || "이 기간을 조회하지 못했어요.");
          if (!cancelled) setQueried(previous => ({ ...previous, [period.key]: result.period }));
        } catch (e) {
          if (!cancelled) setError(e instanceof TypeError ? "자료 도우미에 연결할 수 없어요. 도우미를 켠 뒤 기간을 다시 선택해 주세요." : e instanceof Error ? e.message : "자료를 받지 못했어요.");
        } finally { if (!cancelled) setLoading(false); }
      })();
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [ready, hasPeriod, period.start, period.end, period.key]);
  if (!inflow) return null;
  return (
    <section className="card space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">
          손님이 검색해 들어온 말 <span className="text-xs font-normal text-stone-500">네이버검색 유입 키워드 · {new Date(inflow.collectedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" })} 받음</span>
        </h2>
      </div>
      <div className="grid grid-cols-[104px_minmax(0,1fr)] items-stretch gap-2 sm:grid-cols-[144px_minmax(0,1fr)] sm:gap-3">
        <select aria-label="키워드 조회 단위" className="h-14 w-full min-w-0 rounded-xl border border-stone-200 bg-white px-3 text-sm font-medium outline-none focus:border-emerald-500 disabled:opacity-60 sm:px-4" value={mode} disabled={loading} onChange={e => { setMode(e.target.value as InflowMode); setAll(false); setError(null); }}>
          <option value="daily">일간</option><option value="weekly">주간</option><option value="monthly">월간</option>
        </select>
        <div role="group" aria-label="키워드 조회 기간 이동" className="flex h-14 min-w-0 items-center justify-between gap-1 rounded-xl border border-stone-200 bg-white px-1 sm:gap-3 sm:px-3">
          <button type="button" aria-label="이전 기간" className="shrink-0 px-2 py-3 text-emerald-600 disabled:opacity-30" disabled={loading || period.start <= INFLOW_FIRST_DAY} onClick={() => changePeriod(moveInflowPeriod(mode, anchor, -1))}>◀</button>
          <label className="relative min-w-0 flex-1 cursor-pointer text-center text-xs font-semibold leading-snug sm:text-base">
            {inflowPeriodLabel(period.start, period.end)}
            <input type="date" aria-label="키워드 조회 기준 날짜" className="absolute inset-0 w-full cursor-pointer opacity-0" min={INFLOW_FIRST_DAY} max={period.latest} value={anchor} disabled={loading} onChange={e => { if (e.target.value) changePeriod(e.target.value); }} />
          </label>
          <button type="button" aria-label="다음 기간" className="shrink-0 px-2 py-3 text-emerald-600 disabled:opacity-30" disabled={loading || period.end >= period.latest} onClick={() => changePeriod(moveInflowPeriod(mode, anchor, 1))}>▶</button>
        </div>
      </div>
      {loading && <p role="status" className="py-2 text-sm text-stone-500">선택한 기간의 자료를 불러오는 중이에요…</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

      {!s ? null : !s.total ? (
        <p className="text-sm text-stone-500">이 기간에 네이버가 제공한 검색 키워드 자료가 없어요.</p>
      ) : (
        <>
          <p className="num text-sm">
            {s.start} ~ {s.end} · 네이버검색 유입 <b>{num(s.total)}회</b> · 가게 이름 검색 {num(s.brand.pv)}회({s.total ? Math.round((s.brand.pv / s.total) * 100) : 0}%) · <b>다른 말로 찾아온 {num(s.rows.reduce((a, x) => a + x.pv, 0))}회</b> ({num(s.rows.length)}개 말){s.noKeyword > 0 && <> · 검색어 없음 {num(s.noKeyword)}회</>}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[22rem] text-sm">
              <thead className="text-left text-xs text-stone-500">
                <tr>
                  <th className="py-1">검색한 말</th>
                  <th className="text-right">검색 유입</th>
                  <th className="text-right">검색 유입 내 비율</th>
                </tr>
              </thead>
              <tbody className="num divide-y divide-stone-100">
                {(all ? s.rows : s.rows.slice(0, LIMIT)).map((r) => (
                  <tr key={r.keyword}>
                    <td className="py-1">{r.keyword}</td>
                    <td className="text-right font-bold">{num(r.pv)}</td>
                    <td className="text-right text-stone-500">{r.share}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {s.rows.length > LIMIT && (
            <button className="btn-ghost w-full py-1.5 text-xs" onClick={() => setAll((v) => !v)}>
              {all ? `많은 ${LIMIT}개만 보기` : `모두 보기 (${s.rows.length}개)`}
            </button>
          )}
          <p className="text-xs text-stone-500">위 합계와 비율은 네이버검색 유입 기준이에요. 네이버지도·블로그 등 다른 경로를 포함한 리포트의 전체 플레이스 유입과는 달라요. 표에서는 가게 이름 검색과 검색어 없음을 제외해요. 주간은 월~일 기준이고, 진행 중인 기간은 어제까지 집계해요.</p>
        </>
      )}
    </section>
  );
}
