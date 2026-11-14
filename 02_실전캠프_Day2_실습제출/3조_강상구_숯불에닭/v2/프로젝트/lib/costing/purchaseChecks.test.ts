import { describe, expect, it } from "vitest";
import { checkPurchase, checkPurchases, taxableAmount, usualUnitCost } from "./purchaseChecks";
import type { Purchase, PurchaseLine } from "./purchases";
import type { Item } from "./types";

const item = (id: string, name: string, baseUnit: Item["baseUnit"] = "ea"): Item =>
  ({ id, name, baseUnit, standardCost: 0, category: "etc", active: true });

const line = (p: Partial<PurchaseLine> & { name: string; amount: number }): PurchaseLine =>
  ({ unitPrice: 0, qty: 1, category: "원재료비", itemId: null, itemQty: 0, ...p });

const buy = (id: string, date: string, vendor: string, lines: PurchaseLine[], extra: Partial<Purchase> = {}): Purchase =>
  ({ id, date, vendor, lines, discount: 0, ...extra });

const COLA = item("it_cola", "코카콜라");
const CHICKEN = item("it_chicken", "닭갈비 원육", "kg");

describe("부가세 빈 영수증 (2026-11-11 코카콜라음료 실제 건)", () => {
  it("과세 줄이 있는데 부가세가 비면 알리고, 넣을 값까지 알려 준다", () => {
    const p = buy("p1", "2026-11-11", "코카콜라음료", [line({ name: "코카콜라 510PET ×24", amount: 22_200, itemId: COLA.id, itemQty: 24 })]);
    const [issue] = checkPurchase(p, [COLA]);
    expect(issue.kind).toBe("vat-empty");
    expect(issue.suggest).toBe(2_018); // 22,200 ÷ 11
    expect(issue.message).toContain("10% 비싸게");
  });

  it("부가세가 들어 있으면 조용하다", () => {
    const p = buy("p1", "2026-11-11", "코카콜라음료", [line({ name: "코카콜라", amount: 22_200, itemId: COLA.id, itemQty: 24 })], { vat: 2_018 });
    expect(checkPurchase(p, [COLA]).filter((i) => i.kind === "vat-empty")).toEqual([]);
  });

  it("모든 줄이 면세면 부가세가 없어도 안 묻는다 (으뜸식품 닭)", () => {
    const p = buy("p2", "2026-11-10", "으뜸식품", [line({ name: "닭갈비(드럼) 국내산", amount: 164_000, taxFree: true })]);
    expect(checkPurchase(p, [CHICKEN])).toEqual([]);
  });

  it("면세와 과세가 섞이면 과세 몫으로만 센다 (홈마트)", () => {
    const p = buy("p3", "2026-10-29", "홈마트(청주점)", [
      line({ name: "특란 30구", amount: 39_900, taxFree: true }),
      line({ name: "구포국수 3kg", amount: 14_940 }),
    ]);
    expect(taxableAmount(p)).toBe(14_940);
    expect(checkPurchase(p, []).find((i) => i.kind === "vat-empty")?.suggest).toBe(1_358);
  });
});

describe("박스 수와 낱개 수를 바꿔 넣은 줄", () => {
  it("묶음 수가 품목 수량보다 크면 바꿔 넣은 것으로 본다 (2026-10-28 qty 24 · itemQty 48 → 경고 없음, 24 > 48 아님)", () => {
    const ok = buy("p1", "2026-10-28", "코카콜라음료", [line({ name: "코카콜라", amount: 44_200, qty: 24, itemQty: 48, itemId: COLA.id })], { vat: 4_018 });
    expect(checkPurchase(ok, [COLA]).filter((i) => i.kind === "qty-swapped")).toEqual([]);
  });

  it("2박스인데 품목 수량 2로 넣으면 안 걸리지만, 24묶음 1개로 넣으면 걸린다", () => {
    const bad = buy("p2", "2026-11-11", "코카콜라음료", [line({ name: "코카콜라 ×24", amount: 22_200, qty: 24, itemQty: 1, itemId: COLA.id })], { vat: 2_018 });
    const i = checkPurchase(bad, [COLA]).find((x) => x.kind === "qty-swapped")!;
    expect(i.message).toContain("바꿔 넣지 않았나요");
  });

  it("kg 품목은 한 봉이 1kg 미만일 수 있어 묻지 않는다 (날치알 1봉 0.8kg · 애호박 2개 0.66kg)", () => {
    const ROE = item("it_roe", "날치알", "kg");
    const SQUASH = item("it_squash", "애호박", "kg");
    const p = buy("p3", "2026-11-08", "홈마트(청주점)", [
      line({ name: "날치알(레드)", amount: 16_000, qty: 1, itemQty: 0.8, itemId: ROE.id, taxFree: true }),
      line({ name: "인큐애호박", amount: 1_960, qty: 2, itemQty: 0.66, itemId: SQUASH.id, taxFree: true }),
    ]);
    expect(checkPurchase(p, [ROE, SQUASH]).filter((x) => x.kind === "qty-swapped")).toEqual([]);
  });
});

