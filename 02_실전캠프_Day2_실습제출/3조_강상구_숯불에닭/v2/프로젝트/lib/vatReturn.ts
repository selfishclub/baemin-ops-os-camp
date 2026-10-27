// 부가세 신고 미리보기 (2026-10-27, 복식장부 4단계)
//  - 세무사님 신고서(일반과세자 부가가치세 신고서)와 같은 칸 번호로, 과세기간(1기 1~6월, 2기 7~12월) 달마다 손익의 부가세 계산을 모은다
//  - 신고는 세무사님이 한다. 이건 "얼마쯤 나올지" 미리 보는 것 — 칸 이름·계산은 26년 1기 신고서에 맞췄다
import { CARD_CREDIT_RATE, CARD_CREDIT_YEAR_CAP } from "./vatBasis";
import type { Pnl } from "./pnl";
import type { TaxNotice } from "./taxNotices";
import type { Month } from "./types";

export interface VatPeriod {
  year: number;
  half: 1 | 2;
  label: string; // "2026년 2기"
  months: Month[];
  start: string;
  end: string;
}

export function vatPeriodOf(month: Month): VatPeriod {
  const year = Number(month.slice(0, 4));
  const half = Number(month.slice(5, 7)) <= 6 ? 1 : 2;
  const first = half === 1 ? 1 : 7;
  const months = Array.from({ length: 6 }, (_, i) => `${year}-${String(first + i).padStart(2, "0")}`);
  return { year, half, label: `${year}년 ${half}기`, months, start: `${months[0]}-01`, end: half === 1 ? `${year}-06-30` : `${year}-12-31` };
}

// 세무사님 신고서 실제 숫자 — 미리보기 옆에 견줘 보고, 카드 매출 세액공제 1년 한도에서 앞 기수 몫을 뺀다
export interface VatReturnActual {
  cardSales: [number, number]; // (3) 신용카드·현금영수증 발행분 [금액, 세액]
  otherSales: [number, number]; // (4) 기타
  invoice: [number, number]; // (10) 세금계산서 수취분 일반매입
  cardPurchase: [number, number]; // (44) 신용카드매출전표등 수령 일반매입
  deemed: [number, number]; // (46) 의제매입세액
  cardCredit: [number, number]; // (20) 신용카드매출전표등 발행공제 [바탕(부가세 포함), 공제액]
  prepaid: number; // (24) 예정고지세액
  due: number; // (30) 차가감 납부할 세액
}
export const ACTUAL_RETURNS: Record<string, VatReturnActual> = {
  "2026-1": {
    cardSales: [235_571_327, 23_557_132],
    otherSales: [2_214_020, 221_402],
    invoice: [70_697_584, 7_069_814],
    cardPurchase: [17_936_972, 1_651_337],
    deemed: [40_254_550, 2_981_818],
    cardCredit: [259_128_248, 3_368_667],
    prepaid: 2_601_000,
    due: 6_105_898,
  },
};
const periodKey = (p: Pick<VatPeriod, "year" | "half">) => `${p.year}-${p.half}`;

export interface VatReturnMonthInput {
  month: Month;
  vat: Pnl["vat"];
  empty: boolean;
}

export interface VatReturnPreview {
  period: VatPeriod;
  covered: { month: Month; sales: boolean; hometax: boolean }[]; // 이 기수에서 지금까지 본 달
  cardSales: [number, number];
  otherSales: [number, number];
  output: [number, number]; // (9) 합계 ㉮
  invoice: [number, number];
  cardPurchase: [number, number];
  estimatedInput: [number, number]; // 홈택스 자료가 없는 달의 비용 ÷1.1 어림 (세금계산서·카드 구분 못 함)
  deemed: [number, number];
  input: [number, number]; // (18) 차감계 ㉯
  payable: number; // ㉰ = ㉮ − ㉯
  cardCredit: [number, number]; // (20)
  cardCreditCapLeft: number; // 올해 남은 한도
  prepaid: number; // (24) 예정고지세액
  due: number; // (30) 차가감 납부할 세액
  actual: VatReturnActual | null; // 같은 기수 세무사님 신고서가 있으면
  previous: { label: string; actual: VatReturnActual } | null; // 바로 앞 기수 신고서 (견줘 보기)
}

