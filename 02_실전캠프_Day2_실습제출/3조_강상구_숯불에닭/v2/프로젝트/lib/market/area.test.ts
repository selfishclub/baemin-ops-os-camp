import { describe, expect, it } from "vitest";
import { areaSummary, competitorRows, trendSummary } from "./area";
import type { MarketArea, MarketCompetitor } from "../export/types";

const st = (id: string, name: string, large: string, mid: string, small: string): MarketArea["stores"][number] => ({ id, name, large, mid, small, addr: null });

describe("동네 점포", () => {
  const area: MarketArea = {
    surveyedAt: "2026-10-15", center: { lat: 36.6, lng: 127.4 }, radius: 500, total: 5,
    stores: [st("1", "우리닭갈비", "음식", "한식", "닭/오리요리"), st("2", "옆집치킨", "음식", "닭/오리요리", "치킨"), st("3", "별다방", "음식", "카페", "커피전문점"), st("4", "슈퍼", "소매", "종합소매", "편의점"), st("5", "국밥집", "음식", "한식", "국밥")],
    prev: { surveyedAt: "2026-09-10", center: { lat: 36.6, lng: 127.4 }, radius: 500, total: 4, stores: [st("1", "우리닭갈비", "음식", "한식", "닭/오리요리"), st("3", "별다방", "음식", "카페", "커피전문점"), st("4", "슈퍼", "소매", "종합소매", "편의점"), st("9", "문닫은분식", "음식", "분식", "분식")] },
  };
  const s = areaSummary(area, ["닭", "치킨"]);
  it("업종별 수와 음식 중분류", () => {
    expect(s.byLarge[0]).toEqual({ name: "음식", count: 4 });
    expect(s.food.map((f) => f.name)).toEqual(["한식", "닭/오리요리", "카페"]);
  });
  it("같은 종류 가게 — 소분류·중분류·상호에 글자가 들어가면", () => {
    expect(s.same.map((x) => x.name)).toEqual(["우리닭갈비", "옆집치킨"]);
    expect(areaSummary(area).same).toEqual([]);
  });
  it("지난 조사와 비교 — 새로 생긴 · 사라진", () => {
    expect(s.prev!.opened.map((x) => x.name)).toEqual(["옆집치킨", "국밥집"]);
    expect(s.prev!.closed.map((x) => x.name)).toEqual(["문닫은분식"]);
  });
});

describe("검색 흐름", () => {
  it("많이 찾는 달과 한 달 전", () => {
    const data = ["2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"].map((p, i) => ({ period: p, ratio: i === 1 ? 100 : i === 9 ? 70 : 40 }));
    const t = trendSummary({ name: "청주닭갈비", keywords: ["청주닭갈비"], data });
    expect(t.bestMonth).toBe(12);
    expect(t.prepareMonth).toBe(11);
    expect(t.peakMonths).toEqual([12, 8]);
    expect(t.latestVsAvg).toBeLessThan(1);
  });
  it("1월이 최고면 준비는 12월", () => {
    const t = trendSummary({ name: "x", keywords: ["x"], data: [{ period: "2026-01", ratio: 100 }, { period: "2026-02", ratio: 10 }] });
    expect(t.prepareMonth).toBe(12);
  });
  it("자료 없음", () => {
    expect(trendSummary({ name: "x", keywords: [], data: [] }).bestMonth).toBeNull();
  });
});

describe("경쟁 가게 변화", () => {
  const c: MarketCompetitor = {
    keyword: "청주닭갈비",
    first: { date: "2026-10-01", rows: [{ id: "a", rank: 1, name: "A닭갈비", visitor: 900, blog: 100 }, { id: "b", rank: 2, name: "B닭갈비", visitor: 500, blog: 50 }], mine: { id: "me", rank: 43, name: "우리", visitor: 1500, blog: 300 } },
    latest: { date: "2026-10-15", rows: [{ id: "a", rank: 1, name: "A닭갈비", visitor: 960, blog: 110 }, { id: "c", rank: 2, name: "C닭갈비", visitor: 300, blog: 20 }], mine: { id: "me", rank: 39, name: "우리", visitor: 1540, blog: 310 } },
  };
  it("처음과 최근을 붙이고, 새로 들어온 가게는 증가를 비운다 · 우리 가게는 순위 밖이어도 넣는다", () => {
    const r = competitorRows(c);
    expect(r.days).toBe(14);
    expect(r.rows.find((x) => x.id === "a")).toMatchObject({ visitorGain: 60, rankFirst: 1 });
    expect(r.rows.find((x) => x.id === "c")!.visitorGain).toBeNull();
    const me = r.rows.find((x) => x.mine)!;
    expect(me).toMatchObject({ rankNow: 39, rankFirst: 43, visitorGain: 40 });
  });
});
