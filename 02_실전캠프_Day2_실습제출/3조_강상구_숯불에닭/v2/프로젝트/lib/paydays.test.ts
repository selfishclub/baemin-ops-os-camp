import { describe, expect, it } from "vitest";
import { isPrevMonthDefault, parsePayDays } from "./paydays";

describe("지급일 설정", () => {
  it("글을 날짜 목록으로 정리한다", () => {
    expect(parsePayDays("10")).toEqual([10]);
    expect(parsePayDays("25, 10일 10")).toEqual([10, 25]);
    expect(parsePayDays("0, 32, abc")).toEqual([]);
  });
  it("지급일에 나간 인건비·재료비만 지난달 비용이 기본", () => {
    expect(isPrevMonthDefault("2026-09-10", "노무관리비", [10])).toBe(true);
    expect(isPrevMonthDefault("2026-09-10", "매출원가", [10])).toBe(true);
    expect(isPrevMonthDefault("2026-09-10", "영업비", [10])).toBe(false);
    expect(isPrevMonthDefault("2026-09-11", "노무관리비", [10])).toBe(false);
    expect(isPrevMonthDefault("2026-09-25", "노무관리비", [10, 25])).toBe(true);
    expect(isPrevMonthDefault("2026-09-10", "", [10])).toBe(false);
  });
});
