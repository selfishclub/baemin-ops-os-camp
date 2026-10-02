import type { Major } from "./categories";
import type { Month, Transaction } from "./types";

// 매달 나가는데 다음 달에 내는 돈 (석쇠 대여비, 가스요금 같은 것).
// 9월에 쓴 가스는 9월 비용인데 돈은 10/7에 나간다. 10월 통장을 올리기 전까지
// 9월 손익이 비어 보이지 않게, 청구서 금액을 적어 두고 그만큼 미리 채운다.
// 통장에서 실제로 나가면(지급일 규칙으로 그 달 귀속이 되면) 채운 몫은 자동으로 빠진다.
//
// 적용 시작 월·달마다 금액 (해모닉에서 따옴):
//  - since: 이 달부터 채운다. 그 전 달(이 고정비를 적기 전, 이미 마감한 달)은 건드리지 않는다
//  - amounts: 청구서 금액을 달마다 따로 적는다. 10월 가스비를 고쳐도 9월 금액은 그대로
export const FIXED_COSTS_KEY = "fixed_costs";

export interface FixedCost {
  id: string;
  name: string; // 화면에 보여 줄 이름 ("양계철 석쇠 대여")
  payeeKeyword: string; // 통장 거래처에 이 글자가 들어가면 그 달에 낸 것으로 본다
  major: Major;
  minor: string;
  amount: number; // 마지막으로 적은 금액. 달마다 금액(amounts)이 없는 예전 자료는 이것을 모든 달에 쓴다
  active: boolean;
  since?: Month; // 적용 시작 월. 없으면 처음부터 (예전 자료)
  amounts?: Record<Month, number>; // 달마다 적은 청구서 금액
}

export interface FixedCostGap {
  cost: FixedCost;
  amount: number; // 이 달 청구서 금액
  paid: number; // 그 달 통장에서 이미 나간 금액
  gap: number; // 아직 안 나간 몫 (이만큼 손익에 채운다)
}

export const emptyFixedCost = (month?: Month): FixedCost => ({
  id: `fc_${Math.random().toString(36).slice(2, 10)}`,
  name: "",
  payeeKeyword: "",
  major: "영업비",
  minor: "지급수수료",
  amount: 0,
  active: true,
  ...(month ? { since: month } : {}),
});

/** 이 달 청구서 금액: 시작 월 전이면 0, 그 달에 적은 금액, 없으면 가장 가까운 이전 달 금액 (그것도 없으면 처음 적은 달 금액, 예전 자료는 amount) */
export function amountFor(c: FixedCost, month: Month): number {
  if (c.since && month < c.since) return 0;
  const keys = Object.keys(c.amounts ?? {}).sort();
  if (!keys.length) return c.amount;
  const before = keys.filter((k) => k <= month);
  return c.amounts![before.length ? before[before.length - 1] : keys[0]];
}

/** 이 달 금액을 고친다 — 다른 달 금액은 그대로 둔다 */
export function setAmountFor(c: FixedCost, month: Month, amount: number): FixedCost {
  const amounts = { ...(c.amounts ?? {}) };
  // 예전 자료(달마다 금액 없음)를 처음 고칠 때: 지금까지 쓰던 금액을 이 달 전 달들의 값으로 남겨 다른 달이 안 바뀌게
  //  (시작 월이 있으면 그 달 값으로, 없으면 "처음부터" 값으로 — "0000-00"은 어느 달보다 앞이다)
  const base = c.since ?? "0000-00";
  if (!Object.keys(amounts).length && c.amount > 0 && base < month) amounts[base] = c.amount;
  amounts[month] = amount;
  return { ...c, amount, amounts };
}

/** 이 달 통장에서 그 거래처로 나간 돈과 견줘, 아직 안 나간 몫을 낸다 */
export function fixedCostGaps(costs: FixedCost[], txs: Transaction[], month: Month): FixedCostGap[] {
  return costs
    .filter((c) => c.active && c.payeeKeyword.trim())
    .map((cost) => ({ cost, amount: amountFor(cost, month) }))
    .filter((x) => x.amount > 0)
    .map(({ cost, amount }) => {
      const key = cost.payeeKeyword.trim();
      const paid = txs.filter((t) => t.payee.includes(key)).reduce((a, t) => a + t.out - t.in, 0);
      return { cost, amount, paid, gap: Math.max(0, Math.round(amount - paid)) };
    });
}

export const totalFixedGap = (gaps: FixedCostGap[]) => gaps.reduce((a, g) => a + g.gap, 0);
