"use client";

import { useEffect, useState } from "react";
import { useMonth } from "@/components/AppShell";
import { ConfirmDialog, MoneyInput, Notice } from "@/components/ui";
import { useLedger } from "@/components/useLedger";
import { DEFAULT_CHANNELS } from "@/lib/categories";
import { channelFees } from "@/lib/channels";
import { num, pctText, won } from "@/lib/format";
import { isClosed, monthLabel } from "@/lib/month";
import { sampleChannelSales } from "@/lib/seed";
import { getStore, storageMode } from "@/lib/storage";
import type { ChannelSale } from "@/lib/types";
import { checkChannelSale, type Issue } from "@/lib/validate";

export default function ChannelsPage() {
  const { month } = useMonth();
  const ledger = useLedger(month);
  const [form, setForm] = useState<ChannelSale[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [asking, setAsking] = useState(false);
  const [saved, setSaved] = useState(false);

  // 저장된 값이 있으면 그걸로, 없으면 지난달 채널 이름을 이어받아 빈 칸으로
  useEffect(() => {
    if (ledger.loading) return;
    setForm(
      DEFAULT_CHANNELS.map((c) => {
        const now = ledger.sales.find((s) => s.channel === c.id);
        const prev = ledger.prevSales.find((s) => s.channel === c.id);
        return now ?? { month, channel: c.id, name: prev?.name ?? c.name, orders: 0, deposit: 0, count: 0 };
      }),
    );
    setSaved(false);
  }, [ledger.loading, ledger.sales, ledger.prevSales, month]);

  const patch = (i: number, p: Partial<ChannelSale>) => {
    setForm((f) => f.map((s, j) => (j === i ? { ...s, ...p } : s)));
    setSaved(false);
  };

  function trySave() {
    const found = form.flatMap((s) => checkChannelSale(s, ledger.prevSales.find((p) => p.channel === s.channel)?.orders));
    setIssues(found);
    if (found.some((i) => i.level === "error")) return;
    if (found.length > 0) setAsking(true);
    else void save();
  }

  async function save() {
    setAsking(false);
    await getStore().saveChannelSales(form);
    await ledger.recordEdit("배달앱·홀 실매출 입력을 고침");
    await ledger.reload();
    setIssues([]);
    setSaved(true);
  }

  const fees = channelFees(ledger.sales, ledger.txs);
  const delivery = fees.filter((f) => f.channel !== "hall" && f.feeRate !== null);
  const worst = delivery.length ? delivery.reduce((a, b) => ((b.feeRate ?? 0) > (a.feeRate ?? 0) ? b : a)) : null;
  const hasBank = ledger.txs.some((t) => t.channel && t.in > 0);

  return (
    <>
      <section className="card space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-bold">채널별 실매출 입력</h2>
          <span className="text-xs text-stone-500">{monthLabel(month)} 합계</span>
        </div>
        <p className="text-sm text-stone-600">
          각 앱 사장님 사이트의 월 합계를 보고 넣어 주세요. <b>주문금액</b>은 손님이 결제한 돈, <b>입금액</b>은 수수료가 빠지고 통장에 들어온 돈이에요.
        </p>
        {isClosed(ledger.closing) && <Notice tone="warn">마감한 달이에요. 고치면 수정 기록이 남아요.</Notice>}

        <div className="space-y-3">
          {form.map((s, i) => (
            <div key={s.channel} className="rounded-xl bg-stone-50 p-3">
              <input aria-label={`${s.channel} 채널 이름`} className="mb-2 w-full bg-transparent text-sm font-bold outline-none" value={s.name} onChange={(e) => patch(i, { name: e.target.value })} />
              <div className="grid grid-cols-3 gap-2">
                <label className="space-y-1 text-[11px] text-stone-500">
                  주문금액
                  <MoneyInput label={`${s.name} 주문금액`} value={s.orders} onChange={(n) => patch(i, { orders: n })} />
                </label>
                <label className="space-y-1 text-[11px] text-stone-500">
                  {s.channel === "hall" ? "카드 입금액" : "입금액"}
                  <MoneyInput label={`${s.name} 입금액`} value={s.deposit} onChange={(n) => patch(i, { deposit: n })} />
                </label>
                <label className="space-y-1 text-[11px] text-stone-500">
                  건수
                  <MoneyInput label={`${s.name} 건수`} value={s.count} onChange={(n) => patch(i, { count: n })} />
                </label>
              </div>
            </div>
          ))}
        </div>

        {issues.filter((i) => i.level === "error").map((i) => (
          <Notice key={i.message} tone="error">
            {i.message}
          </Notice>
        ))}
        {saved && <Notice tone="ok">저장했어요.</Notice>}
        <div className="flex gap-2">
          <button className="btn-primary flex-1" onClick={trySave}>
            저장
          </button>
          {storageMode() === "supabase" || ledger.sales.length === 0 ? (
            <button className="btn-ghost" onClick={() => setForm(sampleChannelSales(month))}>
              가짜 예시 채우기
            </button>
          ) : null}
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="text-base font-bold">앱별 수수료 비교</h2>
        {fees.length === 0 ? (
          <Notice tone="info">실매출을 저장하면 앱별 수수료율이 나와요.</Notice>
        ) : (
          <>
            {worst && (
              <Notice tone="warn">
                수수료율이 가장 높은 곳은 <b>{worst.name}</b> — 주문금액의 <b>{pctText(worst.feeRate)}</b> ({won(worst.fee)})가 빠져요.
              </Notice>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead className="text-left text-xs text-stone-500">
                  <tr>
                    <th className="py-1">채널</th>
                    <th className="text-right">주문금액</th>
                    <th className="text-right">수수료</th>
                    <th className="text-right">수수료율</th>
                    <th className="text-right">건당</th>
                    <th className="text-right">통장 입금</th>
                    <th className="text-right">차이</th>
                  </tr>
                </thead>
                <tbody className="num divide-y divide-stone-100">
                  {fees.map((f) => (
                    <tr key={f.channel} className={worst?.channel === f.channel ? "bg-amber-50" : ""}>
                      <td className="py-2 font-semibold">{f.name}</td>
                      <td className="text-right">{num(f.orders)}</td>
                      <td className="text-right">{f.feeRate === null ? "–" : num(f.fee)}</td>
                      <td className="text-right font-bold">{pctText(f.feeRate)}</td>
                      <td className="text-right">{f.perOrder === null ? "–" : num(f.perOrder)}</td>
                      <td className="text-right">{hasBank ? num(f.bankDeposit) : "–"}</td>
                      <td className={`text-right font-bold ${hasBank && f.gap !== 0 ? "text-red-600" : "text-stone-400"}`}>
                        {hasBank && f.deposit > 0 ? (f.gap === 0 ? "일치" : `${f.gap > 0 ? "+" : "−"}${num(Math.abs(f.gap))}`) : "–"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-stone-500">
              차이 = 입력한 입금액 − 통장에 찍힌 그 채널 입금 합계. 정산 주기 때문에 달이 걸치면 조금 다를 수 있어요. 홀은 현금 매출만큼 주문금액과 카드 입금이 달라요.
            </p>
          </>
        )}
      </section>

      {asking && (
        <ConfirmDialog title="숫자를 한 번 더 확인해 주세요" confirmLabel="맞아요, 저장" onConfirm={save} onCancel={() => setAsking(false)}>
          {issues.map((i) => (
            <p key={i.message}>• {i.message}</p>
          ))}
        </ConfirmDialog>
      )}
    </>
  );
}
