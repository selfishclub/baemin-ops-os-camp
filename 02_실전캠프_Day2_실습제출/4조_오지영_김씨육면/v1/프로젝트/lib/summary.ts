import {
  DEFAULT_BEHAVIOR,
  EXPENSE_ACCOUNTS,
  PERSONAL_ACCOUNTS,
  UNCLASSIFIED,
  behaviorOf,
  type Behavior,
  type BehaviorConfig,
} from "./accounts";
import type { RevenueLine, Transaction } from "./types";

export interface SubTotal {
  sub: string;
  amount: number;
  count: number;
}

export interface AccountTotal {
  account: string;
  amount: number;
  count: number;
  /** 매출액 대비 비율 */
  ratio: number;
  behavior: Behavior | null;
  subs: SubTotal[];
  /** 거래 건이 아니라 계산으로 만들어진 계정(수수료) */
  derived?: boolean;
}

export interface ChannelFee extends RevenueLine {
  fee: number;
  feeRate: number;
}

export interface Summary {
  month: string;
  revenue: {
    gross: number;
    deposit: number;
    fee: number;
    feeRate: number;
    byChannel: ChannelFee[];
  };
  expense: { total: number; byAccount: AccountTotal[] };
  operatingProfit: number;
  operatingMargin: number;
  primeCost: number;
  primeCostRatio: number;
  fixedTotal: number;
  variableTotal: number;
  /** 고정/변동 플래그가 없는 금액 (인건비 소분류 미지정 등) */
  unflaggedTotal: number;
  personal: { total: number; byAccount: AccountTotal[] };
  otherIncome: { total: number; count: number };
  unclassified: { total: number; count: number };
  reviewCount: number;
  txCount: number;
}

function rollUp(
  txs: Transaction[],
  order: string[],
  revenueGross: number,
  cfg: BehaviorConfig
): AccountTotal[] {
  const byAccount = new Map<string, Transaction[]>();
  for (const t of txs) {
    const list = byAccount.get(t.account);
    if (list) list.push(t);
    else byAccount.set(t.account, [t]);
  }

  const rank = new Map(order.map((n, i) => [n, i]));
  const totals: AccountTotal[] = [];

  for (const [account, list] of byAccount) {
    const subMap = new Map<string, { amount: number; count: number }>();
    let amount = 0;
    for (const t of list) {
      amount += t.amount;
      const key = t.sub ?? "(소분류 없음)";
      const cur = subMap.get(key) ?? { amount: 0, count: 0 };
      cur.amount += t.amount;
      cur.count += 1;
      subMap.set(key, cur);
    }
    totals.push({
      account,
      amount,
      count: list.length,
      ratio: revenueGross ? amount / revenueGross : 0,
      behavior: behaviorOf(account, null, cfg),
      subs: [...subMap.entries()]
        .map(([sub, v]) => ({ sub, ...v }))
        .sort((a, b) => b.amount - a.amount),
    });
  }

  return totals.sort((a, b) => {
    const ra = rank.get(a.account) ?? 999;
    const rb = rank.get(b.account) ?? 999;
    return ra !== rb ? ra - rb : b.amount - a.amount;
  });
}

export function summarize(
  month: string,
  transactions: Transaction[],
  revenue: RevenueLine[],
  cfg: BehaviorConfig = DEFAULT_BEHAVIOR
): Summary {
  const gross = revenue.reduce((s, r) => s + r.gross, 0);
  const deposit = revenue.reduce((s, r) => s + r.deposit, 0);

  // §4-2 수수료 — 매출액 − 입금액으로 자동 계산한다
  const byChannel: ChannelFee[] = revenue.map((r) => {
    const fee = r.gross - r.deposit;
    return { ...r, fee, feeRate: r.gross ? fee / r.gross : 0 };
  });
  const feeFromRevenue = byChannel.reduce((s, r) => s + r.fee, 0);

  const expenseTx = transactions.filter((t) => t.group === "expense");
  const personalTx = transactions.filter((t) => t.group === "personal");
  const otherIncomeTx = transactions.filter((t) => t.group === "excluded");
  const unclassifiedTx = transactions.filter(
    (t) => t.group === "unclassified" || t.account === UNCLASSIFIED
  );

  const expenseOrder = EXPENSE_ACCOUNTS.map((a) => a.name);
  const byAccount = rollUp(expenseTx, expenseOrder, gross, cfg);

  // 수수료 계정은 거래 건이 아니라 매출에서 파생된다 — 이미 있으면 합치고, 없으면 만든다
  if (feeFromRevenue !== 0) {
    const existing = byAccount.find((a) => a.account === "수수료");
    const feeSubs = byChannel
      .filter((c) => c.fee !== 0)
      .map((c) => ({ sub: c.channel, amount: c.fee, count: 1 }))
      .sort((a, b) => b.amount - a.amount);
    if (existing) {
      existing.amount += feeFromRevenue;
      existing.subs = [...existing.subs, ...feeSubs];
      existing.ratio = gross ? existing.amount / gross : 0;
      existing.derived = true;
    } else {
      byAccount.push({
        account: "수수료",
        amount: feeFromRevenue,
        count: feeSubs.length,
        ratio: gross ? feeFromRevenue / gross : 0,
        behavior: behaviorOf("수수료", null, cfg),
        subs: feeSubs,
        derived: true,
      });
      const rank = new Map(expenseOrder.map((n, i) => [n, i]));
      byAccount.sort((a, b) => (rank.get(a.account) ?? 999) - (rank.get(b.account) ?? 999));
    }
  }

  const expenseTotal = byAccount.reduce((s, a) => s + a.amount, 0);

  // 고정/변동은 계정 플래그를 읽어서 계산한다 (§7). 인건비는 소분류 플래그를 본다.
  let fixedTotal = 0;
  let variableTotal = 0;
  let unflaggedTotal = 0;
  for (const a of byAccount) {
    if (a.account === "인건비") {
      for (const s of a.subs) {
        const b = behaviorOf("인건비", s.sub, cfg);
        if (b === "fixed") fixedTotal += s.amount;
        else if (b === "variable") variableTotal += s.amount;
        else unflaggedTotal += s.amount;
      }
      continue;
    }
    const b = behaviorOf(a.account, null, cfg);
    if (b === "fixed") fixedTotal += a.amount;
    else if (b === "variable") variableTotal += a.amount;
    else unflaggedTotal += a.amount;
  }

  const food = byAccount.find((a) => a.account === "식자재비")?.amount ?? 0;
  const labor = byAccount.find((a) => a.account === "인건비")?.amount ?? 0;
  const primeCost = food + labor;

  const operatingProfit = gross - expenseTotal;

  return {
    month,
    revenue: {
      gross,
      deposit,
      fee: feeFromRevenue,
      feeRate: gross ? feeFromRevenue / gross : 0,
      byChannel,
    },
    expense: { total: expenseTotal, byAccount },
    operatingProfit,
    operatingMargin: gross ? operatingProfit / gross : 0,
    primeCost,
    primeCostRatio: gross ? primeCost / gross : 0,
    fixedTotal,
    variableTotal,
    unflaggedTotal,
    personal: {
      total: personalTx.reduce((s, t) => s + t.amount, 0),
      byAccount: rollUp(personalTx, PERSONAL_ACCOUNTS.map((a) => a.name), gross, cfg),
    },
    otherIncome: {
      total: otherIncomeTx.reduce((s, t) => s + t.amount, 0),
      count: otherIncomeTx.length,
    },
    unclassified: {
      total: unclassifiedTx.reduce((s, t) => s + t.amount, 0),
      count: unclassifiedTx.length,
    },
    reviewCount: transactions.filter((t) => t.needsReview).length,
    txCount: transactions.length,
  };
}

