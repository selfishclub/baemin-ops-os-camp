import { getReview, getSettings, saveContents } from "../db";
import { ContentBundleSchema, type ContentBundle, type ContentRow } from "../types";
import { generateStructured } from "./client";
import { CONTENT_SYSTEM, contentUserPrompt } from "./prompts/content";

/** 리뷰 1개 → 캐러셀·릴스·새소식 3종을 한 번에 생성해 저장 */
export async function generateContentsForReview(reviewId: number): Promise<{ bundle: ContentBundle; rows: ContentRow[]; model: string }> {
  const review = await getReview(reviewId);
  if (!review) throw new Error("리뷰를 찾을 수 없습니다.");
  if (!review.review_text.trim()) throw new Error("리뷰 본문이 없는 리뷰(별점만)는 콘텐츠를 만들 수 없습니다.");

  const settings = await getSettings();
  const { data, model } = await generateStructured({
    system: CONTENT_SYSTEM,
    user: contentUserPrompt(review, settings),
    schema: ContentBundleSchema,
    schemaName: "content_bundle",
  });

  const rows = await saveContents(reviewId, [
    { kind: "carousel", payload: data.carousel, key_quote: data.key_quote, model },
    { kind: "reels", payload: data.reels, key_quote: data.key_quote, model },
    { kind: "news", payload: data.news, key_quote: data.key_quote, model },
  ]);
  return { bundle: data, rows, model };
}
