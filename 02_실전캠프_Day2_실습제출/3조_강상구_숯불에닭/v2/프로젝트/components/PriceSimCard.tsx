"use client";

import { useMemo, useState } from "react";
import { MoneyInput } from "@/components/ui";
import type { CostRateReport } from "@/lib/costing/costRate";
import { simulatePrice, type PriceSimMenu } from "@/lib/costing/priceSim";
import { num, pctText, won } from "@/lib/format";
import { SourceTag } from "@/components/SourceTag";

const DELTAS = [300, 500, 1_000, 2_000];
const DECLINES = [0, 5, 10, 20];

// 가격 실험 — 메뉴 하나를 골라 값을 올리면 1개당·한 달에 얼마가 더 남는지, 손님이 몇 % 줄어도 괜찮은지.
// 계산은 lib/costing/priceSim.ts. 여기서는 고르고 보여 주기만 한다.
export function PriceSimCard({ report, defaultFeePct }: { report: CostRateReport; defaultFeePct: number | null }) {
  // 원가율 높은 순이라 첫 줄이 "안 남는 메뉴". 레시피 있는 메뉴를 먼저 고른다
  const menus: PriceSimMenu[] = useMemo(
    () => [...report.rows, ...report.unmapped].filter((r) => r.quantity > 0 && r.amount > 0).map((r) => ({ code: r.code, name: r.name, quantity: r.quantity, amount: r.amount, unitCost: r.unitCost })),
    [report],
  );
  const [code, setCode] = useState<string>(menus[0]?.code ?? "");
  const [delta, setDelta] = useState<number>(1_000);
  const [custom, setCustom] = useState<number | null>(null);
  const [feePct, setFeePct] = useState<number>(defaultFeePct ?? 3);

  const menu = menus.find((m) => m.code === code) ?? menus[0];
  const sim = menu ? simulatePrice({ menu, priceDelta: custom ?? delta, feeRatePct: feePct, declinesPct: DECLINES }) : null;

  if (!menu) return null;

  return (
    <section className="card space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">
          가격 실험
          <SourceTag from="유승균" />
        </h2>
        <span className="text-xs text-stone-500">이 메뉴 값을 올리면?</span>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <label className="block text-xs font-semibold text-stone-500">
          메뉴
          <select className="field mt-1" value={menu.code} onChange={(e) => setCode(e.target.value)}>
            {menus.map((m) => (
              <option key={m.code} value={m.code}>
                {m.name}
                {m.unitCost === null ? " (레시피 없음)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-semibold text-stone-500">
          인상분에 붙는 수수료 가정
          <span className="mt-1 flex items-center gap-1">
            {/* .field 가 w-full 이라 바깥 상자로 폭을 잡는다 */}
            <span className="inline-block w-20">
              <input
                aria-label="수수료 가정 (%)"
                className="field text-right"
              inputMode="decimal"
              value={feePct}
                onChange={(e) => setFeePct(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
              />
            </span>
            <span className="text-sm text-stone-600">%</span>
          </span>
        </label>
      </div>
      <p className="text-xs text-stone-400">
        {defaultFeePct === null
          ? "수수료는 정산 탭에 주문·정산금액을 넣으면 장부에서 어림해 와요. 지금은 3%로 두었어요."
          : `이 달 장부 기준 수수료 어림 ${pctText(defaultFeePct)} (배달앱 수수료 + 카드수수료 ÷ 주문금액). 배달 메뉴면 더 높게 잡으세요.`}
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        {DELTAS.map((d) => (
          <button
            key={d}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${custom === null && delta === d ? "bg-orange-600 text-white" : "bg-stone-100 text-stone-700 hover:bg-stone-200"}`}
            onClick={() => {
              setDelta(d);
              setCustom(null);
            }}
          >
            +{num(d)}원
          </button>
        ))}
        <span className="ml-1 text-xs text-stone-500">직접</span>
        <div className="w-28">
          <MoneyInput label="직접 입력한 인상액" value={custom} onChange={setCustom} allowEmpty placeholder="예: 700" />
        </div>
      </div>

      {sim === null || sim.status === "empty" ? (
        <p className="rounded-lg bg-stone-50 px-2 py-3 text-sm text-stone-600">{sim?.reason ?? "메뉴를 골라 주세요."}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            <Box label="지금 단가" value={won(sim.unitPrice)} sub={sim.costRateBefore === null ? "원가 모름" : `원가율 ${pctText(sim.costRateBefore)}`} />
            <Box label="올린 뒤" value={won(sim.newPrice)} sub={sim.costRateAfter === null ? "원가 모름" : `원가율 ${pctText(sim.costRateAfter)}`} tone="accent" />
            <Box label="1개 마진" value={sim.marginBefore === null ? "–" : won(sim.marginBefore)} sub={sim.marginAfter === null ? "레시피 넣으면 나와요" : `→ ${won(sim.marginAfter)}`} />
            <Box label="1개당 더 남는 돈" value={won(sim.addedPerUnit)} sub={`수수료 ${pctText(feePct)} 뺀 뒤`} tone="accent" />
          </div>

          <div className="rounded-xl bg-orange-50 px-3 py-2 text-sm text-orange-900">
            이 달처럼 <b className="num">{num(menu.quantity)}개</b> 팔리면 한 달에 <b className="num">{won(sim.gainSameQty)}</b> {sim.gainSameQty >= 0 ? "더 남아요" : "덜 남아요"}.
            {sim.maxDeclinePct !== null && sim.maxDeclinePct > 0 && (
              <>
                {" "}
                값을 올려서 판매가 <b>{pctText(sim.maxDeclinePct)}</b> 넘게 줄면 오히려 손해예요
                {sim.minQuantity !== null && <> (최소 <b className="num">{num(sim.minQuantity)}개</b>는 팔려야 지금만큼 남아요)</>}.
              </>
            )}
          </div>

          {sim.marginBefore === null ? (
            <p className="text-xs text-stone-500">이 메뉴는 레시피가 없어 원가를 몰라요. 그래서 "더 들어오는 돈"까지만 계산하고, 손님이 줄었을 때 비교는 비워 두었어요. 설정에서 레시피를 넣으면 채워져요.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[24rem] text-sm">
                <thead className="text-left text-xs text-stone-500">
                  <tr>
                    <th className="py-1">손님이 줄면</th>
                    <th className="text-right">판매량</th>
                    <th className="text-right">한 달 마진</th>
                    <th className="text-right">지금과 차이</th>
                  </tr>
                </thead>
                <tbody className="num divide-y divide-stone-100">
                  {sim.scenarios.map((s) => (
                    <tr key={s.declinePct} className={(s.diff ?? 0) < 0 ? "text-red-800" : ""}>
                      <td className="py-1.5 font-semibold">{s.declinePct === 0 ? "그대로" : `${s.declinePct}% 줄면`}</td>
                      <td className="text-right">{num(s.quantity)}개</td>
                      <td className="text-right">{s.profit === null ? "–" : won(s.profit)}</td>
                      <td className="text-right font-bold">{s.diff === null ? "–" : `${s.diff > 0 ? "+" : ""}${won(s.diff)}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-xs text-stone-400">
                지금 한 달 마진 {won(sim.baseProfit!)} 기준. 가격만 올렸다고 같은 음식의 재료 원가가 오르지는 않으니 원가는 그대로 두고 계산했어요. 날씨·행사·휴무는 섞여 있지 않아요.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Box({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "accent" }) {
  return (
    <div className={`rounded-xl px-2 py-2 ${tone === "accent" ? "bg-orange-50" : "bg-stone-50"}`}>
      <p className="text-xs font-semibold text-stone-500">{label}</p>
      <p className={`num mt-0.5 text-sm font-bold ${tone === "accent" ? "text-orange-800" : "text-stone-900"}`}>{value}</p>
      <p className="mt-0.5 text-[11px] text-stone-400">{sub}</p>
    </div>
  );
}
