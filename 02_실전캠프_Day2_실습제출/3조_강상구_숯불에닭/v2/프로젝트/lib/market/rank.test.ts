import { describe, expect, it } from "vitest";
import { keywordSummaries, nextSeasonKeyword, rankSeries, rankText, EMPTY_PLACE_KEYWORDS } from "./rank";
import type { RankPoint } from "../export/types";

const p = (date: string, keyword: string, rank: number | null, extra: Partial<RankPoint> = {}): RankPoint => ({ date, keyword, rank, blog: 10, visitor: 100, save: 5, total: 50, ...extra });

describe("키워드 순위 요약", () => {
  const history: RankPoint[] = [
    p("2026-10-05", "율량동닭갈비", 6),
    p("2026-10-06", "율량동닭갈비", 5),
    p("2026-10-12", "율량동닭갈비", 4),
    p("2026-10-13", "율량동닭갈비", 4, { blog: 12 }),
    p("2026-10-14", "율량동닭갈비", null, { note: "읽지 못했어요: 인터넷 끊김" }),
    p("2026-10-13", "청주맛집", null), // 50위 밖
  ];
  const s = keywordSummaries(history, ["율량동닭갈비", "청주맛집", "청주닭갈비"]);

  it("못 읽은 날은 최근값으로 안 쓴다", () => {
    const k = s[0];
    expect(k.latestDate).toBe("2026-10-13");
    expect(k.rank).toBe(4);
    expect(k.blog).toBe(12);
    expect(k.unreadDays).toBe(1);
    expect(k.days).toBe(4);
  });

  it("7일 전 즈음과 비교 — 올라가면 양수", () => {
    const k = s[0];
    expect(k.weekAgoRank).toBe(5); // 10/13 − 7 = 10/06
    expect(k.change).toBe(1);
    expect(k.best).toBe(4);
  });

  it("50위 밖과 기록 없음", () => {
    expect(s[1]).toMatchObject({ rank: null, best: null, days: 1 });
    expect(s[2]).toMatchObject({ latestDate: null, rank: null, days: 0 });
    expect(rankText({ rank: null })).toBe("50위 밖");
    expect(rankText({ rank: null, note: "x" })).toBe("못 읽음");
    expect(rankText({ rank: 4 })).toBe("4위");
  });

  it("추이는 오래된 것부터 최근 n일", () => {
    expect(rankSeries(history, "율량동닭갈비", 3).map((x) => x.date)).toEqual(["2026-10-12", "2026-10-13", "2026-10-14"]);
  });
});

describe("대표 키워드 시즌 칸", () => {
  it("다음 달 것을 알려 준다 (12월 다음은 1월)", () => {
    const pk = { ...EMPTY_PLACE_KEYWORDS, season: { "11": "청주연말모임", "1": "청주신년회" } };
    expect(nextSeasonKeyword(pk, "2026-10-15")).toEqual({ month: 11, keyword: "청주연말모임" });
    expect(nextSeasonKeyword(pk, "2026-12-15")).toEqual({ month: 1, keyword: "청주신년회" });
    expect(nextSeasonKeyword(pk, "2026-08-15")).toBeNull();
  });
});
