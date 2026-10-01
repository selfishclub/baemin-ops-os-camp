import { DAY_KEYS, type DayKey } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");

/** Date → "YYYY-MM-DD" (기기 시간대 기준) */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, n: number): string {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** 그 날짜가 속한 주의 월요일 (주는 월~일 기준) */
export function mondayOf(iso: string): string {
  const d = fromISODate(iso);
  const dow = (d.getDay() + 6) % 7; // 월=0 … 일=6
  d.setDate(d.getDate() - dow);
  return toISODate(d);
}

/** 월요일부터 7일 */
export function weekDates(monday: string): string[] {
  return DAY_KEYS.map((_, i) => addDays(monday, i));
}

export function dayKeyOf(iso: string): DayKey {
  return DAY_KEYS[(fromISODate(iso).getDay() + 6) % 7];
}

export function todayISO(): string {
  return toISODate(new Date());
}

/** "2026-09-15" → "9/15" */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}

/** "2026-09" 형태의 월 키 */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function monthDates(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return Array.from({ length: last }, (_, i) => `${y}-${pad(m)}-${pad(i + 1)}`);
}
