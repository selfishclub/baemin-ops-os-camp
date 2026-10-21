import { describe, expect, it } from "vitest";
import { DEFAULT_CHANNELS } from "../categories";
import { adOpsAlerts, belowMinBid, bizmoneyDays, budgetPlan, customerAdLimit, exposureSummary, hallVersusUsual, mondayOf, placeGroupIds, weeklyRecord } from "./adOps";
import type { NaverAdExport } from "./adStats";

const base = (): NaverAdExport => ({
  collectedAt: "2026-10-20",
  campaigns: [
    { id: "c1", name: "파워링크", type: "WEB_SITE", dailyBudget: 10_000, status: "ELIGIBLE", on: true },
    { id: "c2", name: "플레이스 회식", type: "PLACE", dailyBudget: 7_000, status: "ELIGIBLE", on: true },
  ],
  groups: [
    { id: "g1", campaignId: "c1", name: "동네메뉴", bid: 70, dailyBudget: 10_000, status: "ELIGIBLE", on: true, adCount: 1 },
    { id: "g2", campaignId: "c1", name: "랜드마크", bid: 70, dailyBudget: 10_000, status: "ELIGIBLE", on: true, adCount: 0 },
    { id: "g3", campaignId: "c2", name: "평일낮 회식", bid: 50, dailyBudget: 7_000, status: "ELIGIBLE", on: true, adCount: 2 },
  ],
  keywords: [
    { id: "k1", groupId: "g1", keyword: "청주닭발", bid: 70, useGroupBid: false, status: "ELIGIBLE", inspect: null, quality: null, on: true, minBid: 400 },
    { id: "k2", groupId: "g1", keyword: "율량동닭갈비", bid: 500, useGroupBid: false, status: "ELIGIBLE", inspect: null, quality: 4, on: true, minBid: 300 },
    { id: "k3", groupId: "g2", keyword: "엔포드호텔맛집", bid: null, useGroupBid: true, status: "ELIGIBLE", inspect: null, quality: null, on: true, minBid: 1340 },
  ],
  stats: [],
  bizmoney: 50_000,
});

describe("주 단위", () => {
  it("월요일을 찾는다", () => {
    expect(mondayOf("2026-10-20")).toBe("2026-10-19"); // 화
    expect(mondayOf("2026-10-19")).toBe("2026-10-19");
    expect(mondayOf("2026-10-25")).toBe("2026-10-19"); // 일
  });
});

describe("최소 노출선보다 낮은 입찰가", () => {
  it("묶음 입찰가를 쓰는 키워드까지 찾고, 차이가 큰 순으로", () => {
    const r = belowMinBid(base());
    expect(r.map((x) => x.keyword)).toEqual(["엔포드호텔맛집", "청주닭발"]);
    expect(r[0]).toMatchObject({ bid: 70, min: 1340, group: "랜드마크" });
  });
  it("꺼진 묶음 키워드는 빼고 본다", () => {
    const d = base();
    d.groups[1].on = false;
    expect(belowMinBid(d).map((x) => x.keyword)).toEqual(["청주닭발"]);
  });
});

