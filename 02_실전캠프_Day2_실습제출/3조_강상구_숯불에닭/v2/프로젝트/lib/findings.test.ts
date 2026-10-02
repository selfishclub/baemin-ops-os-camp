import { describe, expect, it } from "vitest";
import { monthEnd, monthFindings, monthSources, type FindingsInput } from "./findings";
import type { ChannelSettlementSummary, Settlement } from "./settlement";

const batch = (status: Settlement["status"], sales: number): Settlement => ({
  channel: "baemin", from: "2026-09-10", to: "2026-09-10", sales, payout: "2026-09-13", deposit: 0, fee: 0, feeRate: null, status,
});
const summary = (channel: string, settlements: Settlement[]): ChannelSettlementSummary => ({
  channel, sales: 0, deposited: 0, fee: 0, feeRate: null, pending: 0,
  missing: settlements.filter((s) => s.status === "미입금").reduce((a, s) => a + s.sales, 0),
  settlements, unmatchedDeposits: [],
});

const base: FindingsInput = {
  month: "2026-09",
  today: "2026-10-03",
  lastBankDate: "2026-09-30",
  needsReview: 0,
  unclassified: 0,
  revenueBasis: "실매출",
  missingDays: [],
  enteredDays: 30,
  settlements: [],
  nameOf: (id) => ({ baemin: "배달의민족", coupang: "쿠팡이츠" })[id] ?? id,
  purchaseCount: 12,
  laborEstimated: false,
};

describe("이번 달 확인할 것", () => {
  it("다 들어왔으면 확인할 것이 없다", () => {
    expect(monthFindings(base)).toEqual([]);
    expect(monthSources(base).every((s) => s.done)).toBe(true);
  });

  it("입금일 지난 정산이 맨 위(빨강)로 온다", () => {
    const f = monthFindings({ ...base, needsReview: 3, settlements: [summary("baemin", [batch("미입금", 120_000), batch("일치", 90_000)])] });
    expect(f[0].level).toBe("danger");
    expect(f[0].text).toContain("1건");
    expect(f[0].text).toContain("120,000원");
    expect(f[0].text).toContain("배달의민족");
    expect(f[1].text).toContain("3줄");
  });

  it("빈 날은 다섯 개까지만 보여 주고 나머지는 … 로", () => {
    const days = ["01", "02", "03", "04", "05", "06", "07"].map((d) => `2026-09-${d}`);
    const f = monthFindings({ ...base, missingDays: days });
    expect(f[0].text).toContain("7일");
    expect(f[0].text).toContain("9/5 …");
    expect(f[0].text).not.toContain("9/6");
  });

  it("일별 매출이 없으면 빈 날 대신 '통장 입금액 기준'을 알린다", () => {
    const f = monthFindings({ ...base, revenueBasis: "입금액", missingDays: ["2026-09-01"] });
    expect(f).toHaveLength(1);
    expect(f[0].text).toContain("통장 입금액 기준");
  });

  it("이번 달은 어제까지 올렸으면 통장 완료로 본다", () => {
    const s = monthSources({ ...base, month: "2026-10", today: "2026-10-03", lastBankDate: "2026-10-02" });
    expect(s.find((x) => x.label === "통장")!.done).toBe(true);
    const s2 = monthSources({ ...base, lastBankDate: "2026-09-25" });
    expect(s2.find((x) => x.label === "통장")!.detail).toBe("9/25까지만 올림");
  });

  it("급여가 어림값이면 급여 칸이 안 채워진다", () => {
    const s = monthSources({ ...base, laborEstimated: true });
    expect(s.find((x) => x.label === "급여")!.done).toBe(false);
  });

  it("말일 구하기", () => {
    expect(monthEnd("2026-09")).toBe("2026-09-30");
    expect(monthEnd("2028-02")).toBe("2028-02-29");
  });
});
