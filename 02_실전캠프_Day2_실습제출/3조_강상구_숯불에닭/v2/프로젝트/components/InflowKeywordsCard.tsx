"use client";

import { useMemo, useState } from "react";
import { num } from "@/lib/format";
import type { MarketInflow } from "@/lib/export/types";
import { inflowSummary, type InflowRange } from "@/lib/market/inflow";

// 손님이 검색해 들어온 말 — 스마트플레이스 통계의 유입키워드 전체 (화면은 5개만 보여 줌).
// 가게 이름 검색은 따로 묶고, 새 손님이 찾은 말을 많은 순으로 보여 준다. 스마트플레이스 숫자만 쓴다(순위 추적과 섞지 않음).
const RANGES: { id: InflowRange; label: string }[] = [
  { id: "d7", label: "7일" },
  { id: "d30", label: "30일" },
  { id: "d90", label: "90일" },
];
const LIMIT = 20;

export function InflowKeywordsCard({ inflow }: { inflow: MarketInflow | null | undefined }) {
  const [range, setRange] = useState<InflowRange>("d30");
  const [all, setAll] = useState(false);
  const s = useMemo(() => inflowSummary(inflow, range, new Map()), [inflow, range]);

  if (!inflow) return null;
  return (
    <section className="card space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">
          손님이 검색해 들어온 말 <span className="text-xs font-normal text-stone-500">스마트플레이스 유입 키워드 전체 · {new Date(inflow.collectedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" })} 받음</span>
        </h2>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button key={r.id} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${range === r.id ? "bg-orange-600 text-white" : "bg-stone-100 text-stone-600"}`} onClick={() => setRange(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {!s ? (
        <p className="text-sm text-stone-500">이 기간 자료가 없어요.</p>
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
          <p className="text-xs text-stone-500">스마트플레이스 통계 화면은 5개만 보여 주지만 여기서는 전부 보여요. 많이 들어오는 말은 대표 키워드·소식 글에 써 보세요. 리뷰 수집기 <code>npx tsx scripts/collect-smartplace-inflow.ts</code> → 내보내기로 새로 받아요.</p>
        </>
      )}
    </section>
  );
}
