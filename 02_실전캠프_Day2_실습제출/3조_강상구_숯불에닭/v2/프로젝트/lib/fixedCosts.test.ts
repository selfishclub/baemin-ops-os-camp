import { describe, expect, it } from "vitest";
import { amountFor, fixedCostGaps, setAmountFor, totalFixedGap, type FixedCost } from "./fixedCosts";

const M = "2026-09";
import type { Transaction } from "./types";

const cost = (name: string, keyword: string, amount: number): FixedCost => ({
  id: name, name, payeeKeyword: keyword, major: "영업비", minor: "지급수수료", amount, active: true,
});
const tx = (payee: string, out: number): Transaction => ({
  id: payee + out, month: "2026-09", date: "2026-09-10", payee, out, in: 0,
  source: "bank", major: "영업비", minor: "지급수수료", channel: null, review: null,
});

describe("매달 나가는 고정비", () => {
  const costs = [cost("석쇠 대여", "가짜불판", 350_000), cost("가스요금", "가짜가스", 223_020)];

  it("통장에 아직 안 나갔으면 전액을 채운다", () => {
    const gaps = fixedCostGaps(costs, [], M);
    expect(gaps.map((g) => g.gap)).toEqual([350_000, 223_020]);
    expect(totalFixedGap(gaps)).toBe(573_020);
  });

  it("통장에서 나갔으면 그만큼 뺀다", () => {
    const gaps = fixedCostGaps(costs, [tx("NH콕송금 가짜불판", 350_000)], M);
    expect(gaps[0]).toMatchObject({ paid: 350_000, gap: 0 });
    expect(gaps[1].gap).toBe(223_020);
  });

  it("일부만 나갔으면 모자란 만큼만", () => {
    expect(fixedCostGaps(costs, [tx("가짜가스 김씨", 200_000)], M)[1].gap).toBe(23_020);
  });

  it("더 많이 나갔어도 음수로 가지 않는다", () => {
    expect(fixedCostGaps(costs, [tx("가짜불판", 400_000)], M)[0].gap).toBe(0);
  });

  it("끈 것·금액 0·거래처 빈 것은 세지 않는다", () => {
    const off = [{ ...cost("끈 것", "가짜", 100), active: false }, cost("0원", "가짜", 0), cost("빈 거래처", "  ", 500)];
    expect(fixedCostGaps(off, [], M)).toHaveLength(0);
  });

  it("환급(입금)이 있으면 낸 돈에서 뺀다", () => {
    const refund: Transaction = { ...tx("가짜불판", 0), in: 50_000 };
    expect(fixedCostGaps(costs, [tx("가짜불판", 350_000), refund], M)[0].gap).toBe(50_000);
  });
});

describe("적용 시작 월 · 달마다 금액", () => {
  const gas: FixedCost = { ...cost("가스요금", "가짜가스", 223_020), since: "2026-09" };

  it("시작 월 전 달(이미 마감한 달 등)은 채우지 않는다", () => {
    expect(fixedCostGaps([gas], [], "2026-08")).toHaveLength(0);
    expect(fixedCostGaps([gas], [], "2026-09")[0].gap).toBe(223_020);
  });

  it("시작 월이 없는 예전 자료는 전처럼 모든 달", () => {
    const legacy = cost("석쇠 대여", "가짜불판", 350_000);
    expect(amountFor(legacy, "2026-01")).toBe(350_000);
  });

  it("10월 금액을 고쳐도 9월 금액은 그대로", () => {
    const oct = setAmountFor(gas, "2026-10", 310_000);
    expect(amountFor(oct, "2026-09")).toBe(223_020);
    expect(amountFor(oct, "2026-10")).toBe(310_000);
    expect(amountFor(oct, "2026-11")).toBe(310_000); // 다음 달은 아직 안 적었으면 가장 가까운 이전 달 금액
    expect(oct.amount).toBe(310_000);
  });

  it("시작 월에 처음 적으면 그 달 금액이 된다", () => {
    const g = setAmountFor({ ...gas, amount: 0 }, "2026-09", 200_000);
    expect(amountFor(g, "2026-09")).toBe(200_000);
    expect(amountFor(g, "2026-08")).toBe(0);
  });
});

describe("예전 자료를 고칠 때", () => {
  it("시작 월이 없는 고정비의 10월 금액을 고쳐도 9월은 예전 금액", () => {
    const legacy = cost("석쇠 대여", "가짜불판", 350_000);
    const oct = setAmountFor(legacy, "2026-10", 400_000);
    expect(amountFor(oct, "2026-09")).toBe(350_000);
    expect(amountFor(oct, "2026-10")).toBe(400_000);
  });
});
