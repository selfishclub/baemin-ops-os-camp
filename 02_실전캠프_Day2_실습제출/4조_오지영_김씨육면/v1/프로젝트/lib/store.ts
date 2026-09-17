"use client";

import { behaviorOf, getAccount, DEFAULT_BEHAVIOR } from "./accounts";
import { assignIds } from "./dedupe";
import { BASE_MAPPINGS, mergeMappings, type Mappings, type SubMemo, type SubRename } from "./mappings";
import { defaultRules, type MapRule } from "./rules";
import type { Reconciliation } from "./parseCard";
import type { Split } from "./split";
import type { RevenueLine, Transaction, TxSource } from "./types";

export interface ImportLog {
  name: string;
  kind: string;
  encoding: string;
  added: number;
  skipped: number;
  at: string;
  /** 현대카드 대사 결과 — 파일이 스스로 검산한 값 */
  recon?: Reconciliation;
  /** 지출 집계에서 뺀 취소 건. 버리지 않고 보관한다 */
  cancelled?: { date: string; merchant: string; amount: number }[];
  /** 거래 목록에서 제외한 소계 행 */
  subtotals?: { label: string; amount: number }[];
  /** 할부 건 */
  installments?: { date: string; merchant: string; amount: number; months: number }[];
  undated?: number;
  /** 금액이 ###### 로 깨져 못 읽은 건 */
  unreadable?: { date: string; merchant: string }[];
  headerRow?: number;
}

export interface MonthState {
  month: string;
  transactions: Transaction[];
  revenue: RevenueLine[];
  closed: boolean;
  /** §5-3 학습 — 검수하며 고친 매핑 */
  learned: MapRule[];
  subRenames: SubRename[];
  subMemos: SubMemo[];
  imports: ImportLog[];
}

export const newMonthState = (month: string): MonthState => ({
  month,
  transactions: [],
  revenue: [],
  closed: false,
  learned: [],
  subRenames: [],
  subMemos: [],
  imports: [],
});

/** 학습 규칙 → 커밋된 mappings.json → 코드 기본값 순으로 우선한다 */
export const rulesOf = (s: MonthState): MapRule[] => [
  ...s.learned,
  ...BASE_MAPPINGS.rules,
  ...defaultRules(),
];

export const exportableMappings = (s: MonthState): Mappings =>
  mergeMappings(BASE_MAPPINGS, {
    rules: s.learned,
    subRenames: s.subRenames,
    subMemos: s.subMemos,
  });

const PREFIX = "kimssi-settlement:";
const KEY = (month: string) => `${PREFIX}${month}`;

export function loadMonth(month: string): MonthState {
  if (typeof window === "undefined") return newMonthState(month);
  try {
    const raw = window.localStorage.getItem(KEY(month));
    if (!raw) return newMonthState(month);
    return { ...newMonthState(month), ...(JSON.parse(raw) as MonthState), month };
  } catch {
    return newMonthState(month);
  }
}

export const isEmptyMonth = (s: MonthState): boolean =>
  !s.transactions.length && !s.revenue.length && !s.imports.length && !s.closed;

export function saveMonth(s: MonthState) {
  if (typeof window === "undefined") return;
  try {
    // 빈 달을 써두면 '모든 달 지우기' 직후 보고 있던 달이 되살아나 목록에 남는다
    if (isEmptyMonth(s)) window.localStorage.removeItem(KEY(s.month));
    else window.localStorage.setItem(KEY(s.month), JSON.stringify(s));
  } catch {
    /* 저장 실패가 입력을 막지 않는다 */
  }
}

export function listStoredMonths(): string[] {
  if (typeof window === "undefined") return [];
  const out: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k?.startsWith(PREFIX)) out.push(k.slice(PREFIX.length));
  }
  return out.sort();
}

export function clearAllMonths() {
  if (typeof window === "undefined") return;
  for (const m of listStoredMonths()) window.localStorage.removeItem(KEY(m));
}

/* ── 거래 조작 ─────────────────────────────────────────── */

/** 계정을 바꾸면 그룹·고정변동 플래그도 따라오고, 검수 표시는 풀린다. */
export function applyAccount(t: Transaction, account: string, sub: string | null): Transaction {
  const def = getAccount(account);
  return {
    ...t,
    account,
    sub,
    group: def?.group ?? "unclassified",
    behavior: behaviorOf(account, sub, DEFAULT_BEHAVIOR),
    needsReview: false,
    reviewReason: null,
    confirmed: true,
  };
}

export const confirmTx = (t: Transaction): Transaction => ({
  ...t,
  needsReview: false,
  reviewReason: null,
  confirmed: true,
});

let manualSeq = 0;
export function makeManualTx(input: {
  month: string;
  date: string | null;
  account: string;
  sub: string | null;
  merchant: string;
  amount: number;
  source?: TxSource;
  note?: string | null;
  split?: Split | null;
}): Transaction {
  const def = getAccount(input.account);
  const base: Omit<Transaction, "id"> = {
    date: input.date,
    month: input.month,
    account: input.account,
    sub: input.sub,
    merchant: input.merchant,
    amount: input.amount,
    source: input.source ?? "manual",
    group: def?.group ?? "unclassified",
    behavior: behaviorOf(input.account, input.sub, DEFAULT_BEHAVIOR),
    needsReview: false,
    reviewReason: null,
    autoMapped: false,
    confirmed: true,
    note: input.note ?? null,
    split: input.split ?? null,
    flagged: false,
  };
  return { ...base, id: `${assignIds([base])[0].id}@${Date.now()}-${manualSeq++}` };
}

/* ── 소분류 정리 ───────────────────────────────────────── */

/** 소분류 이름 바꾸기 — 딸린 건이 모두 바뀌고 이력이 남는다 */
export function renameSub(s: MonthState, account: string, from: string, to: string): MonthState {
  const at = new Date().toISOString().slice(0, 10);
  return {
    ...s,
    transactions: s.transactions.map((t) =>
      t.account === account && t.sub === from ? { ...t, sub: to } : t
    ),
    subRenames: [...s.subRenames, { account, from, to, at }],
    subMemos: s.subMemos.map((m) =>
      m.account === account && m.sub === from ? { ...m, sub: to } : m
    ),
  };
}

/** 고른 건들을 새 소분류로 묶기 — 세븐일레븐 8건 → '편의점' */
export function groupIntoSub(s: MonthState, ids: string[], sub: string): MonthState {
  const set = new Set(ids);
  return {
    ...s,
    transactions: s.transactions.map((t) => (set.has(t.id) ? { ...t, sub, confirmed: true } : t)),
  };
}

export function setSubMemo(s: MonthState, account: string, sub: string, memo: string): MonthState {
  const rest = s.subMemos.filter((m) => !(m.account === account && m.sub === sub));
  return { ...s, subMemos: memo.trim() ? [...rest, { account, sub, memo: memo.trim() }] : rest };
}

export const subMemoOf = (s: MonthState, account: string, sub: string): string =>
  s.subMemos.find((m) => m.account === account && m.sub === sub)?.memo ?? "";

export function patchTx(s: MonthState, id: string, patch: Partial<Transaction>): MonthState {
  return {
    ...s,
    transactions: s.transactions.map((t) => (t.id === id ? { ...t, ...patch } : t)),
  };
}

export function removeTx(s: MonthState, id: string): MonthState {
  return { ...s, transactions: s.transactions.filter((t) => t.id !== id) };
}
