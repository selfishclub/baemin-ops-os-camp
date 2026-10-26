import type { BaseUnit, Item } from "./types";

// 매입 영수증 — 마트·거래처에서 산 것을 품목별로 적는다 (원가율 B안의 첫 단계: 입고).
//  - 원가율(기준단가)은 부가세를 뺀 공급가로, 미지급금은 부가세 포함으로 센다 (2026-10-26).
//  - 손익은 통장 기준이라 여기 금액이 손익에 바로 들어가지는 않는다. 품목별로 얼마나 샀는지, 최근 매입 단가가 얼마인지 보는 용도.
//  - 줄을 원가율 품목에 연결하고 "품목 단위 수량"(예: 특란 30구×5 = 150개, 단무지 2.6kg×4 = 10.4kg)을 적으면
//    그 품목의 기준단가가 최근 매입 단가로 자동 갱신된다. 할인은 줄마다 비례해서 뺀다.
export const PURCHASES_KEY_PREFIX = "purchases_"; // + month

export type PurchaseCategory = "원재료비" | "기타재료비" | "소모품비" | "기타";
export const PURCHASE_CATEGORIES: PurchaseCategory[] = ["원재료비", "기타재료비", "소모품비", "기타"];

export interface PurchaseLine {
  name: string; // 영수증 상품명 그대로
  unitPrice: number;
  qty: number;
  amount: number; // 보통 unitPrice × qty. 영수증 값 우선
  category: PurchaseCategory;
  itemId: string | null; // 원가율 품목 연결
  itemQty: number; // 품목 baseUnit 기준 수량 (연결했을 때만)
  taxFree?: boolean; // 면세 품목 (닭고기·채소·계란 등) — 영수증 부가세를 이 줄에는 나눠 매기지 않는다
}

export interface Purchase {
  id: string;
  date: string;
  vendor: string; // 예: 홈마트
  lines: PurchaseLine[];
  discount: number; // 영수증 할인 합계 (양수)
  memo?: string;
  // 부가세 (2026-10-26 사장님: 재료비·원가율은 공급가, 미지급금은 부가세 포함)
  vat?: number; // 이 영수증의 부가세. 없으면 모름 (공급가 = 금액 그대로로 본다)
  vatExcluded?: boolean; // 줄 금액이 공급가(거래명세표·세금계산서) — 합계 = 줄 합 − 할인 + 부가세
  deposit?: number; // 병·상자 보증금 순액 (낸 것 − 돌려받은 것). 원가가 아니라 미지급금에만 들어간다
}

export const round1 = (n: number) => Math.round(n * 10) / 10;

export const purchaseGross = (p: Purchase) => p.lines.reduce((a, l) => a + l.amount, 0);
/** 줄 합 − 할인 (영수증에 찍힌 금액 그대로: 보통 부가세 포함, vatExcluded면 공급가) */
const goodsNet = (p: Purchase) => Math.max(0, purchaseGross(p) - p.discount);
/** 낸(낼) 돈 = 부가세 포함 합계 */
export const purchaseTotal = (p: Purchase) => goodsNet(p) + (p.vatExcluded ? p.vat ?? 0 : 0);
/** 공급가 합계 = 합계 − 부가세 */
export const purchaseSupply = (p: Purchase) => purchaseTotal(p) - (p.vat ?? 0);
/** 미지급금에 들어갈 돈 = 부가세 포함 합계 + 보증금 순액 */
export const purchasePayable = (p: Purchase) => purchaseTotal(p) + (p.deposit ?? 0);

// 할인을 줄마다 비례 배분한 뒤의 금액 (영수증에 찍힌 기준 — 보통 부가세 포함, vatExcluded면 공급가)
export function lineNet(p: Purchase, line: PurchaseLine): number {
  const gross = purchaseGross(p);
  if (gross <= 0) return 0;
  return Math.round(line.amount * (goodsNet(p) / gross));
}

