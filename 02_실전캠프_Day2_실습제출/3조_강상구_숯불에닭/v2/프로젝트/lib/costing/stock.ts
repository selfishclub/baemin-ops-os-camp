import { lineSupply, type Purchase } from "./purchases";
import type { BaseUnit, Item, StockCount, StockCountLine } from "./types";

// 월말 재고 실사 — 그 달 진짜 매출원가를 내려고 냉장고·창고에 남은 것을 센다.
//   재고 반영 원가 = 매입 + 전월말 재고 − 당월말 재고
// 손익의 매출원가는 세무사 장부와 같게 매입 기준 그대로 두고, 이 숫자는 원가율 탭에만 보여 준다.
// (2026-11-01 사장님 — 9월에 소스·냉동육·숯을 269만 더 사고 10월에 쓴 것으로 보이는데,
//  재고를 세지 않으면 그게 재고였는지 로스였는지 가릴 수가 없다.)
//
// 재고 평가는 기준단가(standardCost) 그대로 쓴다. 수율로 나누지 않는다 —
// 냉장고에 있는 것은 뼈·껍질을 발라내기 전 상태다. 수율은 레시피 원가(usableCost)에만 쓴다.

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const pct = (a: number, b: number) => (b > 0 ? round1((a / b) * 100) : null);

/** 월말에 세는 품목 */
export const isCountable = (i: Item) => !!i.countable && i.active !== false;
/** 박스를 부르는 말 */
export const packLabel = (i: Item) => i.packName?.trim() || "박스";

/**
 * 최근 매입 영수증에서 "1박스가 baseUnit 몇 개인가"를 알아낸다.
 * 영수증 줄에 산 묶음 수(qty)와 품목 단위 수량(itemQty)이 같이 있어서 나눗셈 하나로 나온다.
 *   찍어소스 "5팩(10kg)" 1박스 → 10 / 1 = 10kg
 *   비장탄 5박스 45kg → 45 / 5 = 9kg
 * 1 이하는 낱개로 사는 것이라 넣지 않는다 (박스 칸을 띄울 필요가 없다).
 */
export function guessPackSizes(purchases: Purchase[]): Map<string, number> {
  const best = new Map<string, { date: string; size: number }>();
  for (const p of purchases)
    for (const l of p.lines ?? []) {
      if (!l.itemId || l.qty <= 0 || l.itemQty <= 0) continue;
      const size = round2(l.itemQty / l.qty);
      if (size <= 1) continue;
      const cur = best.get(l.itemId);
      if (!cur || p.date > cur.date) best.set(l.itemId, { date: p.date, size });
    }
  return new Map([...best].map(([id, v]) => [id, v.size]));
}

/** 이 품목의 박스 환산 — 사장님이 적어 둔 값이 먼저, 없으면 매입에서 짐작한 값 */
export function packSizeOf(item: Item, guessed: Map<string, number>): number | null {
  if (item.packSize && item.packSize > 1) return item.packSize;
  return guessed.get(item.id) ?? null;
}

/** 실사 한 줄의 baseUnit 수량. 둘 다 비어 있으면 null(= 안 셌다) */
export function countedQuantity(line: StockCountLine, packSize: number | null): number | null {
  if (line.packs === null && line.units === null) return null;
  return round2((line.packs ?? 0) * (packSize ?? 1) + (line.units ?? 0));
}

export interface StockRow {
  itemId: string;
  name: string;
  unit: BaseUnit;
  packs: number | null;
  units: number | null;
  packSize: number | null;
  quantity: number;
  unitCost: number;
  amount: number;
}

export interface StockValue {
  month: string;
  countedOn: string;
  total: number;
  rows: StockRow[];
  counted: number; // 센 품목 수
  missing: { itemId: string; name: string }[]; // 셀 품목인데 아직 안 센 것
}

