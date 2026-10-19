"use client";

import { useMemo, useState } from "react";
import { num } from "@/lib/format";
import type { MarketInflow } from "@/lib/export/types";
import { inflowSummary, inflowMonths, type InflowRange } from "@/lib/market/inflow";

// 손님이 검색해 들어온 말 — 스마트플레이스 통계의 유입키워드 전체 (화면은 5개만 보여 줌).
// 가게 이름 검색은 따로 묶고, 새 손님이 찾은 말을 많은 순으로 보여 준다. 스마트플레이스 숫자만 쓴다(순위 추적과 섞지 않음).
const LIMIT = 20;

export function InflowKeywordsCard({ inflow }: { inflow: MarketInflow | null | undefined }) {
  const months = inflowMonths();
  const [range, setRange] = useState<InflowRange>(() => months[0] as InflowRange);
  const [all, setAll] = useState(false);
  const s = useMemo(() => inflowSummary(inflow, range, new Map()), [inflow, range]);

  if (!inflow) return null;
  return (
    <section className="card space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">
          손님이 검색해 들어온 말 <span className="text-xs font-normal text-stone-500">스마트플레이스 유입 키워드 전체 · {new Date(inflow.collectedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" })} 받음</span>
        </h2>
        <label className="flex items-center gap-2 text-sm">
          조회 월
          <select aria-label="유입 키워드 조회 월" className="field py-1" value={range} onChange={e => { setRange(e.target.value as InflowRange); setAll(false); }}>
            {months.map(month => <option key={month} value={month}>{month.slice(0, 4)}년 {Number(month.slice(5))}월</option>)}
          </select>
        </label>
      </div>
      {!s || !s.total ? (
        <p className="text-sm text-stone-500">{range.replace("-", "년 ")}월 자료 없음. 월별 수집 전이거나 네이버에서 제공한 키워드 자료가 없는 달이에요.</p>
      ) : (
        <>
          <p className="num text-sm">
            {s.start} ~ {s.end} · 유입 <b>{num(s.total)}회</b> · 가게 이름 검색 {num(s.brand.pv)}회({s.total ? Math.round((s.brand.pv / s.total) * 100) : 0}%) · <b>다른 말로 찾아온 {num(s.rows.reduce((a, x) => a + x.pv, 0))}회</b> ({num(s.rows.length)}개 말)
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[22rem] text-sm">
              <thead className="text-left text-xs text-stone-500">
                <tr>
                  <th className="py-1">검색한 말</th>
                  <th className="text-right">유입</th>
                  <th className="text-right">비율</th>
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
          <p className="text-xs text-stone-500">선택한 달에 네이버가 제공한 키워드를 모두 보여요. 이번 달은 어제까지 집계해요.</p>
        </>
      )}
    </section>
  );
}
