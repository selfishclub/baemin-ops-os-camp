"use client";

import { useEffect, useMemo, useState } from "react";
import { SourceTag } from "@/components/SourceTag";
import { CHANNELS_KEY } from "@/components/useDaily";
import { num } from "@/lib/format";
import { AD_WEEK_NOTES_KEY, hallVersusUsual, weeklyRecord } from "@/lib/market/adOps";
import type { NaverAdExport } from "@/lib/market/adStats";
import { mergeChannels } from "@/lib/monthPnl";
import { getStore } from "@/lib/storage";
import type { Channel, DailySale } from "@/lib/types";

// 광고 노트 ⑥ 주간 광고 기록 — 카페스이 광고 노트의 틀.
// 카페스이는 예약·방문을 손으로 적지만, 우리는 장부에 매출이 있어서 홀 매출을 자동으로 붙인다.
// 늘릴지 줄일지는 클릭이 아니라 매출로 정하고, 한 주에 하나만 바꿔 비교한다.
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

export function AdWeeklyRecord({ ad, today, log }: { ad: NaverAdExport | null; today: string; log: { date: string; text: string }[] }) {
  const [sales, setSales] = useState<DailySale[]>([]);
  const [channels, setChannels] = useState<Channel[]>(mergeChannels(null));
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const store = getStore();
    void Promise.all([store.listAllDailySales(), store.getSetting<Channel[]>(CHANNELS_KEY), store.getSetting<Record<string, string>>(AD_WEEK_NOTES_KEY)]).then(([s, c, n]) => {
      setSales(s);
      setChannels(mergeChannels(c));
      setNotes(n ?? {});
      setLoaded(true);
    });
  }, []);

  const rows = useMemo(() => weeklyRecord(ad, sales, channels, log, notes, today, 8), [ad, sales, channels, log, notes, today]);
  const vs = useMemo(() => hallVersusUsual(rows), [rows]);

  function saveNote(monday: string, text: string) {
    const next = { ...notes, [monday]: text.trim() };
    if (!next[monday]) delete next[monday];
    setNotes(next);
    void getStore().saveSetting(AD_WEEK_NOTES_KEY, next).catch(() => {});
  }

  if (!loaded) return null;

  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">
          ⑥ 주간 광고 기록 <span className="text-xs font-normal text-stone-500">광고비 옆에 장부 매출을 자동으로</span>
          <SourceTag from="카페스이" />
        </h2>
      </div>
      <p className="text-sm text-stone-600">
        늘릴지 줄일지는 <b>클릭이 아니라 매출</b>로 정해요. 광고 화면에는 손님 수가 없어서, 오늘 탭에 넣은 홀 매출(배달앱 빼고)을 그 주 광고비 옆에 붙였어요. 바꾼 것은 <b>한 주에 하나만</b> 적고 비교하세요.
      </p>
      {vs && vs.pct !== null && (
        <p className={`rounded-xl px-3 py-2 text-sm ${vs.pct >= 0 ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
          지난주({md(vs.week.monday)}~{md(vs.week.sunday)}) 홀 매출 <b className="num">{num(vs.week.hall)}원</b> — 그 앞 4주 평균({num(vs.usual)}원)보다 <b className="num">{vs.pct >= 0 ? "+" : ""}{vs.pct}%</b>
          {vs.week.costVat > 0 && <> · 광고비 {num(vs.week.costVat)}원</>}
          {vs.week.note && <> · 그 주에 바꾼 것: {vs.week.note}</>}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-xs text-stone-500">
            <tr>
              <th className="py-1">주 (월~일)</th>
              <th className="text-right">노출</th>
              <th className="text-right">클릭</th>
              <th className="text-right">누른 비율</th>
              <th className="text-right">클릭 1번에</th>
              <th className="text-right">광고비</th>
              <th className="text-right">홀 매출</th>
              <th className="text-right">전체 매출</th>
              <th className="text-right" title="광고비 ÷ 홀 매출">광고비 비중</th>
              <th className="pl-3">이번 주 바꾼 것 하나</th>
            </tr>
          </thead>
          <tbody className="num divide-y divide-stone-100">
            {rows.map((r) => (
              <tr key={r.monday} className={r.partial ? "bg-stone-50" : ""}>
                <td className="py-1 font-semibold whitespace-nowrap">
                  {md(r.monday)}~{md(r.sunday)}
                  {r.partial && <span className="ml-1 text-[10px] font-normal text-stone-500">이번 주</span>}
                </td>
                <td className="text-right">{num(r.t.imp)}</td>
                <td className="text-right">{num(r.t.clk)}</td>
                <td className="text-right">{r.t.imp ? `${((r.t.clk / r.t.imp) * 100).toFixed(2)}%` : "–"}</td>
                <td className="text-right">{r.t.clk ? `${num((r.t.cost * 1.1) / r.t.clk)}원` : "–"}</td>
                <td className="text-right">{r.costVat ? `${num(r.costVat)}원` : "–"}</td>
                <td className="text-right font-semibold">{r.hall ? `${num(r.hall)}원` : "–"}</td>
                <td className="text-right text-stone-500">{r.sales ? `${num(r.sales)}원` : "–"}</td>
                <td className="text-right">{r.adShare === null ? "–" : `${r.adShare}%`}</td>
                <td className="pl-3">
                  <input
                    className="field py-1 text-xs"
                    defaultValue={r.note}
                    placeholder={r.changes[0] ?? "이번 주에 바꾼 것 하나"}
                    maxLength={60}
                    aria-label={`${md(r.monday)} 주 바꾼 것`}
                    onBlur={(e) => e.target.value.trim() !== r.note && saveNote(r.monday, e.target.value)}
                  />
                  {r.changes.length > 0 && <span className="mt-0.5 block text-[10px] text-stone-400" title={r.changes.join("\n")}>이 주 "바꾼 기록" {r.changes.length}건 — 하나만 바꿔야 비교돼요</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-stone-500">광고비는 청구 기준(VAT 포함)이에요. 홀 매출은 카드·현금·계좌이체 합계예요. 날씨·공휴일·행사로도 매출이 움직이니 한 주만 보고 정하지 말고 2주 이상 같은 방향일 때 바꾸세요.</p>
    </section>
  );
}
