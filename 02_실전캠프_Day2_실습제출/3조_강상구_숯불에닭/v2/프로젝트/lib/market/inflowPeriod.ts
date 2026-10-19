// 일간은 하루, 주간은 월~일, 월간은 달력 한 달. 이번 기간은 한국 시간 어제까지만 집계한다.
export type InflowMode = "daily" | "weekly" | "monthly";
export const INFLOW_FIRST_DAY = "2024-09-01";
export const shiftInflowDay = (day: string, amount: number) => new Date(Date.parse(`${day}T00:00:00Z`) + amount * 86400000).toISOString().slice(0, 10);
export function inflowYesterday(now = new Date()): string {
  return shiftInflowDay(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now), -1);
}
export function inflowPeriod(mode: InflowMode, anchor: string, now = new Date()) {
  const latest = inflowYesterday(now);
  const day = anchor < INFLOW_FIRST_DAY ? INFLOW_FIRST_DAY : anchor > latest ? latest : anchor;
  const date = new Date(`${day}T00:00:00Z`);
  let start = day, end = day;
  if (mode === "weekly") {
    start = shiftInflowDay(day, -((date.getUTCDay() + 6) % 7));
    end = shiftInflowDay(start, 6);
  } else if (mode === "monthly") {
    start = `${day.slice(0, 7)}-01`;
    end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  }
  if (start < INFLOW_FIRST_DAY) start = INFLOW_FIRST_DAY;
  if (end > latest) end = latest;
  return { start, end, key: `${start}/${end}`, latest };
}
export function moveInflowPeriod(mode: InflowMode, anchor: string, direction: -1 | 1): string {
  if (mode !== "monthly") return shiftInflowDay(anchor, direction * (mode === "weekly" ? 7 : 1));
  const date = new Date(`${anchor}T00:00:00Z`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + direction, 1)).toISOString().slice(0, 10);
}
export function inflowPeriodLabel(start: string, end: string): string {
  const format = (day: string) => {
    const d = new Date(`${day}T00:00:00Z`);
    return `${day.slice(2, 4)}. ${d.getUTCMonth() + 1}. ${d.getUTCDate()}. ${"일월화수목금토"[d.getUTCDay()]}`;
  };
  return start === end ? format(start) : `${format(start)} - ${format(end)}`;
}
