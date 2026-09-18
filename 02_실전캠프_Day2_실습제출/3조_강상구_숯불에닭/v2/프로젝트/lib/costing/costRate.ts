import type { BaseUnit, Item, Menu, PosSalesReport, Recipe } from "./types";

// 원가율 (A안): 포스 판매량 × 레시피 원가 = 이론 재료비. 통장의 실제 재료비와 비교한다.
// 시세/로스 분해는 입고 단가·실사 재고가 있어야 하므로 B안(재고 원장)에서.

const DIM: Record<BaseUnit, "mass" | "volume" | "count"> = { kg: "mass", g: "mass", L: "volume", ml: "volume", ea: "count" };
const TO_BASE: Record<BaseUnit, number> = { kg: 1, g: 0.001, L: 1, ml: 0.001, ea: 1 };

export class UnitMismatchError extends Error {}

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
    cost += convert(l.quantity, l.unit, item.baseUnit) * item.standardCost;
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
}

export interface CostRateReport {
  month: string;
  salesAmount: number; // 포스 매출 합계 (원가율 분모)
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
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const pct = (a: number, b: number) => (b > 0 ? r1((a / b) * 100) : null);

export function buildCostRateReport(pos: PosSalesReport, menus: Menu[], recipes: Recipe[], items: Item[], actualCost: number): CostRateReport {
  const byCode = new Map(menus.filter((m) => m.posCode).map((m) => [m.posCode!, m]));
  const byName = new Map(menus.map((m) => [m.name.replace(/\s+/g, ""), m]));
  const recipeBy = pickRecipes(recipes, pos.periodEnd);
  const usage = new Map<string, { quantity: number; cost: number }>();

  const rows: MenuCostRow[] = pos.lines.map((l) => {
    const menu = byCode.get(l.code) ?? byName.get(l.name.replace(/\s+/g, "")) ?? null;
    const recipe = menu ? recipeBy.get(menu.id) : undefined;
    if (!menu || !recipe || recipe.lines.length === 0) {
      return { code: l.code, name: l.name, menuId: menu?.id ?? null, quantity: l.quantity, amount: l.amount, unitCost: null, theoreticalCost: 0, costRate: null, marginPerUnit: null };
    }
    const { cost } = recipeUnitCost(recipe, items);
    for (const rl of recipe.lines) {
      const item = items.find((i) => i.id === rl.itemId);
      if (!item) continue;
      const q = convert(rl.quantity, rl.unit, item.baseUnit) * l.quantity;
      const u = usage.get(item.id) ?? { quantity: 0, cost: 0 };
      u.quantity += q;
      u.cost += q * item.standardCost;
      usage.set(item.id, u);
    }
    const theoretical = cost * l.quantity;
    const unitPrice = l.quantity > 0 ? l.amount / l.quantity : 0;
    return { code: l.code, name: l.name, menuId: menu.id, quantity: l.quantity, amount: l.amount, unitCost: cost, theoreticalCost: theoretical, costRate: pct(theoretical, l.amount), marginPerUnit: l.quantity > 0 ? Math.round(unitPrice - cost) : null };
  });

  const covered = rows.filter((r) => r.unitCost !== null);
  const unmapped = rows.filter((r) => r.unitCost === null && r.amount > 0);
  const coveredAmount = covered.reduce((a, r) => a + r.amount, 0);
  const theoreticalCost = Math.round(covered.reduce((a, r) => a + r.theoreticalCost, 0));
  const theoreticalRate = pct(theoreticalCost, coveredAmount);
  const estimatedTotalCost = theoreticalRate === null ? theoreticalCost : Math.round((pos.totalAmount * theoreticalRate) / 100);
  const actualRate = pct(actualCost, pos.totalAmount);

  return {
    month: pos.month,
    salesAmount: pos.totalAmount,
    coveredAmount,
    coverage: pct(coveredAmount, pos.totalAmount),
    theoreticalCost,
    theoreticalRate,
    estimatedTotalCost,
    actualCost,
    actualRate,
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