/** 실사 한 장을 금액으로 매긴다 */
export function valueStock(count: StockCount | null, items: Item[], packSizes: Map<string, number>): StockValue | null {
  if (!count) return null;
  const targets = items.filter(isCountable);
  const byId = new Map(count.lines.map((l) => [l.itemId, l]));
  const rows: StockRow[] = [];
  const missing: { itemId: string; name: string }[] = [];
  for (const it of targets) {
    const line = byId.get(it.id);
    const packSize = packSizeOf(it, packSizes);
    const quantity = line ? countedQuantity(line, packSize) : null;
    if (line === undefined || quantity === null) {
      missing.push({ itemId: it.id, name: it.name });
      continue;
    }
    rows.push({
      itemId: it.id,
      name: it.name,
      unit: it.baseUnit,
      packs: line.packs,
      units: line.units,
      packSize,
      quantity,
      unitCost: it.standardCost,
      amount: Math.round(quantity * it.standardCost),
    });
  }
  return { month: count.month, countedOn: count.countedOn, total: rows.reduce((a, r) => a + r.amount, 0), rows, counted: rows.length, missing };
}

/**
 * 실사 한 장에 한 품목의 수량을 넣는다. 박스·낱개가 둘 다 비면 줄을 지워 "안 셌다"로 남긴다.
 * 넘긴 칸만 고치고 나머지는 그대로 둔다 — 한 줄의 두 칸을 잇따라 고칠 때 하나가 날아가지 않게
 * (2026-11-01: 박스를 넣고 바로 낱개를 넣으면 박스만 남는 버그가 있었다).
 */
export function putStockLine(
  count: StockCount | null,
  base: { month: string; countedOn: string },
  itemId: string,
  patch: Partial<Omit<StockCountLine, "itemId">>,
): StockCount {
  const sheet: StockCount = count ?? { month: base.month, countedOn: base.countedOn, lines: [] };
  const cur = sheet.lines.find((l) => l.itemId === itemId) ?? { itemId, packs: null, units: null };
  const merged: StockCountLine = { ...cur, ...patch };
  const lines = sheet.lines.filter((l) => l.itemId !== itemId);
  if (merged.packs !== null || merged.units !== null) lines.push(merged);
  return { ...sheet, lines };
}

export interface StockAdjustedInput {
  purchased: number; // 매입 기준 원가 (손익의 매출원가)
  opening: number | null; // 전월말 재고
  closing: number | null; // 당월말 재고
  revenue: number; // 그 달 총매출 (공급가)
  theoretical: number; // 레시피 이론 사용량
}

export interface StockAdjusted {
  purchased: number;
  opening: number | null;
  closing: number | null;
  adjusted: number | null; // 매입 + 전월말 − 당월말. 전월말을 모르면 null
  change: number | null; // 당월말 − 전월말 (양수면 쌓았다)
  rate: number | null; // 재고 반영 원가율 %
  theoretical: number;
  loss: number | null; // 재고 반영 원가 − 이론 사용량 (시세·로스)
  lossRate: number | null; // 매출 대비 %p
}

/** 재고를 반영한 그 달 원가와, 거기서 나오는 로스 */
export function stockAdjustedCost(i: StockAdjustedInput): StockAdjusted {
  const base = { purchased: i.purchased, opening: i.opening, closing: i.closing, theoretical: i.theoretical };
  // 전월말 재고가 없으면 보정할 수가 없다 (실사를 시작한 첫 달)
  if (i.opening === null || i.closing === null) return { ...base, adjusted: null, change: null, rate: null, loss: null, lossRate: null };
  const adjusted = i.purchased + i.opening - i.closing;
  const loss = adjusted - i.theoretical;
  return { ...base, adjusted, change: i.closing - i.opening, rate: pct(adjusted, i.revenue), loss, lossRate: pct(loss, i.revenue) };
}

// 상하는 것은 매일 사서 매일 쓰니 세 봐야 재고가 거의 안 움직인다. 쌓이는 것만 센다
const PERISHABLE: Item["category"][] = ["produce"];

/** 처음 켤 품목 추천 — 매입 금액 큰 순서로, 쌓이는 것만 */
export function recommendCountable(items: Item[], purchases: Purchase[], limit = 25): string[] {
  const spent = new Map<string, number>();
  for (const p of purchases)
    for (const l of p.lines ?? []) {
      if (!l.itemId || l.itemQty <= 0) continue;
      spent.set(l.itemId, (spent.get(l.itemId) ?? 0) + lineSupply(p, l));
    }
  return items
    .filter((i) => i.active !== false && i.standardCost > 0 && !PERISHABLE.includes(i.category) && (spent.get(i.id) ?? 0) > 0)
    .sort((a, b) => (spent.get(b.id) ?? 0) - (spent.get(a.id) ?? 0))
    .slice(0, limit)
    .map((i) => i.id);
}
