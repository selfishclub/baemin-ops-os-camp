"use client";

import { useMemo, useState } from "react";
import { ExportStatusLine } from "@/components/ExportUploadCard";
import { SourceTag } from "@/components/SourceTag";
import { useExport } from "@/components/useExport";
import { Notice } from "@/components/ui";
import { adEfficiency, channelSaleFromOrders, matchSettlements, perOrderBreakdown, type DepositState } from "@/lib/baemin/settle";
import { todayStr } from "@/lib/daily";
import { num, pctText, won } from "@/lib/format";
import { monthLabel } from "@/lib/month";
import { getStore } from "@/lib/storage";
import type { ChannelSale, Month, Transaction } from "@/lib/types";

const STATE_TONE: Record<DepositState, string> = { "입금 확인": "bg-emerald-100 text-emerald-800", "입금 대기": "bg-red-100 text-red-800", 예정: "bg-stone-100 text-stone-600", "입금 안 맞음": "bg-amber-100 text-amber-900" };

// 정산 탭 — 배민 정산 명세(자동 수집): 정산 건별 입금 확인 · 주문 1건당 쪼개기 · 광고 효율.
// 유승균 사장님 배달이익노트 방식. 자료는 리뷰 수집기의 npm run collect:baemin-settle → export:ledger 로 온다.
export function BaeminSettleSection({ month, txs, nextTxs, sales, onSaved }: { month: Month; txs: Transaction[]; nextTxs: Transaction[]; sales: ChannelSale[]; onSaved: () => Promise<void> }) {
  const exp = useExport();
  const today = todayStr();
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const b = exp.baemin;

  const rows = useMemo(() => (b ? matchSettlements(b.settlements, [...txs, ...nextTxs], today).filter((r) => r.depositDueDate.startsWith(month)) : []), [b, txs, nextTxs, month, today]);
  const per = useMemo(() => (b ? perOrderBreakdown(b.orders, month) : null), [b, month]);
  const ad = useMemo(() => adEfficiency(b, month), [b, month]);
  const suggested = b ? channelSaleFromOrders(b.orders, month) : null;
  const current = sales.find((s) => s.channel === "baemin") ?? null;

  if (!exp.loaded) return null;

  async function applyToChannel() {
    if (!suggested) return;
    setSaving(true);
    try {
      const row: ChannelSale = { month, channel: "baemin", name: current?.name ?? "배달의민족", orders: suggested.orders, deposit: suggested.deposit, count: suggested.count, unsettled: current?.unsettled ?? null };
      await getStore().saveChannelSales([row]);
      await onSaved();
      setMsg(`${monthLabel(month)} 배민 주문금액 ${won(suggested.orders)} · 정산금액 ${won(suggested.deposit)} · ${num(suggested.count)}건을 위 표에 넣었어요.`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className="card space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold">
            배민 정산 명세 — 자동 수집
            <SourceTag from="유승균" />
          </h2>
          <span className="text-xs text-stone-500">{b ? `수집 ${b.collectedAt.slice(0, 10)} · 정산 ${num(b.settlements.length)}건` : "아직 자료 없음"}</span>
        </div>
        {!b ? (
          <Notice tone="info">
            배민 사장님 사이트의 정산 내역·주문·가게통계를 읽기만 해서 가져오면, 정산 건마다 통장에 들어왔는지와 주문 1건당 수수료가 보여요. 리뷰 수집기에서 <code>npm run collect:baemin-settle</code> → <code>npm run export:ledger</code> 뒤 올리기 탭에서 파일을 올리세요.
          </Notice>
        ) : (
          <>
            {/* 정산 건별 입금 */}
            <div>
              <p className="text-sm font-semibold">
                {monthLabel(month)} 입금 예정 정산 <span className="num text-xs font-normal text-stone-500">{rows.length}건</span>
              </p>
              {rows.length === 0 ? (
                <p className="mt-1 text-sm text-stone-500">이 달 입금 예정인 정산이 수집 자료에 없어요.</p>
              ) : (
                <div className="mt-1 overflow-x-auto">
                  <table className="w-full min-w-[34rem] text-sm">
                    <thead className="text-left text-xs text-stone-500">
                      <tr>
                        <th className="py-1">입금 예정</th>
                        <th>주문 기간</th>
                        <th className="text-right">입금액</th>
                        <th className="text-right">광고비</th>
                        <th className="text-right">조정</th>
                        <th>통장</th>
                      </tr>
                    </thead>
                    <tbody className="num divide-y divide-stone-100">
                      {rows.map((r) => (
                        <tr key={r.giveId}>
                          <td className="py-1.5">{r.depositDueDate.slice(5)}</td>
                          <td className="text-xs text-stone-500">
                            {r.periodStart.slice(5)} ~ {r.periodEnd.slice(5)}
                          </td>
                          <td className="text-right font-bold">{num(r.depositAmount)}</td>
                          <td className="text-right text-stone-500">{r.adCost ? num(r.adCost) : "–"}</td>
                          <td className="text-right text-stone-500">{r.adjustment ? num(r.adjustment) : "–"}</td>
                          <td>
                            <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${STATE_TONE[r.state]}`}>{r.state}</span>
                            {r.bankDate && <span className="ml-1 text-xs text-stone-500">{r.bankDate.slice(5)}{r.daysLate ? ` (${r.daysLate > 0 ? "+" : ""}${r.daysLate}일)` : ""}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-1 text-xs text-stone-500">
                <b className="text-red-700">입금 대기</b>는 예정일이 지났는데 같은 금액의 배민 입금이 통장(이 달·다음 달 초)에 없는 것. 올리기 탭에서 그 기간 통장 내역을 올렸는지 먼저 보고, 그래도 없으면 배민 정산 화면에서 확인하세요.
              </p>
            </div>

            {/* 1건당 쪼개기 */}
            {per && per.per && (
              <div className="rounded-xl bg-stone-50 p-3">
                <p className="text-sm font-semibold">
                  주문 1건 {won(per.per.gross)} 중, 배민에 내는 돈 <span className="num text-xs font-normal text-stone-500">{monthLabel(month)} 주문 {num(per.orders)}건 (정산된 것)</span>
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  {[
                    ["중개이용료", per.per.brokerage, per.brokerage],
                    ["결제수수료", per.per.payment, per.payment],
                    ["배달비", per.per.delivery, per.delivery],
                    ["부가세", per.per.vat, per.vat],
                    ["점주 할인", per.per.discount, per.discount],
                    ...(per.unclassified ? [["미분류", per.per.unclassified, per.unclassified] as const] : []),
                  ].map(([label, perOrder, total]) => (
                    <li key={label as string} className="flex items-center gap-2">
                      <span className="w-20 shrink-0 text-stone-600">{label}</span>
                      <span className="h-3 flex-1 rounded bg-white">
                        <span className="block h-3 rounded bg-orange-400" style={{ width: `${Math.min(100, ((perOrder as number) / per.per!.gross) * 100 * 4)}%` }} />
                      </span>
                      <span className="num w-16 text-right font-semibold">{num(perOrder as number)}원</span>
                      <span className="num w-20 text-right text-xs text-stone-500">{pctText(per.per!.gross ? Math.round(((perOrder as number) / per.per!.gross) * 1000) / 10 : null)}</span>
                    </li>
                  ))}
                </ul>
                <p className="num mt-2 text-sm">
                  → 1건당 실제로 받는 돈 <b>{won(per.per.net)}</b> <span className="text-stone-500">(주문금액의 {pctText(per.netRate)} · 재료비·인건비 빼기 전)</span>
                </p>
                {per.unsettledOrders > 0 && <p className="mt-1 text-xs text-stone-500">아직 정산 전이라 뺀 주문 {num(per.unsettledOrders)}건 — 며칠 뒤 다시 수집하면 들어와요.</p>}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button className="btn-primary" disabled={saving || !suggested} onClick={applyToChannel}>
                    이 숫자를 위 정산 표의 배민 칸에 넣기
                  </button>
                  {current && suggested && (
                    <span className="num text-xs text-stone-500">
                      지금 표: 주문 {num(current.orders)} · 정산 {num(current.deposit)} · {num(current.count)}건 → 수집값: {num(suggested.orders)} · {num(suggested.deposit)} · {num(suggested.count)}건
                    </span>
                  )}
                </div>
                {msg && <Notice tone="ok">{msg}</Notice>}
              </div>
            )}
            {per && !per.per && <p className="text-sm text-stone-500">{monthLabel(month)}에 정산된 배민 주문이 수집 자료에 없어요. (수집 기간 {b.orderRange ? `${b.orderRange.start} ~ ${b.orderRange.end}` : "–"})</p>}

            {/* 광고 효율 */}
            {ad && (
              <div className="rounded-xl bg-stone-50 p-3">
                <p className="text-sm font-semibold">
                  광고 효율 (우리가게클릭) <span className="text-xs font-normal text-stone-500">가게통계 {monthLabel(month)}</span>
                </p>
                {ad.cost === null ? (
                  <p className="mt-1 text-sm text-stone-500">이 달 우리가게클릭 광고비 자료가 없어요.</p>
                ) : (
                  <dl className="num mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm sm:grid-cols-3">
                    <dt className="text-stone-500">광고비</dt>
                    <dd className="font-semibold sm:col-span-2">{won(ad.cost)}</dd>
                    <dt className="text-stone-500">광고로 들어온 주문</dt>
                    <dd className="font-semibold sm:col-span-2">
                      {num(ad.adOrders)}건{ad.allOrders ? ` / 전체 ${num(ad.allOrders)}건` : ""} · 매출 {won(ad.adSales)}
                    </dd>
                    <dt className="text-stone-500">광고 주문 1건당 광고비</dt>
                    <dd className="font-semibold sm:col-span-2">{ad.costPerAdOrder === null ? "–" : won(ad.costPerAdOrder)}</dd>
                    <dt className="text-stone-500">광고비 1만원에 들어온 매출</dt>
                    <dd className="font-semibold sm:col-span-2">{ad.salesPer10k === null ? "–" : won(ad.salesPer10k)}</dd>
                    <dt className="text-stone-500">광고 매출 중 광고비</dt>
                    <dd className="font-semibold sm:col-span-2">{pctText(ad.adShareOfSales)}</dd>
                  </dl>
                )}
                <p className="mt-1 text-xs text-stone-500">광고를 안 켰어도 왔을 손님이 광고를 누른 경우도 있어서 실제 효과는 이보다 작을 수 있어요. 광고비는 정산 명세의 일별 광고비와 겹치지 않게 여기서만 봐요.</p>
              </div>
            )}
            {b.unknownCodes.length > 0 && <p className="text-xs text-amber-800">처음 보는 배민 항목 코드가 있어 미분류로 넣었어요: {b.unknownCodes.map((u) => u.code).join(", ")}</p>}
          </>
        )}
      </section>
      <ExportStatusLine exp={exp} need="배민 정산 명세" />
    </>
  );
}
