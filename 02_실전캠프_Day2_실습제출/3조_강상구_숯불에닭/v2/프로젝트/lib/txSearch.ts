import { monthsBetween, prevMonth } from "./month";
import type { Month, Transaction } from "./types";

// 올린 통장 거래 찾기 — 기간·글자·입출금으로 거른다.
// 화면에서 떼어 놓아야 숫자가 맞는지 테스트할 수 있어서 여기에 둔다.
export type TxKind = "전체" | "입금" | "출금" | "미분류";

export interface TxQuery {
  from?: string; // "2026-09-01" — 비우면 처음부터
  to?: string; // "2026-09-30" — 비우면 끝까지
  text?: string; // 거래처·분류에서 찾을 글자
  kind?: TxKind;
}

const squish = (s: string) => s.replace(/\s/g, "");

// 시작·끝을 거꾸로 넣어도 알아서 바로잡는다
export function normalizeQuery(q: TxQuery): TxQuery {
  if (q.from && q.to && q.from > q.to) return { ...q, from: q.to, to: q.from };
  return q;
}

export function matchesTx(t: Transaction, q: TxQuery): boolean {
  if (q.from && t.date < q.from) return false;
  if (q.to && t.date > q.to) return false;
  const text = (q.text ?? "").trim();
  if (text && !squish(`${t.payee} ${t.major ?? ""} ${t.minor ?? ""}`).includes(squish(text))) return false;
  if (q.kind === "입금") return t.in > 0;
  if (q.kind === "출금") return t.out !== 0; // 카드 취소(음수)도 출금 줄이다
  if (q.kind === "미분류") return !t.major;
  return true;
}

export function searchTxs(txs: Transaction[], q: TxQuery): Transaction[] {
  const query = normalizeQuery(q);
  return txs.filter((t) => matchesTx(t, query)).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export function txTotals(txs: Transaction[]): { count: number; in: number; out: number } {
  return { count: txs.length, in: txs.reduce((a, t) => a + t.in, 0), out: txs.reduce((a, t) => a + t.out, 0) };
}

export function lastDayOfMonth(month: Month): string {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

export function shiftDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

// 빠른 기간 버튼 — 날짜를 하나하나 고르지 않아도 되게
export function quickRange(kind: "month" | "week" | "prev", month: Month, today: string): { from: string; to: string } {
  if (kind === "week") return { from: shiftDays(today, -6), to: today };
  const m = kind === "prev" ? prevMonth(month) : month;
  return { from: `${m}-01`, to: lastDayOfMonth(m) };
}

// 이 기간을 보려면 어느 달의 거래를 불러와야 하나 (이미 있는 달은 빼고)
export function monthsToLoad(from: string, to: string, have: Month[]): Month[] {
  const { from: a, to: b } = normalizeQuery({ from, to }) as { from: string; to: string };
  return monthsBetween(a, b).filter((m) => !have.includes(m));
}
