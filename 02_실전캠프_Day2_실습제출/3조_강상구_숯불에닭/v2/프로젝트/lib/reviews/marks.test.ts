import { describe, expect, it } from "vitest";
import { applyMarks, pruneMarks, type ReplyMark } from "./marks";
import { reviewStats } from "./stats";
import type { ExportReview } from "../export/types";

const r = (o: Partial<ExportReview> & { id: string }): ExportReview => ({
  platform: "naver", rating: 5, content: "맛있어요 또 올게요 정말", menu: null, date: "2026-10-10T10:00:00Z", visitDate: null, author: "a**", reply: null, replyDate: null,
  topics: [], complaintType: null, ownerOnly: false, imageCount: 0, draft: { text: "감사합니다", status: "approved", needsOwnerInput: false }, ...o,
});

describe("답글 달았어요 표시", () => {
  const marks: ReplyMark[] = [{ platform: "naver", id: "1", at: "2026-10-15T10:00:00Z", text: "감사합니다" }];
  it("표시가 있으면 답한 것으로 보고 미답변에서 빠진다", () => {
    const reviews = [r({ id: "1" }), r({ id: "2" })];
    const applied = applyMarks(reviews, marks);
    expect(applied[0].reply).toBe("감사합니다");
    expect(applied[0].draft?.status).toBe("posted");
    expect(applied[1].reply).toBeNull();
    const s = reviewStats(applied, "2026-10-15");
    expect(s.unansweredList.map((x) => x.id)).toEqual(["2"]);
  });
  it("수집기가 진짜 답글을 가져오면 그 값이 우선", () => {
    const reviews = [r({ id: "1", reply: "진짜 답글", replyDate: "2026-10-16T00:00:00Z" })];
    expect(applyMarks(reviews, marks)[0].reply).toBe("진짜 답글");
    expect(pruneMarks(reviews, marks)).toEqual([]);
  });
  it("아직 수집 전이면 표시를 남겨 둔다", () => {
    expect(pruneMarks([r({ id: "1" })], marks)).toHaveLength(1);
  });
});
