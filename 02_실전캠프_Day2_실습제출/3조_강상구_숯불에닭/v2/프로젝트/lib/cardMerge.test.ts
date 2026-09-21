import { describe, expect, it } from "vitest";
import { mergeApprovalDay } from "./cardApproval";
import type { DailySale } from "./types";

const day = { date: "2026-08-18", byCard: { card_kb: 500000, card_shinhan: 200000 }, count: 10 };
const existing: DailySale[] = [
  { date: "2026-08-18", channel: "card_kb", amount: 480000 },
  { date: "2026-08-18", channel: "card_easy", amount: 30000 },
  { date: "2026-08-18", channel: "card_zeropay", amount: 12000 },
  { date: "2026-08-18", channel: "card_hana", amount: 50000, source: "pos_easy" },
  { date: "2026-08-18", channel: "hall_cash", amount: 69000 },
  { date: "2026-08-18", channel: "baemin", amount: 300000 },
  { date: "2026-08-17", channel: "card_kb", amount: 1 },
];

describe("승인현황 파일을 그날 매출에 합치기", () => {
  it("카드승인현황은 카드사 줄만 바꾸고 간편결제·제로페이·현금·배달앱은 남긴다", () => {
    const r = mergeApprovalDay(existing, day, "card");
    const by = Object.fromEntries(r.map((s) => [s.channel + (s.source ? "*" : ""), s.amount]));
    expect(by).toEqual({ card_kb: 500000, card_shinhan: 200000, card_easy: 30000, card_zeropay: 12000, "card_hana*": 50000, hall_cash: 69000, baemin: 300000 });
    expect(r.every((s) => s.date === "2026-08-18")).toBe(true);
  });

  it("간편결제승인현황은 간편결제와 그 파일에서 온 카드사 줄만 바꾼다", () => {
    const easy = { date: "2026-08-18", byCard: { card_easy: 40000, card_hana: 60000 }, count: 3 };
    const r = mergeApprovalDay(existing, easy, "easy");
    const by = Object.fromEntries(r.map((s) => [s.channel + (s.source ? "*" : ""), s.amount]));
    expect(by).toEqual({ card_kb: 480000, card_easy: 40000, card_zeropay: 12000, "card_hana*": 60000, hall_cash: 69000, baemin: 300000 });
  });
});
