"use client";

import { useEffect, useMemo, useState } from "react";
import { useMonth } from "@/components/AppShell";
import { ConfirmDialog, MoneyInput, Notice } from "@/components/ui";
import { useLedger } from "@/components/useLedger";
import { useDaily } from "@/components/useDaily";
import SettlementSection from "@/components/SettlementSection";
import { useSettlement } from "@/components/useSettlement";
import { BaeminSettleSection } from "@/components/BaeminSettleSection";
import { CardSalesSection } from "@/components/CardSalesSection";
import { IncomingSection } from "@/components/IncomingSection";
import { monthChannelTotals } from "@/lib/daily";
import { channelKind } from "@/lib/categories";
import { channelFees, type ChannelFee } from "@/lib/channels";
import { num, pctText, won } from "@/lib/format";
import { isClosed, monthLabel, nextMonth, prevMonth } from "@/lib/month";
import { sampleChannelSales } from "@/lib/seed";
import { getStore } from "@/lib/storage";
import { isBasic } from "@/lib/edition";
import type { ChannelSale } from "@/lib/types";
import { checkChannelSale, type Issue } from "@/lib/validate";

// 「지난 입금 확인」에서 눌러 펴는 것들. full = 사장님 PC(전체판)에만 있는 것
const REVIEW_TABS = [
  { id: "fee", label: "수수료 집계", full: false },
  { id: "card", label: "카드사 대조", full: true },
  { id: "baemin", label: "배민 정산", full: true },
  { id: "coupang", label: "쿠팡이츠 정산", full: true },
] as const;

