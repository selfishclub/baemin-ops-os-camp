"use client";

import { useEffect, useState } from "react";
import { num, won } from "@/lib/format";
import { loadMonthPnls } from "@/lib/monthPnl";
import { monthLabel } from "@/lib/month";
import { getStore } from "@/lib/storage";
import { TAX_NOTICES_KEY, type TaxNotice } from "@/lib/taxNotices";
import { vatPeriodOf, vatReturnPreview, type VatReturnActual, type VatReturnPreview } from "@/lib/vatReturn";
import type { Month } from "@/lib/types";

// 부가세 신고 미리보기 — 세무사님 신고서와 같은 칸 번호로, 이 기수(1~6월 / 7~12월)에서 지금 달까지 모은다 (lib/vatReturn.ts)
export function VatReturnCard({ month }: { month: Month }) {
  const [preview, setPreview] = useState<VatReturnPreview | null>(null);

  useEffect(() => {
    setPreview(null);
    const period = vatPeriodOf(month);
    const months = period.months.filter((m) => m <= month);
    // 그 달 날짜의 통장 줄이 없는 달(장부 시작 전)은 뺀다 — 다음 달 통장에서 돌린 비용·며칠 매출만 있어도 매입만 들어가 부가세가 쏠린다
    void Promise.all([loadMonthPnls(getStore(), months), getStore().getSetting<TaxNotice[]>(TAX_NOTICES_KEY)]).then(([rows, notices]) =>
      setPreview(vatReturnPreview(period, rows.map((r) => ({ month: r.month, vat: r.pnl.vat, empty: r.empty || !r.journal.some((e) => e.source === "통장" && e.date.startsWith(r.month)) })), notices ?? [])),
    );
  }, [month]);

  if (!preview) return <section className="card text-sm text-stone-500">부가세 신고 미리보기 모으는 중…</section>;
  const p = preview;
  const prev = p.previous;
  const missing = p.period.months.filter((m) => m <= month && !p.covered.some((c) => c.month === m));
  const noHometax = p.covered.filter((c) => !c.hometax).map((c) => monthLabel(c.month).slice(6));

  const a: VatReturnActual | undefined = prev?.actual;
  const aOutput = a ? a.cardSales[1] + a.otherSales[1] : null;
  const aInput = a ? a.invoice[1] + a.cardPurchase[1] + a.deemed[1] : null;

  return (
    <section className="card space-y-2">
      <h2 className="text-sm font-bold">
        🧾 부가세 신고 미리보기 — {p.period.label}{" "}
        <span className="text-xs font-normal text-stone-500">
          {monthLabel(p.period.months[0]).slice(6)}~{monthLabel(p.period.months[5]).slice(6)} 중 {p.covered.length}달 모음
        </span>
      </h2>
      <div className="overflow-x-auto">
        <table className="num w-full min-w-[30rem] text-xs">
          <thead>
            <tr className="text-stone-500">
              <th className="py-1 text-left">칸</th>
              <th className="text-left">구분</th>
              <th className="text-right">금액</th>
              <th className="text-right">세액</th>
              {prev && <th className="text-right">{prev.label} 실제 세액</th>}
            </tr>
          </thead>
          <tbody>
            <Row showRef={!!prev} no="(3)" label="카드·현금영수증·배달앱 매출" amount={p.cardSales[0]} tax={p.cardSales[1]} refTax={a?.cardSales[1]} />
            <Row showRef={!!prev} no="(4)" label="기타 매출 (영수증 없는 현금·이체)" amount={p.otherSales[0]} tax={p.otherSales[1]} refTax={a?.otherSales[1]} />
            <Row showRef={!!prev} no="(9)" label="매출세액 ㉮" amount={p.output[0]} tax={p.output[1]} refTax={aOutput} strong />
            <Row showRef={!!prev} no="(10)" label="세금계산서 받은 매입 (홈택스)" amount={p.invoice[0]} tax={p.invoice[1]} refTax={a?.invoice[1]} />
            <Row showRef={!!prev} no="(44)" label="카드로 산 것 (신용카드매출전표 수령)" amount={p.cardPurchase[0]} tax={p.cardPurchase[1]} refTax={a?.cardPurchase[1]} />
            {p.estimatedInput[1] > 0 && <Row showRef={!!prev} no="" label="홈택스 자료 없는 달 매입 (비용 ÷1.1 어림)" amount={p.estimatedInput[0]} tax={p.estimatedInput[1]} />}
            <Row showRef={!!prev} no="(46)" label="의제매입세액 (면세 재료 × 8/108)" amount={p.deemed[0]} tax={p.deemed[1]} refTax={a?.deemed[1]} />
            <Row showRef={!!prev} no="(18)" label="매입세액 ㉯" amount={p.input[0]} tax={p.input[1]} refTax={aInput} strong />
            <Row showRef={!!prev} no="㉰" label="납부세액 (㉮ − ㉯)" tax={p.payable} refTax={aOutput !== null && aInput !== null ? aOutput - aInput : null} strong />
            <Row showRef={!!prev} no="(20)" label={`카드 매출 세액공제 (1.3%, 올해 남은 한도 ${num(p.cardCreditCapLeft)})`} amount={p.cardCredit[0]} tax={-p.cardCredit[1]} refTax={a ? -a.cardCredit[1] : null} />
            <Row showRef={!!prev} no="(24)" label="예정고지세액 (세금 고지서 칸)" tax={-p.prepaid} refTax={a ? -a.prepaid : null} />
            <Row showRef={!!prev} no="(30)" label="확정신고 때 더 낼 세액 어림" tax={p.due} refTax={a?.due} strong />
          </tbody>
        </table>
      </div>
      <p className="text-sm">
        지금까지 {p.covered.length}달 몫 부가세 <b className="num">{won(p.payable - p.cardCredit[1])}</b> 중 예정고지로 <b className="num">{won(p.prepaid)}</b> 내고, 확정신고 때 <b className="num">{won(p.due)}</b>쯤 더 낼 것 같아요.
      </p>
      <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-stone-500">
        {missing.length > 0 && <li className="text-amber-700">장부(통장) 자료가 없는 달: {missing.map((m) => monthLabel(m).slice(6)).join("·")} — 이 달들은 빠져 있어요. 홈택스 매입 자료만 있고 매출이 없으면 부가세가 틀리게 나와서요.</li>}
        {noHometax.length > 0 && <li className="text-amber-700">매입세액이 어림인 달: {noHometax.join("·")} — 홈택스 자료가 없거나 아직 다 안 들어온 달이에요(세금계산서는 다음 달 10일까지 들어와요). 11일 이후 손익 탭 &quot;홈택스 매입 자료&quot;에 다시 올리면 실제로 바뀌어요.</li>}
        <li>남은 달이 지나야 6달이 다 차요. 확정신고는 다음 해 1월 25일(1기는 7월 25일)까지 세무사님이 해요.</li>
        <li>
          카드 매출 세액공제는 1년 1,000만 원 한도에서 1기에 쓴 만큼 빼고, 납부세액을 넘지 않게 셌어요. 의제매입 한도·전자신고 세액공제 같은 작은 칸은 빠져 있어요.
        </li>
        {prev && <li>오른쪽 회색 숫자는 세무사님이 신고한 {prev.label} 실제 세액 (6달 치)이에요. 칸마다 크기가 비슷한지 견줘 보세요.</li>}
      </ul>
    </section>
  );
}

function Row({ no, label, amount, tax, refTax, strong = false, showRef }: { no: string; label: string; amount?: number; tax: number; refTax?: number | null; strong?: boolean; showRef: boolean }) {
  return (
    <tr className={`border-t border-stone-100 ${strong ? "font-bold" : ""}`}>
      <td className="py-1 pr-1 text-stone-400">{no}</td>
      <td>{label}</td>
      <td className="text-right">{amount === undefined ? "" : num(amount)}</td>
      <td className="text-right">{num(tax)}</td>
      {showRef && <td className="text-right text-stone-400">{refTax === undefined || refTax === null ? "" : num(refTax)}</td>}
    </tr>
  );
}
