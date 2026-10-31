import { describe, expect, it } from "vitest";
import { countedQuantity, guessPackSizes, packSizeOf, putStockLine, recommendCountable, stockAdjustedCost, valueStock } from "./stock";
import type { Purchase, PurchaseLine } from "./purchases";
import type { Item, StockCount } from "./types";

const item = (id: string, name: string, baseUnit: Item["baseUnit"], standardCost: number, extra: Partial<Item> = {}): Item => ({
  id, name, baseUnit, standardCost, category: "etc", active: true, countable: true, ...extra,
});
const line = (itemId: string, qty: number, itemQty: number, amount: number): PurchaseLine => ({
  name: "", unitPrice: 0, qty, amount, category: "원재료비", itemId, itemQty,
});
const purchase = (date: string, lines: PurchaseLine[]): Purchase => ({ id: date, date, vendor: "으뜸식품", lines, discount: 0 });

const 원육 = item("it_dak", "닭갈비 원육", "kg", 8200, { yieldRate: 0.85, category: "meat" });
const 소스 = item("it_sauce", "찍어소스", "kg", 17500, { category: "sauce" });
const 카스 = item("it_cass", "카스", "ea", 1975, { category: "drink" });

describe("박스 환산 짐작", () => {
  // 영수증에 "찍어소스 (5팩)(10kg)" 1박스 → 1박스 = 10kg
  const purchases = [
    purchase("2026-10-02", [line("it_sauce", 1, 10, 175_000), line("it_cass", 100, 100, 197_500)]),
    purchase("2026-10-20", [line("it_sauce", 2, 20, 350_000)]),
  ];

  it("최근 매입의 itemQty ÷ qty 로 센다", () => {
    expect(guessPackSizes(purchases).get("it_sauce")).toBe(10);
  });

  it("낱개로 사는 것(박스 = 1)은 넣지 않는다 — 박스 칸을 띄울 필요가 없다", () => {
    expect(guessPackSizes(purchases).has("it_cass")).toBe(false);
  });

  it("사장님이 품목에 적어 둔 값이 짐작보다 앞선다", () => {
    const sizes = guessPackSizes(purchases);
    expect(packSizeOf(소스, sizes)).toBe(10);
    expect(packSizeOf({ ...소스, packSize: 4 }, sizes)).toBe(4);
    expect(packSizeOf(카스, sizes)).toBeNull();
  });
});

describe("실사 수량", () => {
  it("박스 + 낱개를 baseUnit 으로 바꾼다", () => {
    expect(countedQuantity({ itemId: "it_sauce", packs: 2, units: 3 }, 10)).toBe(23);
  });

  it("박스 환산이 없으면 박스 칸은 낱개로 본다", () => {
    expect(countedQuantity({ itemId: "it_cass", packs: 24, units: null }, null)).toBe(24);
  });

  it("둘 다 비어 있으면 '안 셌다'(null)고, 0은 '세 봤는데 없다'(0)다", () => {
    expect(countedQuantity({ itemId: "it_sauce", packs: null, units: null }, 10)).toBeNull();
    expect(countedQuantity({ itemId: "it_sauce", packs: 0, units: 0 }, 10)).toBe(0);
  });
});

describe("재고 금액", () => {
  const items = [원육, 소스, 카스];
  const count: StockCount = {
    month: "2026-10",
    countedOn: "2026-11-01",
    lines: [
      { itemId: "it_dak", packs: null, units: 30 },
      { itemId: "it_sauce", packs: 2, units: 0 },
    ],
  };

  it("수량 × 기준단가로 매긴다 — 수율로 나누지 않는다 (냉장고에 있는 건 발라내기 전이다)", () => {
    const v = valueStock(count, items, guessPackSizes([purchase("2026-10-02", [line("it_sauce", 1, 10, 175_000)])]))!;
    // 원육 30kg × 8,200 = 246,000 (수율 85%를 쓰면 289,412 이 되어 버린다)
    expect(v.rows.find((r) => r.itemId === "it_dak")!.amount).toBe(246_000);
    expect(v.rows.find((r) => r.itemId === "it_sauce")!.quantity).toBe(20);
    expect(v.total).toBe(246_000 + 350_000);
  });

  it("셀 품목인데 안 센 것을 집어 준다", () => {
    const v = valueStock(count, items, new Map())!;
    expect(v.missing.map((m) => m.name)).toEqual(["카스"]);
    expect(v.counted).toBe(2);
  });

  it("셀 품목이 아닌 것은 실사에 줄이 있어도 세지 않는다", () => {
    const v = valueStock(count, [원육, { ...소스, countable: false }, 카스], new Map())!;
    expect(v.rows.map((r) => r.itemId)).toEqual(["it_dak"]);
  });

  it("실사가 없으면 null", () => {
    expect(valueStock(null, items, new Map())).toBeNull();
  });
});

