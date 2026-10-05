import type { UploadRecord } from "./types";

// "통장을 어디까지 받았나" — 다음에 은행에서 어느 기간을 내려받아야 하는지 알려 준다.
//  은행 사이트에서 기간을 손으로 고르다 보면 앞 기간을 빠뜨리기 쉽다.
//  (실제로 10/3~10/4만 받아 와서 10/1~10/2가 빠질 뻔한 일이 있었다 — 2026-10-05)

const day = 864e5;
const shift = (d: string, n: number) => new Date(new Date(d + "T00:00:00Z").getTime() + n * day).toISOString().slice(0, 10);

/** 올린 기간들을 겹치는 것끼리 합쳐 이어진 덩어리로 (날짜 오름차순) */
export function mergeRanges(uploads: UploadRecord[]): { from: string; to: string }[] {
  const sorted = uploads
    .filter((u) => u.from && u.to && u.from <= u.to)
    .map((u) => ({ from: u.from, to: u.to }))
    .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  const out: { from: string; to: string }[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    // 하루 차이로 붙어 있어도 이어진 것으로 본다 (1~2일 받고 3~4일 받은 경우)
    if (last && r.from <= shift(last.to, 1)) {
      if (r.to > last.to) last.to = r.to;
    } else out.push({ ...r });
  }
  return out;
}

export interface NextFetch {
  /** 다음에 받아야 할 기간 */
  from: string;
  to: string;
  /** 며칠치인가 */
  days: number;
  /** 지금까지 받은 마지막 날 (처음이면 null) */
  lastTo: string | null;
}

/** 다음에 받아야 할 기간. 오늘까지 다 받았으면 null */
export function nextFetch(uploads: UploadRecord[], today: string): NextFetch | null {
  const merged = mergeRanges(uploads);
  if (merged.length === 0) return { from: today.slice(0, 8) + "01", to: today, days: Number(today.slice(8)) , lastTo: null };
  const lastTo = merged[merged.length - 1].to;
  if (lastTo >= today) return null;
  const from = shift(lastTo, 1);
  const days = Math.round((new Date(today + "T00:00:00Z").getTime() - new Date(from + "T00:00:00Z").getTime()) / day) + 1;
  return { from, to: today, days, lastTo };
}

/** 가운데가 빈 기간 (앞뒤는 받았는데 중간이 빠진 것) */
export function missingRanges(uploads: UploadRecord[]): { from: string; to: string }[] {
  const merged = mergeRanges(uploads);
  const out: { from: string; to: string }[] = [];
  for (let i = 1; i < merged.length; i += 1) out.push({ from: shift(merged[i - 1].to, 1), to: shift(merged[i].from, -1) });
  return out;
}

/** "10월 5일" 처럼 읽기 좋게 */
export const dayLabel = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;
