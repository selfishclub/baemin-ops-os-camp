import { UNCLASSIFIED, behaviorOf, type BehaviorConfig, DEFAULT_BEHAVIOR } from "./accounts";
import type { Transaction } from "./types";

/**
 * 계정 → 소분류 → 거래처 묶음 → 건, 4단 트리.
 * 금액이 작은 것은 접는다. 건수로 접으면 우삼겹 258만·알바 241만 같은
 * 1건짜리 큰 건이 숨기 때문에 기준은 반드시 금액이다.
 */
export interface TreeOptions {
  /** 이 금액 미만이면 접는다 */
  foldBelow: number;
  /** 한 단계에서 펼쳐 보여줄 최대 자식 수. 나머지는 접는다 */
  maxChildren: number;
  cfg: BehaviorConfig;
}

export const DEFAULT_TREE_OPTIONS: TreeOptions = {
  foldBelow: 30_000,
  maxChildren: 12,
  cfg: DEFAULT_BEHAVIOR,
};

export interface LeafNode {
  kind: "leaf";
  /** 정규화된 거래처명 */
  key: string;
  amount: number;
  count: number;
  txs: Transaction[];
  flagged: boolean;
  splitLabel: string | null;
  note: string | null;
}

export interface FoldNode {
  kind: "fold";
  label: string;
  amount: number;
  count: number;
  txs: Transaction[];
  /** 접힌 안쪽. 펼치면 그대로 보여준다 — 접혔다고 분류를 못 하면 안 된다 */
  children: (LeafNode | SubNode)[];
}

export interface SubNode {
  kind: "sub";
  sub: string;
  amount: number;
  count: number;
  /** 안에 들어 있는 거래처 요약 — 접혀 있어도 보이게 */
  compose: string;
  children: (LeafNode | FoldNode)[];
  txs: Transaction[];
  splitCount: number;
}

export interface AccountNode {
  kind: "account";
  account: string;
  amount: number;
  count: number;
  ratio: number;
  behavior: ReturnType<typeof behaviorOf>;
  children: (SubNode | FoldNode)[];
  splitCount: number;
  flaggedCount: number;
}

/** 괄호·집 접두어를 걷어낸 거래처 키 */
export function merchantKey(s: string): string {
  return String(s ?? "")
    .replace(/\s*[(（][^)）]*[)）]\s*/g, " ")
    .replace(/\?/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^집\s+/, "")
    .replace(/\s+집$/, "");
}

function foldSmall<T extends LeafNode | SubNode>(
  items: T[],
  opts: TreeOptions,
  label: (n: number) => string,
  txsOf: (t: T) => Transaction[]
): { kept: T[]; fold: FoldNode | null } {
  const sorted = [...items].sort((a, b) => b.amount - a.amount);
  const big = sorted.filter((i) => Math.abs(i.amount) >= opts.foldBelow);
  const kept = big.slice(0, opts.maxChildren);
  const folded = [...big.slice(opts.maxChildren), ...sorted.filter((i) => Math.abs(i.amount) < opts.foldBelow)];
  if (!folded.length) return { kept, fold: null };
  const txs = folded.flatMap(txsOf);
  return {
    kept,
    fold: {
      kind: "fold",
      label: label(folded.length),
      amount: folded.reduce((a, b) => a + b.amount, 0),
      count: txs.length,
      txs,
      children: folded,
    },
  };
}

export function buildTree(
  transactions: Transaction[],
  revenueGross: number,
  options: Partial<TreeOptions> = {}
): AccountNode[] {
  const opts = { ...DEFAULT_TREE_OPTIONS, ...options };

  const byAccount = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const list = byAccount.get(t.account);
    if (list) list.push(t);
    else byAccount.set(t.account, [t]);
  }

  const nodes: AccountNode[] = [];

  for (const [account, accTxs] of byAccount) {
    const bySub = new Map<string, Transaction[]>();
    for (const t of accTxs) {
      const k = t.sub ?? "(소분류 없음)";
      const l = bySub.get(k);
      if (l) l.push(t);
      else bySub.set(k, [t]);
    }

    const subs: SubNode[] = [];
    for (const [sub, subTxs] of bySub) {
      const byMerchant = new Map<string, Transaction[]>();
      for (const t of subTxs) {
        const k = merchantKey(t.merchant) || "(이름 없음)";
        const l = byMerchant.get(k);
        if (l) l.push(t);
        else byMerchant.set(k, [t]);
      }

      const leaves: LeafNode[] = [...byMerchant].map(([key, txs]) => {
        const withSplit = txs.find((t) => t.split);
        const withNote = txs.find((t) => t.note);
        return {
          kind: "leaf" as const,
          key,
          amount: txs.reduce((a, b) => a + b.amount, 0),
          count: txs.length,
          txs,
          flagged: txs.some((t) => t.flagged),
          splitLabel: withSplit?.split ? `${withSplit.split.kind} ${withSplit.split.current}/${withSplit.split.total}` : null,
          note: withNote?.note ?? null,
        };
      });

      const { kept, fold } = foldSmall(
        leaves,
        opts,
        (n) => `${(opts.foldBelow / 10000).toFixed(0)}만원 미만 ${n}곳`,
        (l) => l.txs
      );

      const composeParts = [...leaves]
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 4)
        .map((l) => (l.count > 1 ? `${l.key} ${l.count}` : l.key));
      const rest = leaves.length - composeParts.length;

      subs.push({
        kind: "sub",
        sub,
        amount: subTxs.reduce((a, b) => a + b.amount, 0),
        count: subTxs.length,
        compose: composeParts.join(" · ") + (rest > 0 ? ` · 외 ${rest}` : ""),
        children: fold ? [...kept, fold] : kept,
        txs: subTxs,
        splitCount: subTxs.filter((t) => t.split).length,
      });
    }

    const { kept: keptSubs, fold: subFold } = foldSmall(
      subs,
      opts,
      (n) => `${(opts.foldBelow / 10000).toFixed(0)}만원 미만 소분류 ${n}개`,
      (s) => s.txs
    );

    const amount = accTxs.reduce((a, b) => a + b.amount, 0);
    nodes.push({
      kind: "account",
      account,
      amount,
      count: accTxs.length,
      ratio: revenueGross ? amount / revenueGross : 0,
      behavior: behaviorOf(account, null, opts.cfg),
      children: subFold ? [...keptSubs, subFold] : keptSubs,
      splitCount: accTxs.filter((t) => t.split).length,
      flaggedCount: accTxs.filter((t) => t.flagged).length,
    });
  }

  return nodes.sort((a, b) => {
    if (a.account === UNCLASSIFIED) return -1;
    if (b.account === UNCLASSIFIED) return 1;
    return b.amount - a.amount;
  });
}