describe("품목 연결을 빠뜨린 줄 (2026-11-11 코크제로 실제 건)", () => {
  const ZERO = item("it_zero", "코카콜라제로");

  it("금액이 큰데 품목 이름이 줄에 들어 있으면 연결하라고 알린다", () => {
    const p = buy("p1", "2026-11-11", "코카콜라음료", [line({ name: "코카콜라제로 510PET ×24", amount: 22_200 })], { vat: 2_018 });
    expect(checkPurchase(p, [ZERO]).map((i) => i.kind)).toContain("item-unlinked");
  });

  it("잡화 같은 작은 줄은 묻지 않는다", () => {
    const p = buy("p2", "2026-11-09", "다이소", [line({ name: "이쑤시개", amount: 1_000 })], { vat: 91 });
    expect(checkPurchase(p, [ZERO])).toEqual([]);
  });

  it("연결은 했는데 품목 수량이 0이면 알린다", () => {
    const p = buy("p3", "2026-10-25", "쿠팡", [line({ name: "코카콜라 제로", amount: 16_170, itemId: ZERO.id, itemQty: 0 })], { vat: 1_470 });
    expect(checkPurchase(p, [ZERO]).map((i) => i.kind)).toContain("item-qty-zero");
  });
});

describe("평소와 단가가 크게 다른 줄", () => {
  const past = [
    buy("a", "2026-10-07", "코카콜라음료", [line({ name: "코카콜라", amount: 22_200, itemId: COLA.id, itemQty: 24 })], { vat: 2_018 }),
    buy("b", "2026-10-14", "코카콜라음료", [line({ name: "코카콜라", amount: 22_200, itemId: COLA.id, itemQty: 24 })], { vat: 2_018 }),
  ];

  it("평소 925원인데 22,200원으로 들어오면 잡는다", () => {
    const bad = buy("c", "2026-11-11", "코카콜라음료", [line({ name: "코카콜라", amount: 22_200, itemId: COLA.id, itemQty: 1 })], { vat: 2_018 });
    const i = checkPurchase(bad, [COLA], past).find((x) => x.kind === "cost-outlier")!;
    expect(i.suggest).toBe(925);
    expect(i.message).toContain("평소는 925원");
  });

  it("값이 조금 올랐을 뿐이면 안 묻는다", () => {
    const ok = buy("c", "2026-11-11", "코카콜라음료", [line({ name: "코카콜라", amount: 24_000, itemId: COLA.id, itemQty: 24 })], { vat: 2_182 });
    expect(checkPurchase(ok, [COLA], past).filter((x) => x.kind === "cost-outlier")).toEqual([]);
  });

  it("처음 사는 품목은 견줄 데가 없어 묻지 않는다", () => {
    const first = buy("c", "2026-11-11", "어디", [line({ name: "닭갈비 원육", amount: 99_000, itemId: CHICKEN.id, itemQty: 10 })], { vat: 9_000 });
    expect(usualUnitCost(CHICKEN.id, [])).toBeNull();
    expect(checkPurchase(first, [CHICKEN], []).filter((x) => x.kind === "cost-outlier")).toEqual([]);
  });

  it("견줄 자료가 한 건뿐이면 묻지 않는다 — 어느 쪽이 틀렸는지 알 수 없다", () => {
    expect(usualUnitCost(COLA.id, [past[0]])).toBeNull();
    const bad = buy("c", "2026-11-11", "코카콜라음료", [line({ name: "코카콜라", amount: 22_200, itemId: COLA.id, itemQty: 1 })], { vat: 2_018 });
    expect(checkPurchase(bad, [COLA], [past[0]]).filter((x) => x.kind === "cost-outlier")).toEqual([]);
  });
});

describe("한 달치 한꺼번에", () => {
  it("자기 자신과는 견주지 않는다", () => {
    const ps = [
      buy("a", "2026-11-04", "코카콜라음료", [line({ name: "코카콜라", amount: 22_200, itemId: COLA.id, itemQty: 24 })], { vat: 2_018 }),
      buy("b", "2026-11-11", "코카콜라음료", [line({ name: "코카콜라", amount: 22_200, itemId: COLA.id, itemQty: 24 })], { vat: 2_018 }),
    ];
    expect(checkPurchases(ps, [COLA])).toEqual([]);
  });

  it("멀쩡한 장은 두고 문제 있는 장만 집어낸다", () => {
    const ok = (id: string, date: string) =>
      buy(id, date, "코카콜라음료", [line({ name: "코카콜라", amount: 22_200, itemId: COLA.id, itemQty: 24 })], { vat: 2_018 });
    const ps = [
      ok("a", "2026-11-04"),
      ok("b", "2026-11-06"),
      ok("c", "2026-11-09"),
      buy("d", "2026-11-11", "코카콜라음료", [line({ name: "코카콜라", amount: 22_200, itemId: COLA.id, itemQty: 1 })]),
    ];
    const found = checkPurchases(ps, [COLA]);
    expect([...new Set(found.map((i) => i.purchaseId))]).toEqual(["d"]);
    expect(found.map((i) => i.kind).sort()).toEqual(["cost-outlier", "vat-empty"]);
  });
});
