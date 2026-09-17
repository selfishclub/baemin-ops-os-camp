/** 한국 시간 기준 월요일~일요일 주간 범위 계산 */

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function toYmd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** 해당 날짜가 속한 주의 월요일 */
export function weekStartOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = x.getDay(); // 0=일
  const diff = dow === 0 ? -6 : 1 - dow;
  return addDays(x, diff);
}

export function weekRange(d: Date): { start: string; end: string } {
  const s = weekStartOf(d);
  return { start: toYmd(s), end: toYmd(addDays(s, 6)) };
}

export function weekEndOf(start: string): string {
  return toYmd(addDays(parseYmd(start), 6));
}

export function weekLabel(start: string): string {
  const s = parseYmd(start);
  const e = addDays(s, 6);
  return `${s.getMonth() + 1}/${s.getDate()} ~ ${e.getMonth() + 1}/${e.getDate()}`;
}

/** 최근 n주의 시작일 목록 (이번 주 포함, 최신순) */
export function recentWeekStarts(n: number, now = new Date()): string[] {
  const out: string[] = [];
  let s = weekStartOf(now);
  for (let i = 0; i < n; i++) {
    out.push(toYmd(s));
    s = addDays(s, -7);
  }
  return out;
}
