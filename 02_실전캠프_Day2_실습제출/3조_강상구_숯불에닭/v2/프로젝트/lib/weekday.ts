import { isHall, type Channel } from "./categories";
import type { DailySale } from "./types";

// 요일별 평균 매출 — "오늘 왜 이렇게 한가하지?"가 원래 그런 요일인지 보려고.
// 매출이 0인 날은 쉰 날로 보고 평균에서 뺀다(명절·휴무).

export const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
/** 보는 차례는 월요일부터 — 주간 근무표와 같은 순서 */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export interface DayTotal {
  date: string;
  total: number;
  delivery: number;
}

export interface WeekdayStat {
  day: number; // 0=일 … 6=토
  label: string;
  days: number; // 그 요일에 영업한 날 수
  total: number;
  avg: number; // 하루 평균
  delivery: number;
  deliveryPct: number | null;
}

export interface WeekdayReport {
  rows: WeekdayStat[]; // 월~일 차례
  openDays: number;
  total: number;
  avg: number; // 영업일 하루 평균
  max: number; // 막대 길이 기준 (가장 센 요일의 평균)
  best: WeekdayStat | null;
  worst: WeekdayStat | null;
}

/** 하루치로 합치기 — 같은 날 여러 채널을 한 줄로 */
export function dayTotals(sales: DailySale[], channels?: Channel[]): DayTotal[] {
  const by = new Map<string, DayTotal>();
  for (const s of sales) {
    const row = by.get(s.date) ?? { date: s.date, total: 0, delivery: 0 };
    row.total += s.amount;
    if (!isHall(s.channel, channels)) row.delivery += s.amount;
    by.set(s.date, row);
  }
  return [...by.values()].filter((d) => d.total > 0).sort((a, b) => a.date.localeCompare(b.date));
}

export function weekdayReport(sales: DailySale[], channels?: Channel[]): WeekdayReport {
  const days = dayTotals(sales, channels);
  const rows: WeekdayStat[] = WEEK_ORDER.map((day) => ({ day, label: WEEKDAY_LABELS[day], days: 0, total: 0, avg: 0, delivery: 0, deliveryPct: null }));
  const byDay = new Map(rows.map((r) => [r.day, r]));

  for (const d of days) {
    // "2026-09-17" → 시간대에 안 흔들리게 UTC로 읽는다
    const row = byDay.get(new Date(`${d.date}T00:00:00Z`).getUTCDay());
    if (!row) continue;
    row.days += 1;
    row.total += d.total;
    row.delivery += d.delivery;
  }
  for (const r of rows) {
    r.avg = r.days ? Math.round(r.total / r.days) : 0;
    r.deliveryPct = r.total > 0 ? Math.round((r.delivery / r.total) * 1000) / 10 : null;
  }

  const filled = rows.filter((r) => r.days > 0);
  const total = days.reduce((a, d) => a + d.total, 0);
  return {
    rows,
    openDays: days.length,
    total,
    avg: days.length ? Math.round(total / days.length) : 0,
    max: Math.max(...rows.map((r) => r.avg), 1),
    best: filled.length ? filled.reduce((a, b) => (b.avg > a.avg ? b : a)) : null,
    worst: filled.length ? filled.reduce((a, b) => (b.avg < a.avg ? b : a)) : null,
  };
}
