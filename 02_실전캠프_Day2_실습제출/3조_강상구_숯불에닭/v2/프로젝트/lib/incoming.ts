import { CARD_PRESETS, type ChannelId } from "./categories";
import type { CardsalesData } from "./cardsales";
import { payoutDate, type SettlementRule } from "./settlement";
import type { DailySale } from "./types";

// 「들어올 돈」 — 오늘·내일·모레 통장에 찍힐 카드 대금을 미리 본다 (2026-11-17).
//
// 두 가지를 더한다.
//  - 확정: 여신협회가 알려 준 지급예정일·지급금액. 카드사가 매입을 올려야 나오는데 보통 거래 다음 날,
//          KB국민카드는 이틀 뒤에야 올라온다. 그래서 오늘 들어올 돈인데도 아직 안 보이는 날이 생긴다.
//  - 짐작: 아직 매입이 안 올라온 거래일은 포스 카드 매출 × (1 − 그 카드사 실측 수수료율)로 센다.
//          입금일은 정산 규칙(카드사 +2영업일, 삼성은 달력 2일 등)으로 구한다.
//
// 2026-11-17 입금을 이 방법으로 계산해 캐시노트와 맞춰 보니 카드사 7곳이 원 단위까지 같았다.
// (예: 현대 확정 631,620 + 11/15분 짐작 81,180 = 712,800 — 캐시노트와 동일)
//
// 여신협회에 안 나오는 채널(간편결제·제로페이)은 실측 수수료율이 없어 짐작하지 않는다. 섣불리
// 어림한 숫자를 "들어올 돈"에 섞으면 통장과 맞춰 볼 수가 없다.

export interface IncomingLine {
  kind: "card" | "easy" | "delivery";
  channel: ChannelId;
  name: string;
  confirmed: number; // 카드: 여신협회 지급금액 / 배달: 앱이 알려 준 정산 입금액
  estimated: number; // 포스 매출로 미리 센 몫
  amount: number;
  from: string[]; // 이 입금에 들어가는 거래일
  estFrom: string[]; // 그중 아직 짐작인 거래일
  feeRate: number | null; // 짐작에 쓴 수수료율 (%)
}

/**
 * 여신협회에 안 나오는 채널 — 배달앱과 간편결제.
 *  - 배달앱: 앱이 정산 건을 알려 주므로 그 금액이 "확정"이다.
 *  - 간편결제(카카오페이·네이버페이·토스 등): 알려 주는 곳이 없어 통장에 실제로 들어온 묶음을 쓴다.
 *    그래서 "확정"은 이미 들어온 날뿐이고, 앞날은 실측 입금률로만 짐작한다.
 */
export interface DeliverySource {
  channel: ChannelId;
  name: string;
  kind?: "delivery" | "easy";
  settlements: { depositDueDate: string; periodStart: string; periodEnd: string; depositAmount: number }[];
}

export interface IncomingDay {
  date: string;
  lines: IncomingLine[];
  confirmed: number;
  estimated: number;
  amount: number;
  partial: boolean; // 짐작이 섞여 있나
}

export interface IncomingInput {
  sales: DailySale[];
  cardsales: CardsalesData | null;
  rules: SettlementRule[];
  holidays?: string[];
  channels?: ChannelId[]; // 비우면 카드사 전부
  delivery?: DeliverySource[];
}

const cardRule = (channel: ChannelId): SettlementRule => ({ channel, mode: "days", days: 2, weekday: 0 });

/** 그 카드사의 실측 수수료율 (여신협회 매입/수수료 합계). 자료가 없으면 null */
export function feeRateOf(data: CardsalesData | null, channel: ChannelId): number | null {
  let amount = 0;
  let fee = 0;
  for (const p of data?.payouts ?? []) {
    if (p.channel !== channel) continue;
    amount += p.amount;
    fee += p.fee;
  }
  return amount > 0 ? fee / amount : null;
}

/** 여신협회에 매입이 올라와 있는 마지막 거래일 */
export function lastKnownSale(data: CardsalesData | null, channel: ChannelId): string | null {
  let last: string | null = null;
  for (const p of data?.payouts ?? []) if (p.channel === channel && (!last || p.saleDate > last)) last = p.saleDate;
  return last;
}

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** 몇백 원 차이는 채널 분류가 흔들린 것으로 보고 넘긴다 */
const MIN_SHORT = 1_000;

/**
 * 그 카드사의 "아직 매입이 안 올라온 매출" — 거래일별로 (포스 매출 − 여신협회 매입).
 *
 * 하루가 통째로 안 올라오기도 하지만 **반만 올라오기도 한다**: 2026-11-14 하나카드는 포스 336,000원
 * 중 132,000원만 올라와 있었고, 나머지 204,000원이 11/17 입금에 같이 들어왔다 (캐시노트와 202,470원
 * 차이가 났던 원인). 자정 넘겨 받은 결제는 포스가 전날로 적고 카드사는 다음 날로 적어서 이렇게 갈린다.
 *
 * 올라온 마지막 거래일에서 이틀 앞까지만 본다. 더 오래된 구멍(10/23~24 하나카드처럼 매입 자료를
 * 못 받아 비어 있는 날)은 들어올 돈이 아니라 자료 구멍이라 "카드사 입금 대조"에서 볼 일이다.
 */
