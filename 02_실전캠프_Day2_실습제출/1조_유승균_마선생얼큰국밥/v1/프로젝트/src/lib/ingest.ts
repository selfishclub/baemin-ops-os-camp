import type { z } from "zod";
import { classifyReview } from "./classify";
import { upsertReviews, type UpsertReviewInput } from "./db";
import { IngestPayloadSchema, PLATFORMS, type IncomingReview, type IngestPayload, type Platform } from "./types";
import { toYmd } from "./week";

/** 확장·크롤러가 보내는 플랫폼 이름을 표준 코드로 */
export function normalizePlatform(code?: string, name?: string): Platform | null {
  const v = (code || name || "").toLowerCase().trim();
  if ((PLATFORMS as readonly string[]).includes(v)) return v as Platform;
  if (/배민|baemin/.test(v)) return "baemin";
  if (/쿠팡|coupang/.test(v)) return "coupangeats";
  if (/요기요|yogiyo/.test(v)) return "yogiyo";
  if (/네이버|naver/.test(v)) return "naver";
  return null;
}

/** 다양한 날짜 표기를 YYYY-MM-DD로. 실패하면 오늘 */
export function normalizeDate(value: string | undefined, fallback = new Date()): string {
  const s = String(value || "").trim();
  let m = s.match(/(\d{4})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  // "9.1.화" 처럼 연도가 없는 네이버 표기 → 올해(미래면 작년)
  m = s.match(/^(\d{1,2})\.\s*(\d{1,2})\./);
  if (m) {
    const y = fallback.getFullYear();
    const d = new Date(y, Number(m[1]) - 1, Number(m[2]));
    if (d.getTime() > fallback.getTime() + 86400000) d.setFullYear(y - 1);
    return toYmd(d);
  }
  return toYmd(fallback);
}

/** 플랫폼이 가린 리뷰(게시중단·차단 안내문)는 본문이 아니므로 비웁니다 */
export function cleanReviewText(text: string): string {
  const t = (text || "").trim();
  if (/게시중단 요청으로 인해|임시차단 되었어요|블라인드 처리|게시자가 삭제한 리뷰/.test(t)) return "";
  return t.replace(/\n?원문보기$/, "").trim();
}

export function toUpsertInput(platform: Platform, r: IncomingReview, meta: { store_id: string; source_url: string; collected_at: string }): UpsertReviewInput {
  const review_text = cleanReviewText(r.review_text);
  const cls = classifyReview({
    review_text,
    order_menu: r.order_menu,
    delivery_review: r.delivery_review,
    rating: r.rating ?? null,
    has_photo: r.has_photo,
    order_count: r.order_count ?? null,
  });
  return {
    platform,
    external_id: r.external_review_id,
    store_id: meta.store_id,
    customer_name: r.customer_name || "",
    rating: typeof r.rating === "number" ? r.rating : null,
    order_count: typeof r.order_count === "number" ? r.order_count : null,
    review_date: normalizeDate(r.review_date),
    review_text,
    order_menu: r.order_menu || "",
    delivery_review: r.delivery_review || "",
    has_photo: Boolean(r.has_photo),
    owner_reply: r.owner_reply || "",
    categories: cls.categories,
    sentiment: cls.sentiment,
    score: cls.score,
    source_url: meta.source_url,
    raw_json: r.raw_payload ? JSON.stringify(r.raw_payload) : "",
    collected_at: meta.collected_at,
  };
}

export type IngestPayloadInput = z.input<typeof IngestPayloadSchema>;

export async function ingestPayload(raw: IngestPayloadInput | IngestPayload): Promise<{ platform: Platform; inserted: number; updated: number; total: number }> {
  const payload = IngestPayloadSchema.parse(raw);
  const platform = normalizePlatform(payload.platform_code, payload.platform_name);
  if (!platform) throw new Error("platform_code가 없거나 지원하지 않는 플랫폼입니다.");
  const collected_at = payload.captured_at || new Date().toISOString();
  const inputs = payload.reviews
    .filter((r) => r.external_review_id)
    .map((r) => toUpsertInput(platform, r, { store_id: payload.store_id || "", source_url: payload.source_url || "", collected_at }));
  const res = await upsertReviews(inputs);
  return { platform, ...res, total: inputs.length };
}
