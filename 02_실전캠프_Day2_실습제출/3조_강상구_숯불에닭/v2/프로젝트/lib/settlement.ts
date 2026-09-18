import type { ChannelId } from "./categories";
import { shiftDate } from "./daily";
import type { DailySale, Month, Transaction } from "./types";

// 정산 주기 규칙 — "언제 주문(매출)한 돈이 언제 통장에 들어오나"
//  - days:   매출일 + N영업일 뒤에 그날 매출분이 들어온다 (카드사, 배달앱 일 정산)
//  - weekly: 매주 weekday요일에 지난주(월~일) 매출분이 한 번에 들어온다 (주 단위 정산 앱)
export interface SettlementRule {
  channel: ChannelId;
  mode: "days" | "weekly";
  days: number; // days 모드: 영업일 수 (0이면 당일)
  weekday: number; // weekly 모드: 0=월 … 6=일
}

export const SETTLEMENT_RULES_KEY = "settlement_rules";
export const HOLIDAYS_KEY = "holidays"; // "2026-10-03" 같은 날짜 목록

const dow = (date: string) => (new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7; // 월=0

export function isBusinessDay(date: string, holidays: string[] = []): boolean {
  const d = dow(date);
  return d < 5 && !holidays.includes(date);
}

// 영업일 N일 뒤 (주말·공휴일은 건너뜀). 도착일이 휴일이면 다음 영업일로 민다.
export function addBusinessDays(date: string, n: number, holidays: string[] = []): string {
  let d = date;
  let left = n;
  while (left > 0) {
    d = shiftDate(d, 1);
    if (isBusinessDay(d, holidays)) left -= 1;
  }
  while (!isBusinessDay(d, holidays)) d = shiftDate(d, 1);
  return d;
}

// 그 매출일의 돈이 들어올 날
export function payoutDate(saleDate: string, rule: SettlementRule, holidays: string[] = []): string {
  if (rule.mode === "days") return addBusinessDays(saleDate, rule.days, holidays);
  // weekly: 매출일이 속한 주(월~일)의 다음 주 weekday요일
  const monday = shiftDate(saleDate, -dow(saleDate));
  let p = shiftDate(monday, 7 + rule.weekday);
  while (!isBusinessDay(p, holidays)) p = shiftDate(p, 1);
  return p;
}

// 한 정산 묶음: days 모드면 하루치, weekly 모드면 한 주치
export interface Settlement {
  channel: ChannelId;
  from: string; // 매출 기간
  to: string;
  sales: number; // 그 기간 매출(주문금액)
  payout: string; // 들어와야 할 날
  deposit: number; // 그날 통장에 실제로 들어온 돈 (같은 채널)
  fee: number; // sales − deposit (입금이 있을 때만)
  feeRate: number | null; // %
  status: "일치" | "차이" | "미입금" | "예정" | "매출없음";
}

export interface ChannelSettlementSummary {
  channel: ChannelId;
  sales: number; // 이 달 주문분 매출
  deposited: number; // 그중 실제 입금 확인된 정산금액
  fee: number;
  feeRate: number | null; // 입금 확인된 분에 대한 수수료율
  pending: number; // 아직 입금일이 안 온 매출 (월말 미입금액에 해당)
  missing: number; // 입금일이 지났는데 안 들어온 매출
  settlements: Settlement[];
  unmatchedDeposits: { date: string; amount: number }[]; // 매출 묶음과 짝이 안 맞는 입금
}

// 채널·날짜별 통장 입금 합계
function depositsByDate(txs: Transaction[], channel: ChannelId): Map<string, number> {
  const m = new Map<string, number>();
  // v1 때 "hall"(홀 전체)로 분류된 카드 입금은 hall_card로 본다
  const same = (c: string | null) => c === channel || (channel === "hall_card" && c === "hall");
  for (const t of txs) if (same(t.channel) && t.in > 0) m.set(t.date, (m.get(t.date) ?? 0) + t.in);
  return m;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
export const MISMATCH_TOLERANCE = 0.005; // 0.5% 이내 차이는 "일치"로 본다 (반올림 등)

// 이 달 주문분을 규칙대로 묶어 통장 입금과 짝 맞춘다.
//  txs: 이 달 + 다음 달 초 통장 거래 (다음 달 파일이 아직 없으면 그 뒤 정산은 "예정")
//  lastBankDate: 올린 통장 내역의 마지막 날짜. 그 뒤로 들어올 돈은 "예정", 그 전인데 없으면 "미입금"
export function settleChannel(
  channel: ChannelId,
  month: Month,
  rule: SettlementRule,
  dailySales: DailySale[],
  txs: Transaction[],
  lastBankDate: string,
  holidays: string[] = [],
): ChannelSettlementSummary {
  const deposits = depositsByDate(txs, channel);
  const daily = dailySales.filter((s) => s.channel === channel && s.date.startsWith(month));

  // 묶음 만들기
  const groups = new Map<string, { from: string; to: string; sales: number }>();
  for (const s of daily) {
    const payout = payoutDate(s.date, rule, holidays);
    const g = groups.get(payout) ?? { from: s.date, to: s.date, sales: 0 };
    g.from = g.from < s.date ? g.from : s.date;
    g.to = g.to > s.date ? g.to : s.date;
    g.sales += s.amount;
    groups.set(payout, g);
  }

  const used = new Set<string>();
  const settlements: Settlement[] = [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([payout, g]) => {
      const deposit = deposits.get(payout) ?? 0;
      if (deposit > 0) used.add(payout);
      // 입금이 매출의 70% 미만이거나 매출보다 많으면 "차이"(추가 공제·누락·다른 돈이 섞임), 그 안이면 수수료만 뗀 정상 입금으로 본다
      let status: Settlement["status"];
      if (g.sales === 0) status = "매출없음";
      else if (deposit > 0) status = deposit < g.sales * 0.7 || deposit > g.sales * (1 + MISMATCH_TOLERANCE) ? "차이" : "일치";
      else status = payout > lastBankDate ? "예정" : "미입금";
      const fee = deposit > 0 ? g.sales - deposit : 0;
      return {
        channel,
        from: g.from,
        to: g.to,
        sales: g.sales,
        payout,
        deposit,
        fee,
        feeRate: deposit > 0 && g.sales > 0 ? round1((fee / g.sales) * 100) : null,
        status,
      };
    });

  const deposited = settlements.filter((s) => s.deposit > 0);
  const salesDeposited = deposited.reduce((a, s) => a + s.sales, 0);
  const fee = deposited.reduce((a, s) => a + s.fee, 0);

  // 이 달 입금 중 어느 묶음에도 안 붙은 것 (지난달 주문분 정산은 제외: 지난달 묶음의 payout일에 해당)
  const monthStart = month + "-01";
  const unmatchedDeposits = [...deposits.entries()]
    .filter(([date]) => date >= monthStart && date <= lastBankDate && !used.has(date))
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    channel,
    sales: daily.reduce((a, s) => a + s.amount, 0),
    deposited: deposited.reduce((a, s) => a + s.deposit, 0),
    fee,
    feeRate: salesDeposited > 0 ? round1((fee / salesDeposited) * 100) : null,
    pending: settlements.filter((s) => s.status === "예정").reduce((a, s) => a + s.sales, 0),
    missing: settlements.filter((s) => s.status === "미입금").reduce((a, s) => a + s.sales, 0),
    settlements,
    unmatchedDeposits,
  };
}

// 지난달 주문분 중 이 달에 들어온 입금은 "지난달 묶음"이다. 이 달 입금 대조에서 그것을 빼기 위해 계산한다.
export function prevMonthPayoutsInto(month: Month, rule: SettlementRule, prevDaily: DailySale[], holidays: string[] = []): string[] {
  const days = new Set<string>();
  for (const s of prevDaily) {
    if (s.channel !== rule.channel) continue;
    const p = payoutDate(s.date, rule, holidays);
    if (p.startsWith(month)) days.add(p);
  }
  return [...days];
}

export const DEFAULT_RULES: SettlementRule[] = [
  { channel: "hall_card", mode: "days", days: 2, weekday: 0 },
  { channel: "baemin", mode: "weekly", days: 0, weekday: 0 },
  { channel: "coupang", mode: "weekly", days: 0, weekday: 4 },
  { channel: "yogiyo", mode: "days", days: 5, weekday: 0 },
  { channel: "etc", mode: "days", days: 3, weekday: 0 },
];
