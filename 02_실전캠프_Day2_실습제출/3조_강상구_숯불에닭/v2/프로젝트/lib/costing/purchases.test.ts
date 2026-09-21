import { describe, expect, it } from "vitest";
import { applyPurchaseToItems, guessItemQty, lineNet, lineUnitCost, purchaseTotal, summarizePurchases, type Purchase } from "./purchases";
import type { Item } from "./types";

const items: Item[] = [
  { id: "egg", name: "특란", baseUnit: "ea", standardCost: 0, category: "produce", active: true },
  { id: "radish", name: "단무지", baseUnit: "kg", standardCost: 2000, category: "produce", active: true },
];

// 가짜 영수증: 특란 30구 × 5 = 34,900, 단무지 2.6kg × 4 = 19,920, 세제 8,980, 할인 −6,380 → 57,420
const p: Purchase = {
  id: "p1",
  date: "2026-09-17",
  vendor: "가짜마트",
  discount: 6_380,
  lines: [
    { name: "특란 30구", unitPrice: 6_980, qty: 5, amount: 34_900, category: "원재료비", itemId: "egg", itemQty: 150 },
    { name: "반달단무지 2.6kg", unitPrice: 4_980, qty: 4, amount: 19_920, category: "원재료비", itemId: "radish", itemQty: 10.4 },
    { name: "주방세제 13kg", unitPrice: 8_980, qty: 1, amount: 8_980, category: "소모품비", itemId: null, itemQty: 0 },
  ],
};

describe("매입 영수증", () => {
  it("합계 = 줄 합 − 할인, 할인은 줄마다 비례", () => {
    expect(purchaseTotal(p)).toBe(57_420);
    expect(lineNet(p, p.lines[0])).toBe(31_410); // 34,900 × 57,420/63,800
    expect(lineNet(p, p.lines[2])).toBe(8_082);
  });
  it("연결한 품목의 단가 = 할인 반영 금액 ÷ 품목 수량", () => {
    expect(lineUnitCost(p, p.lines[0])).toBe(209.4); // 원/개
    expect(lineUnitCost(p, p.lines[1])).toBe(1_723.8); // 원/kg
    expect(lineUnitCost(p, p.lines[2])).toBeNull();
  });
  it("저장하면 기준단가가 최근 매입가로 바뀐다", () => {
    const r = applyPurchaseToItems(items, p);
    expect(r.items.find((i) => i.id === "egg")!.standardCost).toBe(209.4);
    expect(r.items.find((i) => i.id === "radish")!.standardCost).toBe(1_723.8);
    expect(r.updated.map((u) => u.name)).toEqual(["특란", "단무지"]);
  });
  it("달 요약: 합계·분류별·거래처별·품목별", () => {
    const s = summarizePurchases([p, { ...p, id: "p2", vendor: "가짜상회", discount: 0, lines: [p.lines[2]] }]);
    expect(s.total).toBe(57_420 + 8_980);
    expect(s.byCategory.원재료비).toBe(31_410 + 17_928);
    expect(s.byCategory.소모품비).toBe(8_082 + 8_980);
    expect(s.byVendor[0]).toEqual({ vendor: "가짜마트", total: 57_420, count: 1 });
    expect(s.byItem.find((i) => i.itemId === "egg")).toEqual({ itemId: "egg", net: 31_410, qty: 150 });
  });
  it("상품명에서 품목 수량을 짐작한다", () => {
    expect(guessItemQty("특란 30구", 5, "ea")).toBe(150);
    expect(guessItemQty("청연)반달단무지 2.6kg", 4, "kg")).toBe(10.4);
    expect(guessItemQty("청양고추(특) 1kg/봉", 1, "g")).toBe(1000);
    expect(guessItemQty("환타 355ml", 2, "ml")).toBe(710);
    expect(guessItemQty("비트", 1, "kg")).toBeNull();
    expect(guessItemQty("애호박 1개", 1, "ea")).toBe(1);
  });
});

describe("최근 매입가만 기준단가로", () => {
  const egg = { id: "egg", name: "특란", baseUnit: "ea" as const, standardCost: 230, category: "etc" as const, active: true };
  const buy = (id: string, date: string, amount: number, qty: number) => ({ id, date, vendor: "가짜", discount: 0, memo: "", lines: [{ name: "특란 30구", unitPrice: amount, qty: 1, amount, category: "원재료비" as const, itemId: "egg", itemQty: qty }] });
  it("더 늦게 산 기록이 있으면 지난 영수증으로 바꾸지 않는다", () => {
    const newer = buy("b", "2026-08-19", 34500, 150);
    const older = buy("a", "2026-08-12", 66300, 300);
    expect(applyPurchaseToItems([egg], older, [newer, older]).updated).toEqual([]);
  });
  it("가장 최근이면 바꾼다", () => {
    const newer = buy("b", "2026-08-19", 33000, 150);
    const older = buy("a", "2026-08-12", 66300, 300);
    expect(applyPurchaseToItems([egg], newer, [newer, older]).items[0].standardCost).toBe(220);
  });
});
