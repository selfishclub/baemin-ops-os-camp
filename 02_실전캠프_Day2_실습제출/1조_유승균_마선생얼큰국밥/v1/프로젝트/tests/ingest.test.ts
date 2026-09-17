import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "studio-test-"));
process.env.STUDIO_DATA_DIR = tmp;
delete process.env.TURSO_DATABASE_URL;

const { ingestPayload, normalizeDate, normalizePlatform, cleanReviewText } = await import("@/lib/ingest");
const db = await import("@/lib/db");
const { pickByScore } = await import("@/lib/ai/weekly");

describe("normalize", () => {
  it("플랫폼 이름 정규화", () => {
    expect(normalizePlatform("baemin")).toBe("baemin");
    expect(normalizePlatform(undefined, "쿠팡이츠")).toBe("coupangeats");
    expect(normalizePlatform("coupang")).toBe("coupangeats");
    expect(normalizePlatform("x")).toBeNull();
  });
  it("날짜 정규화", () => {
    expect(normalizeDate("2026년 9월 1일")).toBe("2026-09-01");
    expect(normalizeDate("2026-09-01")).toBe("2026-09-01");
    expect(normalizeDate("2026.9.1")).toBe("2026-09-01");
    expect(normalizeDate("", new Date(2026, 8, 2))).toBe("2026-09-02");
    expect(normalizeDate("9.1.화", new Date(2026, 8, 2))).toBe("2026-09-01");
  });
  it("차단 안내문은 본문에서 제거", () => {
    expect(cleanReviewText("게시중단 요청으로 인해 30일간 임시차단 되었어요\n원문보기")).toBe("");
    expect(cleanReviewText("게시자가 삭제한 리뷰입니다.")).toBe("");
    expect(cleanReviewText("맛있어요")).toBe("맛있어요");
  });
});

describe("ingest → db", () => {
  beforeAll(async () => {
    const res = await ingestPayload({
      platform_code: "baemin",
      store_id: "s1",
      source_url: "https://self.baemin.com/",
      reviews: [
        { external_review_id: "baemin_1", customer_name: "홍길동", review_date: "2026년 9월 1일", review_text: "국물이 진해서 해장에 최고예요. 사진 보세요", has_photo: true, order_menu: "[얼큰이국밥]" },
        { external_review_id: "baemin_2", customer_name: "김", review_date: "2026년 8월 30일", review_text: "배달이 늦고 국물이 샜어요 아쉽네요", delivery_review: "아쉬워요" },
        { external_review_id: "baemin_3", customer_name: "이", review_date: "2026년 9월 2일", review_text: "" },
      ],
    });
    expect(res.inserted).toBe(3);
    expect(res.updated).toBe(0);
  });

  afterAll(() => {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* windows lock */ }
  });

  it("중복 수집은 갱신으로 처리하고 북마크는 유지", async () => {
    const first = (await db.listReviews({ platform: "baemin" })).items.find((r) => r.external_id === "baemin_1")!;
    await db.setBookmark(first.id, true, "좋은 리뷰");
    const res = await ingestPayload({ platform_code: "baemin", reviews: [{ external_review_id: "baemin_1", review_text: "국물이 진해서 해장에 최고예요. 사진 보세요 (수정)", review_date: "2026-09-01" }] });
    expect(res.updated).toBe(1);
    const again = (await db.getReview(first.id))!;
    expect(again.bookmarked).toBe(true);
    expect(again.bookmark_note).toBe("좋은 리뷰");
    expect(again.review_text).toContain("(수정)");
  });

  it("카테고리·감정 필터", async () => {
    expect((await db.listReviews({ category: "불만" })).items.map((r) => r.external_id)).toEqual(["baemin_2"]);
    expect((await db.listReviews({ sentiment: "positive" })).items.map((r) => r.external_id)).toContain("baemin_1");
    expect((await db.listReviews({ q: "해장" })).total).toBe(1);
    expect((await db.listReviews({ from: "2026-09-01", to: "2026-09-07" })).total).toBe(2);
  });

  it("통계", async () => {
    const s = await db.getStats("2026-08-31", "2026-09-06");
    expect(s.total).toBe(3);
    expect(s.thisWeek).toBe(2);
    expect(s.bookmarked).toBe(1);
    expect(s.byPlatform.baemin).toBe(3);
  });

  it("콘텐츠 저장/조회", async () => {
    const r = (await db.listReviews({ q: "해장" })).items[0];
    const rows = await db.saveContents(r.id, [{ kind: "news", payload: { naver: { title: "t", body: "b" }, daangn: { title: "t", body: "b" } }, key_quote: "해장에 최고", model: "test" }]);
    expect(rows).toHaveLength(1);
    expect((await db.listContents(r.id))[0].key_quote).toBe("해장에 최고");
    expect((await db.getReview(r.id))!.content_count).toBe(1);
  });

  it("점수 기반 주간 베스트는 본문 있는 리뷰만, 점수순", async () => {
    const items = (await db.listReviews({ limit: 100 })).items;
    const s = pickByScore(items);
    expect(s.picks.length).toBe(2);
    expect(s.picks[0].rank).toBe(1);
    const top = (await db.getReview(s.picks[0].review_id))!;
    expect(top.external_id).toBe("baemin_1");
  });

  it("주간 베스트 저장/조회", async () => {
    const s = pickByScore((await db.listReviews({ limit: 100 })).items);
    const row = await db.saveWeekly("2026-08-31", "2026-09-06", s, 3, "rule-based");
    expect(row.week_start).toBe("2026-08-31");
    expect((await db.listWeekly())[0].summary.picks.length).toBe(2);
  });

  it("설정 저장", async () => {
    await db.saveSettings({ storeName: "테스트 가게" });
    expect((await db.getSettings()).storeName).toBe("테스트 가게");
    expect((await db.getSettings()).tone).toBeTruthy();
  });
});
