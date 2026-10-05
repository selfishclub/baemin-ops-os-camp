import { payoutDate, type SettlementRule, type ChannelSettlementSummary } from "./settlement";
import type { Channel, ChannelId } from "./categories";
import type { DailySale } from "./types";

// "통장엔 들어왔는데 매출에 없는 날" 찾기.
//
//  포스에 안 찍히는 매출(손님 계좌이체·제로페이/알리페이·요기요)은 손으로 넣어야 해서
//  깜빡하면 통장에 돈은 있는데 매출에서 사라진다. 2026년 9~10월에 세 번 났다.
//
//  찾는 법: 정산 탭이 이미 "매출 묶음과 짝이 안 맞는 입금"을 뽑아 둔다.
//  그 입금이 며칠 주문분인지 정산 규칙을 거꾸로 풀고, 그날 그 채널 매출이 비어 있으면 빠뜨린 것으로 본다.
//  주말·공휴일이 끼면 여러 날이 같은 날 입금되므로 후보가 여럿이다. 그중 하나라도 매출이 있으면 넘어간다.

export interface MissingSale {
  channel: ChannelId;
  name: string;
  saleDates: string[]; // 매출이 비어 있는 날 후보 (하나면 그날이 확실하다)
  depositDate: string;
  deposit: number; // 그날 들어온 돈 (수수료 뗀 뒤)
}

/** 이 날 입금된 것이 며칠 주문분일 수 있나 (여러 날이 같은 날 입금될 수 있다) */
export function saleDatesOf(depositDate: string, rule: SettlementRule, holidays: string[] = [], lookBack = 14): string[] {
  const d = new Date(depositDate + "T00:00:00Z").getTime();
  const out: string[] = [];
  for (let back = lookBack; back >= 0; back -= 1) {
    const cand = new Date(d - back * 864e5).toISOString().slice(0, 10);
    if (payoutDate(cand, rule, holidays) === depositDate) out.push(cand);
  }
  return out;
}

export function missingSales(
  summaries: ChannelSettlementSummary[],
  rules: SettlementRule[],
  sales: DailySale[],
  channels: Channel[],
  month: string,
  holidays: string[] = [],
): MissingSale[] {
  const sold = new Set(sales.filter((s) => s.amount > 0).map((s) => `${s.date}|${s.channel}`));
  const nameOf = (id: ChannelId) => channels.find((c) => c.id === id)?.name ?? id;
  const out: MissingSale[] = [];
  for (const s of summaries) {
    const rule = rules.find((r) => r.channel === s.channel);
    if (!rule) continue; // 규칙이 없으면 주문일을 알 수 없다
    for (const d of s.unmatchedDeposits) {
      const cands = saleDatesOf(d.date, rule, holidays).filter((c) => c.slice(0, 7) === month);
      if (cands.length === 0) continue; // 지난달 주문분은 지난달에서 본다
      if (cands.some((c) => sold.has(`${c}|${s.channel}`))) continue; // 한 날이라도 매출이 있으면 넘어간다
      out.push({ channel: s.channel, name: nameOf(s.channel), saleDates: cands, depositDate: d.date, deposit: d.amount });
    }
  }
  return out.sort((a, b) => (a.saleDates[0] < b.saleDates[0] ? -1 : a.saleDates[0] > b.saleDates[0] ? 1 : 0));
}

export const totalMissing = (list: MissingSale[]) => list.reduce((a, m) => a + m.deposit, 0);
