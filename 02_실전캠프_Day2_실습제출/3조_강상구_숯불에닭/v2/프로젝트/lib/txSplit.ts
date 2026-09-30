import type { Major } from "./categories";
import type { Transaction } from "./types";

// 통장 한 줄에 성격이 다른 돈이 섞여 있을 때 나눠서 분류한다.
//  - 마트 한 번 결제에 재료비와 개인 물품이 섞이거나,
//    관리비 고지서에 순수 관리비·전기·수도가 같이 청구되는 경우.
//  - 원본 줄은 그대로 두고(통장 대조·중복 올리기 방지가 유지되게) 나눈 몫만 따로 적는다.
//    손익을 낼 때 나눈 몫이 있으면 그걸로, 없으면 원래 분류로 센다.

export interface TxSplit {
  major: Major;
  minor: string;
  amount: number; // 그 분류로 갈 금액 (출금 줄이면 나간 돈, 입금 줄이면 들어온 돈)
  note?: string;
}

export const splitTotal = (splits: TxSplit[]) => splits.reduce((a, s) => a + (Number(s.amount) || 0), 0);

/** 나눈 금액 합계가 그 줄 금액과 맞는지 */
export function splitCheck(tx: Pick<Transaction, "out" | "in">, splits: TxSplit[]): { total: number; target: number; gap: number; ok: boolean } {
  const target = tx.out > 0 ? tx.out : tx.in;
  const total = splitTotal(splits);
  const gap = target - total;
  return { total, target, gap, ok: gap === 0 && splits.length > 0 };
}

/** 나눈 줄이 있으면 가상의 줄 여러 개로 펴서 돌려준다. 손익·세무 집계는 이걸 쓴다. */
export function expandSplits(txs: Transaction[]): Transaction[] {
  const out: Transaction[] = [];
  for (const t of txs) {
    const splits = t.splits ?? [];
    if (!splits.length || !splitCheck(t, splits).ok) {
      out.push(t);
      continue;
    }
    const isOut = t.out > 0;
    splits.forEach((s, i) => {
      out.push({
        ...t,
        id: `${t.id}#${i + 1}`,
        major: s.major,
        minor: s.minor,
        out: isOut ? s.amount : 0,
        in: isOut ? 0 : s.amount,
        splits: undefined,
      });
    });
  }
  return out;
}
