import type { Month, MonthClosing, UploadRecord } from "./types";

// 같은 기간의 은행 파일을 두 번 올리는 것을 막는다: 날짜 범위가 겹치면 중복.
export function findOverlap(uploads: UploadRecord[], from: string, to: string): UploadRecord | null {
  return uploads.find((u) => from <= u.to && to >= u.from) ?? null;
}

export function isClosed(c: MonthClosing | null | undefined): boolean {
  return !!c?.closedAt;
}

export function closeMonth(month: Month, prev: MonthClosing | null, now = new Date()): MonthClosing {
  return { month, closedAt: now.toISOString(), edits: prev?.edits ?? [] };
}

// 마감한 달을 고치면 무엇을 고쳤는지 남긴다. 마감 전이면 기록하지 않는다.
export function logEdit(c: MonthClosing | null, what: string, now = new Date()): MonthClosing | null {
  if (!c || !isClosed(c)) return c;
  return { ...c, edits: [...c.edits, { at: now.toISOString(), what }] };
}

export function prevMonth(month: Month): Month {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

export function nextMonth(month: Month): Month {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return d.toISOString().slice(0, 7);
}

export function monthLabel(month: Month): string {
  const [y, m] = month.split("-");
  return `${y}년 ${Number(m)}월`;
}

// 기간이 겹치는 거래내역 파일을 또 올렸을 때: 이미 있는 줄(날짜·거래처·출금·입금이 같은 줄)은 빼고 새 줄만 남긴다.
// 같은 날 같은 금액이 두 번 있을 수 있어서(편의점 등) 개수까지 센다.
export function newBankRowsOnly<T extends { date: string; payee: string; out: number; in: number }>(rows: T[], existing: { date: string; payee: string; out: number; in: number }[]): { fresh: T[]; duplicates: number } {
  const k = (r: { date: string; payee: string; out: number; in: number }) => `${r.date}|${r.payee.replace(/\s+/g, "")}|${r.out}|${r.in}`;
  const left = new Map<string, number>();
  for (const e of existing) left.set(k(e), (left.get(k(e)) ?? 0) + 1);
  const fresh: T[] = [];
  let duplicates = 0;
  for (const r of rows) {
    const n = left.get(k(r)) ?? 0;
    if (n > 0) {
      left.set(k(r), n - 1);
      duplicates++;
    } else fresh.push(r);
  }
  return { fresh, duplicates };
}

// from~to 사이의 달 목록 ("2026-08-28" ~ "2026-09-03" → ["2026-08", "2026-09"])
export function monthsBetween(from: string, to: string): Month[] {
  const out: Month[] = [];
  for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = nextMonth(m)) out.push(m);
  return out;
}
