import { describe, expect, it } from "vitest";
import { inflowSummary, rankMap } from "./inflow";

const inflow = {
  collectedAt: "2026-10-20T00:00:00Z",
  ranges: { d30: { start: "2026-09-20", end: "2026-10-19", items: [
    { keyword: "숯불에닭", pv: 50 }, { keyword: "율량동숯불에닭", pv: 20 }, { keyword: "(검색어 없음)", pv: 5 },
    { keyword: "율량동맛집", pv: 15 }, { keyword: "청주문화제조창식당", pv: 10 },
  ] } },
};

describe("유입 키워드", () => {
  const ranks = rankMap([{ keyword: "율량동 맛집", rank: 36 }]);
  const s = inflowSummary(inflow, "d30", ranks)!;
  it("가게 이름 검색과 검색어 없음은 따로 묶는다", () => {
    expect(s.total).toBe(100);
    expect(s.brand).toEqual({ pv: 70, keywords: 2 });
    expect(s.noKeyword).toBe(5);
    expect(s.rows.map((r) => r.keyword)).toEqual(["율량동맛집", "청주문화제조창식당"]);
  });
  it("추적 중이면 순위를 띄어쓰기 무시하고 붙인다", () => {
    expect(s.rows[0]).toMatchObject({ tracked: true, rank: 36, share: 15 });
    expect(s.rows[1]).toMatchObject({ tracked: false, rank: null });
  });
  it("그 기간 자료가 없으면 null", () => {
    expect(inflowSummary(inflow, "d7", ranks)).toBeNull();
  });
});
