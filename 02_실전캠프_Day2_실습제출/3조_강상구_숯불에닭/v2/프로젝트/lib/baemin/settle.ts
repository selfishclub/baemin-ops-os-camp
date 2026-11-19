// 배민 정산·입금 — 유승균 사장님 배달이익노트의 계산을 우리 장부에 맞춘 것.
//  - 정산 건: 입금(예정)일 · 정산 기간 · 입금액 · 광고비 · 조정액. 통장의 배민 입금과 짝을 맞춰 "들어왔나"를 본다.
//  - 주문 1건당: 주문금액 중 중개이용료 · 결제수수료 · 배달비 · 부가세 · 할인이 각각 얼마인지 (이 달 정산된 주문 기준)
//  - 광고 효율: 가게통계의 우리가게클릭 광고비 · 광고 연결 주문 · 광고비 1만원당 매출
// 모르는 값은 0이 아니라 null. 정산 전 주문은 비용이 비어 있어 "1건당"에서 뺀다.
import type { BaeminExport, BaeminOrderDay, BaeminSettlement } from "../export/types";
import type { Transaction } from "../types";

export type DepositState = "입금 확인" | "입금 대기" | "예정" | "입금 안 맞음" | "출금 확인 필요" | "입금 없음";

export interface SettlementRow extends BaeminSettlement {
  state: DepositState;
  bankDate: string | null; // 짝이 맞은 통장 입금일
  bankAmount: number | null;
  bankGap: number | null; // 입금액 − 통장 입금 (짝이 맞았을 때 0)
  daysLate: number | null; // 통장 입금일 − 입금 예정일
  note?: string; // 손으로 확인한 기록의 메모
}

// 수집한 정산 금액이 통장과 딱 맞지 않아 자동으로 못 맞춘 건을, 다른 자료(쿠팡이츠 매출내역서 등)로 확인해 적어 둔 기록.
// 쿠팡이츠는 출금 신청 때 며칠치가 합쳐지고, 수집한 정산금액엔 따로 들어오는 상생 환급이 더해져 있어서 1:1 금액 맞추기가 자주 빗나간다.
export const SETTLE_CONFIRM_KEY = "settle_confirm_v1";

export interface SettleConfirm {
  channel: string; // "coupang" · "baemin"
  giveId: string; // 정산 건 id
  bankDate: string | null; // 실제로 들어온 통장 날짜 (합쳐 들어왔으면 그 입금일)
  note: string; // 어떻게 확인했나
}

/** 자동으로 못 맞춘 건(입금 대기·입금 안 맞음)에 확인 기록이 있으면 "입금 확인"으로 */
export function applyConfirms(rows: SettlementRow[], confirms: SettleConfirm[], channel: string): SettlementRow[] {
  const by = new Map(confirms.filter((c) => c.channel === channel).map((c) => [c.giveId, c]));
  return rows.map((r) => {
    const c = by.get(r.giveId);
    if (!c || r.state === "입금 확인") return r;
    return { ...r, state: "입금 확인", bankDate: c.bankDate, bankAmount: null, bankGap: null, daysLate: c.bankDate ? daysBetween(r.depositDueDate, c.bankDate) : null, note: c.note };
  });
}

const MS_DAY = 86_400_000;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / MS_DAY);

/**
 * 정산 건과 통장 입금 짝 맞추기.
 * 통장 줄은 채널이 배민인 입금만 본다. 금액이 같은 줄을 입금 예정일에서 가장 가까운 것으로 고른다(앞뒤 10일 안).
 * 같은 줄을 두 정산에 붙이지 않는다. 금액이 같은 줄이 없고 예정일이 지났으면 "입금 대기", 안 지났으면 "예정".
 * 통장 자료가 입금 예정일까지 아직 안 올라왔으면 "입금 대기"가 아니라 "예정"(확인 전).
 * 쿠팡이츠는 출금 가능 금액(환급 등 남은 돈)이 다음 정산과 합쳐 들어오기도 해서, 같은 금액이 없으면
 * 예정일부터 3일 안에 조금(5천원 이하) 더 큰 입금을 짝으로 본다.
 */
