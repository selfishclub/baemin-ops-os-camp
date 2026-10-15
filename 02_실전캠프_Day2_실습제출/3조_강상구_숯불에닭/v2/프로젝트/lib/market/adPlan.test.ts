import { describe, expect, it } from "vitest";
import { adGroupOf, budgetOutlook, groupCandidates, planAds, type AdPlan } from "./adPlan";
import type { KeywordNavData, VolumeMap } from "./keywordNav";

const data: KeywordNavData = {
  fileName: "t.xlsx",
  uploadedAt: "2026-10-15",
  regions: [
    { keyword: "청주", kind: "주소", volume: 123800, foodVolume: 122700 },
    { keyword: "율량동", kind: "주소", volume: 4630, foodVolume: 28190 },
    { keyword: "충청도", kind: "주소", volume: 20150, foodVolume: 1720 },
    { keyword: "명암타워", kind: "랜드마크", volume: 1800, foodVolume: 4040 },
  ],
  menus: [{ keyword: "닭갈비", volume: 3670 }, { keyword: "고기집", volume: 3770 }],
  tpo: ["회식", "가족모임"],
  nav: [
    { keyword: "청주맛집", volume: 123700, axis: "조합", type: "한참", guide: null, rankNote: null },
    { keyword: "청주닭갈비", volume: 1900, axis: "조합", type: "손님리뷰", guide: null, rankNote: null },
    { keyword: "율량동닭갈비", volume: 1060, axis: "조합", type: "손님리뷰", guide: null, rankNote: null },
    { keyword: "청주회식", volume: 260, axis: "조합", type: "손님리뷰", guide: null, rankNote: null },
    { keyword: "명암타워맛집", volume: 3500, axis: "조합", type: "대표상호", guide: null, rankNote: null },
    { keyword: "충청도맛집", volume: 1370, axis: "조합", type: "한참", guide: null, rankNote: null },
    { keyword: "율량동맛집", volume: 25110, axis: "조합", type: "한참", guide: null, rankNote: null },
  ],
  brandWords: [],
};
const volumes: VolumeMap = {
  청주닭갈비: { total: 1530, pc: 140, mobile: 1390, under10: false, at: "2026-10-15", comp: "높음", adClicks: 4, adDepth: 3 },
};

describe("광고그룹 나누기", () => {
  it("메인 권역 + 메뉴는 동네 메뉴, + 상황은 동네 상황, 랜드마크, 도 단위·시 전체 맛집은 넓은 지역", () => {
    expect(adGroupOf("청주닭갈비", data)).toBe("동네 메뉴");
    expect(adGroupOf("율량동고기집", data)).toBe("동네 메뉴");
    expect(adGroupOf("청주회식", data)).toBe("동네 상황");
    expect(adGroupOf("율량동가족모임", data)).toBe("동네 상황");
    expect(adGroupOf("명암타워맛집", data)).toBe("랜드마크");
    expect(adGroupOf("충청도맛집", data)).toBe("넓은 지역");
    expect(adGroupOf("청주맛집", data)).toBe("넓은 지역");
    expect(adGroupOf("율량동맛집", data)).toBe("동네 상황"); // 동네의 맛집은 넓지 않다
  });
});

describe("광고 시작안", () => {
  const bids = { 청주닭갈비: { top1: 460, minShow: 630 }, 율량동닭갈비: { top1: null, minShow: 200 } };
  const cands = planAds(data, volumes, bids, { 율량동닭갈비: 2, 청주맛집: null }, { minVolume: 100 });

  it("자연 순위 3위 안이면 보류, 넓은 지역은 나중, 동네 메뉴가 먼저", () => {
    const by = Object.fromEntries(cands.map((c) => [c.keyword, c]));
    expect(by["율량동닭갈비"].verdict).toBe("보류");
    expect(by["청주맛집"].verdict).toBe("나중");
    expect(by["충청도맛집"].verdict).toBe("나중");
    expect(by["청주닭갈비"].verdict).toBe("추천");
    expect(["동네 메뉴", "동네 상황"]).toContain(cands[0].group); // 동네 키워드가 맨 위
    const idx = (k: string) => cands.findIndex((c) => c.keyword === k);
    expect(idx("청주닭갈비")).toBeLessThan(idx("청주회식"));
    expect(idx("청주닭갈비")).toBeLessThan(idx("청주맛집"));
  });
  it("조회값(검색수·경쟁·광고 통계)과 입찰가가 붙고, 기대 클릭·비용은 거칠게", () => {
    const c = cands.find((x) => x.keyword === "청주닭갈비")!;
    expect(c.volume).toBe(1530);
    expect(c.comp).toBe("높음");
    expect(c.bid.minShow).toBe(630);
    expect(c.estClicksPerMonth).toBe(1); // 광고 클릭 4를 광고 3개가 나눔 → 1
    expect(c.estCostPerMonth).toBe(630);
    expect(c.reason).toContain("최소 630원");
  });
  it("묶음별로 나눠 담는다", () => {
    const groups = groupCandidates(cands);
    expect(groups.map((g) => g.group)).toEqual(["동네 메뉴", "동네 상황", "랜드마크", "넓은 지역"]);
  });
});

describe("예산 전망", () => {
  it("일 예산 ÷ 평균 입찰가 = 하루 클릭", () => {
    const plan: AdPlan = { dailyBudget: 10000, items: [{ keyword: "a", group: "동네 메뉴", bid: 400, status: "예정" }, { keyword: "b", group: "동네 메뉴", bid: 600, status: "켬" }, { keyword: "c", group: "동네 메뉴", bid: 5000, status: "꺼둠" }], log: [], startedAt: null };
    const o = budgetOutlook(plan);
    expect(o.avgBid).toBe(500);
    expect(o.clicksPerDay).toBe(20);
    expect(o.monthCost).toBe(300000);
  });
});
