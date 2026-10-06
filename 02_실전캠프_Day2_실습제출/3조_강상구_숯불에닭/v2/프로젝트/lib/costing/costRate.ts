import type { BaseUnit, Item, Menu, PosSalesReport, Recipe } from "./types";

// 원가율 (A안): 포스 판매량 × 레시피 원가 = 이론 재료비. 통장의 실제 재료비와 비교한다.
// 시세/로스 분해는 입고 단가·실사 재고가 있어야 하므로 B안(재고 원장)에서.

const DIM: Record<BaseUnit, "mass" | "volume" | "count"> = { kg: "mass", g: "mass", L: "volume", ml: "volume", ea: "count" };
const TO_BASE: Record<BaseUnit, number> = { kg: 1, g: 0.001, L: 1, ml: 0.001, ea: 1 };

export class UnitMismatchError extends Error {}

/** 레시피에 쓸 1단위 원가 — 매입 단가를 수율로 나눈 값. 수율이 없으면 매입 단가 그대로 */
export function usableCost(item: Item): number {
  const y = item.yieldRate;
  if (!y || y <= 0 || y > 1) return item.standardCost;
  return item.standardCost / y;
}

export function convert(quantity: number, from: BaseUnit, to: BaseUnit): number {
  if (from === to) return quantity;
  if (DIM[from] !== DIM[to]) throw new UnitMismatchError(`단위를 바꿀 수 없어요: ${from} → ${to}`);
  return (quantity * TO_BASE[from]) / TO_BASE[to];
}

// 판매일 기준으로 유효한 레시피 (레시피는 바뀌니 effectiveFrom이 가장 최근인 것)
export function pickRecipes(recipes: Recipe[], date: string): Map<string, Recipe> {
  const by = new Map<string, Recipe>();
  for (const r of recipes) {
    if (r.effectiveFrom > date) continue;
    const cur = by.get(r.menuId);
    if (!cur || r.effectiveFrom > cur.effectiveFrom) by.set(r.menuId, r);
  }
  return by;
}

// 메뉴 1개의 레시피 원가 (기준단가 기준)
export function recipeUnitCost(recipe: Recipe, items: Item[]): { cost: number; missingItems: string[] } {
  let cost = 0;
  const missing: string[] = [];
  for (const l of recipe.lines) {
    const item = items.find((i) => i.id === l.itemId);
    if (!item) {
      missing.push(l.itemId);
      continue;
    }
    cost += convert(l.quantity, l.unit, item.baseUnit) * usableCost(item);
  }
  return { cost: Math.round(cost), missingItems: missing };
}

export interface MenuCostRow {
  code: string;
  name: string;
  menuId: string | null;
  quantity: number;
  amount: number; // 실매출액
  unitCost: number | null; // 1개 이론 원가. 레시피 없으면 null
  theoreticalCost: number; // quantity × unitCost
  costRate: number | null; // theoreticalCost ÷ amount %
  marginPerUnit: number | null; // 판매단가 − 원가
  listPrice: number | null; // 차림표 제값 (안 넣었으면 null)
  giveaway: number | null; // 제값 × 판매수량 − 실매출. 서비스·할인으로 안 받은 돈
  giveawayQty: number | null; // 그게 몇 개분인지
}

export interface CostRateReport {
  month: string;
  salesAmount: number; // 포스 매출 합계 (이론 원가율 분모)
  revenueAmount: number; // 실제 원가율 분모 — 포스에 안 찍히는 매출(배달앱·계좌이체·실물현금·제로페이)까지 더한 그 달 총매출
  offPos: number; // 그중 포스에 안 찍힌 몫 (안내용)
  coveredAmount: number; // 레시피가 있는 메뉴의 매출
  coverage: number | null; // coveredAmount ÷ salesAmount %
  theoreticalCost: number; // 레시피 있는 메뉴의 이론 재료비
  theoreticalRate: number | null; // theoreticalCost ÷ coveredAmount %
  estimatedTotalCost: number; // 레시피 없는 메뉴도 같은 원가율이라고 보고 늘린 어림치
  actualCost: number; // 통장의 실제 재료비 (매출원가)
  actualRate: number | null; // actualCost ÷ salesAmount %
  gap: number; // actual − estimatedTotal
  gapRate: number | null; // %p
  rows: MenuCostRow[]; // 원가율 높은 순
  unmapped: MenuCostRow[]; // 레시피 없음 (포스 코드로 메뉴 못 찾음 또는 레시피 미등록)
  itemUsage: { itemId: string; name: string; unit: BaseUnit; quantity: number; cost: number }[]; // 품목별 이론 사용량·원가
  // 서비스·할인으로 안 받은 돈 (정가를 넣은 메뉴만)
  giveaway: number;
  giveawayFull: number; // 그 메뉴들을 전부 제값에 팔았다면 나왔을 매출
  giveawayRate: number | null; // giveaway ÷ giveawayFull %
  pricedMenus: number; // 정가를 넣은 메뉴 수
}