export function matchSettlements(settlements: BaeminSettlement[], txs: Transaction[], today: string, channelId = "baemin"): SettlementRow[] {
  const bank = txs.filter((t) => t.channel === channelId && t.in > 0).map((t) => ({ ...t, used: false }));
  const lastBankDate = txs.filter((t) => t.source === "bank").reduce((m, t) => (t.date > m ? t.date : m), "");
  const sorted = [...settlements].sort((a, b) => a.depositDueDate.localeCompare(b.depositDueDate));
  const near = (s: BaeminSettlement, b: { date: string }) => Math.abs(daysBetween(s.depositDueDate, b.date));

  // 1) 금액이 같은 입금부터 — 합쳐 들어온 입금이 같은 금액 짝을 가로채지 않게 먼저 모두 맞춘다
  const exact: (SettlementRow | null)[] = sorted.map((s) => {
    const hit = bank.filter((b) => !b.used && b.in === s.depositAmount && near(s, b) <= 10).sort((a, b) => near(s, a) - near(s, b))[0];
    if (!hit) return null;
    hit.used = true;
    return { ...s, state: "입금 확인" as const, bankDate: hit.date, bankAmount: hit.in, bankGap: 0, daysLate: daysBetween(s.depositDueDate, hit.date) };
  });

  // 2) 남은 건
  return sorted.map((s, i) => {
    if (s.depositAmount === 0) {
      return { ...s, state: "입금 없음" as const, bankDate: null, bankAmount: null, bankGap: null, daysLate: null };
    }
    const done = exact[i];
    if (done) return done;
    if (channelId === "coupang") {
      const hit = bank
        .filter((b) => !b.used && b.in > s.depositAmount && b.in - s.depositAmount <= 5000 && daysBetween(s.depositDueDate, b.date) >= 0 && daysBetween(s.depositDueDate, b.date) <= 3)
        .sort((a, b) => near(s, a) - near(s, b))[0];
      if (hit) {
        hit.used = true;
        const extra = hit.in - s.depositAmount;
        return {
          ...s,
          state: "입금 확인" as const,
          bankDate: hit.date,
          bankAmount: hit.in,
          bankGap: s.depositAmount - hit.in,
          daysLate: daysBetween(s.depositDueDate, hit.date),
          note: `통장엔 ${hit.in.toLocaleString("ko-KR")}원 — ${extra.toLocaleString("ko-KR")}원 더 들어왔어요. 쿠팡에 남아 있던 출금 가능 금액(환급 등)이 같이 들어온 것으로 보여요.`,
        };
      }
    }
    const due = s.depositDueDate <= today;
    // 통장 자료가 예정일보다 앞에서 끝나면 아직 확인할 수 없다
    if (due && lastBankDate && lastBankDate < s.depositDueDate) {
      return { ...s, state: "예정" as const, bankDate: null, bankAmount: null, bankGap: null, daysLate: null, note: `통장 자료가 ${lastBankDate.slice(5)}까지라 아직 확인 전이에요` };
    }
    return { ...s, state: due ? (channelId === "coupang" ? ("출금 확인 필요" as const) : ("입금 대기" as const)) : ("예정" as const), bankDate: null, bankAmount: null, bankGap: null, daysLate: null };
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
  ad: number; // 주문당 광고비 (쿠팡이츠)
  unclassified: number;
  net: number; // 주문금액 + 가게배달팁 − 할인 − 공제 = 정산으로 받는 돈
  per: { gross: number; discount: number; brokerage: number; payment: number; delivery: number; vat: number; ad: number; unclassified: number; net: number } | null; // 주문 1건당
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
  const ad = sum((d) => d.deductions.ad ?? 0);
  const unclassified = sum((d) => d.deductions.unclassified);
  const net = gross + otherRevenue - discount - brokerage - payment - delivery - vat - ad - unclassified;
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
    ad,
    unclassified,
    net,
    per: orders > 0 ? { gross: r(gross), discount: r(discount), brokerage: r(brokerage), payment: r(payment), delivery: r(delivery), vat: r(vat), ad: r(ad), unclassified: r(unclassified), net: r(net) } : null,
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

export interface DailyOrderFill {
  date: string;
  amount: number; // 그날 앱 결제 주문금액 (만나서결제 제외)
  meetPay: number; // 만나서결제로 손님이 낸 돈 — 매출로는 넣지 않고 알려만 준다
  count: number;
  unsettled: number; // 그중 아직 정산 전인 주문
}

export interface DailyOrderFillSet {
  from: string;
  to: string;
  days: DailyOrderFill[];
  total: number;
  meetPay: number;
  count: number;
  unsettled: number; // 아직 정산 전인 주문 수 (매출은 이미 셌다)
  skipped: string[]; // 옛 내보내기 파일이라 정산 전 주문금액을 알 수 없어 건너뛴 날
}

/**
 * 수집기가 받아 둔 주문에서 그날의 배달앱 매출을 만든다 — 정산을 기다리지 않는다.
 *
 * 배민 정산은 주문 며칠 뒤에 올라와서(NOT_READY), 그때까지 gross 가 0이다. 그런데 주문 품목은
 * 처음부터 들어 있어서 품목 합계로 그날 매출을 낼 수 있다. 수집기가 그 합계를 orderAmount 로
 * 내보낸다 — 정산이 끝난 80일을 대조해 보니 모두 차이 0이었다 (2026-11-18 확인).
 *
 * 만나서결제는 문 앞에서 카드·현금으로 받은 돈이라 배민 매출이 아니다. 따로 알려만 주고
 * 넣지 않는다 (「배민 후불카드」 채널에 손으로 넣는다).
 *
 * orderAmount 가 없는 옛 파일에서는 정산 전 주문이 있는 날을 건너뛴다 — 덜 받아 온 값을
 * 맞는 매출처럼 넣지 않기 위해서다.
 */
export function dailyOrdersFromExport(days: BaeminOrderDay[], month: string): DailyOrderFillSet | null {
  const rows: DailyOrderFill[] = [];
  const skipped: string[] = [];
  for (const d of days.filter((x) => x.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date))) {
    if (d.orderAmount === undefined && d.unsettledOrders > 0) {
      skipped.push(d.date);
      continue;
    }
    // 만나서결제는 손님이 문 앞에서 낸 돈(주문금액 + 가게배달팁)을 알려 준다. 주문금액만 알려 주면
    // 배달팁만큼 모자라게 넣게 된다 (2026-11-02 주문 30,000 · 실제 32,400 — 통장에 32,400 이 찍혔다).
    rows.push({ date: d.date, amount: d.orderAmount ?? d.gross, meetPay: d.meetCollected ?? d.meetPay ?? 0, count: d.orders, unsettled: d.unsettledOrders });
  }
  if (!rows.length) return null;
  const sum = (f: (r: DailyOrderFill) => number) => rows.reduce((a, r) => a + f(r), 0);
  return {
    from: rows[0].date,
    to: rows[rows.length - 1].date,
    days: rows,
    total: sum((r) => r.amount),
    meetPay: sum((r) => r.meetPay),
    count: sum((r) => r.count),
    unsettled: sum((r) => r.unsettled),
    skipped,
  };
}
