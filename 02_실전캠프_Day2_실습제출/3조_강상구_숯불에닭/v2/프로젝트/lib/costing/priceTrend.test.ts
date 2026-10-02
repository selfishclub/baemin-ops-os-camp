import { describe, expect, it } from "vitest";
import { priceTrends } from "./priceTrend";
import type { Purchase, PurchaseLine } from "./purchases";
import type { Item } from "./types";

const items: Item[] = [
  { id: "chicken", name: "닭다리살", baseUnit: "kg", standardCost: 8000, category: "meat", active: true },
  { id: "egg", name: "특란", baseUnit: "ea", standardCost: 250, category: "produce", active: true },
];
const line = (itemId: string | null, amount: number, itemQty: number): PurchaseLine => ({ name: itemId ?? "기타", unitPrice: amount, qty: 1, amount, category: "원재료비", itemId, itemQty });
const buy = (date: string, lines: PurchaseLine[], discount = 0): Purchase => ({ id: date, date, vendor: "가나식품", lines, discount });

describe("매입 단가 흐름", () => {
  const ps = [
    buy("2026-09-20", [line("chicken", 90_000, 10)]),
    buy("2026-08-05", [line("chicken", 80_000, 10), line("egg", 7_500, 30), line(null, 5_000, 0)]),
    buy("2026-09-01", [line("chicken", 88_000, 10)], 0),
  ];
  const t = priceTrends(ps, items);

  it("날짜순으로 품목 단가를 모은다 (연결 안 한 줄은 뺀다)", () => {
    const c = t.find((x) => x.item.id === "chicken")!;
    expect(c.points.map((p) => [p.date, p.unitCost])).toEqual([
      ["2026-08-05", 8000],
      ["2026-09-01", 8800],
      ["2026-09-20", 9000],
    ]);
    expect(c.changePct).toBe(12.5);
    expect(t).toHaveLength(2);
  });

  it("돈을 많이 쓴 품목이 먼저", () => {
    expect(t.map((x) => x.item.id)).toEqual(["chicken", "egg"]);
  });

  it("한 번만 산 품목은 변화율이 없다", () => {
    expect(t.find((x) => x.item.id === "egg")!.changePct).toBeNull();
  });

  it("할인은 단가에 비례해서 반영", () => {
    const d = priceTrends([buy("2026-09-02", [line("chicken", 100_000, 10)], 10_000)], items);
    expect(d[0].last).toBe(9000);
  });
});
