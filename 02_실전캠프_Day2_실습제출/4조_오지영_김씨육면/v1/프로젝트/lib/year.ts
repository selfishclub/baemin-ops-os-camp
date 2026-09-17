"use client";

import { loadMonth } from "./store";
import { summarize } from "./summary";
import type { Transaction } from "./types";

export interface MonthRow {
  month: string;
  label: string;
  hasData: boolean;
  closed: boolean;
  revenue: number;
  expense: number;
  profit: number;
  margin: number;
  prime: number;
  primeRatio: number;
  fee: number;
  feeRate: number;
  personal: number;
  txCount: number;
  reviewCount: number;
  byAccount: Map<string, number>;
  transactions: Transaction[];
}

export interface YearView {
  year: number;
  rows: MonthRow[];
  /** 자료가 들어 있는 달만 */
  filled: MonthRow[];
  revenue: number;
  expense: number;
  profit: number;
  margin: number;
  prime: number;
  primeRatio: number;
  fee: number;
  personal: number;
  closedCount: number;
  /** 계정과목 연간 합계, 금액 내림차순 */
  accounts: { account: string; amount: number; ratio: number; monthly: number }[];
}

export function buildYear(year: number, live?: { month: string; state: ReturnType<typeof loadMonth> }): YearView {
  const rows: MonthRow[] = [];

  for (let m = 1; m <= 12; m++) {
    const month = `${year}-${String(m).padStart(2, "0")}`;
    const st = live && live.month === month ? live.state : loadMonth(month);
    const s = summarize(month, st.transactions, st.revenue);
    const hasData = st.transactions.length > 0 || s.revenue.gross > 0;
    rows.push({
      month,
      label: `${m}월`,
      hasData,
      closed: st.closed,
      revenue: s.revenue.gross,
      expense: s.expense.total,
      profit: s.operatingProfit,
      margin: s.operatingMargin,
      prime: s.primeCost,
      primeRatio: s.primeCostRatio,
      fee: s.revenue.fee,
      feeRate: s.revenue.feeRate,
      personal: s.personal.total,
      txCount: s.txCount,
      reviewCount: s.reviewCount,
      byAccount: new Map(s.expense.byAccount.map((a) => [a.account, a.amount])),
      transactions: st.transactions,
    });
  }

  const filled = rows.filter((r) => r.hasData);
  const revenue = filled.reduce((a, b) => a + b.revenue, 0);
  const expense = filled.reduce((a, b) => a + b.expense, 0);
  const prime = filled.reduce((a, b) => a + b.prime, 0);

  const accTotals = new Map<string, number>();
  for (const r of filled) {
    for (const [k, v] of r.byAccount) accTotals.set(k, (accTotals.get(k) ?? 0) + v);
  }
  const n = filled.length || 1;

  return {
    year,
    rows,
    filled,
    revenue,
    expense,
    profit: revenue - expense,
    margin: revenue ? (revenue - expense) / revenue : 0,
    prime,
    primeRatio: revenue ? prime / revenue : 0,
    fee: filled.reduce((a, b) => a + b.fee, 0),
    personal: filled.reduce((a, b) => a + b.personal, 0),
    closedCount: filled.filter((r) => r.closed).length,
    accounts: [...accTotals]
      .map(([account, amount]) => ({
        account,
        amount,
        ratio: revenue ? amount / revenue : 0,
        monthly: amount / n,
      }))
      .sort((a, b) => b.amount - a.amount),
  };
}

/** 자료가 들어 있는 연도들 */
export function storedYears(): number[] {
  if (typeof window === "undefined") return [];
  const years = new Set<number>();
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (!k?.startsWith("kimssi-settlement:")) continue;
    const y = Number(k.slice("kimssi-settlement:".length, "kimssi-settlement:".length + 4));
    if (!Number.isNaN(y)) years.add(y);
  }
  return [...years].sort();
}
