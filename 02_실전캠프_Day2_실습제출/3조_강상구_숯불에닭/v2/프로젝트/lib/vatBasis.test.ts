import { describe, expect, it } from "vitest";
import type { Purchase } from "./costing/purchases";
import { hasInputVat, vatBasisFrom } from "./vatBasis";

const line = (name: string, amount: number, o: Partial<Purchase["lines"][number]> = {}) => ({ name, unitPrice: amount, qty: 1, amount, category: "원재료비" as const, itemId: null, itemQty: 0, ...o });

describe("공급가 손익 재료", () => {
  it("영수증으로 재료비 공급가 비율과 의제매입세액을 구한다", () => {
    const ps: Purchase[] = [
      { id: "a", date: "2026-10-01", vendor: "으뜸", discount: 0, vat: 0, lines: [line("닭", 1_080_000)] }, // 면세 영수증
      { id: "b", date: "2026-10-02", vendor: "마트", discount: 0, vat: 1_000, lines: [line("계란", 10_000, { taxFree: true }), line("소스", 11_000), line("락스", 5_000, { category: "소모품비" })] },
    ];
    const v = vatBasisFrom(ps);
    expect(v.taxFreeMaterial).toBe(1_090_000);
    expect(v.deemedInput).toBe(Math.round((1_090_000 * 8) / 108));
    // 부가세 1,000원은 과세 줄(소스 11,000·락스 5,000)에 금액 비례로 → 소스 몫 688원
    expect(v.materialSupplyRatio).toBeCloseTo((1_080_000 + 10_000 + 10_312) / (1_080_000 + 10_000 + 11_000), 6);
  });
  it("영수증이 없으면 비율 1 (부가세 모름)", () => {
    expect(vatBasisFrom([])).toEqual({ materialSupplyRatio: 1, deemedInput: 0, taxFreeMaterial: 0 });
  });
  it("공제되는 비용·안 되는 비용", () => {
    expect([hasInputVat("임대료", "관리비"), hasInputVat("영업비", "차량유지관리비"), hasInputVat("영업비", "접대비"), hasInputVat("영업비", "카드수수료"), hasInputVat("노무관리비", "복리후생비")]).toEqual([true, false, false, false, true]);
  });
});