export function unpostedSales(data: CardsalesData | null, channel: ChannelId, sales: DailySale[]): { date: string; amount: number }[] {
  const buy = new Map<string, number>();
  let last = "";
  for (const p of data?.payouts ?? []) {
    if (p.channel !== channel) continue;
    buy.set(p.saleDate, (buy.get(p.saleDate) ?? 0) + p.amount);
    if (p.saleDate > last) last = p.saleDate;
  }
  const from = last ? addDays(last, -2) : null;
  const out: { date: string; amount: number }[] = [];
  for (const s of sales) {
    if (s.channel !== channel || s.amount <= 0) continue;
    if (from && s.date < from) continue;
    const short = s.amount - (buy.get(s.date) ?? 0);
    if (short >= MIN_SHORT) out.push({ date: s.date, amount: short });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 배달앱이 매출의 몇 %를 통장에 넣어 주나 — 정산 건의 입금액 ÷ 그 기간 포스 매출의 가운뎃값.
 * 수수료율을 따로 알 필요 없이 실제로 들어온 비율을 쓴다. 터무니없는 짝(기간에 매출이 없거나
 * 환급이 섞여 비율이 튄 건)은 버린다.
 */
export function netRateOf(src: DeliverySource, sales: DailySale[]): number | null {
  const rates: number[] = [];
  for (const s of src.settlements) {
    if (!(s.depositAmount > 0) || !s.periodStart || !s.periodEnd) continue;
    const sold = sales.filter((x) => x.channel === src.channel && x.date >= s.periodStart && x.date <= s.periodEnd).reduce((a, x) => a + x.amount, 0);
    if (sold <= 0) continue;
    const r = s.depositAmount / sold;
    if (r >= 0.4 && r <= 1.1) rates.push(r); // 배달앱이 절반 아래로 주거나 매출보다 많이 줄 수는 없다
  }
  if (rates.length < 3) return null; // 견줄 자료가 적으면 짐작하지 않는다
  rates.sort((a, b) => a - b);
  return rates[Math.floor(rates.length / 2)];
}

/** 그 앱의 정산 건이 만들어져 있는 마지막 매출일. 이 날까지는 "확정"으로 본다 */
export function lastSettledSale(src: DeliverySource): string | null {
  let last: string | null = null;
  for (const s of src.settlements) if (s.periodEnd && (!last || s.periodEnd > last)) last = s.periodEnd;
  return last;
}

/** 그날 통장에 들어올 카드 대금 */
export function incomingOn(date: string, input: IncomingInput): IncomingDay {
  const { sales, cardsales, rules, holidays = [] } = input;
  const wanted = input.channels ?? CARD_PRESETS.map((c) => c.id);
  const lines: IncomingLine[] = [];

  for (const channel of wanted) {
    const rate = feeRateOf(cardsales, channel);
    const rule = rules.find((r) => r.channel === channel) ?? cardRule(channel);

    let confirmed = 0;
    const from = new Set<string>();
    for (const p of cardsales?.payouts ?? []) {
      if (p.channel !== channel || p.payDate !== date) continue;
      confirmed += p.pay;
      from.add(p.saleDate);
    }

    // 매입이 아직 안 올라온 몫만 포스 매출로 센다. 실측 수수료율이 없으면 짐작하지 않는다
    let estimated = 0;
    const estFrom: string[] = [];
    if (rate !== null) {
      for (const s of unpostedSales(cardsales, channel, sales)) {
        if (payoutDate(s.date, rule, holidays) !== date) continue;
        estimated += Math.round(s.amount * (1 - rate));
        estFrom.push(s.date);
        from.add(s.date);
      }
    }

    if (confirmed + estimated <= 0) continue;
    lines.push({
      kind: "card",
      channel,
      name: CARD_PRESETS.find((c) => c.id === channel)?.name ?? channel,
      confirmed,
      estimated,
      amount: confirmed + estimated,
      from: [...from].sort(),
      estFrom: estFrom.sort(),
      feeRate: rate === null ? null : Math.round(rate * 10000) / 100,
    });
  }

  // 배달앱 — 앱이 알려 준 정산 건이 확정, 아직 정산 건이 없는 매출일은 실측 입금률로 짐작
  for (const src of input.delivery ?? []) {
    const rule = rules.find((r) => r.channel === src.channel) ?? cardRule(src.channel);
    const rate = netRateOf(src, sales);
    const last = lastSettledSale(src);

    let confirmed = 0;
    const from = new Set<string>();
    for (const s of src.settlements) {
      if (s.depositDueDate !== date || !(s.depositAmount > 0)) continue;
      confirmed += s.depositAmount;
      if (s.periodStart) from.add(s.periodStart);
      if (s.periodEnd) from.add(s.periodEnd);
    }

    let estimated = 0;
    const estFrom: string[] = [];
    if (rate !== null) {
      for (const s of sales) {
        if (s.channel !== src.channel || s.amount <= 0) continue;
        if (last && s.date <= last) continue;
        if (payoutDate(s.date, rule, holidays) !== date) continue;
        estimated += Math.round(s.amount * rate);
        estFrom.push(s.date);
        from.add(s.date);
      }
    }

    if (confirmed + estimated <= 0) continue;
    lines.push({
      kind: src.kind ?? "delivery",
      channel: src.channel,
      name: src.name,
      confirmed,
      estimated,
      amount: confirmed + estimated,
      from: [...from].sort(),
      estFrom: estFrom.sort(),
      feeRate: rate === null ? null : Math.round((1 - rate) * 10000) / 100,
    });
  }

  const order = { card: 0, easy: 1, delivery: 2 };
  lines.sort((a, b) => order[a.kind] - order[b.kind] || b.amount - a.amount);
  const confirmed = lines.reduce((a, l) => a + l.confirmed, 0);
  const estimated = lines.reduce((a, l) => a + l.estimated, 0);
  return { date, lines, confirmed, estimated, amount: confirmed + estimated, partial: estimated > 0 };
}

/** 오늘부터 n일치 */
export function incomingDays(from: string, n: number, input: IncomingInput): IncomingDay[] {
  const out: IncomingDay[] = [];
  for (let i = 0; i < n; i++) out.push(incomingOn(new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10), input));
  return out;
}
