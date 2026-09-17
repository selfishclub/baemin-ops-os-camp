import { describe, expect, it } from "vitest";
import { recentWeekStarts, weekEndOf, weekLabel, weekRange } from "@/lib/week";

describe("week", () => {
  it("수요일 → 그 주 월~일", () => {
    expect(weekRange(new Date(2026, 8, 2))).toEqual({ start: "2026-08-31", end: "2026-09-06" });
  });
  it("일요일은 직전 월요일부터", () => {
    expect(weekRange(new Date(2026, 8, 6))).toEqual({ start: "2026-08-31", end: "2026-09-06" });
  });
  it("월요일은 그날부터", () => {
    expect(weekRange(new Date(2026, 8, 7)).start).toBe("2026-09-07");
  });
  it("보조 함수", () => {
    expect(weekEndOf("2026-08-31")).toBe("2026-09-06");
    expect(weekLabel("2026-08-31")).toBe("8/31 ~ 9/6");
    expect(recentWeekStarts(3, new Date(2026, 8, 2))).toEqual(["2026-08-31", "2026-08-24", "2026-08-17"]);
  });
});
