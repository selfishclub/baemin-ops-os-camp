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
