import type { Channel } from "./categories";
import type { DailySale, Month, Shift, Staff } from "./types";

// 오늘 마감 입력 — 일별 매출·시급제 근무 계산

export const WEEK_HOURS_WARN = 14; // 주 15시간에 가까우면 "확인 필요" (주휴수당이 생길 수 있는 기준)
export const MAX_HOURS_PER_DAY = 24;

export const round1 = (n: number) => Math.round(n * 10) / 10;
export const pctOf = (part: number, whole: number) => (whole > 0 ? round1((part / whole) * 100) : null);

export function daysInMonth(month: Month): string[] {
  const [y, m] = month.split("-").map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

export function todayStr(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function shiftDate(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// 그 주의 월요일 (주간 근무시간 계산 기준)
export function weekStart(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7; // 월=0
  return shiftDate(date, -dow);
}

export interface DayTotals {
  date: string;
  sales: number; // 채널 합계
  byChannel: Record<string, number>;
  labor: number; // 어림 인건비 = Σ 시간 × 시급
  hours: number;
  laborRate: number | null; // 인건비 ÷ 매출 %
  entered: boolean; // 매출 한 칸이라도 넣었나
}

export function dayTotals(date: string, sales: DailySale[], shifts: Shift[], staff: Staff[]): DayTotals {
  const byChannel: Record<string, number> = {};
  let total = 0;
  for (const s of sales) {
    if (s.date !== date) continue;
    byChannel[s.channel] = (byChannel[s.channel] ?? 0) + s.amount;
    total += s.amount;
  }
  let labor = 0;
  let hours = 0;
  for (const sh of shifts) {
    if (sh.date !== date) continue;
    const wage = staff.find((p) => p.id === sh.staffId)?.wage ?? 0;
    labor += sh.hours * wage;
    hours += sh.hours;
  }
  return {
    date,
    sales: total,
    byChannel,
    labor: Math.round(labor),
    hours,
    laborRate: pctOf(labor, total),
    entered: sales.some((s) => s.date === date),
  };
}

export interface MonthSummary {
  month: Month;
  days: DayTotals[];
  enteredDays: number;
  missingDays: string[]; // 오늘까지 중 안 넣은 날
  sales: number;
  byChannel: Record<string, number>;
  labor: number;
  laborRate: number | null;
  avgDailySales: number | null;
}

export function monthSummary(month: Month, sales: DailySale[], shifts: Shift[], staff: Staff[], today = todayStr()): MonthSummary {
  const days = daysInMonth(month).map((d) => dayTotals(d, sales, shifts, staff));
  const entered = days.filter((d) => d.entered);
  const byChannel: Record<string, number> = {};
  for (const d of days) for (const [k, v] of Object.entries(d.byChannel)) byChannel[k] = (byChannel[k] ?? 0) + v;
  const total = entered.reduce((a, d) => a + d.sales, 0);
  const labor = days.reduce((a, d) => a + d.labor, 0);
  return {
    month,
    days,
    enteredDays: entered.length,
    missingDays: days.filter((d) => !d.entered && d.date <= today).map((d) => d.date),
    sales: total,
    byChannel,
    labor,
    laborRate: pctOf(labor, total),
    avgDailySales: entered.length ? Math.round(total / entered.length) : null,
  };
}

// 사람별 이번 주 근무시간 — 15시간 근처면 확인 표시
export interface WeekHours {
  staffId: string;
  alias: string;
  hours: number;
  warn: boolean;
}

export function weekHoursByStaff(date: string, shifts: Shift[], staff: Staff[]): WeekHours[] {
  const from = weekStart(date);
  const to = shiftDate(from, 6);
  return staff
    .filter((p) => p.active)
    .map((p) => {
      const hours = shifts.filter((s) => s.staffId === p.id && s.date >= from && s.date <= to).reduce((a, s) => a + s.hours, 0);
      return { staffId: p.id, alias: p.alias, hours: round1(hours), warn: hours >= WEEK_HOURS_WARN };
    });
}

// 채널별 월 합계 (배달앱 탭의 주문금액을 자동으로 채우는 데 씀). 홀은 카드+현금 합계도 같이.
export function monthChannelTotals(month: Month, sales: DailySale[], channels: Channel[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of sales) {
    if (!s.date.startsWith(month)) continue;
    out[s.channel] = (out[s.channel] ?? 0) + s.amount;
  }
  const hall = channels.filter((c) => c.kind !== "delivery").reduce((a, c) => a + (out[c.id] ?? 0), 0);
  if (hall > 0) out.hall = hall;
  return out;
}

// 출근·퇴근 시각("HH:MM")으로 근무시간을 구한다. 퇴근이 출근보다 이르면 자정을 넘긴 것으로 본다. 0.5시간 단위 반올림 없이 소수 1자리.
export function hoursBetween(start: string, end: string): number {
  const m = (t: string) => {
    const [h, mi] = t.split(":").map(Number);
    return Number.isFinite(h) && Number.isFinite(mi) ? h * 60 + mi : NaN;
  };
  const a = m(start);
  const b = m(end);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  let diff = b - a;
  if (diff < 0) diff += 24 * 60;
  return Math.round((diff / 60) * 10) / 10;
}

// 사람이 친 시각을 "HH:MM"으로 정리한다. "6"→"06:00", "610"→"06:10", "1830"→"18:30", "18:3"→"18:03", "24:00"→"00:00". 못 알아들으면 "".
export function normalizeTime(raw: string): string {
  const t = raw.trim().replace(/[.\s]/g, ":");
  let h: number;
  let m: number;
  if (t.includes(":")) {
    const [a, b = "0"] = t.split(":");
    h = Number(a);
    m = Number(b);
  } else {
    const d = t.replace(/\D/g, "");
    if (!d) return "";
    if (d.length <= 2) {
      h = Number(d);
      m = 0;
    } else if (d.length === 3) {
      h = Number(d[0]);
      m = Number(d.slice(1));
    } else {
      h = Number(d.slice(0, 2));
      m = Number(d.slice(2, 4));
    }
  }
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 24 || m < 0 || m > 59) return "";
  if (h === 24) h = 0;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export interface DailyIssue {
  level: "error" | "warn";
  message: string;
}

export function checkDay(
  entries: { channelName: string; amount: number }[],
  shiftRows: { alias: string; hours: number }[],
  avgDailySales: number | null,
): DailyIssue[] {
  const issues: DailyIssue[] = [];
  const total = entries.reduce((a, e) => a + e.amount, 0);
  for (const e of entries) if (e.amount < 0) issues.push({ level: "error", message: `${e.channelName}: 금액은 0보다 작을 수 없어요.` });
  for (const r of shiftRows) {
    if (r.hours < 0 || r.hours > MAX_HOURS_PER_DAY) issues.push({ level: "error", message: `${r.alias}: 근무시간은 0~24시간 사이여야 해요.` });
    else if (r.hours > 12) issues.push({ level: "warn", message: `${r.alias}: 하루 ${r.hours}시간이에요. 맞나요?` });
  }
  if (avgDailySales && total >= avgDailySales * 10) {
    issues.push({ level: "warn", message: `오늘 매출이 이번 달 하루 평균의 10배가 넘어요. 0이 하나 더 붙지 않았나요?` });
  }
  return issues;
}
