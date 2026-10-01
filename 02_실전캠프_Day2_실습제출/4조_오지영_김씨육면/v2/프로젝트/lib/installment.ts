import type { Transaction } from "./types";

/**
 * 할부를 달에 나눠 보기.
 *
 * 카드 파일에는 승인 전액이 승인한 달에 한 줄로 들어온다.
 * 450만원짜리 12개월 할부면 그 달 지출이 450만원 늘고 나머지 11달은 0이 된다.
 * 달끼리 나란히 놓고 볼 수가 없다.
 *
 * 그렇다고 저장된 거래를 쪼개면 카드 파일과 건수·금액이 안 맞아 대조가 깨진다.
 * 그래서 저장은 전액 그대로 두고, 집계할 때만 나눈다.
 */

/** YYYY-MM 에 n달을 더한다 */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const t = (y * 12 + (m - 1)) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

export const monthsBetween = (from: string, to: string): number => {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty * 12 + tm) - (fy * 12 + fm);
};

export const isInstallment = (t: Transaction) =>
  t.split?.kind === "할부" && (t.split?.total ?? 0) > 1;

/**
 * 이 거래가 그 달에 얼마만큼 걸리는가. 안 걸리면 null.
 * 마지막 회차가 나머지를 받아 전부 더하면 원금과 딱 맞는다.
 */
export function sliceFor(t: Transaction, month: string): number | null {
  if (!isInstallment(t)) return t.month === month ? t.amount : null;
  const start = t.date ? t.date.slice(0, 7) : t.month;
  const i = monthsBetween(start, month);
  const n = t.split!.total;
  if (i < 0 || i >= n) return null;
  const per = Math.floor(t.amount / n);
  return i === n - 1 ? t.amount - per * (n - 1) : per;
}

/** 그 달에 걸리는 몫. 사람이 읽을 안내에 쓴다 */
export const perMonthOf = (t: Transaction): number =>
  isInstallment(t) ? Math.floor(t.amount / t.split!.total) : t.amount;

/** 할부가 끝나는 달 */
export const lastMonthOf = (t: Transaction): string =>
  addMonths(t.date ? t.date.slice(0, 7) : t.month, (t.split?.total ?? 1) - 1);

/**
 * 그 달의 집계용 거래 목록.
 * 할부는 그 달 몫만큼으로 줄여서 넣고, 지난달에 산 할부도 이 달 몫이 있으면 끌어온다.
 */
export function spreadForMonth(month: string, all: Transaction[]): Transaction[] {
  const out: Transaction[] = [];
  for (const t of all) {
    const amount = sliceFor(t, month);
    if (amount === null || amount === 0) continue;
    if (!isInstallment(t)) {
      out.push(t);
      continue;
    }
    const start = t.date ? t.date.slice(0, 7) : t.month;
    const i = monthsBetween(start, month);
    out.push({
      ...t,
      // 같은 할부가 달마다 한 줄씩 생기므로 id 가 겹치면 안 된다
      id: `${t.id}#${i + 1}`,
      month,
      amount,
      split: { ...t.split!, current: i + 1 },
      // 이 달에 산 게 아니면 날짜는 그 달 1일로 — 원래 거래일은 메모에 남긴다
      date: i === 0 ? t.date : `${month}-01`,
      note: i === 0 ? t.note : [`${t.date ?? start} 할부 ${i + 1}/${t.split!.total}회차`, t.note].filter(Boolean).join(" · "),
    });
  }
  return out;
}

/** 이 달에 걸리는 할부가 있는 달들 — 어느 달을 뒤져야 하는지 */
export const monthsToScan = (month: string, span = 36): string[] =>
  Array.from({ length: span }, (_, i) => addMonths(month, -i));