export default function ChannelsPage() {
  const { month } = useMonth();
  const ledger = useLedger(month);
  const daily = useDaily(month);
  const [form, setForm] = useState<ChannelSale[]>([]);
  const [fromDaily, setFromDaily] = useState<string[]>([]);
  const settlement = useSettlement(month, ledger, daily);
  const autoChannels = settlement.results.map((r) => r.channel);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [openReview, setOpenReview] = useState<(typeof REVIEW_TABS)[number]["id"] | null>(null);
  // 평소엔 "이상 없음"만 보이게 — 볼 게 있을 때만 숫자를 띄운다
  const review = useMemo(() => {
    const rs = settlement.results;
    return {
      missing: rs.reduce((a, r) => a + r.missing, 0),
      stray: rs.reduce((a, r) => a + r.unmatchedDeposits.length, 0),
      fee: rs.reduce((a, r) => a + r.fee, 0),
    };
  }, [settlement.results]);
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

  const fees = channelFees(settlement.effectiveSales, ledger.txs, ledger.prevSales);
  const manualFees = fees.filter((f) => !autoChannels.includes(f.channel) && channelKind(f.channel, daily.channels) !== "cash");
  const hasBank = ledger.txs.some((t) => t.channel && t.in > 0);

  return (
    <>
      {/* 오늘·내일·모레 통장에 들어올 카드 돈 — 캐시노트 당일 입금예정액과 같은 것을 우리 자료로 센다 (11/17) */}
      {!isBasic() && <IncomingSection month={month} rules={settlement.rules} holidays={settlement.holidays} txs={[...ledger.txs, ...ledger.nextTxs]} results={settlement.results} />}

      {/* 지난 입금 확인 — 전에 따로따로 펼쳐 두던 네 덩어리(수수료 집계·카드사 대조·배민·쿠팡)를
          한 줄로 모았다. 평소엔 "이상 없음"만 보면 되고, 볼 일이 있을 때만 눌러서 편다 (사장님 요청 11/17) */}
      <section className="card space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold">지난 입금 확인</h2>
          <span className="text-xs text-stone-500">{monthLabel(month)} 주문분</span>
        </div>
        {review.missing > 0 || review.stray > 0 ? (
          <Notice tone="warn">
            {review.missing > 0 && <>입금일이 지났는데 안 들어온 돈 <b className="num">{won(review.missing)}</b>{review.stray > 0 && " · "}</>}
            {review.stray > 0 && <>매출과 짝이 안 맞는 입금 <b className="num">{review.stray}건</b></>} — 아래에서 확인해 주세요.
          </Notice>
        ) : (
          <Notice tone="ok">
            통장과 다 맞아요. {monthLabel(month)} 확인된 수수료 <b className="num">{won(review.fee)}</b>.
          </Notice>
        )}
        <div className="flex flex-wrap gap-2">
          {REVIEW_TABS.filter((t) => !t.full || !isBasic()).map((t) => (
            <button key={t.id} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${openReview === t.id ? "bg-orange-600 text-white" : "bg-stone-100 text-stone-700 hover:bg-stone-200"}`} onClick={() => setOpenReview(openReview === t.id ? null : t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </section>

      {openReview === "fee" && <SettlementSection month={month} ledger={ledger} daily={daily} settlement={settlement} show="results" />}
      {openReview === "card" && !isBasic() && <CardSalesSection month={month} txs={[...ledger.txs, ...ledger.nextTxs]} lastBankDate={ledger.lastBankDate} sales={daily.sales} />}
      {openReview === "baemin" && !isBasic() && <BaeminSettleSection platform="baemin" month={month} txs={ledger.txs} nextTxs={ledger.nextTxs} sales={ledger.sales} onSaved={ledger.reload} />}
      {openReview === "coupang" && !isBasic() && <BaeminSettleSection platform="coupang" month={month} txs={ledger.txs} nextTxs={ledger.nextTxs} sales={ledger.sales} onSaved={ledger.reload} />}

      <section className="card space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-bold">{autoChannels.length ? "직접 입력 (규칙이 없는 채널)" : "직접 입력 — 규칙이 없을 때만 쓰는 예비 칸"}</h2>
          <span className="text-xs text-stone-500">{monthLabel(month)} 주문분</span>
        </div>

        <Notice tone="warn">
          <b>통장에 들어온 돈을 넣는 곳이 아니에요.</b> 통장 입금은 올리기 탭에서 은행 엑셀을 올리면 자동으로 읽어요. 여기는 정산 규칙이 없는 채널만, 각 앱 사장님 사이트의 <b>월 합계</b>(주문금액·정산금액)를 손으로 넣는 예비 칸이에요.
          {autoChannels.length === 0 && " 규칙 탭의 “정산 규칙”에서 기본 규칙을 넣으면 이 칸은 거의 사라져요."}
        </Notice>

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
          <p className="text-xs text-sky-900">
            사장님 사이트에서 기간을 {monthNo}월 1일~말일, <b>주문일(거래일) 기준</b>으로 조회한 합계를 넣으세요. 수수료율은 같은 주문분끼리 비교해야 정확해요.
          </p>
        </div>

        {isClosed(ledger.closing) && <Notice tone="warn">마감한 달이에요. 고치면 수정 기록이 남아요.</Notice>}

        {autoChannels.length > 0 && <Notice tone="info">규칙이 있는 채널({autoChannels.map((id) => form.find((f) => f.channel === id)?.name ?? id).join(", ")})은 위에서 자동으로 집계돼요. 아래는 규칙이 없는 채널만 직접 넣습니다.</Notice>}
        <div className="space-y-3">
          {form.map((s, i) => autoChannels.includes(s.channel) ? null : (
            <div key={s.channel} className="rounded-xl bg-stone-50 p-3">
              <input aria-label={`${s.channel} 채널 이름`} className="mb-2 w-full bg-transparent text-sm font-bold outline-none" value={s.name} onChange={(e) => patch(i, { name: e.target.value })} />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <label className="space-y-1 text-xs text-stone-500">
                  {channelKind(s.channel, daily.channels) !== "delivery" ? "포스 매출 (주문금액)" : "주문금액"}
                  {fromDaily.includes(s.channel) && <span className="ml-1 rounded bg-emerald-100 px-1 text-[11px] text-emerald-800">일별 합계</span>}
                  <MoneyInput label={`${s.name} 주문금액`} value={s.orders} onChange={(n) => patch(i, { orders: n ?? 0 })} />
                </label>
                {channelKind(s.channel, daily.channels) === "cash" ? null : (
                <label className="space-y-1 text-xs text-stone-500">
                  {channelKind(s.channel, daily.channels) === "card" ? "카드 정산금액" : "정산금액"}
                  <MoneyInput label={`${s.name} 정산금액`} value={s.deposit} onChange={(n) => patch(i, { deposit: n ?? 0 })} />
                </label>
                )}
                <label className="space-y-1 text-xs text-stone-500">
                  건수
                  <MoneyInput label={`${s.name} 건수`} value={s.count} onChange={(n) => patch(i, { count: n ?? 0 })} />
                </label>
                {channelKind(s.channel, daily.channels) === "cash" ? null : (
                <label className="space-y-1 text-xs text-stone-500">
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
          {ledger.sales.length === 0 ? (
            <button className="btn-ghost" onClick={() => setForm(sampleChannelSales(month))}>
              가짜 예시 채우기
            </button>
          ) : null}
        </div>
      </section>

      {/* 「앱별 수수료 비교」는 뺐다 (11/17) — 배달앱만 숫자가 나와 16줄 중 2줄뿐이었고,
          그 2줄(수수료율·건당)은 「배민 정산」·「쿠팡이츠 정산」이 중개·결제·배달비·부가세·광고로
          쪼개서 더 자세히 보여 준다. 위 「수수료 집계」와 수수료율이 달라 보이던 것도
          기준이 서로 달라서다 — 아래 주석 참고. */}
      {manualFees.length > 0 && (
        <section className="card space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-bold">통장 입금과 맞춰 보기{autoChannels.length > 0 && " (규칙 없는 채널)"}</h2>
            <span className="text-xs text-stone-500">{monthNo}월에 통장에 들어온 돈 기준</span>
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
                  {manualFees.map((f) => (
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

      {/* 배민·쿠팡 정산 명세는 위 「지난 입금 확인」에서 눌러 펴도록 옮겼다 (11/17) */}

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
        {text} <span className="text-[11px]">시차 포함</span>
      </span>
    );
  }
  return <span className="font-bold text-red-600">{text}</span>;
}
