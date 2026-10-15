// 배민 정산·입금 — 유승균 사장님 배달이익노트의 계산을 우리 장부에 맞춘 것.
//  - 정산 건: 입금(예정)일 · 정산 기간 · 입금액 · 광고비 · 조정액. 통장의 배민 입금과 짝을 맞춰 "들어왔나"를 본다.
//  - 주문 1건당: 주문금액 중 중개이용료 · 결제수수료 · 배달비 · 부가세 · 할인이 각각 얼마인지 (이 달 정산된 주문 기준)
//  - 광고 효율: 가게통계의 우리가게클릭 광고비 · 광고 연결 주문 · 광고비 1만원당 매출
// 모르는 값은 0이 아니라 null. 정산 전 주문은 비용이 비어 있어 "1건당"에서 뺀다.
import type { BaeminExport, BaeminOrderDay, BaeminSettlement } from "../export/types";
import type { Transaction } from "../types";

export type DepositState = "입금 확인" | "입금 대기" | "예정" | "입금 안 맞음";

export interface SettlementRow extends BaeminSettlement {
  state: DepositState;
  bankDate: string | null; // 짝이 맞은 통장 입금일
  bankAmount: number | null;
  bankGap: number | null; // 입금액 − 통장 입금 (짝이 맞았을 때 0)
  daysLate: number | null; // 통장 입금일 − 입금 예정일
}

const MS_DAY = 86_400_000;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / MS_DAY);

/**
 * 정산 건과 통장 입금 짝 맞추기.
 * 통장 줄은 채널이 배민인 입금만 본다. 금액이 같은 줄을 입금 예정일에서 가장 가까운 것으로 고른다(앞뒤 10일 안).
 * 같은 줄을 두 정산에 붙이지 않는다. 금액이 같은 줄이 없고 예정일이 지났으면 "입금 대기", 안 지났으면 "예정".
 */
export function matchSettlements(settlements: BaeminSettlement[], txs: Transaction[], today: string, channelId = "baemin"): SettlementRow[] {
  const bank = txs.filter((t) => t.channel === channelId && t.in > 0).map((t) => ({ ...t, used: false }));
  return [...settlements]
    .sort((a, b) => a.depositDueDate.localeCompare(b.depositDueDate))
    .map((s) => {
      const candidates = bank
        .filter((b) => !b.used && b.in === s.depositAmount && Math.abs(daysBetween(s.depositDueDate, b.date)) <= 10)
        .sort((a, b) => Math.abs(daysBetween(s.depositDueDate, a.date)) - Math.abs(daysBetween(s.depositDueDate, b.date)));
      const hit = candidates[0];
      if (hit) {
        hit.used = true;
        return { ...s, state: "입금 확인" as const, bankDate: hit.date, bankAmount: hit.in, bankGap: 0, daysLate: daysBetween(s.depositDueDate, hit.date) };
      }
      const due = s.depositDueDate <= today;
      return { ...s, state: due ? ("입금 대기" as const) : ("예정" as const), bankDate: null, bankAmount: null, bankGap: null, daysLate: null };
    });
}

export interface PerOrder {
  month: string;
  orders: number; // 정산된 주문 수 (1건당 계산의 분모)
  unsettledOrders: number; // 아직 정산 전이라 뺀 주문
  gross: number; // 주문금액 합
  discount: number;
  otherRevenue: number;
  brokerage: number;
  payment: number;
  delivery: number;
  vat: number;
  unclassified: number;
  net: number; // 주문금액 + 가게배달팁 − 할인 − 공제 = 정산으로 받는 돈
  per: { gross: number; discount: number; brokerage: number; payment: number; delivery: number; vat: number; unclassified: number; net: number } | null; // 주문 1건당
  netRate: number | null; // net ÷ gross %
}

/** 이 달에 주문된(정산된) 주문의 1건당 쪼개기 */
export function perOrderBreakdown(days: BaeminOrderDay[], month: string): PerOrder {
  const inM = days.filter((d) => d.date.startsWith(month));
  const sum = (f: (d: BaeminOrderDay) => number) => inM.reduce((a, d) => a + f(d), 0);
  const orders = sum((d) => d.settledOrders);
  const gross = sum((d) => d.gross);
  const discount = sum((d) => d.discount);
  const otherRevenue = sum((d) => d.otherRevenue);
  const brokerage = sum((d) => d.deductions.brokerage);
  const payment = sum((d) => d.deductions.payment);
  const delivery = sum((d) => d.deductions.delivery);
  const vat = sum((d) => d.deductions.vat);
  const unclassified = sum((d) => d.deductions.unclassified);
  const net = gross + otherRevenue - discount - brokerage - payment - delivery - vat - unclassified;
  const r = (n: number) => Math.round(n / orders);
  return {
    month,
    orders,
    unsettledOrders: sum((d) => d.unsettledOrders),
    gross,
    discount,
    otherRevenue,
    brokerage,
    payment,
    delivery,
    vat,
    unclassified,
    net,
    per: orders > 0 ? { gross: r(gross), discount: r(discount), brokerage: r(brokerage), payment: r(payment), delivery: r(delivery), vat: r(vat), unclassified: r(unclassified), net: r(net) } : null,
    netRate: gross > 0 ? Math.round((net / gross) * 1000) / 10 : null,
  };
}

export interface AdEfficiency {
  month: string;
  cost: number | null; // 우리가게클릭 광고비 (가게통계)
  adOrders: number; // 광고 연결 주문
  allOrders: number | null;
  adSales: number; // 광고 연결 주문 매출
  costPerAdOrder: number | null;
  costPerAllOrder: number | null;
  salesPer10k: number | null; // 광고비 1만원당 들어온 매출 (원)
  adShareOfSales: number | null; // 광고비 ÷ 광고 매출 %
}

/** 가게통계의 CPC(우리가게클릭) 묶음으로 광고 효율 */
export function adEfficiency(b: BaeminExport | null, month: string): AdEfficiency | null {
  const m = b?.stats?.[month];
  if (!m) return null;
  const cpc = m.groups?.CPC;
  if (!cpc || cpc.cost === null) return { month, cost: null, adOrders: 0, allOrders: m.orderCount, adSales: 0, costPerAdOrder: null, costPerAllOrder: null, salesPer10k: null, adShareOfSales: null };
  const cost = cpc.cost;
  return {
    month,
    cost,
    adOrders: cpc.orderCount,
    allOrders: m.orderCount,
    adSales: cpc.orderAmount,
    costPerAdOrder: cpc.orderCount > 0 ? Math.round(cost / cpc.orderCount) : null,
    costPerAllOrder: m.orderCount ? Math.round(cost / m.orderCount) : null,
    salesPer10k: cost > 0 ? Math.round((cpc.orderAmount / cost) * 10_000) : null,
    adShareOfSales: cpc.orderAmount > 0 ? Math.round((cost / cpc.orderAmount) * 1000) / 10 : null,
  };
}

/** 정산 탭의 채널 숫자(주문금액·정산금액·건수)로 넣을 값 — 이 달에 주문된 정산 완료 주문 기준 */
export function channelSaleFromOrders(days: BaeminOrderDay[], month: string): { orders: number; deposit: number; count: number } | null {
  const p = perOrderBreakdown(days, month);
  if (p.orders <= 0) return null;
  return { orders: p.gross, deposit: p.net, count: p.orders };
}