// 이 줄에 매기는 부가세 — 영수증 부가세를 면세 아닌 줄에 금액 비례로 나눈다 (모르면 0)
export function lineVat(p: Purchase, line: PurchaseLine): number {
  if (!p.vat || line.taxFree) return 0;
  const taxable = p.lines.filter((l) => !l.taxFree).reduce((a, l) => a + lineNet(p, l), 0);
  return taxable > 0 ? Math.round(p.vat * (lineNet(p, line) / taxable)) : 0;
}

/** 줄의 공급가 (원가율·재료비) */
export const lineSupply = (p: Purchase, line: PurchaseLine) => lineNet(p, line) - (p.vatExcluded ? 0 : lineVat(p, line));
/** 줄의 부가세 포함 금액 (통장과 견주는 손익) */
export const lineGrossPaid = (p: Purchase, line: PurchaseLine) => lineNet(p, line) + (p.vatExcluded ? lineVat(p, line) : 0);

const isMaterial = (l: PurchaseLine) => l.category === "원재료비" || l.category === "기타재료비";
/** 그 달 매입 영수증의 재료비 (부가세 포함) — 통장 재료비와 견줘 외상을 찾는 손익용 */
export const materialPaidBasis = (ps: Purchase[]) => ps.reduce((a, p) => a + (p.lines ?? []).filter(isMaterial).reduce((x, l) => x + lineGrossPaid(p, l), 0), 0);

// 품목 단위 단가 (할인 반영, 공급가). itemQty가 없으면 null
export function lineUnitCost(p: Purchase, line: PurchaseLine): number | null {
  if (!line.itemId || line.itemQty <= 0) return null;
  return round1(lineSupply(p, line) / line.itemQty);
}

export function unitLabel(u: BaseUnit): string {
  return u === "ea" ? "개" : u;
}

// 영수증을 저장할 때: 연결된 품목의 기준단가를 이 영수증의 단가로 바꾼다 (가장 최근 매입가가 기준단가)
//  - others: 다른 매입 영수증들. 이 품목을 이 영수증보다 늦은 날짜에 산 기록이 있으면 바꾸지 않는다
//    (지난 영수증을 나중에 넣어도 더 최근 매입가를 덮어쓰지 않게)
export function applyPurchaseToItems(items: Item[], p: Purchase, others: Purchase[] = []): { items: Item[]; updated: { name: string; from: number; to: number }[] } {
  const latest = new Map<string, string>();
  for (const o of others) {
    if (o.id === p.id) continue;
    for (const l of o.lines) if (l.itemId && l.itemQty > 0 && o.date > (latest.get(l.itemId) ?? "")) latest.set(l.itemId, o.date);
  }
  const updated: { name: string; from: number; to: number }[] = [];
  const next = items.map((it) => {
    const lines = p.lines.filter((l) => l.itemId === it.id && l.itemQty > 0);
    if (lines.length === 0) return it;
    if ((latest.get(it.id) ?? "") > p.date) return it;
    if (it.costMethod === "monthAvg") {
      // 이 영수증이 속한 달의 매입을 모두 모아 가중평균 (할인 비례 반영)
      const month = p.date.slice(0, 7);
      const inMonth = [p, ...others.filter((o) => o.id !== p.id && o.date.slice(0, 7) === month)];
      let net = 0;
      let qty = 0;
      for (const o of inMonth)
        for (const l of o.lines)
          if (l.itemId === it.id && l.itemQty > 0) {
            net += lineSupply(o, l);
            qty += l.itemQty;
          }
      const avg = round1(net / qty);
      if (avg === it.standardCost) return it;
      updated.push({ name: it.name, from: it.standardCost, to: avg });
      return { ...it, standardCost: avg };
    }
    // 같은 품목이 여러 줄이면 합쳐서 평균
    const net = lines.reduce((a, l) => a + lineSupply(p, l), 0);
    const qty = lines.reduce((a, l) => a + l.itemQty, 0);
    const cost = round1(net / qty);
    if (cost === it.standardCost) return it;
    updated.push({ name: it.name, from: it.standardCost, to: cost });
    return { ...it, standardCost: cost };
  });
  return { items: next, updated };
}

