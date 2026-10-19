import { describe, expect, it } from "vitest";
import { inflowPeriod, inflowYesterday, moveInflowPeriod, inflowPeriodLabel } from "./inflowPeriod";
const now = new Date("2026-10-19T18:00:00Z");
describe("키워드 조회 기간", () => {
  it("한국 시간 어제 하루를 일간으로 조회한다", () => {
    expect(inflowYesterday(now)).toBe("2026-10-19");
    expect(inflowPeriod("daily", "2026-10-19", now)).toMatchObject({ start: "2026-10-19", end: "2026-10-19" });
  });
  it("주간은 월요일부터 일요일이며 월 경계를 넘을 수 있다", () => {
    expect(inflowPeriod("weekly", "2026-09-01", now)).toMatchObject({ start: "2026-08-31", end: "2026-09-06" });
  });
  it("이번 주와 이번 달은 어제까지만 조회한다", () => {
    expect(inflowPeriod("weekly", "2026-10-19", now)).toMatchObject({ start: "2026-10-19", end: "2026-10-19" });
    expect(inflowPeriod("monthly", "2026-10-19", now)).toMatchObject({ start: "2026-10-01", end: "2026-10-19" });
  });
  it("월간은 윤년과 연도 경계를 처리한다", () => {
    expect(inflowPeriod("monthly", "2028-02-29", new Date("2028-03-02T00:00:00Z"))).toMatchObject({ start: "2028-02-01", end: "2028-02-29" });
    expect(moveInflowPeriod("monthly", "2026-01-31", -1)).toBe("2025-12-01");
    expect(moveInflowPeriod("monthly", "2025-12-31", 1)).toBe("2026-01-01");
  });
  it("일간과 주간 화살표는 하루와 7일씩 이동한다", () => {
    expect(moveInflowPeriod("daily", "2026-09-01", -1)).toBe("2026-08-31");
    expect(moveInflowPeriod("weekly", "2026-09-01", 1)).toBe("2026-09-08");
  });
  it("조회 가능 범위 밖으로 벗어나지 않는다", () => {
    expect(inflowPeriod("weekly", "2024-09-01", now)).toMatchObject({ start: "2024-09-01", end: "2024-09-01" });
    expect(inflowPeriod("daily", "2027-01-01", now).end).toBe("2026-10-19");
  });
  it("화면에 날짜와 요일을 표시한다", () => {
    expect(inflowPeriodLabel("2026-09-01", "2026-09-30")).toBe("26. 9. 1. 화 - 26. 9. 30. 수");
  });
});
