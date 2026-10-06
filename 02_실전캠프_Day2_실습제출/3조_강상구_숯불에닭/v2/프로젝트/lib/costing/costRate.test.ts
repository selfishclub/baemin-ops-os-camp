import { describe, expect, it } from "vitest";
import { buildCostRateReport } from "./costRate";
import type { Item, Menu, PosSalesReport, Recipe } from "./types";

describe("포스에 안 찍히는 매출도 분모에 (배달앱 등)", () => {
  // 통장 재료비는 배달앱 음식까지 만든 값이라, 포스 매출만 분모로 쓰면 실제 원가율이 부풀어 보인다
  const pos: PosSalesReport = {
    month: "2026-09", periodStart: "2026-09-01", periodEnd: "2026-09-30",
    lines: [{ code: "A", name: "닭갈비", amount: 1_000_000, quantity: 100 }],
    totalAmount: 1_000_000, totalQuantity: 100,
  };
  const menus: Menu[] = [{ id: "m1", name: "닭갈비", posCode: "A", price: 10_000, active: true }];
  const recipes: Recipe[] = [{ menuId: "m1", effectiveFrom: "2026-01-01", lines: [{ itemId: "i1", unit: "g", quantity: 300 }] }];
  const items: Item[] = [{ id: "i1", name: "원육", baseUnit: "kg", standardCost: 10_000, category: "meat", active: true }];

  it("총매출을 안 넘기면 포스 매출로 나눈다 (예전 그대로)", () => {
    const r = buildCostRateReport(pos, menus, recipes, items, 400_000);
    expect(r.revenueAmount).toBe(1_000_000);
    expect(r.offPos).toBe(0);
    expect(r.actualRate).toBe(40);
  });

  it("배달앱까지 넣으면 실제 원가율이 내려간다", () => {
    const r = buildCostRateReport(pos, menus, recipes, items, 400_000, 1_250_000);
    expect(r.revenueAmount).toBe(1_250_000);
    expect(r.offPos).toBe(250_000);
    expect(r.actualRate).toBe(32); // 400,000 ÷ 1,250,000
  });

  it("이론 원가율은 그대로고, 어림 재료비만 총매출 기준으로 늘어난다", () => {
    const r = buildCostRateReport(pos, menus, recipes, items, 400_000, 1_250_000);
    expect(r.theoreticalRate).toBe(30); // 300g × 10,000원/kg × 100개 ÷ 100만
    expect(r.estimatedTotalCost).toBe(375_000); // 125만 × 30%
    expect(r.gap).toBe(25_000);
  });

  it("총매출이 포스보다 작게 들어오면(아직 덜 넣음) 포스 매출을 쓴다", () => {
    const r = buildCostRateReport(pos, menus, recipes, items, 400_000, 800_000);
    expect(r.revenueAmount).toBe(1_000_000);
  });
});

import { recipeUnitCost, usableCost } from "./costRate";

describe("수율 — 산 것 중 실제로 쓰는 몫", () => {
  const 원육 = (yieldRate?: number): Item => ({ id: "i1", name: "닭갈비 원육", baseUnit: "kg", standardCost: 8676, category: "meat", active: true, yieldRate });

  it("수율이 없으면 매입 단가 그대로", () => {
    expect(usableCost(원육())).toBe(8676);
  });

  it("수율 85%면 실제로 쓰는 1kg은 그만큼 비싸다", () => {
    expect(Math.round(usableCost(원육(0.85)))).toBe(10207); // 8,676 ÷ 0.85
  });

  it("레시피 원가에 수율이 반영된다", () => {
    const r: Recipe = { menuId: "m1", effectiveFrom: "2026-01-01", lines: [{ itemId: "i1", unit: "g", quantity: 350 }] };
    expect(recipeUnitCost(r, [원육()]).cost).toBe(3037); // 350g × 8,676원/kg
    expect(recipeUnitCost(r, [원육(0.85)]).cost).toBe(3572); // 손질 로스까지 치면
  });

  it("말이 안 되는 수율은 무시하고 매입 단가를 쓴다", () => {
    expect(usableCost(원육(0))).toBe(8676);
    expect(usableCost(원육(-0.5))).toBe(8676);
    expect(usableCost(원육(1.5))).toBe(8676);
  });

  it("수율 100%는 안 넣은 것과 같다", () => {
    expect(usableCost(원육(1))).toBe(8676);
  });
});
