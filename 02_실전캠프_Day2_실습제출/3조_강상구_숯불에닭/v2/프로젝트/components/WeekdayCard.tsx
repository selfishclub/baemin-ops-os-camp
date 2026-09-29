"use client";

import { useEffect, useState } from "react";
import type { Channel } from "@/lib/categories";
import { num, won } from "@/lib/format";
import { monthLabel, prevMonth } from "@/lib/month";
import { getStore } from "@/lib/storage";
import { weekdayReport } from "@/lib/weekday";
import type { DailySale, Month } from "@/lib/types";

// 요일별 평균 매출. 한 달이면 요일마다 4~5일뿐이라, 두 달로 넓혀 보는 단추를 같이 둔다.
export function WeekdayCard({ month, sales, channels }: { month: Month; sales: DailySale[]; channels: Channel[] }) {
  const [wide, setWide] = useState(false);
  const [prev, setPrev] = useState<DailySale[] | null>(null);

  useEffect(() => {
    setWide(false);
    setPrev(null);
  }, [month]);

  useEffect(() => {
    if (!wide || prev) return;
    let alive = true;
    getStore()
      .listDailySales(prevMonth(month))
      .then((rows) => alive && setPrev(rows))
      .catch(() => alive && setPrev([]));
    return () => {
      alive = false;
    };
  }, [wide, prev, month]);

  const rows = wide && prev ? [...prev, ...sales] : sales;
  const r = weekdayReport(rows, channels);

  return (
    <section className="card">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">요일별 평균 매출</h2>
        <div className="flex gap-1">
          <Chip on={!wide} onClick={() => setWide(false)}>
            {monthLabel(month)}
          </Chip>
          <Chip on={wide} onClick={() => setWide(true)}>
            두 달
          </Chip>
        </div>
      </div>

      {r.openDays === 0 ? (
        <p className="rounded-lg bg-stone-50 px-2 py-3 text-sm text-stone-600">
          일별 매출이 아직 없어요. <b>오늘 탭</b>에서 하루 매출을 넣으면 여기에 요일별 평균이 쌓여요.
        </p>
      ) : (
        <>
          <p className="mb-2 text-sm text-stone-600">
            영업 {r.openDays}일 · 하루 평균 <b className="num">{won(r.avg)}</b>
            {wide && !prev && <span className="ml-1 text-xs text-stone-400">지난달 불러오는 중…</span>}
          </p>
          <ul className="space-y-1.5">
            {r.rows.map((row) => {
              const best = r.best?.day === row.day && row.days > 0;
              const worst = r.worst?.day === row.day && row.days > 0 && r.best?.day !== row.day;
              return (
                <li key={row.day} className="grid grid-cols-[1.25rem_minmax(0,1fr)_5rem_4.5rem] items-center gap-x-2">
                  <span className={`text-sm font-bold ${best ? "text-orange-700" : worst ? "text-stone-400" : "text-stone-600"}`}>{row.label}</span>
                  <span className="h-3 rounded-full bg-stone-100">
                    <span className={`block h-3 rounded-full ${best ? "bg-orange-500" : "bg-stone-300"}`} style={{ width: `${Math.round((row.avg / r.max) * 100)}%` }} />
                  </span>
                  <span className="num whitespace-nowrap text-right text-sm font-bold">{row.days ? num(row.avg) : <span className="font-normal text-stone-300">–</span>}</span>
                  <span className="whitespace-nowrap text-right text-[11px] text-stone-500">
                    {row.days ? `${row.days}일 · 배달 ${row.deliveryPct ?? 0}%` : "장사 안 함"}
                  </span>
                </li>
              );
            })}
          </ul>
          {r.best && r.worst && r.best.day !== r.worst.day && (
            <p className="mt-2 rounded-lg bg-stone-50 px-2 py-1.5 text-xs text-stone-600">
              제일 센 요일은 <b>{r.best.label}요일</b>({won(r.best.avg)}), 제일 한가한 요일은 <b>{r.worst.label}요일</b>({won(r.worst.avg)}) — 하루 {won(r.best.avg - r.worst.avg)} 차이예요. 사람 쓰는 날과 쉬는 날을 정할 때 보세요.
            </p>
          )}
          <p className="mt-1 text-xs text-stone-400">매출이 0인 날은 쉰 날로 보고 평균에서 뺐어요.</p>
        </>
      )}
    </section>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${on ? "bg-stone-800 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"}`} onClick={onClick}>
      {children}
    </button>
  );
}
