import { describe, expect, it } from "vitest";
import { computePnl } from "./pnl";
import type { Major } from "./categories";
import type { ChannelSale, Transaction } from "./types";

describe("아직 안 낸 재료비", () => {
  const tx = (payee: string, out: number, major: Major, minor: string): Transaction => ({
    id: payee, month: "2026-09", date: "2026-09-10", payee, out, in: 0, source: "bank", major, minor, channel: null, review: null,
  });
  const sales: ChannelSale[] = [{ month: "2026-09", channel: "hall_card", name: "홀", orders: 10_000_000, deposit: 9_900_000, count: 100 }];
  const txs = [tx("가나식품", 3_000_000, "매출원가", "원재료비")];

  it("매입 영수증이 통장보다 많으면 그 차이를 원가에 더한다", () => {
    const p = computePnl(txs, sales, undefined, 4_500_000);
    expect(p.materialUnpaid).toBe(1_500_000);
    const cost = p.lines.find((l) => l.label === "매출원가")!;
    expect(cost.amount).toBe(4_500_000);
    expect(cost.minors?.find((m) => m.label === "아직 안 낸 재료비 (외상)")?.amount).toBe(1_500_000);
  });

  it("통장이 더 많으면 더하지 않는다 (지난달 대금까지 낸 달)", () => {
    const p = computePnl(txs, sales, undefined, 2_000_000);
    expect(p.materialUnpaid).toBe(0);
    expect(p.lines.find((l) => l.label === "매출원가")!.amount).toBe(3_000_000);
  });

  it("매입 영수증을 안 넣었으면 예전처럼 통장 기준", () => {
    const p = computePnl(txs, sales);
    expect(p.materialUnpaid).toBe(0);
    expect(p.lines.find((l) => l.label === "매출원가")!.amount).toBe(3_000_000);
  });

  it("그만큼 영업이익이 줄어든다", () => {
    const before = computePnl(txs, sales).operatingProfit;
    const after = computePnl(txs, sales, undefined, 4_500_000).operatingProfit;
    expect(before - after).toBe(1_500_000);
  });
});

describe("아직 안 낸 고정비", () => {
  const sales2: ChannelSale[] = [{ month: "2026-09", channel: "hall_card", name: "홀", orders: 10_000_000, deposit: 9_900_000, count: 100 }];
  const gap = (name: string, minor: string, amount: number, paid = 0) => ({
    cost: { id: name, name, payeeKeyword: name, major: "영업비" as Major, minor, amount, active: true },
    paid,
    gap: Math.max(0, amount - paid),
  });

  it("안 나간 만큼 그 소분류에 더한다", () => {
    const p = computePnl([], sales2, undefined, 0, [gap("가짜불판", "지급수수료", 350_000), gap("가짜가스", "수도광열비", 223_020)]);
    const op = p.lines.find((l) => l.label === "영업비")!;
    expect(p.fixedUnpaid).toBe(573_020);
    expect(op.amount).toBe(573_020);
    expect(op.minors?.find((m) => m.label === "지급수수료")?.amount).toBe(350_000);
    expect(op.minors?.find((m) => m.label === "수도광열비")?.amount).toBe(223_020);
  });

  it("이미 통장에서 나갔으면 더하지 않는다", () => {
    const p = computePnl([], sales2, undefined, 0, [gap("가짜불판", "지급수수료", 350_000, 350_000)]);
    expect(p.fixedUnpaid).toBe(0);
    expect(p.lines.find((l) => l.label === "영업비")!.amount).toBe(0);
  });

  it("그만큼 영업이익이 줄어든다", () => {
    const before = computePnl([], sales2).operatingProfit;
    const after = computePnl([], sales2, undefined, 0, [gap("가짜불판", "지급수수료", 350_000)]).operatingProfit;
    expect(before - after).toBe(350_000);
  });
});

describe("나눠 분류한 줄로 손익 내기", () => {
  const sales3: ChannelSale[] = [{ month: "2026-09", channel: "hall_card", name: "홀", orders: 10_000_000, deposit: 9_900_000, count: 100 }];
  const bill: Transaction = {
    id: "b1", month: "2026-09", date: "2026-09-30", payee: "가짜관리사무소", out: 494_440, in: 0,
    source: "bank", major: "임대료", minor: "관리비", channel: null, review: null,
    splits: [
      { major: "임대료", minor: "관리비", amount: 264_000 },
      { major: "영업비", minor: "수도광열비", amount: 230_440 },
    ],
  };

  it("나눈 대로 각 항목에 들어간다", () => {
    const p = computePnl([bill], sales3);
    expect(p.lines.find((l) => l.label === "임대료")!.amount).toBe(264_000);
    expect(p.lines.find((l) => l.label === "영업비")!.amount).toBe(230_440);
  });

  it("나눠도 영업이익은 그대로다", () => {
    const plain = { ...bill, splits: undefined };
    expect(computePnl([bill], sales3).operatingProfit).toBe(computePnl([plain], sales3).operatingProfit);
  });

  it("개인 몫을 제외로 나누면 그만큼 손익에서 빠진다", () => {
    const mart: Transaction = { ...bill, id: "m1", payee: "가짜마트", out: 70_430, major: "매출원가", minor: "원재료비",
      splits: [{ major: "매출원가", minor: "원재료비", amount: 63_950 }, { major: "제외", minor: "손익에 안 넣음", amount: 6_480 }] };
    const p = computePnl([mart], sales3);
    expect(p.lines.find((l) => l.label === "매출원가")!.amount).toBe(63_950);
    expect(p.excluded.out).toBe(6_480);
  });
});
