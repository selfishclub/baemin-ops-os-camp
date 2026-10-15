import { describe, expect, it } from "vitest";
import { monthReviewSummary, reviewStats, weekStart } from "./stats";
import type { ExportReview } from "../export/types";

const r = (o: Partial<ExportReview> & { id: string; date: string }): ExportReview => ({
  platform: "naver", rating: 5, content: "맛있어요", menu: null, visitDate: null, author: "a**", reply: null, replyDate: null,
  topics: [], complaintType: null, ownerOnly: false, imageCount: 0, draft: null, ...o,
});
const TODAY = "2026-10-15"; // 목요일 → 이번 주는 10/12(월)~

describe("주 계산", () => {
  it("월요일 시작", () => {
    expect(weekStart("2026-10-15")).toBe("2026-10-12");
    expect(weekStart("2026-10-12")).toBe("2026-10-12");
    expect(weekStart("2026-10-11")).toBe("2026-10-05");
  });
});

describe("리뷰 통계", () => {
  const reviews: ExportReview[] = [
    r({ id: "1", date: "2026-10-14T10:00:00Z", reply: "감사합니다", replyDate: "2026-10-14T20:00:00Z" }), // 이번 주, 답 10시간
    r({ id: "2", date: "2026-10-13T10:00:00Z", rating: 2, complaintType: "맛" }), // 이번 주 불만, 미답변
    r({ id: "3", date: "2026-10-07T10:00:00Z", rating: 4, content: "포장 되나요?" }), // 지난주 질문
    r({ id: "4", date: "2026-09-20T10:00:00Z", rating: 5, platform: "baemin" }), // 25일 지남 — 배민 30일 안이라 아직 달 수 있음 (2주 넘음)
    r({ id: "5", date: "2026-08-01T10:00:00Z", rating: 5, platform: "coupang" }), // 쿠팡 30일 지남 — 달 수 없음
    r({ id: "6", date: "2026-10-12T10:00:00Z", rating: 5, ownerOnly: true }), // 사장님만 보는 리뷰 — 제외
    r({ id: "7", date: "2026-10-12T10:00:00Z", rating: null, draft: { text: "초안", status: "draft", needsOwnerInput: false } }), // 별점 없음, 초안 있음
  ];
  const s = reviewStats(reviews, TODAY);

  it("사장님만 보는 리뷰는 빼고 센다", () => {
    expect(s.total).toBe(6);
  });

  it("이번 주 vs 지난주", () => {
    expect(s.thisWeek).toMatchObject({ from: "2026-10-12", to: TODAY, count: 3, unanswered: 2, complaints: 1 });
    expect(s.thisWeek.avgRating).toBe(3.5); // 5와 2, 별점 없는 건 제외
    expect(s.lastWeek).toMatchObject({ from: "2026-10-05", to: "2026-10-11", count: 1 });
  });

  it("오늘 먼저 볼 것 — 불만 · 질문 · 2주 넘음 · 초안 준비", () => {
    const kinds = s.first.map((f) => f.kind);
    expect(kinds).toEqual(["complaint", "question", "old", "draft"]);
    expect(s.first[0].reviews.map((x) => x.id)).toEqual(["2"]);
    expect(s.first[1].reviews.map((x) => x.id)).toEqual(["3"]);
    expect(s.first[2].reviews.map((x) => x.id)).toEqual(["4"]); // 쿠팡 5번은 기간이 지나 빠짐
    expect(s.first[3].reviews.map((x) => x.id)).toEqual(["7"]);
  });

  it("플랫폼별 답변률 · 답글까지 걸린 시간", () => {
    const naver = s.platforms.find((p) => p.platform === "naver")!;
    expect(naver.total).toBe(4);
    expect(naver.answered).toBe(1);
    expect(naver.answerRate).toBe(25);
    expect(naver.medianReplyHours).toBe(10);
    const coupang = s.platforms.find((p) => p.platform === "coupang")!;
    expect(coupang.unanswered).toBe(1);
    expect(coupang.unansweredOpen).toBe(0); // 기간 지남
  });

  it("별점 분포 · 별점 없음 · 요일", () => {
    expect(s.ratingDist.find((d) => d.rating === 5)!.count).toBe(3);
    expect(s.noRating).toBe(1);
    expect(s.weekday.reduce((a, b) => a + b, 0)).toBe(6);
    expect(s.weekday[0]).toBe(1); // 10/12 월요일 (7번)
  });

  it("최근 12개월 · 미답변 목록은 달 수 있는 것만 최근순", () => {
    expect(s.monthly).toHaveLength(12);
    expect(s.monthly[11]).toMatchObject({ month: "2026-10", count: 4, unanswered: 3 });
    expect(s.unansweredList.map((x) => x.id)).toEqual(["2", "7", "3", "4"]);
  });

  it("이 달 요약", () => {
    expect(monthReviewSummary(reviews, "2026-10")).toEqual({ count: 4, unanswered: 3, complaints: 1, avgRating: 3.67 });
  });
});