describe("실사 한 줄 넣기", () => {
  const base = { month: "2026-10", countedOn: "2026-11-01" };

  it("박스를 넣고 바로 낱개를 넣어도 둘 다 남는다", () => {
    const one = putStockLine(null, base, "it_coal", { packs: 2 });
    const two = putStockLine(one, base, "it_coal", { units: 4 });
    expect(two.lines).toEqual([{ itemId: "it_coal", packs: 2, units: 4 }]);
  });

  it("둘 다 비우면 줄을 지워 '안 셌다'로 돌린다", () => {
    const one = putStockLine(null, base, "it_coal", { packs: 2 });
    const two = putStockLine(one, base, "it_coal", { packs: null });
    expect(two.lines).toEqual([]);
  });

  it("0은 지우지 않는다 — '세 봤는데 없다'다", () => {
    const sheet = putStockLine(null, base, "it_coal", { packs: 0, units: 0 });
    expect(sheet.lines).toEqual([{ itemId: "it_coal", packs: 0, units: 0 }]);
  });

  it("다른 품목 줄은 건드리지 않는다", () => {
    const one = putStockLine(null, base, "it_a", { units: 1 });
    const two = putStockLine(one, base, "it_b", { units: 2 });
    expect(two.lines).toHaveLength(2);
    expect(two.countedOn).toBe("2026-11-01");
  });
});

describe("재고 반영 원가", () => {
  const base = { purchased: 12_109_617, revenue: 38_399_091, theoretical: 11_903_718 };

  it("매입 + 전월말 − 당월말", () => {
    const r = stockAdjustedCost({ ...base, opening: 5_000_000, closing: 2_500_000 });
    expect(r.adjusted).toBe(12_109_617 + 5_000_000 - 2_500_000);
    expect(r.change).toBe(-2_500_000); // 재고를 꺼내 썼다
    expect(r.rate).toBe(38.0);
  });

  it("전월말 재고가 없으면 보정하지 않는다 (첫 달)", () => {
    const r = stockAdjustedCost({ ...base, opening: null, closing: 2_500_000 });
    expect(r.adjusted).toBeNull();
    expect(r.rate).toBeNull();
    expect(r.change).toBeNull();
  });

  it("로스 = 재고 반영 원가 − 레시피 이론 사용량", () => {
    const r = stockAdjustedCost({ ...base, opening: 3_000_000, closing: 3_000_000 });
    expect(r.loss).toBe(12_109_617 - 11_903_718);
    expect(r.lossRate).toBe(0.5);
  });

  it("매출이 0이면 비율은 null", () => {
    const r = stockAdjustedCost({ ...base, revenue: 0, opening: 0, closing: 0 });
    expect(r.rate).toBeNull();
    expect(r.lossRate).toBeNull();
  });
});

describe("처음 켤 품목 추천", () => {
  const items = [원육, 소스, 카스, item("it_onion", "양파", "kg", 2000, { category: "produce", countable: false })].map((i) => ({ ...i, countable: false }));
  const purchases = [
    purchase("2026-10-02", [line("it_dak", 20, 20, 4_092_000), line("it_sauce", 1, 10, 350_000), line("it_cass", 100, 100, 869_000), line("it_onion", 10, 10, 302_000)]),
  ];

  it("금액 큰 순서로 고르고 상하는 것(채소·계란)은 뺀다", () => {
    const ids = recommendCountable(items, purchases, 3);
    expect(ids).toEqual(["it_dak", "it_cass", "it_sauce"]);
  });

  it("기준단가가 없는 품목은 금액을 매길 수 없어 뺀다", () => {
    const ids = recommendCountable(items.map((i) => (i.id === "it_cass" ? { ...i, standardCost: 0 } : i)), purchases, 3);
    expect(ids).not.toContain("it_cass");
  });
});
