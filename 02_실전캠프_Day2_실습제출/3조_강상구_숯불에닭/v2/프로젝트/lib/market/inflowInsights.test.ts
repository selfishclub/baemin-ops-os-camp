import { describe, expect, it } from "vitest";
import { eventEvidence, inflowResearch } from "./inflowInsights";
import type { InflowEvent } from "./inflowEvents";
import type { MarketInflow } from "../export/types";
const event: InflowEvent = { id: "sample", title: "가상 행사", place: "가상공원", pattern: "가상공원", start: "2026-09-12", end: "2026-09-13", source: "테스트", url: "https://example.com", note: "가상 자료" };
const entry = (start: string, end: string, pv: number, keyword = "가상공원맛집") => ({start, end, items: [{keyword, pv}]});
describe("유입 이유 근거 계산", () => {
  it("일간만 집계하고 겹치는 주간·월간은 합산하지 않는다", () => {
    const data: MarketInflow = { collectedAt: "", periods: {
      a: entry("2026-09-12", "2026-09-12", 6), duplicate: entry("2026-09-12", "2026-09-12", 6),
      b: entry("2026-09-13", "2026-09-13", 4), week: entry("2026-09-07", "2026-09-13", 99),
      baseline: entry("2026-09-05", "2026-09-05", 2),
    }, months: { "2026-09": entry("2026-09-01", "2026-09-30", 200) } };
    const result = eventEvidence(data, event);
    expect(result.observed).toBe(10);
    expect(result.days).toHaveLength(2);
    expect(result.peak?.count).toBe(6);
    expect(result.baseline?.count).toBe(2);
    expect(result.label).toBe("비교일보다 증가");
    expect(result.months[0].count).toBe(200);
  });
  it("비교일 자료가 없으면 0회로 단정하지 않는다", () => {
    const result = eventEvidence({collectedAt: "", periods: { a: entry("2026-09-12", "2026-09-12", 5) }}, event);
    expect(result.baseline).toBeNull();
    expect(result.label).toBe("행사일 유입 대조");
    expect(result.days.length).toBeLessThan(result.expectedDays);
  });
  it("행사가 있어도 증가하지 않은 비교 결과를 보존한다", () => {
    const result = eventEvidence({collectedAt: "", periods: { a: entry("2026-09-12", "2026-09-12", 3), b: entry("2026-09-05", "2026-09-05", 3) }}, event);
    expect(result.label).toBe("증가 확인 안 됨");
  });
  it("월별 자료만 있으면 일간 근거로 표시하지 않는다", () => {
    const result = eventEvidence({collectedAt: "", months: { "2026-09": entry("2026-09-01", "2026-09-30", 10) }}, event);
    expect(result.label).toBe("월별 후보 · 일간 미확인");
    expect(result.peak).toBeNull();
  });
  it("앞달 자료가 비어 있으면 신규 검색어나 증가로 계산하지 않는다", () => {
    const result = inflowResearch({collectedAt: "", months: { "2026-08": {start: "2026-08-01", end: "2026-08-31", items: []}, "2026-09": entry("2026-09-01", "2026-09-30", 10) }});
    expect(result.changes).toHaveLength(0);
    expect(result.months[0].hasData).toBe(false);
  });
  it("진행 중인 달은 일평균으로 비교하고 띄어쓰기가 같은 검색어는 합친다", () => {
    const result = inflowResearch({collectedAt: "", months: { "2026-09": entry("2026-09-01", "2026-09-30", 10, "가상 공원 맛집"), "2026-10": entry("2026-10-01", "2026-10-10", 10) }});
    expect(result.changes[0]).toMatchObject({count: 10, previous: 10, ratio: 3});
  });
});
