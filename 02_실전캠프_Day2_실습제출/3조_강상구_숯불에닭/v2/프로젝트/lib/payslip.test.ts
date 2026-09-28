import { describe, expect, it } from "vitest";
import { buildPayslip, payDateText } from "./payslip";

describe("급여 안내 글", () => {
  const base = { month: "2026-09", alias: "홀A", days: 22, hours: 178.5, wage: 12000, labor: 2142000 };

  it("한 사람 몫을 보기 좋게 적는다", () => {
    expect(buildPayslip({ ...base, payDay: 10 })).toBe(
      ["2026년 9월 급여 — 홀A 님", "", "근무 22일 · 총 178.5시간", "시급 12,000원", "급여 2,142,000원", "", "지급 예정일: 10월 10일"].join("\n"),
    );
  });

  it("지급일을 안 정했으면 그 줄은 빼고 적는다", () => {
    const text = buildPayslip(base);
    expect(text).not.toContain("지급 예정일");
    expect(text).toContain("급여 2,142,000원");
  });

  it("시간은 소수점 한 자리까지만", () => {
    expect(buildPayslip({ ...base, hours: 9.75 })).toContain("총 9.8시간");
    expect(buildPayslip({ ...base, hours: 10 })).toContain("총 10시간");
  });

  it("지급일은 다음 달로 센다", () => {
    expect(payDateText("2026-09", 10)).toBe("10월 10일");
    expect(payDateText("2026-12", 5)).toBe("1월 5일");
  });

  it("그 달에 없는 날이면 말일로 민다", () => {
    expect(payDateText("2027-01", 31)).toBe("2월 28일");
  });
});
