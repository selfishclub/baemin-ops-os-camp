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
  manual?: boolean; // 쿠팡이츠처럼 사장님이 사장님 사이트에서 직접 출금 신청해야 통장에 들어오는 앱.
  //   정산 예정일 뒤에 늦게 들어오거나 며칠치가 한 번에 들어와도, 입금 순서대로 그때까지 정산된 매출 묶음에 붙인다.
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

  if (rule.manual) return settleManual(channel, month, groups, deposits, daily, lastBankDate);

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

// 직접 출금 신청하는 앱: 입금을 날짜순으로 보며, 그 입금일까지 정산 예정일이 지난(아직 안 붙은) 매출 묶음을 한꺼번에 그 입금에 붙인다.
//  - 하루 늦게 출금해도, 이틀치를 한 번에 출금해도 짝이 맞는다.
//  - 붙일 묶음이 없는 입금(지난달 주문분 등)은 "짝이 안 맞는 입금"으로 남긴다.
//  - 예정일이 지났는데 아직 입금이 없는 묶음은 "미입금" — 출금 신청을 아직 안 한 것일 수 있다.
function settleManual(
  channel: ChannelId,
  month: Month,
  groups: Map<string, { from: string; to: string; sales: number }>,
  deposits: Map<string, number>,
  daily: DailySale[],
  lastBankDate: string,
): ChannelSettlementSummary {
  const bundles = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([payout, g]) => ({ payout, ...g, claimed: false }));
  const settlements: Settlement[] = [];
  const unmatchedDeposits: { date: string; amount: number }[] = [];
  const monthStart = month + "-01";
  for (const [date, amount] of [...deposits.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (amount <= 0) continue;
    const eligible = bundles.filter((b) => !b.claimed && b.payout <= date);
    if (eligible.length === 0) {
      if (date >= monthStart && date <= lastBankDate) unmatchedDeposits.push({ date, amount });
      continue;
    }
    for (const b of eligible) b.claimed = true;
    const sales = eligible.reduce((a, b) => a + b.sales, 0);
    const from = eligible[0].from;
    const to = eligible[eligible.length - 1].to;
    const fee = sales - amount;
    const status: Settlement["status"] = sales === 0 ? "매출없음" : amount < sales * 0.7 || amount > sales * (1 + MISMATCH_TOLERANCE) ? "차이" : "일치";
    settlements.push({ channel, from, to, sales, payout: date, deposit: amount, fee, feeRate: sales > 0 ? round1((fee / sales) * 100) : null, status });
  }
  for (const b of bundles) {
    if (b.claimed) continue;
    settlements.push({ channel, from: b.from, to: b.to, sales: b.sales, payout: b.payout, deposit: 0, fee: 0, feeRate: null, status: b.sales === 0 ? "매출없음" : b.payout > lastBankDate ? "예정" : "미입금" });
  }
  settlements.sort((a, b) => a.from.localeCompare(b.from));
  const deposited = settlements.filter((s) => s.deposit > 0);
  const salesDeposited = deposited.reduce((a, s) => a + s.sales, 0);
  const fee = deposited.reduce((a, s) => a + s.fee, 0);
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

// 기본 규칙 — 각 사가 공개한 정산 안내를 기준으로 (2026-09-19 조사). 실제 입금과 다르면 정산 탭에서 고친다.
export const DEFAULT_RULES: SettlementRule[] = [
  { channel: "hall_card", mode: "days", days: 2, weekday: 0 }, // 카드사 일반: 매출일 + 2영업일
  { channel: "baemin", mode: "days", days: 3, weekday: 0 }, // 배민: 주문(구매확정)일 + 3영업일 (2022.2~)
  { channel: "coupang", mode: "days", days: 4, weekday: 0, manual: true }, // 쿠팡이츠: 매출 발생일 + 4영업일에 정산되지만 사장님이 직접 출금 신청해야 통장에 들어온다 (2026-09-19)
  { channel: "yogiyo", mode: "days", days: 5, weekday: 0 }, // 요기요: 결제일 + 5영업일 (2024.8~ 일 단위)
  { channel: "etc", mode: "days", days: 1, weekday: 0 }, // 땡겨요: 당일~익영업일 (카드결제는 익영업일)
];

// 카드사별 기본 (매출일 + N영업일). 간편결제(카카오페이 등)는 정산기준일 + 1영업일
export const CARD_RULE_DAYS: Record<string, number> = { card_easy: 1 };
export const DEFAULT_CARD_DAYS = 2;

// 규칙의 근거 — 화면에 "공식 안내 기준 / 확인 필요"로 보여 준다
export const RULE_NOTES: Record<string, { source: "official" | "general" | "unknown"; text: string }> = {
  hall_card: { source: "general", text: "카드사 일반 관행 D+2영업일. 카드사마다 D+1~3으로 다를 수 있어요" },
  card_bc: { source: "general", text: "카드사 일반 관행 D+2영업일" },
  card_kb: { source: "general", text: "카드사 일반 관행 D+2영업일" },
  card_shinhan: { source: "general", text: "카드사 일반 관행 D+2영업일" },
  card_samsung: { source: "general", text: "카드사 일반 관행 D+2영업일" },
  card_hyundai: { source: "general", text: "카드사 일반 관행 D+2영업일" },
  card_lotte: { source: "general", text: "카드사 일반 관행 D+2영업일" },
  card_hana: { source: "general", text: "카드사 일반 관행 D+2영업일" },
  card_nh: { source: "general", text: "카드사 일반 관행 D+2영업일" },
  card_woori: { source: "general", text: "카드사 일반 관행 D+2영업일" },
  card_easy: { source: "official", text: "카카오페이 안내: 정산기준일 + 1영업일 (네이버페이 등은 다를 수 있음)" },
  baemin: { source: "official", text: "배민 안내: 주문일 + 3영업일 (주말·공휴일 제외)" },
  coupang: { source: "official", text: "쿠팡이츠 사장님 사이트 안내: 매출 발생일 + 4영업일. 직접 출금 신청해야 통장에 들어와서 늦거나 몰아서 들어올 수 있음" },
  yogiyo: { source: "official", text: "요기요 안내: 결제일 + 5영업일 (2024.8부터 일 단위)" },
  etc: { source: "official", text: "땡겨요 안내: 당일~익영업일 입금 (카드결제는 익영업일)" },
};
