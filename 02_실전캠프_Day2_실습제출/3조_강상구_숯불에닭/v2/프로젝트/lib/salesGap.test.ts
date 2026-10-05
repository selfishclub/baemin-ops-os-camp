import { describe, expect, it } from "vitest";
import { missingSales, saleDatesOf, totalMissing } from "./salesGap";
import { DEFAULT_CHANNELS } from "./categories";
import type { ChannelSettlementSummary, SettlementRule } from "./settlement";
import type { DailySale } from "./types";

const rule = (channel: string, days: number): SettlementRule => ({ channel, mode: "days", days, weekday: 0 });
const summary = (channel: string, unmatched: { date: string; amount: number }[]): ChannelSettlementSummary =>
  ({ channel, sales: 0, deposited: 0, fee: 0, feeRate: null, pending: 0, missing: 0, settlements: [], unmatchedDeposits: unmatched });
const C = DEFAULT_CHANNELS;

describe("입금일로 주문일 거꾸로 찾기", () => {
  it("+4영업일: 10/1(목) 입금은 9/25~9/27 주문분", () => {
    // 9/26(토)·9/27(일)은 영업일이 아니라 9/25(금)과 같은 날 입금된다
    expect(saleDatesOf("2026-10-01", rule("card_zeropay", 4))).toEqual(["2026-09-25", "2026-09-26", "2026-09-27"]);
  });

  it("+0영업일(계좌이체)은 그날 하나뿐", () => {
    expect(saleDatesOf("2026-09-05", rule("hall_transfer", 0))).toEqual(["2026-09-05"]);
  });

  it("거꾸로 못 풀면 빈 목록", () => {
    expect(saleDatesOf("2026-09-06", rule("hall_card", 2))).toEqual([]);
  });

  it("공휴일을 넣으면 그만큼 앞으로 밀린다", () => {
    expect(saleDatesOf("2026-10-01", rule("card_zeropay", 4), ["2026-09-28"])).toContain("2026-09-24");
  });
});

describe("통장엔 있는데 매출에 없는 날", () => {
  it("짝 안 맞는 입금의 주문일에 매출이 없으면 집어낸다", () => {
    const found = missingSales([summary("yogiyo", [{ date: "2026-10-02", amount: 24948 }])], [rule("yogiyo", 5)], [], C, "2026-09");
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ channel: "yogiyo", deposit: 24948, depositDate: "2026-10-02" });
    expect(found[0].saleDates).toContain("2026-09-26");
  });

  it("후보 중 한 날이라도 매출이 있으면 넘어간다", () => {
    const sales: DailySale[] = [{ date: "2026-09-26", channel: "yogiyo", amount: 34000 }];
    expect(missingSales([summary("yogiyo", [{ date: "2026-10-02", amount: 24948 }])], [rule("yogiyo", 5)], sales, C, "2026-09")).toEqual([]);
  });

  it("지난달 주문분 입금은 이번 달에서 안 본다", () => {
    // 9/1에 들어온 롯데 입금은 8월 주문분 — 9월 마감에서 걸리면 안 된다
    expect(missingSales([summary("card_lotte", [{ date: "2026-09-01", amount: 124740 }])], [rule("card_lotte", 2)], [], C, "2026-09")).toEqual([]);
  });

  it("정산 규칙이 없는 채널은 주문일을 몰라서 건너뛴다", () => {
    expect(missingSales([summary("yogiyo", [{ date: "2026-10-02", amount: 24948 }])], [], [], C, "2026-09")).toEqual([]);
  });

  it("매출이 0원으로 들어간 날도 빠진 것으로 본다", () => {
    const sales: DailySale[] = [{ date: "2026-09-26", channel: "yogiyo", amount: 0 }];
    expect(missingSales([summary("yogiyo", [{ date: "2026-10-02", amount: 24948 }])], [rule("yogiyo", 5)], sales, C, "2026-09")).toHaveLength(1);
  });

  it("계좌이체는 그날 바로 들어와서 날짜가 하나로 딱 나온다", () => {
    const found = missingSales([summary("hall_transfer", [{ date: "2026-09-05", amount: 58000 }])], [rule("hall_transfer", 0)], [], C, "2026-09");
    expect(found[0].saleDates).toEqual(["2026-09-05"]);
  });

  it("여러 건이면 주문일 순으로, 합계도 낸다", () => {
    const found = missingSales(
      [summary("yogiyo", [{ date: "2026-10-02", amount: 24948 }]), summary("hall_transfer", [{ date: "2026-09-05", amount: 58000 }])],
      [rule("yogiyo", 5), rule("hall_transfer", 0)], [], C, "2026-09",
    );
    expect(found.map((f) => f.channel)).toEqual(["hall_transfer", "yogiyo"]);
    expect(totalMissing(found)).toBe(82948);
  });
});

import { looksLikeSplitPayout } from "./salesGap";
import type { Settlement } from "./settlement";

const bundle = (p: Partial<Settlement>): Settlement =>
  ({ channel: "card_kb", from: "2026-09-02", to: "2026-09-02", sales: 94000, payout: "2026-09-04", deposit: 44663, fee: 49337, feeRate: null, status: "차이", ...p });

describe("카드사가 하루치를 두 번에 나눠 보낸 경우", () => {
  // 국민카드가 9/2 매출 94,000을 9/4에 44,663, 9/7에 48,633으로 나눠 보냄 (2026-09 실제)
  it("가까운 날 묶음이 그만큼 덜 들어왔으면 나눠 보낸 것으로 본다", () => {
    expect(looksLikeSplitPayout(48633, "2026-09-07", [bundle({})])).toBe(true);
  });

  it("9/3 국민카드는 매출이 없어도 경고하지 않는다", () => {
    const sum: ChannelSettlementSummary = {
      channel: "card_kb", sales: 94000, deposited: 44663, fee: 0, feeRate: null, pending: 0, missing: 0,
      settlements: [bundle({})], unmatchedDeposits: [{ date: "2026-09-07", amount: 48633 }],
    };
    expect(missingSales([sum], [rule("card_kb", 2)], [], C, "2026-09")).toEqual([]);
  });

  it("묶음이 다 들어왔으면 나눠 보낸 게 아니다", () => {
    expect(looksLikeSplitPayout(48633, "2026-09-07", [bundle({ deposit: 94000, status: "일치" })])).toBe(false);
  });

  it("날짜가 멀면 상관없는 입금으로 본다", () => {
    expect(looksLikeSplitPayout(48633, "2026-09-20", [bundle({})])).toBe(false);
  });

  it("금액이 많이 다르면 나눠 보낸 게 아니다", () => {
    expect(looksLikeSplitPayout(10000, "2026-09-07", [bundle({})])).toBe(false);
  });

  it("요기요처럼 묶음 자체가 없으면 그대로 집어낸다", () => {
    const sum: ChannelSettlementSummary = {
      channel: "yogiyo", sales: 0, deposited: 0, fee: 0, feeRate: null, pending: 0, missing: 0,
      settlements: [], unmatchedDeposits: [{ date: "2026-10-02", amount: 24948 }],
    };
    expect(missingSales([sum], [rule("yogiyo", 5)], [], C, "2026-09")).toHaveLength(1);
  });
});
