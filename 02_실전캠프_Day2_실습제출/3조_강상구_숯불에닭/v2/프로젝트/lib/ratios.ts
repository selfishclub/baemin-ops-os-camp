import type { Pnl } from "./pnl";

// 매출 대비 비율 + 사장님이 정한 기준선. 기준을 넘은 것만 빨갛게 (김씨육면·해모닉에서 따옴).
// 원가 + 인건비를 묶은 "프라임코스트"는 외식업에서 제일 먼저 보는 숫자다.
export const RATIO_LIMITS_KEY = "ratio_limits";

export interface RatioLimits {
  cost: number; // 원가율 %
  labor: number; // 인건비율 %
  prime: number; // 원가 + 인건비 %
  rent: number; // 임대료율 %
}

export const DEFAULT_RATIO_LIMITS: RatioLimits = { cost: 35, labor: 30, prime: 60, rent: 10 };

export interface Ratio {
  key: keyof RatioLimits;
  label: string;
  amount: number;
  pct: number | null; // 매출이 없으면 null
  limit: number;
  over: boolean;
  estimated: boolean; // 어림값이 섞였나
}

const lineAmount = (pnl: Pnl, label: string) => pnl.lines.find((l) => l.label === label)?.amount ?? 0;
const pctOf = (amount: number, revenue: number) => (revenue > 0 ? Math.round((amount / revenue) * 1000) / 10 : null);

export function computeRatios(pnl: Pnl, limits: RatioLimits = DEFAULT_RATIO_LIMITS): Ratio[] {
  const cost = lineAmount(pnl, "매출원가");
  const labor = lineAmount(pnl, "노무관리비");
  const rent = lineAmount(pnl, "임대료");
  const make = (key: keyof RatioLimits, label: string, amount: number, estimated: boolean): Ratio => {
    const pct = pctOf(amount, pnl.revenue);
    return { key, label, amount, pct, limit: limits[key], over: pct !== null && pct > limits[key], estimated };
  };
  return [
    make("cost", "원가율", cost, pnl.materialUnpaid > 0),
    make("labor", "인건비율", labor, pnl.laborEstimated),
    make("prime", "원가 + 인건비", cost + labor, pnl.materialUnpaid > 0 || pnl.laborEstimated),
    make("rent", "임대료율", rent, false),
  ];
}

// 저장해 둔 기준이 일부만 있거나 이상한 값이면 기본값으로 메운다
export function normalizeLimits(v: Partial<RatioLimits> | null | undefined): RatioLimits {
  const ok = (n: unknown, d: number) => (typeof n === "number" && n > 0 && n <= 100 ? n : d);
  return {
    cost: ok(v?.cost, DEFAULT_RATIO_LIMITS.cost),
    labor: ok(v?.labor, DEFAULT_RATIO_LIMITS.labor),
    prime: ok(v?.prime, DEFAULT_RATIO_LIMITS.prime),
    rent: ok(v?.rent, DEFAULT_RATIO_LIMITS.rent),
  };
}
