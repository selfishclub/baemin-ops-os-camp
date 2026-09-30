import { describe, expect, it } from "vitest";
import { fixedCostGaps, totalFixedGap, type FixedCost } from "./fixedCosts";
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
    const gaps = fixedCostGaps(costs, []);
    expect(gaps.map((g) => g.gap)).toEqual([350_000, 223_020]);
    expect(totalFixedGap(gaps)).toBe(573_020);
  });

  it("통장에서 나갔으면 그만큼 뺀다", () => {
    const gaps = fixedCostGaps(costs, [tx("NH콕송금 가짜불판", 350_000)]);
    expect(gaps[0]).toMatchObject({ paid: 350_000, gap: 0 });
    expect(gaps[1].gap).toBe(223_020);
  });

  it("일부만 나갔으면 모자란 만큼만", () => {
    expect(fixedCostGaps(costs, [tx("가짜가스 김씨", 200_000)])[1].gap).toBe(23_020);
  });

  it("더 많이 나갔어도 음수로 가지 않는다", () => {
    expect(fixedCostGaps(costs, [tx("가짜불판", 400_000)])[0].gap).toBe(0);
  });

  it("끈 것·금액 0·거래처 빈 것은 세지 않는다", () => {
    const off = [{ ...cost("끈 것", "가짜", 100), active: false }, cost("0원", "가짜", 0), cost("빈 거래처", "  ", 500)];
    expect(fixedCostGaps(off, [])).toHaveLength(0);
  });

  it("환급(입금)이 있으면 낸 돈에서 뺀다", () => {
    const refund: Transaction = { ...tx("가짜불판", 0), in: 50_000 };
    expect(fixedCostGaps(costs, [tx("가짜불판", 350_000), refund])[0].gap).toBe(50_000);
  });
});
