import { UNCLASSIFIED } from "./accounts";
import type { Transaction } from "./types";

/**
 * 분류는 두 단계다 — 앱이 제안하고, 사장님이 확정한다.
 *
 * 체계(대분류·소분류)가 아직 안 잡혔으니 앱이 붙인 것을 그대로 믿으면 안 된다.
 * 서너 달 쌓아 체계를 세울 때까지는 전부 사람 손을 거친다.
 */

/** 확정이 필요한 건인가 — 파일에서 들어온 것만. 고정비·수기 입력은 이미 사장님이 직접 넣은 것이다 */
export const needsConfirm = (t: Transaction) => t.source !== "manual" && t.source !== "fixed-copy";

export const isConfirmed = (t: Transaction) => !needsConfirm(t) || t.confirmed === true;

/** 앱이 계정을 붙여 놨지만 아직 사장님이 보지 않은 건 */
export const isSuggested = (t: Transaction) =>
  needsConfirm(t) && t.confirmed !== true && t.account !== UNCLASSIFIED;

/** 붙일 규칙조차 없어 생소한 건 */
export const isUnclassified = (t: Transaction) => t.account === UNCLASSIFIED;

/** 아직 사장님 손을 안 거친 것 전부 — 제안 + 미분류 */
export const isPending = (t: Transaction) => needsConfirm(t) && t.confirmed !== true;

export function pendingOf(txs: Transaction[]): { count: number; total: number } {
  const p = txs.filter(isPending);
  return { count: p.length, total: p.reduce((s, t) => s + t.amount, 0) };
}
