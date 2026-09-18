"use client";

import { useEffect, useState } from "react";
import { useMonth } from "@/components/AppShell";
import { ConfirmDialog, MoneyInput, Notice } from "@/components/ui";
import { useLedger } from "@/components/useLedger";
import { useDaily } from "@/components/useDaily";
import { monthChannelTotals } from "@/lib/daily";
import { channelKind } from "@/lib/categories";
import { channelFees, type ChannelFee } from "@/lib/channels";
import { num, pctText, won } from "@/lib/format";
import { isClosed, monthLabel, nextMonth, prevMonth } from "@/lib/month";
import { sampleChannelSales } from "@/lib/seed";
import { getStore, storageMode } from "@/lib/storage";
import type { ChannelSale } from "@/lib/types";
import { checkChannelSale, type Issue } from "@/lib/validate";

export default function ChannelsPage() {
  const { month } = useMonth();
  const ledger = useLedger(month);
  const daily = useDaily(month);
  const [form, setForm] = useState<ChannelSale[]>([]);
  const [fromDaily, setFromDaily] = useState<string[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [asking, setAsking] = useState(false);
  const [saved, setSaved] = useState(false);
  const monthNo = Number(month.slice(5));
  const nextNo = Number(nextMonth(month).slice(5));

  // 저장된 값이 있으면 그걸로, 없으면 지난달 채널 이름을 이어받아 빈 칸으로
  // 채널 목록은 오늘 탭의 설정을 따른다. v1 때 저장한 "hall"(홀 전체) 줄은 있으면 같이 보여 준다.
  // 저장된 월 합계가 없으면 일별 입력의 합계로 미리 채운다.
  useEffect(() => {
    if (ledger.loading || daily.loading) return;
    const totals = monthChannelTotals(month, daily.sales, daily.channels);
    const list = daily.channels.filter((c) => c.active).map((c) => ({ id: c.id, name: c.name }));
    for (const s of ledger.sales) if (!list.some((c) => c.id === s.channel)) list.push({ id: s.channel, name: s.name });
    const filled: string[] = [];
    setForm(
      list.map((c) => {
        const now = ledger.sales.find((s) => s.channel === c.id);
        if (now) return { ...now, unsettled: now.unsettled ?? null };
        const prev = ledger.prevSales.find((s) => s.channel === c.id);
        const orders = totals[c.id] ?? 0;
        if (orders > 0) filled.push(c.id);
        return { month, channel: c.id, name: prev?.name ?? c.name, orders, deposit: 0, count: 0, unsettled: null };
      }),
    );
    setFromDaily(filled);
    setSaved(false);
  }, [ledger.loading, daily.loading, ledger.sales, ledger.prevSales, daily.sales, daily.channels, month]);

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

  const fees = channelFees(ledger.sales, ledger.txs, ledger.prevSales);
  const delivery = fees.filter((f) => f.channel !== "hall" && f.feeRate !== null);
  const worst = delivery.length ? delivery.reduce((a, b) => ((b.feeRate ?? 0) > (a.feeRate ?? 0) ? b : a)) : null;
  const hasBank = ledger.txs.some((t) => t.channel && t.in > 0);

  return (
    <>
      <section className="card space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-bold">채널별 실매출 입력</h2>
          <span className="text-xs text-stone-500">{monthLabel(month)} 주문분</span>
        </div>

        <div className="space-y-1 rounded-xl bg-sky-50 px-3 py-2 text-sm text-sky-950 ring-1 ring-sky-200">
          <p className="font-bold">기준: {monthNo}월에 “주문된” 것만 넣어요 (입금된 날 기준이 아니에요)</p>
          <ul className="list-disc space-y-0.5 pl-4 text-[13px]">
            <li>
              <b>주문금액</b> — {monthNo}월 1일~말일에 손님이 결제한 금액 합계
            </li>
            <li>
              <b>정산금액</b> — 그 {monthNo}월 주문분에서 수수료를 빼고 받을(받은) 돈. {nextNo}월 초에 입금되는 월말 주문분도 <b>포함</b>해요
            </li>
            <li>
              <b>월말 미입금액</b>(선택) — {monthNo}월 주문분 중 {monthNo}월 말까지 통장에 <b>아직 안 들어온</b> 돈. 통장 대조에만 써요
            </li>
          </ul>
          <p className="text-[12px] text-sky-900">
            사장님 사이트에서 기간을 {monthNo}월 1일~말일, <b>주문일(거래일) 기준</b>으로 조회한 합계를 넣으세요. 수수료율은 같은 주문분끼리 비교해야 정확해요.
          </p>
        </div>

        {isClosed(ledger.closing) && <Notice tone="warn">마감한 달이에요. 고치면 수정 기록이 남아요.</Notice>}

        <div className="space-y-3">
          {form.map((s, i) => (
            <div key={s.channel} className="rounded-xl bg-stone-50 p-3">
              <input aria-label={`${s.channel} 채널 이름`} className="mb-2 w-full bg-transparent text-sm font-bold outline-none" value={s.name} onChange={(e) => patch(i, { name: e.target.value })} />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <label className="space-y-1 text-[11px] text-stone-500">
                  {channelKind(s.channel, daily.channels) !== "delivery" ? "포스 매출 (주문금액)" : "주문금액"}
                  {fromDaily.includes(s.channel) && <span className="ml-1 rounded bg-emerald-100 px-1 text-[10px] text-emerald-800">일별 합계</span>}
                  <MoneyInput label={`${s.name} 주문금액`} value={s.orders} onChange={(n) => patch(i, { orders: n ?? 0 })} />
                </label>
                {channelKind(s.channel, daily.channels) === "cash" ? null : (
                <label className="space-y-1 text-[11px] text-stone-500">
                  {channelKind(s.channel, daily.channels) === "card" ? "카드 정산금액" : "정산금액"}
                  <MoneyInput label={`${s.name} 정산금액`} value={s.deposit} onChange={(n) => patch(i, { deposit: n ?? 0 })} />
                </label>
                )}
                <label className="space-y-1 text-[11px] text-stone-500">
                  건수
                  <MoneyInput label={`${s.name} 건수`} value={s.count} onChange={(n) => patch(i, { count: n ?? 0 })} />
                </label>
                {channelKind(s.channel, daily.channels) === "cash" ? null : (
                <label className="space-y-1 text-[11px] text-stone-500">
                  월말 미입금액 (선택)
                  <MoneyInput label={`${s.name} 월말 미입금액`} allowEmpty placeholder="모르면 비워 두기" value={s.unsettled ?? null} onChange={(n) => patch(i, { unsettled: n })} />
                </label>
                )}
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
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-bold">앱별 수수료 비교</h2>
          <span className="text-[11px] text-stone-500">{monthNo}월 주문분 기준</span>
        </div>
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
              <table className="w-full min-w-[26rem] text-sm">
                <thead className="text-left text-xs text-stone-500">
                  <tr>
                    <th className="py-1">채널</th>
                    <th className="text-right">주문금액</th>
                    <th className="text-right">수수료</th>
                    <th className="text-right">수수료율</th>
                    <th className="text-right">건당</th>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-stone-500">홀의 카드수수료는 통장 출금(영업비 › 카드수수료)으로 잡혀서 여기서는 계산하지 않아요.</p>
          </>
        )}
      </section>

      {fees.length > 0 && (
        <section className="card space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-bold">통장 입금과 맞춰 보기</h2>
            <span className="text-[11px] text-stone-500">{monthNo}월에 통장에 들어온 돈 기준</span>
          </div>
          <p className="text-sm text-stone-600">
            주문한 날과 입금되는 날이 달라서 따로 봐요. <b>들어와야 할 돈</b> = {Number(prevMonth(month).slice(5))}월 말 미입금액 + {monthNo}월 정산금액 − {monthNo}월 말 미입금액
          </p>
          {!hasBank ? (
            <Notice tone="info">올리기 탭에서 은행 거래내역을 올리면 채널별 입금 합계와 비교해 드려요.</Notice>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead className="text-left text-xs text-stone-500">
                  <tr>
                    <th className="py-1">채널</th>
                    <th className="text-right">지난달 미입금</th>
                    <th className="text-right">정산금액</th>
                    <th className="text-right">월말 미입금</th>
                    <th className="text-right">들어와야 할 돈</th>
                    <th className="text-right">통장 입금</th>
                    <th className="text-right">차이</th>
                  </tr>
                </thead>
                <tbody className="num divide-y divide-stone-100">
                  {fees.map((f) => (
                    <tr key={f.channel}>
                      <td className="py-2 font-semibold">{f.name}</td>
                      <td className="text-right">{num(f.carriedIn)}</td>
                      <td className="text-right">{num(f.deposit)}</td>
                      <td className="text-right">{f.unsettled === null ? <span className="text-stone-400">안 넣음</span> : num(f.unsettled)}</td>
                      <td className="text-right">{num(f.expectedBank)}</td>
                      <td className="text-right">{num(f.bankDeposit)}</td>
                      <td className="text-right">
                        <GapCell fee={f} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-stone-500">
            <b className="text-red-600">빨간색</b>은 월말 미입금액까지 넣었는데도 안 맞는 진짜 차이예요(입금 누락·추가 공제 등 확인). <b className="text-stone-500">회색 “시차 포함”</b>은 월말 미입금액을 안 넣어서 정산 시차가 섞여 있는 숫자예요. 홀은 현금 매출이 있어서 포스 매출과 카드 정산금액이 달라요.
          </p>
        </section>
      )}

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

function GapCell({ fee }: { fee: ChannelFee }) {
  if (fee.gapKind === "없음") return <span className="text-stone-400">–</span>;
  if (fee.gap === 0) return <span className="font-bold text-emerald-700">일치</span>;
  const text = `${fee.gap > 0 ? "+" : "−"}${num(Math.abs(fee.gap))}`;
  if (fee.gapKind === "시차 포함") {
    return (
      <span className="text-stone-500">
        {text} <span className="text-[10px]">시차 포함</span>
      </span>
    );
  }
  return <span className="font-bold text-red-600">{text}</span>;
}
