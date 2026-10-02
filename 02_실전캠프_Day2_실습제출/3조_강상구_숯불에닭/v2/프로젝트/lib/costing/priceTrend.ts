import { lineNet, lineUnitCost, round1, type Purchase } from "./purchases";
import type { Item } from "./types";

// 매입 단가 흐름 — 품목마다 "언제 얼마에 샀나"를 날짜순으로 (해모닉 매입 인사이트에서 따옴).
// 원가율이 오른 달에 "어느 재료 값이 올랐나"를 찾으려고. 영수증 줄을 원가율 품목에 연결하고 수량을 적은 줄만 센다.

export interface PricePoint {
  date: string;
  vendor: string;
  unitCost: number; // 품목 기준 단위 1개당 (할인 반영)
  qty: number;
}

export interface PriceTrend {
  item: Item;
  points: PricePoint[]; // 날짜순
  spend: number; // 이 기간 이 품목에 쓴 돈
  first: number;
  last: number;
  changePct: number | null; // 처음 산 값 → 마지막 산 값 %
  min: number;
  max: number;
}

export function priceTrends(purchases: Purchase[], items: Item[]): PriceTrend[] {
  const byItem = new Map<string, { points: PricePoint[]; spend: number }>();
  for (const p of purchases)
    for (const l of p.lines) {
      const unitCost = lineUnitCost(p, l);
      if (unitCost === null || !l.itemId) continue;
      const e = byItem.get(l.itemId) ?? { points: [], spend: 0 };
      e.points.push({ date: p.date, vendor: p.vendor, unitCost, qty: l.itemQty });
      e.spend += lineNet(p, l);
      byItem.set(l.itemId, e);
    }

  const out: PriceTrend[] = [];
  for (const [id, e] of byItem) {
    const item = items.find((i) => i.id === id);
    if (!item) continue;
    const points = e.points.sort((a, b) => a.date.localeCompare(b.date));
    const first = points[0].unitCost;
    const last = points[points.length - 1].unitCost;
    out.push({
      item,
      points,
      spend: e.spend,
      first,
      last,
      changePct: points.length > 1 && first > 0 ? round1(((last - first) / first) * 100) : null,
      min: Math.min(...points.map((x) => x.unitCost)),
      max: Math.max(...points.map((x) => x.unitCost)),
    });
  }
  // 돈을 많이 쓴 품목부터 — 단가가 조금만 올라도 원가에 크게 번지는 순서
  return out.sort((a, b) => b.spend - a.spend);
}
