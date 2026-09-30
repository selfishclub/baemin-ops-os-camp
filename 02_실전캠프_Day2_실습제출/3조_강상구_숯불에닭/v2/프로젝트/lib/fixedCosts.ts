import type { Major } from "./categories";
import type { Transaction } from "./types";

// 매달 나가는데 다음 달에 내는 돈 (석쇠 대여비, 가스요금 같은 것).
// 9월에 쓴 가스는 9월 비용인데 돈은 10/7에 나간다. 10월 통장을 올리기 전까지
// 9월 손익이 비어 보이지 않게, 청구서 금액을 적어 두고 그만큼 미리 채운다.
// 통장에서 실제로 나가면(지급일 규칙으로 그 달 귀속이 되면) 채운 몫은 자동으로 빠진다.
export const FIXED_COSTS_KEY = "fixed_costs";

export interface FixedCost {
  id: string;
  name: string; // 화면에 보여 줄 이름 ("양계철 석쇠 대여")
  payeeKeyword: string; // 통장 거래처에 이 글자가 들어가면 그 달에 낸 것으로 본다
  major: Major;
  minor: string;
  amount: number; // 이 달 낼 금액. 청구서를 보고 매달 고친다
  active: boolean;
}

export interface FixedCostGap {
  cost: FixedCost;
  paid: number; // 그 달 통장에서 이미 나간 금액
  gap: number; // 아직 안 나간 몫 (이만큼 손익에 채운다)
}

export const emptyFixedCost = (): FixedCost => ({
  id: `fc_${Math.random().toString(36).slice(2, 10)}`,
  name: "",
  payeeKeyword: "",
  major: "영업비",
  minor: "지급수수료",
  amount: 0,
  active: true,
});

/** 이 달 통장에서 그 거래처로 나간 돈과 견줘, 아직 안 나간 몫을 낸다 */
export function fixedCostGaps(costs: FixedCost[], txs: Transaction[]): FixedCostGap[] {
  return costs
    .filter((c) => c.active && c.amount > 0 && c.payeeKeyword.trim())
    .map((cost) => {
      const key = cost.payeeKeyword.trim();
      const paid = txs.filter((t) => t.payee.includes(key)).reduce((a, t) => a + t.out - t.in, 0);
      return { cost, paid, gap: Math.max(0, Math.round(cost.amount - paid)) };
    });
}

export const totalFixedGap = (gaps: FixedCostGap[]) => gaps.reduce((a, g) => a + g.gap, 0);
