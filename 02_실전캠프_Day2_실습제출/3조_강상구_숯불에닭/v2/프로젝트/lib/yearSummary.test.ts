import { describe, expect, it } from "vitest";
import { computePnl } from "./pnl";
import { summarizeYear, yearMonths } from "./yearSummary";
import type { Major } from "./categories";
import type { ChannelSale, Transaction } from "./types";

const tx = (month: string, payee: string, out: number, major: Major, minor: string): Transaction => ({
  id: month + payee, month, date: `${month}-10`, payee, out, in: 0, source: "bank", major, minor, channel: null, review: null,
});
const sale = (month: string, orders: number): ChannelSale[] => [{ month, channel: "hall_card", name: "홀", orders, deposit: orders, count: 1 }];

describe("1년 화면 숫자", () => {
  const aug = computePnl([tx("2026-08", "가나식품", 3_000_000, "매출원가", "원재료비"), tx("2026-08", "월세", 1_000_000, "임대료", "임대료")], sale("2026-08", 10_000_000));
  const sep = computePnl([tx("2026-09", "가나식품", 4_000_000, "매출원가", "원재료비"), tx("2026-09", "월세", 1_000_000, "임대료", "임대료")], sale("2026-09", 10_000_000));
  const empty = computePnl([], []);
  const y = summarizeYear([
    { month: "2026-09", pnl: sep, empty: false, closed: false },
    { month: "2026-07", pnl: empty, empty: true, closed: false },
    { month: "2026-08", pnl: aug, empty: false, closed: true },
  ]);

  it("자료 있는 달만 1월부터 순서대로", () => {
    expect(y.months.map((m) => m.month)).toEqual(["2026-08", "2026-09"]);
    expect(y.months[0].closed).toBe(true);
  });

  it("누적 매출·영업이익·이익률", () => {
    expect(y.revenue).toBe(20_000_000);
    expect(y.profit).toBe(11_000_000);
    expect(y.margin).toBe(55);
  });

  it("월별 원가율", () => {
    expect(y.months.map((m) => m.costRate)).toEqual([30, 40]);
  });

  it("비용 구성은 큰 순서, 많이 쓴 세부 항목도", () => {
    expect(y.costByMajor.map((c) => [c.label, c.amount])).toEqual([
      ["매출원가", 7_000_000],
      ["임대료", 2_000_000],
    ]);
    expect(y.topMinors[0]).toEqual({ major: "매출원가", label: "원재료비", amount: 7_000_000 });
  });

  it("열두 달", () => {
    expect(yearMonths(2026)).toHaveLength(12);
    expect(yearMonths(2026)[11]).toBe("2026-12");
  });
});
