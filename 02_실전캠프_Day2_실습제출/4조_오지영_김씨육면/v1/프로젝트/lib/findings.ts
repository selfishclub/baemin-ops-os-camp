import { UNCLASSIFIED } from "./accounts";
import { isLastRound } from "./split";
import type { Summary } from "./summary";
import type { Transaction } from "./types";

export type Severity = "danger" | "warn" | "info";

export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  amount?: number;
  /** 어느 단계로 보내야 하는가 */
  step?: number;
}

/** 마감 전에 짚어야 할 것들. 막지 않고 표시만 한다(§2). */
export function findings(summary: Summary, transactions: Transaction[]): Finding[] {
  const out: Finding[] = [];

  if (!summary.revenue.gross) {
    out.push({
      id: "no-revenue",
      severity: "warn",
      title: "매출이 아직 입력되지 않았습니다",
      detail: "매출이 없으면 영업이익도 비율도 나오지 않습니다.",
      step: 4,
    });
  }

  if (summary.unclassified.count) {
    out.push({
      id: "unclassified",
      severity: "danger",
      title: `미분류 ${summary.unclassified.count}건이 손익에서 빠져 있습니다`,
      detail: `계정을 정하기 전까지 매출·비용 어디에도 들어가지 않습니다.`,
      amount: summary.unclassified.total,
      step: 3,
    });
  }

  if (summary.reviewCount) {
    const rows = transactions.filter((t) => t.needsReview);
    const kinds = new Map<string, number>();
    for (const t of rows) {
      const k = (t.reviewReason ?? "").split(" —")[0].replace(/'.*'/, "").trim() || "확인";
      kinds.set(k, (kinds.get(k) ?? 0) + 1);
    }
    out.push({
      id: "review",
      severity: "warn",
      title: `검수 ${summary.reviewCount}건이 남았습니다`,
      detail: [...kinds].map(([k, v]) => `${k} ${v}건`).join(", "),
      amount: rows.reduce((a, b) => a + b.amount, 0),
      step: 3,
    });
  }

  for (const c of summary.revenue.byChannel) {
    if (!c.gross) continue;
    const delivery = c.account === "매출-배달";
    const [lo, hi] = delivery ? [0.2, 0.35] : [0.01, 0.04];
    if (c.deposit > c.gross) {
      out.push({
        id: `deposit-${c.channel}`,
        severity: "danger",
        title: `${c.channel}: 입금액이 매출액보다 큽니다`,
        detail: "어느 쪽 기준으로 넣었는지 확인이 필요합니다.",
        step: 4,
      });
    } else if (c.feeRate < lo || c.feeRate > hi) {
      out.push({
        id: `fee-${c.channel}`,
        severity: "warn",
        title: `${c.channel} 수수료율 ${(c.feeRate * 100).toFixed(1)}%`,
        detail: `정상 범위 ${(lo * 100).toFixed(0)}~${(hi * 100).toFixed(0)}%를 벗어납니다.`,
        step: 4,
      });
    }
  }

  const flagged = transactions.filter((t) => t.flagged);
  if (flagged.length) {
    out.push({
      id: "flagged",
      severity: "warn",
      title: `확인 표시가 붙은 건 ${flagged.length}건`,
      detail: "원본에 물음표가 적혀 있던 건입니다.",
      amount: flagged.reduce((a, b) => a + b.amount, 0),
      step: 3,
    });
  }

  const ending = transactions.filter((t) => t.split && isLastRound(t.split));
  if (ending.length) {
    out.push({
      id: "split-end",
      severity: "info",
      title: `이번 달로 끝나는 분할 ${ending.length}건`,
      detail: "다음 달에는 이 금액이 빠집니다.",
      amount: ending.reduce((a, b) => a + b.amount, 0),
    });
  }

  if (transactions.length) {
    const dated = transactions.filter((t) => t.date).length;
    const rate = dated / transactions.length;
    if (rate < 0.5) {
      out.push({
        id: "dates",
        severity: "info",
        title: `날짜가 있는 건이 ${transactions.length}건 중 ${dated}건`,
        detail: "일별 집계가 되지 않습니다. 카드 파일을 올리면 채워집니다.",
        step: 1,
      });
    }
  }

  const order: Record<Severity, number> = { danger: 0, warn: 1, info: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

export const hasUnclassified = (t: Transaction[]) => t.some((x) => x.account === UNCLASSIFIED);

/**
 * §3 탭2 누락 경고 — 지난달에 있었는데 이번 달에 없는 고정비.
 * 예: "8월에 화재보험 50,000원이 없습니다"
 */
export interface MissingFixed {
  account: string;
  sub: string;
  amount: number;
}

const isFixedRow = (t: Transaction) => t.source === "ledger-fixed" || t.source === "fixed-copy";

export function missingFixedCosts(prev: Transaction[], now: Transaction[]): MissingFixed[] {
  const key = (t: Transaction) => `${t.account}/${t.sub ?? t.merchant}`;
  const here = new Set(now.filter(isFixedRow).map(key));
  const out: MissingFixed[] = [];
  const seen = new Set<string>();
  for (const t of prev.filter(isFixedRow)) {
    const k = key(t);
    if (here.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push({ account: t.account, sub: t.sub ?? t.merchant, amount: t.amount });
  }
  return out.sort((a, b) => b.amount - a.amount);
}
