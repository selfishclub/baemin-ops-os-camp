import { REVENUE_CHANNELS } from "./accounts";
import type { RevenueLine } from "./types";
import { daysInMonth } from "./daily";

/**
 * 일별 매출.
 *
 * 통장 입금은 '정산일'이지 '판 날'이 아니다 — 배민은 며칠 뒤에 들어온다.
 * 그래서 입금으로 달력을 그리면 7월 1일 칸에 6월 매출이 찍힌다.
 * 판 날짜로 적는 자리를 따로 둔다. 페이히어 파일을 올려 채우고, 손으로도 고친다.
 */
export interface DailySale {
  /** YYYY-MM-DD — 판 날 */
  date: string;
  /** 홀 · 배달의민족 · 쿠팡이츠 · 요기요 … */
  channel: string;
  amount: number;
}

export const SALES_CHANNELS = REVENUE_CHANNELS.map((c) => c.channel);

/**
 * 화면에 보일 채널 — 기본 목록에 자료에 실제로 들어온 것을 더한다.
 * 페이히어가 '셀러'처럼 우리가 모르는 이름을 보내와도 사라지면 안 된다.
 */
export const channelsIn = (sales: DailySale[]): string[] => [
  ...SALES_CHANNELS,
  ...[...new Set(sales.map((s) => s.channel))].filter((c) => !SALES_CHANNELS.includes(c)).sort(),
];

export interface DayCell {
  date: string;
  day: number;
  weekday: number;
  /** 채널별 금액 */
  by: Record<string, number>;
  total: number;
  /** 이 달이 아닌 칸(앞뒤 여백) */
  outside: boolean;
}

/** 월~일 일곱 칸으로 끊어 달력 격자를 만든다 */
export function buildCalendar(month: string, sales: DailySale[]): DayCell[][] {
  const [y, m] = month.split("-").map(Number);
  const total = daysInMonth(month);
  const by = new Map<string, Record<string, number>>();
  for (const s of sales) {
    if (!s.date.startsWith(month)) continue;
    const cur = by.get(s.date) ?? {};
    cur[s.channel] = (cur[s.channel] ?? 0) + s.amount;
    by.set(s.date, cur);
  }

  const cell = (d: number, outside: boolean): DayCell => {
    const date = `${month}-${String(d).padStart(2, "0")}`;
    const row = outside ? {} : (by.get(date) ?? {});
    return {
      date,
      day: d,
      weekday: new Date(y, m - 1, d).getDay(),
      by: row,
      total: Object.values(row).reduce((a, b) => a + b, 0),
      outside,
    };
  };

  // 달력은 일요일에서 시작한다
  const lead = new Date(y, m - 1, 1).getDay();
  const cells: DayCell[] = [];
  for (let i = 0; i < lead; i++) cells.push({ ...cell(1, true), day: 0, date: `${month}-lead-${i}` });
  for (let d = 1; d <= total; d++) cells.push(cell(d, false));
  while (cells.length % 7) cells.push({ ...cell(total, true), day: 0, date: `${month}-tail-${cells.length}` });

  const weeks: DayCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** 채널별 그 달 합계 */
export function channelTotals(month: string, sales: DailySale[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of sales) {
    if (!s.date.startsWith(month)) continue;
    m.set(s.channel, (m.get(s.channel) ?? 0) + s.amount);
  }
  return m;
}

export const monthTotal = (month: string, sales: DailySale[]): number =>
  sales.filter((s) => s.date.startsWith(month)).reduce((a, b) => a + b.amount, 0);

/** 홀 / 배달 둘로 가른 합계 — 사장님이 가장 자주 보는 구분 */
export function hallVsDelivery(month: string, sales: DailySale[]): { hall: number; delivery: number } {
  let hall = 0;
  let delivery = 0;
  for (const s of sales) {
    if (!s.date.startsWith(month)) continue;
    const acct = REVENUE_CHANNELS.find((c) => c.channel === s.channel)?.account;
    if (acct === "매출-배달") delivery += s.amount;
    else hall += s.amount;
  }
  return { hall, delivery };
}

/** 한 칸에 적힌 값을 바꾼다. 0이면 지운다 */
export function setSale(sales: DailySale[], date: string, channel: string, amount: number): DailySale[] {
  const rest = sales.filter((s) => !(s.date === date && s.channel === channel));
  return amount > 0 ? [...rest, { date, channel, amount }] : rest;
}

/**
 * 매출 줄을 만든다.
 * 매출액은 달력(판 날)에서, 입금액은 통장에서 온다 — 둘의 차이가 수수료다.
 */
export function buildRevenue(
  month: string,
  sales: DailySale[],
  deposits: { channel?: string | null; kind?: string; amount: number }[]
): RevenueLine[] {
  const gross = channelTotals(month, sales);
  const dep = new Map<string, number>();
  for (const d of deposits) {
    if ((d.kind ?? "매출") !== "매출" || !d.channel) continue;
    dep.set(d.channel, (dep.get(d.channel) ?? 0) + d.amount);
  }
  const channels = [...new Set([...gross.keys(), ...dep.keys()])];
  return channels.map((channel) => ({
    account: REVENUE_CHANNELS.find((c) => c.channel === channel)?.account ?? "매출-기타",
    channel,
    gross: gross.get(channel) ?? 0,
    deposit: dep.get(channel) ?? 0,
  }));
}
