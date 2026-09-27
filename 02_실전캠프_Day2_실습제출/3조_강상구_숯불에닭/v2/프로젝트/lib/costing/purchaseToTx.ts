import type { Major } from "../categories";
import type { Transaction } from "../types";
import { isCardTx } from "./receiptMatch";
import { purchaseTotal, type Purchase, type PurchaseCategory } from "./purchases";

// 영수증을 넣으면 짝이 맞는 통장 체크카드 줄의 분류를 대신 채운다.
//  - 같은 지출을 통장에서 한 번, 영수증에서 또 한 번 분류하던 것을 한 번으로 줄인다.
//  - 이미 분류가 있는 줄은 절대 건드리지 않는다. 사장님이 고른 게 먼저다.
//  - 어느 줄인지 헷갈리면(후보가 여럿) 아무것도 안 한다. 잘못 넣는 것보다 비워 두는 게 낫다.
const CATEGORY_TO_TX: Record<PurchaseCategory, { major: Major; minor: string }> = {
  원재료비: { major: "매출원가", minor: "원재료비" },
  기타재료비: { major: "매출원가", minor: "기타재료비" },
  소모품비: { major: "영업비", minor: "소모품비" },
  기타: { major: "영업비", minor: "잡비" },
};

const days = (a: string, b: string) => Math.abs(Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000));

/** 영수증에서 금액이 가장 큰 분류를 그 영수증의 분류로 본다 */
export function txCategoryForPurchase(p: Purchase): { major: Major; minor: string } | null {
  const sum = new Map<PurchaseCategory, number>();
  for (const l of p.lines) sum.set(l.category, (sum.get(l.category) ?? 0) + l.amount);
  let best: PurchaseCategory | null = null;
  for (const [c, amount] of sum) if (!best || amount > (sum.get(best) ?? 0)) best = c;
  return best ? CATEGORY_TO_TX[best] : null;
}

/** 이 영수증과 짝이 될 만한 "아직 분류 안 한" 체크카드 줄 (금액이 같고 날짜 ±3일, 딱 하나일 때만) */
export function findTxForPurchase(p: Purchase, txs: Transaction[], within = 3): Transaction | null {
  const total = purchaseTotal(p);
  if (total <= 0) return null;
  const hit = txs.filter((t) => !t.major && t.out === total && isCardTx(t) && days(p.date, t.date) <= within);
  if (hit.length !== 1) return null;
  return hit[0];
}

/** 영수증을 저장할 때 같이 고칠 통장 줄 (없으면 null) */
export function txFromPurchase(p: Purchase, txs: Transaction[]): Transaction | null {
  const tx = findTxForPurchase(p, txs);
  const cat = tx && txCategoryForPurchase(p);
  return tx && cat ? { ...tx, major: cat.major, minor: cat.minor, review: null } : null;
}
