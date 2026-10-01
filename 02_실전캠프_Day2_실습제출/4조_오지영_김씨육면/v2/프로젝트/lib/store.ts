"use client";

import { behaviorOf, foldPersonal, getAccount } from "./accounts";
import { assignIds } from "./dedupe";
import type { SubMemo, SubRename } from "./mappings";
import type { DailySale } from "./dailySales";
import type { MapRule } from "./rules";
import { needsConfirm } from "./confirm";
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
  /** 옛 버전이 달 안에 저장하던 학습 결과. 전역(kimssi-learned)으로 옮기기 위해서만 남겨둔다 */
  learned: MapRule[];
  subRenames: SubRename[];
  subMemos: SubMemo[];
  imports: ImportLog[];
  /** 통장에서 읽은 입금 — 매출 입금액 후보다. 사장님이 4단계에서 확인한다 */
  bankDeposits?: BankDeposit[];
  /** 일별 매출 — 판 날 기준. 입금일과 다르다 */
  dailySales?: DailySale[];
}

/**
 * 들어온 돈의 성격.
 * 통장에는 매출만 들어오지 않는다 — 보험 환급, 개인 송금, 대출이 섞인다.
 * '지영 생활비'는 사장님 개인 몫으로 들어온 것이라 손익과 무관하다.
 */
export type DepositKind = "매출" | "기타수입" | "지영 생활비" | "제외";

export interface BankDeposit {
  id: string;
  date: string;
  /** 보낸분 원문 — 가공하지 않는다 */
  who: string;
  amount: number;
  /** 매출이면 어느 채널인가. 매출이 아니면 null */
  channel?: string | null;
  /** 매출 / 기타수입 / 제외 — 통장 입금에는 매출이 아닌 것이 섞여 있다 */
  kind?: DepositKind;
  note?: string | null;
  /** 사장님이 손으로 넣은 줄 */
  manual?: boolean;
}

let depSeq = 0;
export const makeDeposit = (d: Partial<BankDeposit> = {}): BankDeposit => ({
  id: `dep:${Date.now()}:${depSeq++}`,
  date: "",
  who: "",
  amount: 0,
  channel: null,
  kind: "매출",
  note: null,
  manual: true,
  ...d,
});

export function patchDeposit(s: MonthState, id: string, patch: Partial<BankDeposit>): MonthState {
  return {
    ...s,
    bankDeposits: (s.bankDeposits ?? []).map((d) => (d.id === id ? { ...d, ...patch } : d)),
  };
}

export function removeDeposit(s: MonthState, id: string): MonthState {
  return { ...s, bankDeposits: (s.bankDeposits ?? []).filter((d) => d.id !== id) };
}

