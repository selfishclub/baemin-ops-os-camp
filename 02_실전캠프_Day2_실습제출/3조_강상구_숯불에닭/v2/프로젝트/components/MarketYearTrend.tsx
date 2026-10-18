"use client";

import { useEffect, useMemo, useState } from "react";
import { num } from "@/lib/format";
import { getStore } from "@/lib/storage";
import { MARKET_MANUAL_KEY, type ManualEntry } from "@/components/MarketManualCard";
import type { DailySale } from "@/lib/types";

// 해마다 같은 달끼리 나란히 — "작년 이맘때보다 나은가"를 한 화면에서 본다.
// 소상공인365 상세분석 보고서는 최근 13개월만 주고 석 달쯤 늦게 올라온다. 그래서 빈 칸이 생기는 게 정상이다.
// 우리 매출은 오늘 탭에 넣은 채널 합계라 장부에 넣은 날까지만 나온다.

type MetricId = "footTraffic" | "areaSales" | "sameStores" | "ourSales";

const METRICS: { id: MetricId; name: string; unit: string; hint: string }[] = [
  { id: "footTraffic", name: "일평균 유동인구", unit: "명", hint: "동네에 사람이 얼마나 다니나 (업종과 상관없는 숫자)" },
  { id: "areaSales", name: "상권 월매출", unit: "원", hint: "같은 업종 가게 한 곳이 한 달에 파는 평균" },
  { id: "sameStores", name: "같은 업종 점포 수", unit: "곳", hint: "늘면 경쟁이 는 것" },
  { id: "ourSales", name: "우리 매출", unit: "원", hint: "오늘 탭에 넣은 채널 합계 (그 달에 넣은 날까지만)" },
];

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/** 백분율 한 자리. 작년 같은 달이 없거나 0이면 null */
function growth(now: number | null, before: number | null): number | null {
  if (now === null || before === null || before === 0) return null;
  return Math.round(((now - before) / before) * 1000) / 10;
}

export function MarketYearTrend() {
  const [entries, setEntries] = useState<ManualEntry[]>([]);
  const [ourByMonth, setOurByMonth] = useState<Map<string, number>>(new Map());
  const [metric, setMetric] = useState<MetricId>("footTraffic");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const store = getStore();
    void store.getSetting<ManualEntry[]>(MARKET_MANUAL_KEY).then((v) => {
      setEntries(v ?? []);
      setLoaded(true);
    });
    void store.listAllDailySales().then((rows: DailySale[]) => {
      const m = new Map<string, number>();
      for (const r of rows) {
        const k = r.date.slice(0, 7);
        m.set(k, (m.get(k) ?? 0) + r.amount);
      }
      setOurByMonth(m);
    });
  }, []);

  /** 달("2026-07") → 지금 고른 지표의 값 */
  const valueOf = useMemo(() => {
    const byMonth = new Map(entries.map((e) => [e.month, e]));
    return (month: string): number | null => {
      if (metric === "ourSales") return ourByMonth.get(month) ?? null;
      return byMonth.get(month)?.[metric] ?? null;
    };
  }, [entries, ourByMonth, metric]);

  // 숫자가 하나라도 있는 해만 보여준다
  const years = useMemo(() => {
    const all = new Set<string>();
    for (const e of entries) if (e.footTraffic !== null || e.areaSales !== null || e.sameStores !== null) all.add(e.month.slice(0, 4));
    for (const k of ourByMonth.keys()) all.add(k.slice(0, 4));
    return [...all].sort();
  }, [entries, ourByMonth]);

  const m = METRICS.find((x) => x.id === metric)!;
  // 막대 길이를 재려고 — 지금 지표에서 가장 큰 값
  const max = useMemo(() => {
    let v = 0;
    for (const y of years) for (const mo of MONTHS) v = Math.max(v, valueOf(`${y}-${String(mo).padStart(2, "0")}`) ?? 0);
    return v;
  }, [years, valueOf]);

  if (!loaded) return null;
  if (!years.length) {
    return (
      <section className="card space-y-2">
        <h2 className="text-base font-bold">해마다 견줘 보기</h2>
        <p className="text-sm text-stone-600">위 칸에 달마다 숫자를 적어 두면, 여기에 해마다 같은 달끼리 나란히 놓고 보여드려요.</p>
      </section>
    );
  }

  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">
          해마다 견줘 보기 <span className="text-xs font-normal text-stone-500">같은 달끼리 위아래로</span>
        </h2>
        <div className="flex flex-wrap gap-1">
          {METRICS.map((x) => (
            <button key={x.id} type="button" onClick={() => setMetric(x.id)} className={`rounded-lg px-2 py-1 text-xs font-semibold ${metric === x.id ? "bg-orange-600 text-white" : "bg-stone-100 text-stone-600"}`}>
              {x.name}
            </button>
          ))}
        </div>
      </div>
      <p className="text-sm text-stone-600">{m.hint}</p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="text-xs text-stone-500">
            <tr>
              <th className="py-1 text-left">해</th>
              {MONTHS.map((mo) => (
                <th key={mo} className="text-right font-normal">
                  {mo}월
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="num divide-y divide-stone-100">
            {years.map((y, yi) => (
              <tr key={y}>
                <td className="py-1 pr-2 font-bold">{y}</td>
                {MONTHS.map((mo) => {
                  const key = `${y}-${String(mo).padStart(2, "0")}`;
                  const v = valueOf(key);
                  const before = yi > 0 ? valueOf(`${years[yi - 1]}-${String(mo).padStart(2, "0")}`) : null;
                  const g = growth(v, before);
                  return (
                    <td key={mo} className="px-1 py-1 text-right align-bottom">
                      {v === null ? (
                        <span className="text-stone-300">–</span>
                      ) : (
                        <>
                          <span className="block text-[13px]">{m.unit === "원" ? num(Math.round(v / 10000)) : num(v)}</span>
                          {max > 0 && <span className="mt-0.5 block h-1 rounded bg-orange-400" style={{ width: `${Math.max(6, (v / max) * 100)}%`, marginLeft: "auto" }} />}
                          {g !== null && (
                            <span className={`block text-[10px] ${g > 0 ? "text-emerald-700" : g < 0 ? "text-red-700" : "text-stone-400"}`}>
                              {g > 0 ? "+" : ""}
                              {g}%
                            </span>
                          )}
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-stone-500">
        {m.unit === "원" ? "숫자는 만원입니다. " : ""}작은 글씨는 작년 같은 달과 견준 것이에요. 빈 칸은 아직 안 적었거나 자료가 안 나온 달이에요 (소상공인365는 석 달쯤 늦게 올라와요).
      </p>
    </section>
  );
}
