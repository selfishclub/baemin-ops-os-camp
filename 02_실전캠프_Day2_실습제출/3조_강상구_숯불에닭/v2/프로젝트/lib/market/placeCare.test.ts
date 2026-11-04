import { describe, expect, it } from "vitest";
import { health14, rivalWords, routineDue, slotMismatch, wordCoverage, workEffect, type PlaceWork } from "./placeCare";
import type { ExportReview, MarketInflow, PlaceInfoExport, RankPoint } from "../export/types";

const p = (date: string, keyword: string, rank: number | null, extra: Partial<RankPoint> = {}): RankPoint => ({ date, keyword, rank, blog: 10, visitor: 100, save: null, total: 50, ...extra });
const review = (content: string, date = "2026-10-20T00:00:00Z", platform: ExportReview["platform"] = "naver") => ({ platform, id: content, rating: 5, content, menu: null, date, visitDate: null, author: "a", reply: null, replyDate: null, topics: [], complaintType: null }) as unknown as ExportReview;
const dailyInflow = (start: string, days: number, pv: number): MarketInflow => {
  const periods: NonNullable<MarketInflow["periods"]> = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.parse(`${start}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
    periods[`${d}/${d}`] = { start: d, end: d, items: [{ keyword: "x", pv }] };
  }
  return { collectedAt: "", periods };
};

describe("장부 칸 vs 네이버 실제 칸", () => {
  it("순서가 달라도 같은 칸이면 다르다고 하지 않는다", () => {
    expect(slotMismatch(["가 나", "다"], ["다", "가나"])).toEqual({ onlyLedger: [], onlyNaver: [] });
  });
  it("다른 칸을 양쪽으로 알려 준다", () => {
    expect(slotMismatch(["가나", "다"], ["가나", "라"])).toEqual({ onlyLedger: ["다"], onlyNaver: ["라"] });
  });
  it("실제 칸을 못 읽었으면 판단하지 않는다", () => {
    expect(slotMismatch(["가"], null)).toBeNull();
  });
});

describe("상위 가게 대표 키워드", () => {
  const info: PlaceInfoExport = {
    date: "2026-11-04",
    placesDate: "2026-11-04",
    stopped: false,
    mine: { id: "1", name: "우리", keywords: null, description: null, road: null },
    places: [
      { id: "a", name: "가", from: [], keywords: ["회식", "삼겹살"], descriptionLength: 100 },
      { id: "b", name: "나", from: [], keywords: ["회 식", "단체회식"], descriptionLength: null },
      { id: "c", name: "다", from: [], keywords: null, descriptionLength: null },
    ],
  };
  it("많이 쓰는 순으로 세고 띄어쓰기는 무시한다", () => {
    const rows = rivalWords(info, []);
    expect(rows[0]).toMatchObject({ word: "회식", count: 2 });
  });
  it("내 칸에 붙어 있는 말도 찾는다", () => {
    const rows = rivalWords(info, ["숨은웨이팅회식율량"]);
    expect(rows.find((r) => r.word === "회식")?.inMine).toBe(true);
    expect(rows.find((r) => r.word === "단체회식")?.inMine).toBe(false);
  });
});

describe("소개글·리뷰 속 단어", () => {
  const reviews = [review("회식 하기 좋아요"), review("단체 회식", "2026-01-01T00:00:00Z"), review("회식", "2026-10-20T00:00:00Z", "baemin")];
  it("네이버 리뷰만 세고 최근 90일을 나눈다", () => {
    expect(wordCoverage(["회식"], "소개", reviews, "2026-11-04")[0]).toEqual({ word: "회식", inDescription: 0, reviews: 2, recentReviews: 1, verdict: "소개글에 넣을 말" });
  });
  it("판정이 네 갈래로 나뉜다", () => {
    const v = (w: string, d: string | null) => wordCoverage([w], d, [review("회식")], "2026-11-04")[0].verdict;
    expect(v("회식", "회식 환영")).toBe("둘 다 있음");
    expect(v("주차", "주차 가능")).toBe("리뷰에 없는 말");
    expect(v("포장", null)).toBe("둘 다 없음");
  });
});

describe("최근 14일 점검", () => {
  const history = [
    p("2026-10-20", "가", 5),
    p("2026-10-20", "나", 10),
    p("2026-10-20", "다", 20),
    p("2026-11-03", "가", 7, { visitor: 100 }),
    p("2026-11-03", "나", 8, { visitor: 100 }),
    p("2026-11-03", "다", null, { visitor: null, blog: null }),
  ];
  it("순위 이동과 밖으로 나간 말을 센다", () => {
    const h = health14(history, null, "2026-11-04")!;
    expect(h.moves).toMatchObject({ up: 1, down: 1, lost: 1, lostWords: ["다"] });
    expect(h.checks[0].tone).toBe("warn");
  });
  it("리뷰가 그대로면 경고한다", () => {
    expect(health14(history, null, "2026-11-04")!.checks.find((c) => c.label === "방문자 리뷰")?.tone).toBe("warn");
  });
  it("유입은 28일이 다 있어야 비교하고 20% 넘게 줄면 경고한다", () => {
    expect(health14(history, dailyInflow("2026-10-20", 14, 10), "2026-11-04")!.inflowRecent).toBe(140);
    expect(health14(history, dailyInflow("2026-10-20", 14, 10), "2026-11-04")!.inflowBefore).toBeNull();
    const inflow = dailyInflow("2026-10-07", 28, 10);
    for (let i = 21; i <= 31; i++) inflow.periods![`2026-10-${i}/2026-10-${i}`]?.items.forEach((x) => (x.pv = 5));
    const h = health14(history, inflow, "2026-11-04")!;
    expect(h.inflowBefore).toBe(140);
    expect(h.inflowRecent).toBeLessThan(112);
    expect(h.checks.find((c) => c.label === "검색 유입")?.tone).toBe("warn");
  });
  it("못 읽은 날은 비교에 쓰지 않는다", () => {
    expect(health14([p("2026-11-03", "가", null, { note: "못 읽음" })], null, "2026-11-04")).toBeNull();
  });
});

describe("작업 전후", () => {
  const work: PlaceWork = { id: "1", date: "2026-11-05", kind: "소개글", note: "" };
  const history = [p("2026-11-04", "가", 13), p("2026-11-08", "가", 9)];
  it("작업 전날과 작업 뒤 순위를 비교한다", () => {
    const e = workEffect(work, [work], history, null);
    expect(e).toMatchObject({ from: "2026-11-04", to: "2026-11-08", days: 3, overlaps: [] });
    expect(e.moves?.up).toBe(1);
  });
  it("앞뒤 7일 안의 다른 작업을 알려 준다", () => {
    const other: PlaceWork = { id: "2", date: "2026-11-09", kind: "사진", note: "" };
    const far: PlaceWork = { id: "3", date: "2026-11-20", kind: "사진", note: "" };
    expect(workEffect(work, [work, other, far], history, null).overlaps).toEqual([other]);
  });
  it("작업 뒤 자료가 없으면 비교하지 않는다", () => {
    expect(workEffect(work, [work], [p("2026-11-04", "가", 13)], null).moves).toBeNull();
  });
});

describe("루틴", () => {
  it("한 적 없거나 주기가 지나면 할 차례다", () => {
    expect(routineDue(undefined, 14, "2026-11-04")).toBe(true);
    expect(routineDue("2026-10-21", 14, "2026-11-04")).toBe(true);
    expect(routineDue("2026-10-22", 14, "2026-11-04")).toBe(false);
  });
});
