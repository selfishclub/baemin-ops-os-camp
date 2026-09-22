import { describe, expect, it } from "vitest";
import { explainOverdue, ruleText } from "./overdue";
import type { ChannelSettlementSummary, Settlement } from "./settlement";

const st = (channel: string, from: string, payout: string, sales: number, status: Settlement["status"] = "미입금"): Settlement =>
  ({ channel, from, to: from, payout, sales, deposit: 0, fee: 0, feeRate: null, status }) as Settlement;
const sum = (channel: string, settlements: Settlement[], unmatched: { date: string; amount: number }[] = []): ChannelSettlementSummary =>
  ({ channel, sales: 0, deposited: 0, fee: 0, feeRate: null, pending: 0, missing: 0, settlements, unmatchedDeposits: unmatched }) as ChannelSettlementSummary;

describe("입금일 지났는데 없는 돈 설명", () => {
  it("미입금 묶음만, 들어왔어야 할 날 순서로", () => {
    const r = explainOverdue([sum("card_bc", [st("card_bc", "2026-08-10", "2026-08-12", 100000), st("card_bc", "2026-08-05", "2026-08-07", 50000), st("card_bc", "2026-08-11", "2026-08-13", 1, "일치")])], [], "2026-08-20");
    expect(r.map((x) => x.payout)).toEqual(["2026-08-07", "2026-08-12"]);
    expect(r[0].daysLate).toBe(13);
  });

  it("같은 채널에 짝 없는 입금이 근처에 있으면 알려 준다", () => {
    const r = explainOverdue([sum("card_bc", [st("card_bc", "2026-08-10", "2026-08-12", 100000)], [{ date: "2026-08-14", amount: 98000 }])], [{ channel: "card_bc", mode: "days", days: 2, weekday: 0 }], "2026-08-20");
    expect(r[0].nearby[0]).toMatchObject({ date: "2026-08-14", sameChannel: true });
    expect(r[0].hints.join()).toContain("8/14");
    expect(r[0].rule).toBe("매출일 + 2영업일");
  });

  it("다른 카드사로 비슷한 금액이 들어왔으면 매출을 다른 카드사로 넣었는지 묻는다", () => {
    const r = explainOverdue([sum("card_bc", [st("card_bc", "2026-08-10", "2026-08-12", 100000)]), sum("card_kb", [], [{ date: "2026-08-12", amount: 98500 }])], [], "2026-08-20", (id) => (id === "card_kb" ? "국민카드" : id));
    expect(r[0].hints.join()).toContain("국민카드");
  });

  it("직접 출금 앱은 출금 신청을 확인하라고 한다", () => {
    const r = explainOverdue([sum("coupang", [st("coupang", "2026-08-10", "2026-08-14", 80000)])], [{ channel: "coupang", mode: "days", days: 4, weekday: 0, manual: true }], "2026-08-20");
    expect(r[0].hints[0]).toContain("출금 신청");
    expect(ruleText({ channel: "coupang", mode: "days", days: 4, weekday: 0, manual: true })).toBe("매출일 + 4영업일 (직접 출금 신청)");
  });

  it("근처에 아무것도 없으면 확인할 곳을 알려 준다", () => {
    const r = explainOverdue([sum("card_bc", [st("card_bc", "2026-08-10", "2026-08-12", 100000)])], [], "2026-08-20");
    expect(r[0].hints.join()).toContain("cardsales.or.kr");
  });
});

describe("설명 문구", () => {
  it("짝 없는 입금이 예정일보다 일찍 들어왔으면 '일찍'이라고 한다", () => {
    const r = explainOverdue([sum("card_samsung", [st("card_samsung", "2026-08-18", "2026-08-22", 267000)], [{ date: "2026-08-21", amount: 264465 }])], [], "2026-08-22");
    expect(r[0].hints.join()).toContain("일찍");
  });
  it("제로페이는 제로페이 가맹점 포털을 알려 준다", () => {
    const r = explainOverdue([sum("card_zeropay", [st("card_zeropay", "2026-08-19", "2026-08-21", 161000)])], [], "2026-08-22");
    expect(r[0].hints.join()).toContain("zeropay.or.kr");
    expect(r[0].hints.join()).not.toContain("cardsales");
  });
});
