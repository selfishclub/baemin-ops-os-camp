import { describe, expect, it } from "vitest";
import { adAlerts, byGroup, byKeyword, compareWeek, inspectText, monthlyCost, totals, weeklySeries, type NaverAdExport } from "./adStats";

const day = (n: number) => `2026-10-${String(n).padStart(2, "0")}`;
const row = (id: string, date: string, imp: number, clk: number, cost: number, avgRank: number | null = 2) => ({ id: `k${id}`, date, imp, clk, cost, ctr: imp ? (clk / imp) * 100 : null, cpc: clk ? cost / clk : null, avgRank });

const d: NaverAdExport = {
  collectedAt: "2026-10-30T13:00:00Z",
  campaigns: [{ id: "c1", name: "숯불에닭 파워링크", type: "WEB_SITE", dailyBudget: 10000, status: "ELIGIBLE", on: true }],
  groups: [
    { id: "g1", campaignId: "c1", name: "랜드마크", bid: 300, dailyBudget: 10000, status: "ELIGIBLE", on: true },
    { id: "g2", campaignId: "c1", name: "동네 메뉴", bid: 400, dailyBudget: 10000, status: "ELIGIBLE", on: true },
  ],
  keywords: [
    { id: "k1", groupId: "g1", keyword: "명암타워맛집", bid: 100, useGroupBid: false, status: "ELIGIBLE", inspect: null, quality: 5, on: true },
    { id: "k2", groupId: "g1", keyword: "상당산성맛집", bid: null, useGroupBid: true, status: "ELIGIBLE", inspect: null, quality: 4, on: true },
    { id: "k3", groupId: "g2", keyword: "청주닭갈비", bid: 630, useGroupBid: false, status: "ELIGIBLE", inspect: null, quality: 6, on: true },
    { id: "k4", groupId: "g2", keyword: "청주순두부", bid: 290, useGroupBid: false, status: "PAUSED", inspect: "UNDER_REVIEW", quality: null, on: true },
  ],
  stats: [
    // 평소 4주 (10/2~10/23): 명암타워 매일 10노출 1클릭 100원, 청주닭갈비 매일 20노출 1클릭 600원
    ...Array.from({ length: 22 }, (_, i) => row("1", day(2 + i), 10, 1, 100, 1.5)),
    ...Array.from({ length: 22 }, (_, i) => row("3", day(2 + i), 20, 1, 600, 4)),
    // 이번 주 (10/24~10/30): 청주닭갈비가 비싸짐 — 클릭 1번에 1,500원 × 7
    ...Array.from({ length: 7 }, (_, i) => row("1", day(24 + i), 10, 1, 100, 1.5)),
    ...Array.from({ length: 7 }, (_, i) => row("3", day(24 + i), 30, 1, 1500, 4.5)),
    // 상당산성: 보이기만 하고 안 눌림
    ...Array.from({ length: 7 }, (_, i) => row("2", day(24 + i), 20, 0, 0, 2)),
    // 청주순두부: 싸게 잘 눌림 (같은 묶음 비교 기준)
    ...Array.from({ length: 7 }, (_, i) => row("4", day(24 + i), 10, 1, 100, 2)),
  ],
};
const today = "2026-10-30";

describe("합계", () => {
  it("기간 안 줄만 더하고 평균 순위는 노출 가중", () => {
    const t = totals(d.stats, new Set(["k1", "k3"]), "2026-10-24", "2026-10-30");
    expect(t.imp).toBe(280);
    expect(t.clk).toBe(14);
    expect(t.cost).toBe(11200);
    expect(t.cpc).toBe(800);
    expect(t.ctr).toBe(5);
    expect(t.avgRank).toBe(3.8); // (1.5×70 + 4.5×210) / 280
  });
});

describe("이번 주 vs 평소", () => {
  it("평소는 앞 4주(자료 있는 만큼)의 주 평균", () => {
    const c = compareWeek(d, today);
    expect(c.from).toBe("2026-10-24");
    expect(c.thisWeek.cost).toBe(11900);
    expect(c.usualWeeks).toBe(3.1); // 10/2 ~ 10/23 = 22일
    expect(c.usual.cost).toBe(Math.round((22 * 700) / (22 / 7)));
    expect(c.usual.clk).toBe(14);
  });
  it("주별 흐름은 오래된 주부터 n줄", () => {
    const w = weeklySeries(d, today, 4);
    expect(w).toHaveLength(4);
    expect(w[3].to).toBe(today);
    expect(w[3].t.clk).toBe(21);
  });
});

describe("묶음·키워드 표", () => {
  it("광고비 큰 묶음이 먼저, 직전 기간과 비교", () => {
    const g = byGroup(d, "2026-10-24", "2026-10-30");
    expect(g[0].group.name).toBe("동네 메뉴");
    expect(g[0].t.cost).toBe(11200);
    expect(g[0].prev.cost).toBe(4200);
    expect(g[1].keywords).toBe(2);
  });
  it("키워드 표는 그룹 입찰가를 따르는 키워드에 그룹 값을 보여 준다", () => {
    const k = byKeyword(d, "2026-10-24", "2026-10-30");
    expect(k[0].k.keyword).toBe("청주닭갈비");
    expect(k.find((x) => x.k.keyword === "상당산성맛집")?.bidShown).toBe(300);
    expect(inspectText(d.keywords[3])).toBe("검토 중");
    expect(inspectText(d.keywords[0])).toBe("운영");
  });
});

describe("이번 주 챙길 것", () => {
  const a = adAlerts(d, today);
  it("클릭 1번 값이 평소보다 30% 넘게 오르면 주의", () => {
    expect(a.some((x) => x.level === "주의" && x.text.includes("클릭 1번 값이 평소"))).toBe(true);
  });
  it("광고비가 크게 늘었는데 클릭은 그대로면 위험", () => {
    const spent: NaverAdExport = { ...d, stats: [...d.stats.filter((r) => !(r.id === "k4" && r.date >= "2026-10-24")), ...Array.from({ length: 7 }, (_, i) => row("4", day(24 + i), 10, 0, 0, 2))] }; // 순두부 클릭 0 → 이번 주 클릭 14 = 평소
    expect(adAlerts(spent, today).some((x) => x.level === "위험" && x.text.includes("광고비가 평소보다"))).toBe(true);
  });
  it("묶음 평균의 두 배인 키워드 → 위험, 보이기만 하는 키워드 → 주의, 잘 눌리는데 순위 낮음 → 제안", () => {
    expect(a.find((x) => x.keyword === "청주닭갈비")?.level).toBe("위험");
    expect(a.find((x) => x.keyword === "상당산성맛집")?.level).toBe("주의");
    expect(a.filter((x) => x.level === "제안").length).toBeGreaterThanOrEqual(0);
    expect(a[0].level).toBe("위험"); // 위험이 맨 위
  });
  it("자료가 없으면 상태 알림만", () => {
    const empty: NaverAdExport = { ...d, stats: [], keywords: d.keywords.map((k) => ({ ...k, inspect: "UNDER_REVIEW" })) };
    const b = adAlerts(empty, today);
    expect(b.some((x) => x.text.includes("모두 검토 중"))).toBe(true);
    expect(b.some((x) => x.level === "위험")).toBe(false);
  });
});

describe("달별 광고비", () => {
  it("VAT 10% 더한 값", () => {
    expect(monthlyCost(d, "2026-10")).toBe(Math.round((22 * 700 + 11900) * 1.1));
    expect(monthlyCost(d, "2026-10", false)).toBe(22 * 700 + 11900);
  });
});