/**
 * 비용을 서로 겹치지 않게 다섯 덩어리로 나눈다 — "어디에 제일 많이 나갔나"를 보기 위한 것.
 * 고정/변동(behavior)은 손익분기점 계산용이라 같은 돈을 다르게 자른다. 둘은 용도가 다르다.
 */
export interface CostGroupDef {
  name: string;
  accounts: string[];
  tone: string;
}

export const COST_GROUPS: CostGroupDef[] = [
  { name: "프라임코스트", accounts: ["식자재비", "인건비"], tone: "var(--primary)" },
  { name: "매장 운영비", accounts: ["임대료", "공과금", "고정운영비", "일회용품", "설비/비품비", "매장운영비"], tone: "var(--info)" },
  { name: "매출 수수료", accounts: ["수수료"], tone: "var(--warn)" },
  { name: "금융·세금", accounts: ["대출이자", "세금", "기부"], tone: "var(--danger)" },
  { name: "마케팅비", accounts: ["마케팅비"], tone: "var(--violet)" },
];

export interface CostGroup extends CostGroupDef {
  amount: number;
  ratio: number;
}

export function costGroups(s: Summary): CostGroup[] {
  const byAccount = new Map(s.expense.byAccount.map((a) => [a.account, a.amount]));
  const used = new Set<string>();
  const groups = COST_GROUPS.map((g) => {
    let amount = 0;
    for (const a of g.accounts) {
      amount += byAccount.get(a) ?? 0;
      used.add(a);
    }
    return { ...g, amount, ratio: s.revenue.gross ? amount / s.revenue.gross : 0 };
  });
  // 어느 그룹에도 안 들어간 계정이 생기면 마지막에 모아 보여준다
  const leftover = s.expense.byAccount
    .filter((a) => !used.has(a.account))
    .reduce((acc, a) => acc + a.amount, 0);
  if (leftover !== 0) {
    groups.push({
      name: "그 외",
      accounts: [],
      tone: "var(--slate)",
      amount: leftover,
      ratio: s.revenue.gross ? leftover / s.revenue.gross : 0,
    });
  }
  return groups.filter((g) => g.amount !== 0).sort((a, b) => b.amount - a.amount);
}

/** §3 탭2 지표 추이 — 월 요약에서 전월과 나란히 본다 */
export interface KeyRatio {
  label: string;
  ratio: number;
  amount: number;
  /** 업계에서 보는 대략의 상한. 넘으면 표시만 한다 */
  ceiling?: number;
}

export function keyRatios(s: Summary): KeyRatio[] {
  const get = (a: string) => s.expense.byAccount.find((x) => x.account === a)?.amount ?? 0;
  const g = s.revenue.gross;
  // 매출이 없으면 비율은 0이다. 1로 나누면 금액이 그대로 비율이 되어 터무니없는 값이 나온다.
  const ratio = (v: number) => (g > 0 ? v / g : 0);
  const food = get("식자재비");
  const labor = get("인건비");
  const rent = get("임대료");
  return [
    { label: "프라임코스트", ratio: ratio(food + labor), amount: food + labor, ceiling: 0.6 },
    { label: "식재료비율", ratio: ratio(food), amount: food, ceiling: 0.35 },
    { label: "인건비율", ratio: ratio(labor), amount: labor, ceiling: 0.3 },
    { label: "임차료율", ratio: ratio(rent), amount: rent, ceiling: 0.1 },
  ];
}
