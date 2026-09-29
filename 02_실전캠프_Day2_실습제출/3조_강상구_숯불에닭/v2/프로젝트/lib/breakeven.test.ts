import { describe, expect, it } from "vitest";
import { computeBreakeven, costItems, costKey, isVariableByDefault, splitCosts } from "./breakeven";
import type { PnlLine } from "./pnl";

const lines: PnlLine[] = [
  { label: "매출액", amount: 10_000_000, pct: 100, kind: "revenue" },
  { label: "매출원가", amount: 4_000_000, pct: 40, kind: "cost", minors: [{ label: "원재료비", amount: 4_000_000 }] },
  { label: "매출총이익", amount: 6_000_000, pct: 60, kind: "subtotal" },
  { label: "영업비", amount: 1_200_000, pct: 12, kind: "cost", minors: [{ label: "배달앱 수수료", amount: 1_000_000 }, { label: "소모품비", amount: 200_000 }, { label: "잡비", amount: 0 }] },
  { label: "임대료", amount: 2_000_000, pct: 20, kind: "cost", minors: [{ label: "임대료", amount: 2_000_000 }] },
  { label: "영업이익", amount: 2_800_000, pct: 28, kind: "result" },
];

describe("변동비·고정비 나누기", () => {
  it("재료비·수수료는 변동비, 임대료는 고정비가 기본", () => {
    expect(isVariableByDefault("매출원가", "원재료비")).toBe(true);
    expect(isVariableByDefault("영업비", "배달앱 수수료")).toBe(true);
    expect(isVariableByDefault("세금과공과", "부가세")).toBe(true);
    expect(isVariableByDefault("임대료", "임대료")).toBe(false);
    expect(isVariableByDefault("노무관리비", "노무관리비급여")).toBe(false);
  });

  it("손익표를 소분류 단위로 펴고 0원 줄은 뺀다", () => {
    const items = costItems({ lines });
    expect(items.map((i) => i.minor)).toEqual(["원재료비", "배달앱 수수료", "소모품비", "임대료"]);
    expect(splitCosts(items)).toEqual({ variable: 5_000_000, fixed: 2_200_000 });
  });

  it("사장님이 바꾼 줄은 그대로 따른다", () => {
    const items = costItems({ lines }, { [costKey("영업비", "소모품비")]: true, [costKey("매출원가", "원재료비")]: false });
    expect(splitCosts(items)).toEqual({ variable: 1_200_000, fixed: 6_000_000 });
  });
});

describe("손익분기점", () => {
  const base = { revenue: 10_000_000, variable: 5_000_000, fixed: 2_200_000, openDays: 25 };

  it("고정비 ÷ 공헌이익률", () => {
    const b = computeBreakeven(base);
    expect(b.contributionRate).toBe(0.5);
    expect(b.point).toBe(4_400_000);
    expect(b.perDay).toBe(176_000);
    expect(b.profit).toBe(2_800_000);
  });

  it("얼마나 여유가 있는지(안전한계율)", () => {
    const b = computeBreakeven(base);
    expect(b.gap).toBe(5_600_000);
    expect(b.safety).toBe(56);
  });

  it("가져가고 싶은 돈을 넣으면 목표 매출이 나온다", () => {
    const b = computeBreakeven({ ...base, targetProfit: 3_000_000 });
    expect(b.target).toBe(10_400_000);
    expect(b.targetPerDay).toBe(416_000);
  });

  it("변동비가 매출보다 크면 손익분기점이 없다 (팔수록 손해)", () => {
    const b = computeBreakeven({ revenue: 1_000_000, variable: 1_200_000, fixed: 500_000 });
    expect(b.point).toBeNull();
    expect(b.contributionRate).toBe(-0.2);
    expect(b.profit).toBe(-700_000);
  });

  it("매출이 없으면 계산하지 않는다", () => {
    const b = computeBreakeven({ revenue: 0, variable: 0, fixed: 2_000_000 });
    expect(b.point).toBeNull();
    expect(b.contributionRate).toBeNull();
    expect(b.profit).toBe(-2_000_000);
  });

  it("영업일을 모르면 하루 필요 매출은 비워 둔다", () => {
    expect(computeBreakeven({ ...base, openDays: 0 }).perDay).toBeNull();
  });
});
