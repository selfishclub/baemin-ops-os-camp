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
  channel: ChannelId;
  name: string;
  confirmed: number; // 여신협회가 알려 준 지급금액
  estimated: number; // 포스 매출로 미리 센 몫
  amount: number;
  from: string[]; // 이 입금에 들어가는 거래일
  estFrom: string[]; // 그중 아직 짐작인 거래일
  feeRate: number | null; // 짐작에 쓴 수수료율 (%)
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

/** 여신협회에 매입이 올라와 있는 마지막 거래일. 이 날까지는 "확정"으로 본다 */
export function lastKnownSale(data: CardsalesData | null, channel: ChannelId): string | null {
  let last: string | null = null;
  for (const p of data?.payouts ?? []) if (p.channel === channel && (!last || p.saleDate > last)) last = p.saleDate;
  return last;
}

/** 그날 통장에 들어올 카드 대금 */
export function incomingOn(date: string, input: IncomingInput): IncomingDay {
  const { sales, cardsales, rules, holidays = [] } = input;
  const wanted = input.channels ?? CARD_PRESETS.map((c) => c.id);
  const lines: IncomingLine[] = [];

  for (const channel of wanted) {
    const rate = feeRateOf(cardsales, channel);
    const last = lastKnownSale(cardsales, channel);
    const rule = rules.find((r) => r.channel === channel) ?? cardRule(channel);

    let confirmed = 0;
    const from = new Set<string>();
    for (const p of cardsales?.payouts ?? []) {
      if (p.channel !== channel || p.payDate !== date) continue;
      confirmed += p.pay;
      from.add(p.saleDate);
    }

    // 여신협회가 아직 모르는 거래일만 포스 매출로 센다. 실측 수수료율이 없으면 짐작하지 않는다
    let estimated = 0;
    const estFrom: string[] = [];
    if (rate !== null) {
      for (const s of sales) {
        if (s.channel !== channel || s.amount <= 0) continue;
        if (last && s.date <= last) continue;
        if (payoutDate(s.date, rule, holidays) !== date) continue;
        estimated += Math.round(s.amount * (1 - rate));
        estFrom.push(s.date);
        from.add(s.date);
      }
    }

    if (confirmed + estimated <= 0) continue;
    lines.push({
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

  lines.sort((a, b) => b.amount - a.amount);
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
