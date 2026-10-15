import { describe, expect, it } from "vitest";
import { marketingIdeas, meetingText, monthlyReport, prevMonthOf } from "./monthly";
import type { ExportReview } from "../export/types";

const r = (o: Partial<ExportReview> & { id: string; date: string }): ExportReview => ({
  platform: "naver", rating: 5, content: "숯불향이 진해서 맛있어요 또 올게요", menu: null, visitDate: null, author: "a**", reply: "감사합니다", replyDate: null,
  topics: ["맛·품질"], complaintType: null, ownerOnly: false, imageCount: 0, draft: null, ...o,
});

const reviews: ExportReview[] = [
  r({ id: "1", date: "2026-09-02T10:00:00Z", topics: ["맛·품질", "재방문"], content: "숯불향이 진해서 맛있어요. 벌써 세 번째 방문이에요" }),
  r({ id: "2", date: "2026-09-05T10:00:00Z", platform: "baemin", menu: "양념닭갈비, 공기밥", topics: ["양"], content: "양이 푸짐하고 포장도 따끈하게 왔어요" }),
  r({ id: "3", date: "2026-09-09T10:00:00Z", rating: 2, complaintType: "배달", topics: ["배달 지연"], content: "배달이 한 시간 넘게 걸렸어요", reply: null }),
  r({ id: "4", date: "2026-09-12T10:00:00Z", rating: 4, content: "회식 장소로 괜찮나요? 단체도 되나요?", topics: [] }),
  r({ id: "5", date: "2026-09-20T10:00:00Z", platform: "coupang", menu: "양념닭갈비", topics: ["맛·품질"], content: "직원분들이 친절하고 맛도 좋았어요" }),
  r({ id: "6", date: "2026-08-20T10:00:00Z", topics: ["맛·품질"], content: "지난달 리뷰예요 맛있었습니다 정말로" }),
  r({ id: "7", date: "2026-09-25T10:00:00Z", ownerOnly: true, content: "사장님만 보는 리뷰입니다 이건 빼요" }),
];

describe("한달 분석", () => {
  const m = monthlyReport(reviews, "2026-09");
  it("이 달 리뷰만 세고 지난달과 비교", () => {
    expect(m.count).toBe(5);
    expect(m.prevCount).toBe(1);
    expect(m.avgRating).toBe(4.2);
    expect(m.answerRate).toBe(80);
    expect(m.complaints).toBe(1);
    expect(m.questions).toBe(1);
    expect(prevMonthOf("2026-01")).toBe("2025-12");
  });
  it("칭찬 · 아쉬움 · 메뉴", () => {
    expect(m.praise[0]).toMatchObject({ topic: "맛·품질", count: 2 }); // 1번·5번 (4번은 꼬리표 없음, 2번은 "양")
    expect(m.praise[0].examples.length).toBeGreaterThan(0);
    expect(m.regrets).toEqual([{ topic: "배달 지연", count: 1, examples: ["배달이 한 시간 넘게 걸렸어요"] }]);
    expect(m.menus[0]).toMatchObject({ menu: "양념닭갈비", count: 2, avgRating: 5 });
    expect(m.questionList).toEqual(["회식 장소로 괜찮나요? 단체도 되나요?"]);
  });
  it("한 줄 요약 · 회의 자료", () => {
    expect(m.oneLine).toContain("9월 리뷰 5건(지난달 1건, +4)");
    expect(m.oneLine).toContain('"맛·품질"');
    const t = meetingText(m);
    expect(t.split("\n")[0]).toBe("[2026-09 리뷰 한달 분석]");
    expect(t).toContain("아쉬움: 배달 지연(1)");
  });
  it("리뷰 없는 달", () => {
    expect(monthlyReport(reviews, "2026-07").oneLine).toBe("7월에는 리뷰가 없어요");
  });
});

describe("마케팅 자료", () => {
  const ideas = marketingIdeas(reviews, "2026-09");
  it("별점 4 이상 리뷰 문장을 주제·채널로 나눈다", () => {
    const themes = ideas.map((i) => `${i.theme}/${i.channel}`);
    expect(themes).toContain("사람·응대/플레이스 소식");
    expect(themes).toContain("포장·배달 경험/릴스"); // "양이 푸짐하고 포장도 따끈하게" — 포장 규칙이 양 규칙보다 먼저
    expect(themes).toContain("맛의 포인트/릴스"); // "숯불향이 진해서…" — 숯불 규칙
    expect(ideas.every((i) => i.hookPrompt.includes(i.sentence))).toBe(true);
  });
  it("아쉬운 리뷰와 사장님만 보는 리뷰는 안 쓴다", () => {
    expect(ideas.some((i) => i.review.id === "3" || i.review.id === "7")).toBe(false);
  });
});