export function addDeposit(s: MonthState, d: BankDeposit): MonthState {
  return { ...s, bankDeposits: [d, ...(s.bankDeposits ?? [])] };
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
  bankDeposits: [],
  dailySales: [],
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

/**
 * 아무것도 없는 달인가.
 *
 * 입금 내역을 빠뜨리면 거래 없이 입금만 손으로 넣은 달이 통째로 지워진다.
 * 사장님이 적어 넣은 것이 저장되지 않고 새로고침하면 사라진다.
 */
export const isEmptyMonth = (s: MonthState): boolean =>
  !s.transactions.length &&
  !s.revenue.length &&
  !s.imports.length &&
  !(s.bankDeposits ?? []).length &&
  !(s.dailySales ?? []).length &&
  !s.closed;

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

/**
 * 소분류 이름 바꾸기는 한 달에만 적용하면 안 된다.
 * 규칙은 전역이라 다음 달부터 새 이름이 붙는데, 지난 달만 옛 이름으로 남으면 같은 것이 둘로 갈린다.
 * 지금 보고 있는 달은 화면 상태가 따로 고치므로 여기서는 건드리지 않는다.
 */
export function renameSubInOtherMonths(except: string, account: string, from: string, to: string): number {
  if (typeof window === "undefined") return 0;
  let touched = 0;
  for (const m of listStoredMonths()) {
    if (m === except) continue;
    const st = loadMonth(m);
    if (!st.transactions.some((t) => t.account === account && t.sub === from)) continue;
    saveMonth(renameSub(st, account, from, to));
    touched++;
  }
  return touched;
}

const UNCONFIRM_FLAG = "kimssi-unconfirmed-once";

/**
 * 이미 저장돼 있던 달의 분류를 전부 제안으로 되돌린다.
 *
 * 지금까지는 앱이 붙인 것과 사장님이 고른 것이 섞여 있었다.
 * 어느 쪽인지 구분이 안 되니 기준을 한 번 맞춰 놓고 다시 시작한다.
 * 계정은 그대로 남는다 — 지우는 게 아니라 '아직 확인 전'으로 표시만 바꾼다.
 */
export function unconfirmAllOnce(): { months: number; txs: number } {
  if (typeof window === "undefined") return { months: 0, txs: 0 };
  if (window.localStorage.getItem(UNCONFIRM_FLAG)) return { months: 0, txs: 0 };

  let months = 0;
  let txs = 0;
  for (const m of listStoredMonths()) {
    const st = loadMonth(m);
    const hit = st.transactions.filter((t) => t.confirmed === true && needsConfirm(t));
    if (!hit.length) continue;
    saveMonth({
      ...st,
      transactions: st.transactions.map((t) =>
        t.confirmed === true && needsConfirm(t) ? { ...t, confirmed: false } : t
      ),
    });
    months++;
    txs += hit.length;
  }
  window.localStorage.setItem(UNCONFIRM_FLAG, new Date().toISOString().slice(0, 10));
  return { months, txs };
}

export function clearAllMonths() {
  if (typeof window === "undefined") return;
  for (const m of listStoredMonths()) window.localStorage.removeItem(KEY(m));
}

/* ── 거래 조작 ─────────────────────────────────────────── */

/** 계정을 바꾸면 그룹·고정변동 플래그도 따라오고, 검수 표시는 풀린다. */
/**
 * 계정을 바꾸면 그룹·고정변동 플래그도 따라오고, 검수 표시는 풀린다.
 *
 * 줄에서 계정만 고른 것은 확정이 아니다 — 소분류를 넣기 전에 확정되면
 * '미분류만' 목록에서 사라져 소분류를 나중에 다시 찾아 넣어야 한다.
 * 한꺼번에 처리하는 자리에서만 confirm 을 켠다.
 */
export function applyAccount(
  t: Transaction,
  account: string,
  sub: string | null,
  opts: { confirm?: boolean } = {}
): Transaction {
  // 옛 개인 계정명(우리집·개인보험…)이 들어와도 '개인'의 소분류로 접는다
  const folded = foldPersonal(account, sub);
  account = folded.account;
  sub = folded.sub;
  const def = getAccount(account);
  return {
    ...t,
    account,
    sub,
    group: def?.group ?? "unclassified",
    behavior: behaviorOf(account, sub),
    needsReview: false,
    reviewReason: null,
    confirmed: opts.confirm === false ? t.confirmed === true : true,
  };
}

export const confirmTx = (t: Transaction): Transaction => ({
  ...t,
  needsReview: false,
  reviewReason: null,
  confirmed: true,
});

/**
 * 같은 가맹점 건을 한꺼번에 확정한다.
 * 한 달에 200건이 넘는데 한 건씩 누르면 끝까지 못 간다.
 * account를 주면 그 계정으로 바꾸면서 확정하고, 안 주면 붙어 있던 제안을 그대로 인정한다.
 */
export function confirmMerchant(
  s: MonthState,
  merchant: string,
  to?: { account: string; sub: string | null }
): MonthState {
  const key = merchant.trim();
  return {
    ...s,
    transactions: s.transactions.map((t) =>
      t.merchant.trim() === key
        ? to
          ? applyAccount(t, to.account, to.sub)
          : confirmTx(t)
        : t
    ),
  };
}

/** 여러 건을 한 번에 확정 — 붙어 있던 제안을 그대로 인정한다 */
export function confirmMany(s: MonthState, ids: Set<string>): MonthState {
  return {
    ...s,
    transactions: s.transactions.map((t) => (ids.has(t.id) ? confirmTx(t) : t)),
  };
}

/** 확정을 되돌린다 — 잘못 눌렀을 때 빠져나올 길이 있어야 한다 */
export function unconfirmTx(s: MonthState, id: string): MonthState {
  return {
    ...s,
    transactions: s.transactions.map((t) => (t.id === id ? { ...t, confirmed: false } : t)),
  };
}

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
    behavior: behaviorOf(input.account, input.sub),
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

/** 소분류 이름 바꾸기 — 이 달의 거래를 고친다. 이력·메모는 전역(learned)이 맡는다 */
export function renameSub(s: MonthState, account: string, from: string, to: string): MonthState {
  return {
    ...s,
    transactions: s.transactions.map((t) =>
      t.account === account && t.sub === from ? { ...t, sub: to } : t
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

export function patchTx(s: MonthState, id: string, patch: Partial<Transaction>): MonthState {
  return {
    ...s,
    transactions: s.transactions.map((t) => (t.id === id ? { ...t, ...patch } : t)),
  };
}

export function removeTx(s: MonthState, id: string): MonthState {
  return { ...s, transactions: s.transactions.filter((t) => t.id !== id) };
}