describe("경고", () => {
  it("문구 없는 묶음 · 낮은 입찰가 · 노출 0 을 위험으로", () => {
    const a = adOpsAlerts(base(), "2026-10-20");
    expect(a.find((x) => x.text.includes("광고 문구가 없는 묶음"))?.level).toBe("위험");
    expect(a.find((x) => x.text.includes("최소 노출선"))?.level).toBe("위험"); // 3개 중 2개
    expect(a.find((x) => x.text.includes("한 번도 안 떴어요"))?.level).toBe("위험");
  });
  it("키워드 대부분이 검토 중이면 노출 0 을 위험으로 띄우지 않는다", () => {
    const d = base();
    d.keywords.forEach((k) => (k.inspect = "UNDER_REVIEW"));
    const a = adOpsAlerts(d, "2026-10-20");
    expect(a.some((x) => x.text.includes("한 번도 안 떴어요"))).toBe(false);
    expect(a.some((x) => x.text.includes("검토 중이라"))).toBe(false); // 전부 검토 중이면 기존 경고가 알려 준다
    d.keywords[0].inspect = null; // 일부만 검토 중
    expect(adOpsAlerts(d, "2026-10-20").find((x) => x.text.includes("검토 중이라"))?.level).toBe("제안");
  });
  it("충전금이 며칠치인지", () => {
    const d = base();
    // 최근 14일 매일 2,500원(VAT 빼고) → 하루 2,750원 → 50,000 / 2,750 = 18일
    for (let i = 0; i < 14; i++) {
      const day = new Date(Date.parse("2026-10-20T00:00:00Z") - i * 86_400_000).toISOString().slice(0, 10);
      d.stats.push({ id: "c1", date: day, imp: 100, clk: 2, cost: 2_500, ctr: 2, cpc: 1250, avgRank: 3 });
    }
    expect(bizmoneyDays(d, "2026-10-20")).toEqual({ left: 50_000, perDay: 2_750, days: 18 });
    d.bizmoney = 30_000;
    const a = adOpsAlerts(d, "2026-10-20");
    expect(a.find((x) => x.text.includes("충전금"))?.level).toBe("주의"); // 10일치
    d.bizmoney = 15_000;
    expect(adOpsAlerts(d, "2026-10-20").find((x) => x.text.includes("충전금"))?.level).toBe("위험"); // 5일치
  });
  it("켠 지 하루면 하루치 광고비로 며칠 버틸지 센다 (14로 나누지 않는다)", () => {
    const d = base();
    d.bizmoney = 49_224;
    d.stats.push({ id: "c2", date: "2026-10-21", imp: 299, clk: 10, cost: 776, ctr: 3.34, cpc: 78, avgRank: 6.2 });
    expect(bizmoneyDays(d, "2026-10-21")).toEqual({ left: 49_224, perDay: 854, days: 57 });
    expect(bizmoneyDays(d, "2026-10-22")?.days).toBe(57); // 다음 날 아침(그날 성적 없음)에 봐도 같다
  });
  it("플레이스 묶음은 키워드·광고 문구가 없어도 '문구 없는 묶음'으로 경고하지 않는다", () => {
    const d = base();
    d.groups[2].adCount = 0; // 평일낮 회식 (플레이스)
    d.groups[1].adCount = 1;
    expect(adOpsAlerts(d, "2026-10-20").some((x) => x.text.includes("광고 문구가 없는 묶음"))).toBe(false);
    expect([...placeGroupIds(d)]).toEqual(["g3"]);
  });
  it("묶음 클릭 급락과 유난히 비싼 묶음", () => {
    const d = base();
    const add = (id: string, date: string, clk: number, cost: number) => d.stats.push({ id, date, imp: clk * 30, clk, cost, ctr: null, cpc: clk ? cost / clk : null, avgRank: 3 });
    // 평소 4주 g1 하루 3클릭(주 21), 이번 주 하루 0~1클릭
    for (let i = 7; i < 35; i++) add("g1", new Date(Date.parse("2026-10-20T00:00:00Z") - i * 86_400_000).toISOString().slice(0, 10), 3, 150);
    add("g1", "2026-10-19", 1, 60);
    add("g3", "2026-10-19", 3, 330); // 110원/클릭
    add("g2", "2026-10-18", 3, 150); // 50원/클릭
    const a = adOpsAlerts(d, "2026-10-20");
    expect(a.some((x) => x.text.startsWith("동네메뉴: 지난 7일 클릭 1번"))).toBe(true);
    expect(a.some((x) => x.text.startsWith("평일낮 회식: 클릭 1번에 110원"))).toBe(true);
  });
});

describe("노출 현황", () => {
  it("등록 N 중 뜬 것 · 클릭 생긴 것", () => {
    const d = base();
    d.stats.push({ id: "k2", date: "2026-10-18", imp: 20, clk: 1, cost: 500, ctr: 5, cpc: 500, avgRank: 2 });
    expect(exposureSummary(d, "2026-10-14", "2026-10-20")).toEqual({ on: 3, shown: 1, clicked: 1 });
  });
});

describe("주간 광고 기록", () => {
  it("광고비 옆에 장부 홀 매출·바꾼 기록을 붙인다", () => {
    const d = base();
    d.stats.push({ id: "c1", date: "2026-10-13", imp: 300, clk: 10, cost: 5_000, ctr: null, cpc: null, avgRank: null });
    const sales = [
      { date: "2026-10-13", channel: "card_kb", amount: 300_000 },
      { date: "2026-10-14", channel: "baemin", amount: 100_000 },
      { date: "2026-10-06", channel: "card_kb", amount: 200_000 },
    ];
    const rows = weeklyRecord(d, sales, DEFAULT_CHANNELS, [{ date: "2026-10-15", text: "입찰가 70→300" }], { "2026-10-12": "랜드마크 문구 바꿈" }, "2026-10-20", 3);
    expect(rows.map((r) => r.monday)).toEqual(["2026-10-19", "2026-10-12", "2026-10-05"]);
    const w = rows[1];
    expect(w).toMatchObject({ costVat: 5_500, sales: 400_000, hall: 300_000, adShare: 1.8, note: "랜드마크 문구 바꿈", partial: false });
    expect(w.changes).toEqual(["입찰가 70→300"]);
    expect(rows[0].partial).toBe(true);
    const h = hallVersusUsual(rows)!;
    expect(h.week.monday).toBe("2026-10-12");
    expect(h.usual).toBe(200_000);
    expect(h.pct).toBe(50);
  });
});

describe("예산", () => {
  it("캠페인 하루 한도와 켜진 묶음 한도 합 중 작은 쪽 × 31일 × VAT", () => {
    const p = budgetPlan(base(), 300_000, "2026-10-20");
    expect(p.rows.map((r) => [r.type, r.daily, r.monthMax])).toEqual([
      ["파워링크", 10_000, 341_000],
      ["플레이스", 7_000, 238_700],
    ]);
    expect(p.monthMax).toBe(579_700);
    expect(p.over).toBe(true);
    expect(budgetPlan(base(), 0, "2026-10-20").over).toBe(false); // 상한을 안 정했으면 넘는다고 하지 않는다
  });
  it("손님 1명당 광고비 한도 = 1년 이익 ÷ 3", () => {
    expect(customerAdLimit({ monthCap: 0, ticket: 60_000, visitsPerYear: 4, marginPct: 15 })).toEqual({ yearProfit: 36_000, limit: 12_000 });
    expect(customerAdLimit({ monthCap: 0, ticket: null, visitsPerYear: 4, marginPct: 15 })).toBeNull();
  });
});