// 품목의 기준단가를 매입 기록으로 다시 계산 (가장 최근 매입이 있는 달 기준)
//  - latest: 가장 최근 매입 영수증의 단가 / monthAvg: 그 달 매입 전체의 가중평균
export function costFromPurchases(itemId: string, method: "latest" | "monthAvg", purchases: Purchase[]): number | null {
  const withItem = purchases.filter((p) => p.lines.some((l) => l.itemId === itemId && l.itemQty > 0));
  if (withItem.length === 0) return null;
  const last = withItem.reduce((a, b) => (b.date > a.date ? b : a));
  const pool = method === "monthAvg" ? withItem.filter((p) => p.date.slice(0, 7) === last.date.slice(0, 7)) : [last];
  let net = 0;
  let qty = 0;
  for (const p of pool)
    for (const l of p.lines)
      if (l.itemId === itemId && l.itemQty > 0) {
        net += lineSupply(p, l);
        qty += l.itemQty;
      }
  return round1(net / qty);
}

export interface PurchaseSummary {
  total: number;
  count: number;
  byCategory: Record<PurchaseCategory, number>;
  byVendor: { vendor: string; total: number; count: number }[];
  byItem: { itemId: string; net: number; qty: number }[]; // 연결된 품목별 매입 합계 (baseUnit 수량)
}

export function summarizePurchases(purchases: Purchase[]): PurchaseSummary {
  const byCategory: Record<PurchaseCategory, number> = { 원재료비: 0, 기타재료비: 0, 소모품비: 0, 기타: 0 };
  const vendors = new Map<string, { total: number; count: number }>();
  const itemsMap = new Map<string, { net: number; qty: number }>();
  let total = 0;
  for (const p of purchases) {
    const t = purchaseTotal(p);
    total += t;
    const v = vendors.get(p.vendor) ?? { total: 0, count: 0 };
    v.total += t;
    v.count += 1;
    vendors.set(p.vendor, v);
    for (const l of p.lines) {
      byCategory[l.category] = (byCategory[l.category] ?? 0) + lineGrossPaid(p, l);
      if (l.itemId && l.itemQty > 0) {
        const e = itemsMap.get(l.itemId) ?? { net: 0, qty: 0 };
        e.net += lineSupply(p, l);
        e.qty += l.itemQty;
        itemsMap.set(l.itemId, e);
      }
    }
  }
  return {
    total,
    count: purchases.length,
    byCategory,
    byVendor: [...vendors.entries()].map(([vendor, v]) => ({ vendor, ...v })).sort((a, b) => b.total - a.total),
    byItem: [...itemsMap.entries()].map(([itemId, e]) => ({ itemId, ...e })).sort((a, b) => b.net - a.net),
  };
}

// "특란 30구" 같은 상품명에서 묶음 수를 짐작해 품목 수량 제안 (사장님이 고칠 수 있다)
export function guessItemQty(name: string, qty: number, unit: BaseUnit): number | null {
  const n = name.replace(/\s/g, "");
  if (unit === "ea") {
    const m = n.match(/(\d+)(구|개|입|매|장|병)/);
    if (m) return Number(m[1]) * qty;
    // "별빛청하(BOX)"처럼 박스인데 몇 개 들었는지 없으면 짐작하지 않는다 (박스값이 개당 단가로 들어가면 안 됨)
    return /box|박스|상자|케이스/i.test(n) ? null : qty;
  }
  const kg = n.match(/(\d+(?:\.\d+)?)kg/i);
  const g = n.match(/(\d+(?:\.\d+)?)g(?![a-z])/i);
  const l = n.match(/(\d+(?:\.\d+)?)l(?![a-z])/i);
  const ml = n.match(/(\d+(?:\.\d+)?)ml/i);
  if (unit === "kg") return kg ? Number(kg[1]) * qty : g ? (Number(g[1]) / 1000) * qty : null;
  if (unit === "g") return g ? Number(g[1]) * qty : kg ? Number(kg[1]) * 1000 * qty : null;
  if (unit === "L") return l ? Number(l[1]) * qty : ml ? (Number(ml[1]) / 1000) * qty : null;
  if (unit === "ml") return ml ? Number(ml[1]) * qty : l ? Number(l[1]) * 1000 * qty : null;
  return null;
}
