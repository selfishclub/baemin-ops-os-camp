import type { Transaction } from "./types";

/**
 * §7 중복 방지 — 고유키(카드 뒷4자리+승인번호, 없으면 날짜+금액+가맹점).
 * 날짜 없는 손입력 건은 같은 튜플이 실제로 여러 번 나올 수 있으므로
 * 배치 내 등장 순번을 키에 붙인다. 같은 파일을 겹쳐 넣으면 순번까지 같아 스킵되고,
 * 진짜 반복 지출은 살아남는다.
 */
export function buildKey(
  t: Pick<Transaction, "date" | "month" | "amount" | "merchant" | "account" | "sub" | "source">,
  card?: { last4?: string; approvalNo?: string },
  ordinal = 0
): string {
  if (card?.last4 && card?.approvalNo) return `card:${card.last4}:${card.approvalNo}`;
  const base = [
    t.source,
    t.date ?? t.month,
    t.amount,
    t.merchant.trim(),
    t.account,
    t.sub ?? "",
  ].join("|");
  return `${base}#${ordinal}`;
}

/** 같은 base키가 몇 번째로 등장했는지 세어가며 id를 붙인다. */
export function assignIds<T extends Omit<Transaction, "id">>(
  rows: T[],
  cardInfo?: (row: T, i: number) => { last4?: string; approvalNo?: string } | undefined
): (T & { id: string })[] {
  const seen = new Map<string, number>();
  return rows.map((row, i) => {
    const card = cardInfo?.(row, i);
    if (card?.last4 && card?.approvalNo) {
      return { ...row, id: buildKey(row, card) };
    }
    const base = buildKey(row, undefined, 0).split("#")[0];
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return { ...row, id: `${base}#${n}` };
  });
}

/** 이미 있는 건은 자동 스킵. 겹쳐 넣어도 안전하다. */
export function mergeTransactions(
  existing: Transaction[],
  incoming: Transaction[]
): { merged: Transaction[]; added: number; skipped: number } {
  const ids = new Set(existing.map((t) => t.id));
  const fresh = incoming.filter((t) => !ids.has(t.id));
  return {
    merged: [...existing, ...fresh],
    added: fresh.length,
    skipped: incoming.length - fresh.length,
  };
}
