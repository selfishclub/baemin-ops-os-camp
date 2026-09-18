import { describe, expect, it } from "vitest";
import { DEFAULT_CHANNELS } from "./categories";
import { effectiveChannelSales } from "./effective";
import type { ChannelSettlementSummary } from "./settlement";

const st = (p: Partial<ChannelSettlementSummary>): ChannelSettlementSummary => ({
  channel: "baemin", sales: 1_000_000, deposited: 680_000, fee: 120_000, feeRate: 15, pending: 200_000, missing: 0, settlements: [], unmatchedDeposits: [], ...p,
});

describe("손익용 실매출 정하기", () => {
  const daily = [
    { date: "2026-09-01", channel: "baemin", amount: 800_000 },
    { date: "2026-09-02", channel: "baemin", amount: 200_000 },
    { date: "2026-09-01", channel: "hall_cash", amount: 50_000 },
    { date: "2026-09-01", channel: "hall_card", amount: 300_000 },
  ];
  it("직접 저장한 월 합계가 있으면 그것을 쓴다", () => {
    const out = effectiveChannelSales("2026-09", [{ month: "2026-09", channel: "baemin", name: "배민", orders: 999, deposit: 900, count: 1 }], daily, DEFAULT_CHANNELS, []);
    expect(out.find((s) => s.channel === "baemin")).toMatchObject({ orders: 999, deposit: 900 });
  });
  it("없으면 일별 합계 + 정산 결과로 만든다 (예정분은 같은 수수료율로 어림)", () => {
    const out = effectiveChannelSales("2026-09", [], daily, DEFAULT_CHANNELS, [st({})]);
    const b = out.find((s) => s.channel === "baemin")!;
    expect(b.orders).toBe(1_000_000);
    expect(b.deposit).toBe(680_000 + 170_000);
    expect(b.unsettled).toBe(170_000);
    expect(out.find((s) => s.channel === "hall_cash")).toMatchObject({ orders: 50_000, deposit: 0, unsettled: 0 });
    expect(out.find((s) => s.channel === "hall_card")).toMatchObject({ orders: 300_000, deposit: 0, unsettled: null }); // 규칙 없음
  });
});
