import { describe, expect, it } from "vitest";
import type { Pnl } from "./pnl";
import type { TaxNotice } from "./taxNotices";
import type { Transaction } from "./types";
import { cardDeductRatio, cardSpendOf, historyMonthVat, prepaidOf, previousReturn, vatPeriodOf, vatReturnPreview } from "./vatReturn";

const vat = (o: Partial<NonNullable<Pnl["vat"]>>): Pnl["vat"] => ({
  output: 0, input: 0, inputSource: "어림", inputCard: null, invoiceSupply: null, salesGross: 0, cardBase: 0, taxFreeMaterial: 0, deemed: 0, cardCredit: 0, due: 0, paid: 0, ...o,
});

describe("부가세 신고 미리보기", () => {
  it("기수: 1~6월은 1기, 7~12월은 2기", () => {
    expect(vatPeriodOf("2026-10")).toMatchObject({ label: "2026년 2기", start: "2026-07-01", end: "2026-12-31" });
    expect(vatPeriodOf("2026-03").months).toEqual(["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"]);
  });

  it("달마다 모아 신고서 칸으로 — 카드 매출·기타 매출, 세금계산서·카드 매입, 의제매입, 카드 공제 한도, 예정고지", () => {
    const period = vatPeriodOf("2026-10");
    const rows = [
      // 9월: 홈택스 있음
      { month: "2026-09", empty: false, vat: vat({ salesGross: 44_000_000, cardBase: 43_000_000, output: 4_000_000, inputSource: "홈택스", input: 1_500_000, inputCard: 300_000, invoiceSupply: 12_000_000, taxFreeMaterial: 5_400_000, deemed: 400_000 }) },
      // 10월: 홈택스 없음 → 어림
      { month: "2026-10", empty: false, vat: vat({ salesGross: 11_000_000, cardBase: 11_000_000, output: 1_000_000, input: 200_000 }) },
      { month: "2026-08", empty: true, vat: vat({}) },
    ];
    const notices: TaxNotice[] = [{ id: "n", kind: "부가세", title: "2026년 2기 부가세 예정고지", amount: 1_450_660, due: "2026-11-02", addedAt: "2026-10-26" }];
    const p = vatReturnPreview(period, rows, notices);
    expect(p.covered.map((c) => [c.month, c.hometax])).toEqual([["2026-09", true], ["2026-10", false]]);
    expect(p.cardSales[1]).toBe(43_000_000 - Math.round(43_000_000 / 1.1) + 1_000_000);
    expect(p.output[1]).toBe(5_000_000);
    expect(p.output[0] + p.output[1]).toBe(55_000_000);
    expect(p.invoice).toEqual([12_000_000, 1_200_000]);
    expect(p.cardPurchase).toEqual([3_000_000, 300_000]);
    expect(p.estimatedInput[1]).toBe(200_000);
    expect(p.input[1]).toBe(1_500_000 + 200_000 + 400_000);
    expect(p.payable).toBe(5_000_000 - 2_100_000);
    // 카드 공제: 5,400만 × 1.3% = 702,000. 1기에 3,368,667 썼으니 남은 한도 6,631,333 안
    expect(p.cardCredit).toEqual([54_000_000, 702_000]);
    expect(p.cardCreditCapLeft).toBe(10_000_000 - 3_368_667);
    expect(p.prepaid).toBe(1_450_660);
    expect(p.due).toBe(2_900_000 - 702_000 - 1_450_660);
    expect(p.previous?.label).toBe("2026년 1기");
  });

  it("예정고지는 그 기수 안에 기한이 있는 부가세 예정고지만", () => {
    const n = (title: string, due: string, kind: TaxNotice["kind"] = "부가세"): TaxNotice => ({ id: due, kind, title, amount: 100, due, addedAt: due });
    expect(prepaidOf(vatPeriodOf("2026-10"), [n("2기 예정고지", "2026-11-02"), n("1기 예정고지", "2026-04-25"), n("확정", "2026-07-25"), n("중간예납 예정", "2026-11-30", "종합소득세")])).toBe(100);
  });
});

describe("장부 쓰기 전 달 — 지난 매출 + 홈택스", () => {
  it("매출은 홀+배달 합(부가세 포함), 카드 몫은 지난 신고 비율, 매입은 홈택스 + 카드 평균 어림", () => {
    const days = [
      { date: "2026-07-01", hall: 1_000_000, receipts: 10, customers: 10, baemin: 100_000, coupang: 0 },
      { date: "2026-07-02", hall: 0, receipts: 0, customers: 0, baemin: 0, coupang: 0 },
      { date: "2026-08-01", hall: 999_999, receipts: 1, customers: 1 },
    ];
    const hm = { month: "2026-07", taxCount: 2, freeCount: 1, supply: 15_000_000, vat: 1_000_000, freeSupply: 5_000_000, freeGoods: 5_400_000, vendors: [] };
    const prev = previousReturn(vatPeriodOf("2026-07"))!.actual;
    const v = historyMonthVat("2026-07", days, hm, prev)!;
    expect(v).toMatchObject({ salesGross: 1_100_000, output: 100_000, inputSource: "홈택스", invoiceSupply: 10_000_000, taxFreeMaterial: 5_400_000, deemed: 400_000 });
    expect(v.inputCard).toBe(Math.round(1_651_337 / 6));
    expect(v.input).toBe(1_000_000 + Math.round(1_651_337 / 6));
    expect(v.cardBase).toBeGreaterThan(1_085_000);
    expect(historyMonthVat("2026-09", days, null, prev)).toBeNull();
  });
});

describe("통장만 있는 달의 카드로 산 것", () => {
  it("체크카드 결제 합계 × 지난 기수 공제 비율", () => {
    const prev = previousReturn(vatPeriodOf("2026-07"))!.actual;
    const t = (id: string, payee: string, out: number, date = "2026-07-10") => ({ id, date, payee, out, in: 0, source: "bank", month: date.slice(0, 7), major: null, minor: null, channel: null, review: null }) as Transaction;
    const txs = [t("a", "NH체크 홈마트", 110_000), t("b", "NH체크 홈마트", -10_000), t("c", "NH콕송금 누구", 50_000), t("d", "NH체크 다이소", 30_000, "2026-08-01")];
    expect(cardSpendOf(txs, "2026-07")).toBe(100_000);
    const ratio = cardDeductRatio(prev, 23_307_889)!;
    expect(ratio).toBeCloseTo(0.8404, 3);
    const v = historyMonthVat("2026-07", [{ date: "2026-07-01", hall: 1_100_000, receipts: 1, customers: 1 }], null, prev, { spend: 1_100_000, ratio: 1 })!;
    expect(v.input).toBe(Math.round(prev.invoice[1] / 6) + 100_000);
  });
});
