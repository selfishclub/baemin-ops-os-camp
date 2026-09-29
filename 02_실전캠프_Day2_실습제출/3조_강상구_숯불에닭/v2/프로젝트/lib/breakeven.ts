import type { Pnl } from "./pnl";

// 손익분기점 — "한 달에 얼마를 팔아야 본전인가".
//   공헌이익률 = (매출 − 변동비) ÷ 매출
//   손익분기 매출 = 고정비 ÷ 공헌이익률
// 변동비는 팔수록 같이 늘어나는 돈(재료비·수수료), 고정비는 하나도 안 팔아도 나가는 돈(임대료·월급).
// 어느 쪽인지는 가게마다 달라서 사장님이 줄마다 바꿀 수 있게 두고, 아래는 기본값만 정한다.

export interface CostItem {
  key: string; // "영업비›소모품비"
  major: string;
  minor: string;
  amount: number;
  variable: boolean;
}

export const costKey = (major: string, minor: string) => `${major}\u203a${minor}`;

// 대분류가 통째로 변동비인 것
const ALL_VARIABLE = ["매출원가", "가맹수수료"];
// 대분류는 고정비지만 이 소분류만 변동비인 것 (부가세는 많이 팔수록 많이 낸다)
const VARIABLE_MINORS = ["배달앱 수수료", "배달대행비", "카드수수료", "부가세"];

export function isVariableByDefault(major: string, minor: string): boolean {
  return ALL_VARIABLE.includes(major) || VARIABLE_MINORS.includes(minor);
}

/** 손익표의 비용 줄을 소분류 단위로 펴서, 변동비/고정비 딱지를 붙인다 */
export function costItems(pnl: Pick<Pnl, "lines">, overrides: Record<string, boolean> = {}): CostItem[] {
  const out: CostItem[] = [];
  for (const line of pnl.lines) {
    if (line.kind !== "cost") continue;
    for (const m of line.minors ?? []) {
      if (m.amount === 0) continue;
      const key = costKey(line.label, m.label);
      out.push({ key, major: line.label, minor: m.label, amount: m.amount, variable: overrides[key] ?? isVariableByDefault(line.label, m.label) });
    }
  }
  return out;
}

export function splitCosts(items: CostItem[]): { variable: number; fixed: number } {
  let variable = 0;
  let fixed = 0;
  for (const i of items) (i.variable ? (variable += i.amount) : (fixed += i.amount));
  return { variable, fixed };
}

export interface BreakevenInput {
  revenue: number;
  variable: number;
  fixed: number;
  openDays?: number; // 이 달 영업일 수 (하루 필요 매출을 내려고)
  targetProfit?: number; // 이만큼은 남기고 싶다 (생활비 등)
}

export interface Breakeven {
  contributionRate: number | null; // 공헌이익률 (0~1). 매출 1원이 고정비를 갚는 비율
  point: number | null; // 손익분기 매출 — 변동비율이 100%를 넘으면 null(팔수록 손해)
  perDay: number | null;
  gap: number | null; // 매출 − 손익분기 (양수면 넘김)
  safety: number | null; // 안전한계율 % — 매출이 몇 % 줄 때까지 버티나
  target: number | null; // 목표 이익까지 필요한 매출
  targetPerDay: number | null;
  profit: number; // 매출 − 변동비 − 고정비
}

export function computeBreakeven(i: BreakevenInput): Breakeven {
  const profit = i.revenue - i.variable - i.fixed;
  const empty: Breakeven = { contributionRate: null, point: null, perDay: null, gap: null, safety: null, target: null, targetPerDay: null, profit };
  if (i.revenue <= 0) return empty;

  const rate = (i.revenue - i.variable) / i.revenue;
  if (rate <= 0) return { ...empty, contributionRate: Math.round(rate * 1000) / 1000 };

  const point = Math.round(i.fixed / rate);
  const target = Math.round((i.fixed + Math.max(0, i.targetProfit ?? 0)) / rate);
  const days = i.openDays && i.openDays > 0 ? i.openDays : null;
  return {
    contributionRate: Math.round(rate * 1000) / 1000,
    point,
    perDay: days ? Math.round(point / days) : null,
    gap: i.revenue - point,
    safety: Math.round(((i.revenue - point) / i.revenue) * 1000) / 10,
    target,
    targetPerDay: days ? Math.round(target / days) : null,
    profit,
  };
}
