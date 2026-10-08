import { payoutDate, type Settlement, type SettlementRule, type ChannelSettlementSummary } from "./settlement";
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
//
//  헛경고 하나 — 카드사가 하루치를 두 번에 나눠 보내면 뒤쪽 입금이 떠돈다.
//  (국민카드가 9/2 매출 94,000을 9/4에 44,663, 9/7에 48,633으로 나눠 보냄 — 2026-09)
//  그래서 가까운 날 묶음이 그만큼 덜 들어왔으면 "나눠 보낸 것"으로 보고 넘어간다.

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
      if (looksLikeSplitPayout(d.amount, d.date, s.settlements)) continue; // 카드사가 나눠 보낸 것
      out.push({ channel: s.channel, name: nameOf(s.channel), saleDates: cands, depositDate: d.date, deposit: d.amount });
    }
  }
  return out.sort((a, b) => (a.saleDates[0] < b.saleDates[0] ? -1 : a.saleDates[0] > b.saleDates[0] ? 1 : 0));
}

/** 이 입금이 가까운 날 묶음의 모자란 몫일 수 있나 (카드사가 나눠 보낸 경우) */
export function looksLikeSplitPayout(deposit: number, depositDate: string, settlements: Settlement[], withinDays = 5): boolean {
  const t = new Date(depositDate + "T00:00:00Z").getTime();
  for (const b of settlements) {
    if (b.status === "매출없음" || b.sales <= 0) continue;
    const gap = b.sales - b.deposit; // 그 묶음이 덜 들어온 몫
    if (gap <= 0) continue;
    if (Math.abs(new Date(b.payout + "T00:00:00Z").getTime() - t) > withinDays * 864e5) continue;
    // 모자란 몫이 이 입금과 엇비슷하면 (수수료만큼 차이) 나눠 보낸 것으로 본다
    if (Math.abs(gap - deposit) <= Math.max(2000, deposit * 0.05)) return true;
  }
  return false;
}

export const totalMissing = (list: MissingSale[]) => list.reduce((a, m) => a + m.deposit, 0);

// ── 짝 안 맞는 입금이 "지난달 주문분"인지 가려내기 ────────────────────
//  월초에는 지난달 말 주문분 정산이 들어온다. 그 달에 아직 그 채널 주문이 없으면
//  정산 탭이 "매출 미입력"이라고 띄워서, 사장님이 안 넣은 것처럼 보였다 (2026-10 롯데·요기요).

export interface StrayDeposit {
  date: string; // 입금일
  amount: number;
  saleDates: string[]; // 며칠 주문분일 수 있나 (주말이 끼면 여럿)
}

export interface StrayGroup {
  deposits: StrayDeposit[];
  total: number;
  /** 전부 지난달(이전) 주문분이면 true — 이 달에서 또 셀 필요가 없다 */
  allPrevMonth: boolean;
}

/** 한 채널의 짝 안 맞는 입금이 며칠 주문분인지 풀어 본다 */
export function explainStrays(
  unmatched: { date: string; amount: number }[],
  rule: SettlementRule | undefined,
  month: string,
  holidays: string[] = [],
): StrayGroup {
  const deposits: StrayDeposit[] = unmatched.map((d) => ({
    date: d.date,
    amount: d.amount,
    saleDates: rule ? saleDatesOf(d.date, rule, holidays) : [],
  }));
  const total = deposits.reduce((a, d) => a + d.amount, 0);
  // 주문일을 하나라도 풀었고, 그 날짜가 전부 이 달보다 앞이면 지난달 몫이다
  const resolved = deposits.filter((d) => d.saleDates.length > 0);
  const allPrevMonth =
    resolved.length === deposits.length && deposits.length > 0 && deposits.every((d) => d.saleDates.every((c) => c.slice(0, 7) < month));
  return { deposits, total, allPrevMonth };
}

/** "9/30 주문분" 처럼 읽기 좋게. 여러 날이면 범위로 */
export function strayDatesText(d: StrayDeposit): string {
  if (d.saleDates.length === 0) return "";
  const f = (s: string) => `${Number(s.slice(5, 7))}/${s.slice(8, 10)}`;
  return d.saleDates.length === 1 ? f(d.saleDates[0]) : `${f(d.saleDates[0])}~${f(d.saleDates[d.saleDates.length - 1])}`;
}