const add = (a: [number, number], s: number, t: number): [number, number] => [a[0] + s, a[1] + t];
const supplyOf = (gross: number) => Math.round(gross / 1.1);

/** 그 기수의 예정고지세액 — 세금 고지서 칸에 넣은 부가세 예정고지 중 납부기한이 이 기수 안인 것 */
export function prepaidOf(period: VatPeriod, notices: TaxNotice[]): number {
  return notices.filter((n) => n.kind === "부가세" && /예정/.test(n.title) && n.due >= period.start && n.due <= period.end).reduce((a, n) => a + n.amount, 0);
}

export function vatReturnPreview(period: VatPeriod, rows: VatReturnMonthInput[], notices: TaxNotice[] = []): VatReturnPreview {
  let cardSales: [number, number] = [0, 0];
  let otherSales: [number, number] = [0, 0];
  let invoice: [number, number] = [0, 0];
  let cardPurchase: [number, number] = [0, 0];
  let estimatedInput: [number, number] = [0, 0];
  let deemed: [number, number] = [0, 0];
  let cardBase = 0;
  const covered: VatReturnPreview["covered"] = [];
  for (const r of rows) {
    if (!period.months.includes(r.month) || r.empty || !r.vat) continue;
    const v = r.vat;
    covered.push({ month: r.month, sales: v.salesGross > 0, hometax: v.inputSource === "홈택스" });
    // 매출: 카드·현금영수증·배달앱 결제는 (3), 나머지(영수증 없는 현금·계좌이체)는 (4). 세액은 달 매출 부가세를 나눈다
    const cardTax = v.cardBase - supplyOf(v.cardBase);
    cardSales = add(cardSales, supplyOf(v.cardBase), cardTax);
    otherSales = add(otherSales, v.salesGross - v.cardBase - (v.output - cardTax), v.output - cardTax);
    cardBase += v.cardBase;
    if (v.inputSource === "홈택스") {
      const card = v.inputCard ?? 0;
      invoice = add(invoice, v.invoiceSupply ?? 0, v.input - card);
      cardPurchase = add(cardPurchase, card * 10, card);
    } else estimatedInput = add(estimatedInput, v.input * 10, v.input);
    deemed = add(deemed, v.taxFreeMaterial, v.deemed);
  }
  const output = add(cardSales, otherSales[0], otherSales[1]);
  const input: [number, number] = [invoice[0] + cardPurchase[0] + estimatedInput[0] + deemed[0], invoice[1] + cardPurchase[1] + estimatedInput[1] + deemed[1]];
  const payable = output[1] - input[1];
  // 카드 매출 세액공제: 1.3%, 1년 1,000만 원 한도(앞 기수에 쓴 만큼 뺀다), 납부세액을 넘을 수 없다
  const usedEarlier = period.half === 2 ? (ACTUAL_RETURNS[periodKey({ year: period.year, half: 1 })]?.cardCredit[1] ?? 0) : 0;
  const capLeft = Math.max(0, CARD_CREDIT_YEAR_CAP - usedEarlier);
  const credit = Math.max(0, Math.min(Math.round(cardBase * CARD_CREDIT_RATE), capLeft, payable));
  const prepaid = prepaidOf(period, notices);
  return {
    period,
    covered,
    cardSales,
    otherSales,
    output,
    invoice,
    cardPurchase,
    estimatedInput,
    deemed,
    input,
    payable,
    cardCredit: [cardBase, credit],
    cardCreditCapLeft: capLeft,
    prepaid,
    due: payable - credit - prepaid,
    actual: ACTUAL_RETURNS[periodKey(period)] ?? null,
    previous: (() => {
      const prev = period.half === 2 ? { year: period.year, half: 1 as const } : { year: period.year - 1, half: 2 as const };
      const actual = ACTUAL_RETURNS[periodKey(prev)];
      return actual ? { label: `${prev.year}년 ${prev.half}기`, actual } : null;
    })(),
  };
}
