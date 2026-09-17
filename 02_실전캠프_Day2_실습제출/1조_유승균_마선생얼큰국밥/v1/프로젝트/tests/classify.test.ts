import { describe, expect, it } from "vitest";
import { classifyReview } from "@/lib/classify";

describe("classifyReview", () => {
  it("긍정 리뷰: 맛·양·배달 카테고리와 positive", () => {
    const r = classifyReview({ review_text: "국물이 진하고 맛있어요. 양도 푸짐하고 배달도 빨랐어요!", has_photo: true, rating: 5 });
    expect(r.sentiment).toBe("positive");
    expect(r.categories).toEqual(expect.arrayContaining(["맛", "양", "배달", "사진"]));
    expect(r.categories).not.toContain("불만");
    expect(r.score).toBeGreaterThan(60);
  });

  it("부정 리뷰: 불만 카테고리와 negative, 낮은 점수", () => {
    const r = classifyReview({ review_text: "국물이 다 새서 왔고 반찬도 누락됐어요. 실망입니다.", rating: 1 });
    expect(r.sentiment).toBe("negative");
    expect(r.categories).toContain("불만");
    expect(r.categories).toContain("포장");
    expect(r.score).toBeLessThan(40);
  });

  it("혼합 리뷰: mixed + 불만", () => {
    const r = classifyReview({ review_text: "맛은 정말 맛있는데 배달이 좀 늦게 와서 아쉬웠어요" });
    expect(r.sentiment).toBe("mixed");
    expect(r.categories).toEqual(expect.arrayContaining(["맛", "배달", "불만"]));
  });

  it("별점만 있는 리뷰: neutral/positive, 낮은 점수", () => {
    const r = classifyReview({ review_text: "", rating: 5 });
    expect(r.score).toBeLessThan(30);
    expect(r.categories).not.toContain("불만");
  });

  it("배민 배달리뷰 '아쉬워요'는 배달 카테고리 + 부정 신호", () => {
    const r = classifyReview({ review_text: "맛있어요", delivery_review: "아쉬워요" });
    expect(r.categories).toContain("배달");
    expect(r.sentiment).toBe("mixed");
  });

  it("재주문 신호", () => {
    const r = classifyReview({ review_text: "벌써 세 번째 주문이에요. 항상 믿고 시켜요" });
    expect(r.categories).toContain("재주문");
    expect(r.sentiment).toBe("positive");
  });
});
