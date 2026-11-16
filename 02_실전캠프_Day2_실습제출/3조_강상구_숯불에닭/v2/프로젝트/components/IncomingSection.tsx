"use client";

import { useEffect, useMemo, useState } from "react";
import { Notice } from "@/components/ui";
import { CARDSALES_KEY, type CardsalesData } from "@/lib/cardsales";
import { num, won } from "@/lib/format";
import { incomingDays, type IncomingDay } from "@/lib/incoming";
import { prevMonth } from "@/lib/month";
import type { SettlementRule } from "@/lib/settlement";
import { getStore } from "@/lib/storage";
import type { DailySale, Transaction } from "@/lib/types";

// 정산 탭 — 「들어올 돈」. 캐시노트가 보여 주는 당일 입금예정액을 우리 자료로 직접 센다 (2026-11-17).
//  여신협회가 알려 준 확정 금액에, 아직 매입이 안 올라온 거래일은 포스 매출로 미리 더한다 (lib/incoming.ts).
//  여신협회는 거래 다음 날(KB국민은 이틀 뒤)에야 매입을 올려서, 확정만 보면 오늘 들어올 돈이 비어 보인다.

const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const dowOf = (d: string) => DOW[new Date(`${d}T00:00:00Z`).getUTCDay()];
const label = (d: string, today: string) => (d === today ? "오늘" : d === addDays(today, 1) ? "내일" : d === addDays(today, 2) ? "모레" : `${md(d)}`);

/** 거래일 목록을 "11/13~11/15" 처럼 */
function range(days: string[]): string {
  if (!days.length) return "–";
  return days.length === 1 ? md(days[0]) : `${md(days[0])}~${md(days[days.length - 1])}`;
}

export function IncomingSection({ rules, holidays, txs }: { rules: SettlementRule[]; holidays: string[]; txs: Transaction[] }) {
  const [cardsales, setCardsales] = useState<CardsalesData | null>(null);
  const [sales, setSales] = useState<DailySale[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const today = localDay();

  useEffect(() => {
    const store = getStore();
    const month = today.slice(0, 7);
    void Promise.all([store.getSetting<CardsalesData>(CARDSALES_KEY), store.listDailySales(month), store.listDailySales(prevMonth(month))])
      .then(([c, a, b]) => {
        setCardsales(c);
        setSales([...a, ...b]);
      })
      .finally(() => setLoaded(true));
  }, [today]);

  const days = useMemo(() => incomingDays(today, 3, { sales, cardsales, rules, holidays }), [today, sales, cardsales, rules, holidays]);

  // 오늘 몫이 이미 통장에 들어왔나 (카드 입금은 아침에 들어온다)
  const gotToday = useMemo(() => txs.filter((t) => t.date === today && t.in > 0 && String(t.channel ?? "").startsWith("card_")).reduce((a, t) => a + t.in, 0), [txs, today]);

  if (!loaded) return null;
  if (!days.some((d) => d.amount > 0))
    return (
      <section className="card space-y-2">
        <h2 className="text-base font-bold">들어올 돈</h2>
        <Notice tone="info">카드 매출이나 여신협회 자료가 아직 없어요. 오늘 탭에 카드사별 매출을 넣고, 아래 「여신협회에서 바로 가져오기」를 한 번 눌러 주세요.</Notice>
      </section>
    );

  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-base font-bold">들어올 돈 · 카드</h2>
        <p className="text-xs text-stone-500">여신협회 확정 + 아직 안 올라온 날은 포스 매출로 미리 셈</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {days.map((d) => (
          <button key={d.date} type="button" onClick={() => setOpen(open === d.date ? null : d.date)} className={`rounded-xl p-3 text-left transition ${open === d.date ? "bg-orange-50 ring-2 ring-orange-300" : "bg-stone-50 hover:bg-stone-100"}`}>
            <p className="text-[11px] text-stone-500 sm:text-xs">
              {label(d.date, today)} <span className="num">{md(d.date)}</span>({dowOf(d.date)})
            </p>
            <p className="num text-[15px] font-bold leading-tight sm:text-lg">{num(d.amount)}</p>
            <p className="num text-[10px] leading-tight text-stone-500 sm:text-[11px]">
              {d.amount === 0 ? "오늘 마감 뒤에 채워져요" : d.estimated > 0 ? (d.confirmed > 0 ? <>확정 {num(d.confirmed)}<br />+ 예상 {num(d.estimated)}</> : "전부 예상") : "확정"}
            </p>
          </button>
        ))}
      </div>

      {days
        .filter((d) => (open ? d.date === open : d.date === today))
        .map((d) => (
          <Detail key={d.date} day={d} today={today} />
        ))}

      {gotToday > 0 && (
        <Notice tone="ok">
          오늘 통장에 들어온 카드 입금 <b className="num">{won(gotToday)}</b>
          {Math.abs(gotToday - days[0].amount) <= Math.max(1000, days[0].amount * 0.01) ? " — 예상과 맞아요." : ` — 위 예상 ${won(days[0].amount)}과 ${won(Math.abs(gotToday - days[0].amount))} 차이가 나요.`}
        </Notice>
      )}

      <p className="text-xs text-stone-500">
        <b>예상</b>은 여신협회에 매입이 아직 안 올라온 거래일을, 포스 카드 매출에서 그 카드사 실측 수수료율을 뺀 금액이에요. 카드사는 보통 거래 다음 날 매입을 올리고, <b>KB국민카드는 이틀 뒤</b>에 올려요. 모레 칸은 오늘 장사분이 들어가므로 마감 뒤에 채워져요. 간편결제·제로페이는 여신협회에 안 나와서 여기서 뺐어요.
      </p>
    </section>
  );
}

function Detail({ day, today }: { day: IncomingDay; today: string }) {
  if (!day.lines.length) return <p className="text-sm text-stone-500">{label(day.date, today)}({dowOf(day.date)}) 들어올 카드 돈이 아직 없어요. 오늘 장사가 끝나고 포스를 올리면 채워져요.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[30rem] text-sm">
        <thead className="text-left text-xs text-stone-500">
          <tr>
            <th className="py-1">
              {label(day.date, today)} {md(day.date)}({dowOf(day.date)}) 입금
            </th>
            <th>거래일</th>
            <th className="text-right">금액</th>
            <th className="text-right">확정</th>
            <th className="text-right">예상</th>
          </tr>
        </thead>
        <tbody className="num divide-y divide-stone-100">
          {day.lines.map((l) => (
            <tr key={l.channel} className="whitespace-nowrap">
              <td className="py-1.5">{l.name}</td>
              <td className="text-xs text-stone-500">
                {range(l.from)}{" "}
                {l.estFrom.length > 0 && <span className="ml-0.5 rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-900" title={`${l.estFrom.map(md).join(", ")}는 아직 여신협회에 안 올라와 포스 매출로 셌어요 (수수료 ${l.feeRate}%)`}>{l.estFrom.map(md).join(",")} 예상</span>}
              </td>
              <td className="text-right font-bold">{num(l.amount)}</td>
              <td className="text-right text-stone-500">{l.confirmed ? num(l.confirmed) : "–"}</td>
              <td className="text-right text-amber-800">{l.estimated ? num(l.estimated) : "–"}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-stone-200 font-bold">
            <td className="py-1.5">합계</td>
            <td />
            <td className="text-right">{num(day.amount)}</td>
            <td className="text-right text-stone-500">{num(day.confirmed)}</td>
            <td className="text-right text-amber-800">{num(day.estimated)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
