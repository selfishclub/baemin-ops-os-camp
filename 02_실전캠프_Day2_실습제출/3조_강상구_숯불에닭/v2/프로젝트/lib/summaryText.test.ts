import { describe, expect, it } from "vitest";
import { computePnl } from "./pnl";
import { monthSummaryText } from "./summaryText";
import type { Major } from "./categories";
import type { ChannelSale, Transaction } from "./types";

const tx = (payee: string, out: number, major: Major, minor: string): Transaction => ({
  id: payee, month: "2026-09", date: "2026-09-10", payee, out, in: 0, source: "bank", major, minor, channel: null, review: null,
});
const sales: ChannelSale[] = [
  { month: "2026-09", channel: "hall_card", name: "홀", orders: 4_000_000, deposit: 3_960_000, count: 1 },
  { month: "2026-09", channel: "baemin", name: "배민", orders: 6_000_000, deposit: 5_100_000, count: 1 },
];

describe("카톡용 월 요약", () => {
  const pnl = computePnl([tx("가나식품", 3_800_000, "매출원가", "원재료비"), tx("생활비", 2_000_000, "기타", "생활비")], sales, { hourly: 1_000_000, salary: 0, insurance: 0 });
  const text = monthSummaryText({ monthName: "9월", prevName: "8월", pnl, prevProfit: 3_000_000, closed: false, missingDays: 2 });

  it("한 줄씩 핵심만", () => {
    const lines = text.split("\n");
    expect(lines[0]).toBe("[9월 손익 요약] 마감 전");
    expect(lines[1]).toBe("매출 10,000,000원 (홀 4,000,000 · 배달 6,000,000)");
    expect(lines[2]).toContain("영업이익 4,300,000원");
    expect(lines[2]).toContain("8월보다 ▲1,300,000");
  });

  it("기준 넘은 비율, 가져간 돈, 어림·미입력을 알린다", () => {
    expect(text).toContain("원가율 38.0%(기준 넘음)");
    expect(text).toContain("가져간 돈(생활비) 2,000,000원");
    expect(text).toContain("※ 어림값 1,000,000원 포함");
    expect(text).toContain("※ 매출 미입력 2일");
  });

  it("손님·직원 이름이 들어갈 자리가 없다 (거래처 이름도 안 넣는다)", () => {
    expect(text).not.toContain("가나식품");
  });
});
