"use client";

import { useEffect, useState } from "react";
import { MoneyInput } from "@/components/ui";
import { computeBreakeven, costItems, splitCosts, type CostItem } from "@/lib/breakeven";
import { num, pctText, won } from "@/lib/format";
import { monthLabel } from "@/lib/month";
import type { Pnl } from "@/lib/pnl";
import { getStore } from "@/lib/storage";
import type { Month } from "@/lib/types";

export const BREAKEVEN_KEY = "breakeven_v1";

export interface BreakevenSetting {
  variable: Record<string, boolean>; // 사장님이 손으로 바꾼 줄만
  targetProfit: number; // 이만큼은 남기고 싶다
}

const EMPTY: BreakevenSetting = { variable: {}, targetProfit: 0 };

// 손익분기 매출은 어림이라 천원 아래는 자른다 — 21,416,453원 같은 숫자는 오히려 안 믿긴다
const rough = (n: number) => Math.round(n / 1000) * 1000;

// 손익분기점 — 한 달에 얼마를 팔아야 본전인가.
// 변동비/고정비 구분은 가게마다 다르니 기본값만 정해 두고 줄마다 바꿀 수 있게 한다.
export function BreakevenCard({ month, pnl, openDays }: { month: Month; pnl: Pnl; openDays: number }) {
  const [setting, setSetting] = useState<BreakevenSetting>(EMPTY);
  const [showItems, setShowItems] = useState(false);

  useEffect(() => {
    getStore()
      .getSetting<BreakevenSetting>(BREAKEVEN_KEY)
      .then((v) => v && setSetting({ variable: v.variable ?? {}, targetProfit: v.targetProfit ?? 0 }))
      .catch(() => {});
  }, []);

  const update = (next: BreakevenSetting) => {
    setSetting(next);
    void getStore().saveSetting(BREAKEVEN_KEY, next).catch(() => {});
  };
  const flip = (item: CostItem) => update({ ...setting, variable: { ...setting.variable, [item.key]: !item.variable } });

  const items = costItems(pnl, setting.variable);
  const { variable, fixed } = splitCosts(items);
  const b = computeBreakeven({ revenue: pnl.revenue, variable, fixed, openDays, targetProfit: setting.targetProfit });
  const thisMonth = new Date().toISOString().slice(0, 7);

  return (
    <section className="card">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">손익분기점</h2>
        <span className="text-xs text-stone-500">본전이 되는 매출</span>
      </div>

      {pnl.revenue <= 0 || b.point === null ? (
        <p className="rounded-lg bg-stone-50 px-2 py-3 text-sm text-stone-600">
          {pnl.revenue <= 0
            ? "이 달 매출이 없어서 아직 계산할 수 없어요."
            : "변동비(재료비·수수료)가 매출보다 커서 손익분기점이 안 나와요. 팔수록 손해라는 뜻이라 원가부터 봐야 해요."}
        </p>
      ) : (
        <>
          <div className="rounded-xl bg-stone-50 p-3">
            <p className="text-xs font-semibold text-stone-500">{monthLabel(month)} 한 달에 이만큼은 팔아야 본전</p>
            <p className="num mt-1 text-3xl font-extrabold text-stone-900">약 {won(rough(b.point))}</p>
            {b.perDay !== null && (
              <p className="num mt-1 text-sm text-stone-600">
                영업 {openDays}일 기준 하루 <b>{won(rough(b.perDay))}</b>
              </p>
            )}
          </div>

          <div className={`mt-2 rounded-xl px-3 py-2 text-sm ${b.gap! >= 0 ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900"}`}>
            {b.gap! >= 0 ? (
              <>
                지금 매출 <b className="num">{won(pnl.revenue)}</b> — 본전을 <b className="num">{won(rough(b.gap!))}</b> 넘겼어요. 매출이 <b>{pctText(b.safety)}</b> 줄어도 적자는 아니에요.
              </>
            ) : (
              <>
                지금 매출 <b className="num">{won(pnl.revenue)}</b> — 본전까지 <b className="num">{won(rough(-b.gap!))}</b> 모자라요{b.perDay !== null && openDays > 0 && <> (하루 {won(rough(-b.gap! / openDays))}씩)</>}.
              </>
            )}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Box label="변동비" value={won(variable)} sub={`매출의 ${pctText(pnl.revenue > 0 ? Math.round((variable / pnl.revenue) * 1000) / 10 : null)}`} />
            <Box label="고정비" value={won(fixed)} sub="안 팔아도 나가요" />
            <Box label="공헌이익률" value={pctText(b.contributionRate === null ? null : Math.round(b.contributionRate * 1000) / 10)} sub="고정비 갚는 몫" />
          </div>

          <div className="mt-3 border-t border-stone-100 pt-3">
            <p className="text-xs font-semibold text-stone-500">한 달에 가져가고 싶은 돈 (생활비·저축)</p>
            <div className="mt-1 flex items-center gap-2">
              <MoneyInput label="한 달에 가져가고 싶은 돈" value={setting.targetProfit} onChange={(v) => update({ ...setting, targetProfit: v ?? 0 })} />
              {setting.targetProfit > 0 && b.target !== null && (
                <p className="num shrink-0 text-sm text-stone-700">
                  → 약 <b>{won(rough(b.target))}</b>
                  {b.targetPerDay !== null && <span className="ml-1 text-xs text-stone-500">하루 {num(rough(b.targetPerDay))}</span>}
                </p>
              )}
            </div>
            {setting.targetProfit > 0 && b.target !== null && (
              <p className="mt-1 text-xs text-stone-500">
                {won(setting.targetProfit)}을 남기려면 한 달 약 {won(rough(b.target))}을 팔아야 해요{pnl.revenue >= b.target ? " — 이미 넘겼어요." : ` (지금보다 ${won(rough(b.target - pnl.revenue))} 더).`}
              </p>
            )}
          </div>

          <button className="mt-3 w-full rounded-lg bg-stone-100 px-3 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-200" onClick={() => setShowItems(!showItems)}>
            {showItems ? "변동비·고정비 접기" : `변동비·고정비 나눈 내역 보기 (${items.length}줄)`}
          </button>
          {showItems && (
            <>
              <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                <b>변동비</b>는 팔수록 같이 늘어나는 돈(재료비·수수료), <b>고정비</b>는 하나도 안 팔아도 나가는 돈(임대료·월급)이에요. 우리 가게와 다르면 눌러서 바꾸세요 — 바꾼 건 계속 기억해요.
              </p>
              <ul className="mt-1 divide-y divide-stone-100">
                {items.map((i) => (
                  <li key={i.key} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="min-w-0 text-sm">
                      <span className="text-stone-500">{i.major}</span> <b className="text-stone-800">{i.minor}</b>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="num text-sm">{num(i.amount)}</span>
                      <button
                        className={`rounded-lg px-2 py-1 text-xs font-bold ${i.variable ? "bg-orange-100 text-orange-800 hover:bg-orange-200" : "bg-stone-100 text-stone-600 hover:bg-stone-200"}`}
                        onClick={() => flip(i)}
                      >
                        {i.variable ? "변동비" : "고정비"}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {month === thisMonth && (
        <p className="mt-2 text-xs text-stone-400">이 달은 아직 안 끝나서 임대료처럼 나중에 나갈 고정비가 빠져 있을 수 있어요. 지난달로 넘겨 보면 한 달 전체 기준으로 보여요.</p>
      )}
      {pnl.laborEstimated && <p className="mt-1 text-xs text-stone-400">인건비는 아직 어림값이라 고정비도 어림이에요.</p>}
    </section>
  );
}

function Box({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl bg-stone-50 px-2 py-2">
      <p className="text-xs font-semibold text-stone-500">{label}</p>
      <p className="num mt-0.5 text-sm font-bold text-stone-900">{value}</p>
      <p className="mt-0.5 text-[11px] text-stone-400">{sub}</p>
    </div>
  );
}