// 차림표 제값이 있으면 "제값에 다 팔았다면 얼마"와 실매출의 차이를 낸다.
// 서비스로 준 것과 깎아 준 것이 섞여 있어 둘을 나누지는 못한다.
function giveawayOf(menu: Menu | null, quantity: number, amount: number) {
  const list = menu?.listPrice;
  if (!list || list <= 0 || quantity <= 0) return { listPrice: null, giveaway: null, giveawayQty: null };
  const full = list * quantity;
  const gap = Math.max(0, full - amount); // 제값보다 많이 받았으면(가격 인상 등) 0
  return { listPrice: list, giveaway: gap, giveawayQty: r1(gap / list) };
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const pct = (a: number, b: number) => (b > 0 ? r1((a / b) * 100) : null);

//  totalRevenue: 그 달 총매출(모든 채널). 통장 재료비는 배달앱 음식까지 만든 값이라
//    포스 매출만 분모로 쓰면 실제 원가율이 부풀어 보인다. 안 넘기면 포스 매출을 쓴다.
export function buildCostRateReport(pos: PosSalesReport, menus: Menu[], recipes: Recipe[], items: Item[], actualCost: number, totalRevenue?: number): CostRateReport {
  const byCode = new Map(menus.filter((m) => m.posCode).map((m) => [m.posCode!, m]));
  const byName = new Map(menus.map((m) => [m.name.replace(/\s+/g, ""), m]));
  const recipeBy = pickRecipes(recipes, pos.periodEnd);
  const usage = new Map<string, { quantity: number; cost: number }>();

  const rows: MenuCostRow[] = pos.lines.map((l) => {
    const menu = byCode.get(l.code) ?? byName.get(l.name.replace(/\s+/g, "")) ?? null;
    const recipe = menu ? recipeBy.get(menu.id) : undefined;
    if (!menu || !recipe || recipe.lines.length === 0) {
      return { code: l.code, name: l.name, menuId: menu?.id ?? null, quantity: l.quantity, amount: l.amount, unitCost: null, theoreticalCost: 0, costRate: null, marginPerUnit: null, ...giveawayOf(menu, l.quantity, l.amount) };
    }
    const { cost } = recipeUnitCost(recipe, items);
    for (const rl of recipe.lines) {
      const item = items.find((i) => i.id === rl.itemId);
      if (!item) continue;
      const q = convert(rl.quantity, rl.unit, item.baseUnit) * l.quantity;
      const u = usage.get(item.id) ?? { quantity: 0, cost: 0 };
      u.quantity += q;
      u.cost += q * usableCost(item);
      usage.set(item.id, u);
    }
    const theoretical = cost * l.quantity;
    const unitPrice = l.quantity > 0 ? l.amount / l.quantity : 0;
    return { code: l.code, name: l.name, menuId: menu.id, quantity: l.quantity, amount: l.amount, unitCost: cost, theoreticalCost: theoretical, costRate: pct(theoretical, l.amount), marginPerUnit: l.quantity > 0 ? Math.round(unitPrice - cost) : null, ...giveawayOf(menu, l.quantity, l.amount) };
  });

  const covered = rows.filter((r) => r.unitCost !== null);
  const unmapped = rows.filter((r) => r.unitCost === null && r.amount > 0);
  const coveredAmount = covered.reduce((a, r) => a + r.amount, 0);
  const theoreticalCost = Math.round(covered.reduce((a, r) => a + r.theoreticalCost, 0));
  const theoreticalRate = pct(theoreticalCost, coveredAmount);
  // 실제 재료비는 포스에 안 찍히는 매출(배달앱 등)의 음식까지 만든 값이라 그 매출도 분모에 넣는다
  const revenueAmount = totalRevenue && totalRevenue > pos.totalAmount ? totalRevenue : pos.totalAmount;
  const estimatedTotalCost = theoreticalRate === null ? theoreticalCost : Math.round((revenueAmount * theoreticalRate) / 100);
  const actualRate = pct(actualCost, revenueAmount);
  const priced = rows.filter((r) => r.listPrice !== null);
  const giveaway = priced.reduce((a, r) => a + (r.giveaway ?? 0), 0);
  const giveawayFull = priced.reduce((a, r) => a + r.listPrice! * r.quantity, 0);

  return {
    month: pos.month,
    salesAmount: pos.totalAmount,
    revenueAmount,
    offPos: revenueAmount - pos.totalAmount,
    coveredAmount,
    coverage: pct(coveredAmount, pos.totalAmount),
    theoreticalCost,
    theoreticalRate,
    estimatedTotalCost,
    actualCost,
    actualRate,
    giveaway,
    giveawayFull,
    giveawayRate: pct(giveaway, giveawayFull),
    pricedMenus: priced.length,
    gap: actualCost - estimatedTotalCost,
    gapRate: actualRate === null || theoreticalRate === null ? null : r1(actualRate - theoreticalRate),
    rows: covered.sort((a, b) => (b.costRate ?? 0) - (a.costRate ?? 0)),
    unmapped: unmapped.sort((a, b) => b.amount - a.amount),
    itemUsage: [...usage.entries()]
      .map(([itemId, u]) => {
        const item = items.find((i) => i.id === itemId)!;
        return { itemId, name: item.name, unit: item.baseUnit, quantity: Math.round(u.quantity * 100) / 100, cost: Math.round(u.cost) };
      })
      .sort((a, b) => b.cost - a.cost),
  };
}
