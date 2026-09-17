import { z } from "zod";

/* ---------- 플랫폼 / 분류 ---------- */
export const PLATFORMS = ["baemin", "coupangeats", "yogiyo", "naver"] as const;
export type Platform = (typeof PLATFORMS)[number];
export const PLATFORM_LABEL: Record<Platform, string> = {
  baemin: "배민",
  coupangeats: "쿠팡이츠",
  yogiyo: "요기요",
  naver: "네이버",
};

export const CATEGORIES = ["맛", "양", "포장", "배달", "서비스", "가격", "재주문", "사진", "불만"] as const;
export type Category = (typeof CATEGORIES)[number];

export const SENTIMENTS = ["positive", "negative", "mixed", "neutral"] as const;
export type Sentiment = (typeof SENTIMENTS)[number];
export const SENTIMENT_LABEL: Record<Sentiment, string> = {
  positive: "긍정",
  negative: "부정",
  mixed: "혼합",
  neutral: "중립",
};

/* ---------- 수집 입력 (크롤러 · 크롬 확장 공용) ---------- */
const nullableNum = z.union([z.number(), z.null()]).optional();

export const IncomingReviewSchema = z.object({
  external_review_id: z.string().min(1),
  customer_name: z.string().optional().default(""),
  rating: nullableNum,
  order_count: nullableNum,
  review_date: z.string().optional().default(""),
  review_text: z.string().optional().default(""),
  order_menu: z.string().optional().default(""),
  delivery_review: z.string().optional().default(""),
  owner_only: z.boolean().optional().default(false),
  has_photo: z.boolean().optional().default(false),
  owner_reply: z.string().optional().default(""),
  raw_payload: z.unknown().optional(),
});
export type IncomingReview = z.infer<typeof IncomingReviewSchema>;

export const IngestPayloadSchema = z.object({
  platform_code: z.enum(PLATFORMS).optional(),
  platform_name: z.string().optional(),
  store_id: z.string().optional().default(""),
  source_url: z.string().optional().default(""),
  captured_at: z.string().optional(),
  reviews: z.array(IncomingReviewSchema),
});
export type IngestPayload = z.infer<typeof IngestPayloadSchema>;

/* ---------- 저장된 리뷰 ---------- */
export interface Review {
  id: number;
  platform: Platform;
  external_id: string;
  store_id: string;
  customer_name: string;
  rating: number | null;
  order_count: number | null;
  review_date: string; // YYYY-MM-DD
  review_text: string;
  order_menu: string;
  delivery_review: string;
  has_photo: boolean;
  owner_reply: string;
  categories: Category[];
  sentiment: Sentiment;
  score: number;
  bookmarked: boolean;
  bookmark_note: string;
  source_url: string;
  collected_at: string;
  created_at: string;
  content_count: number;
}

export interface ReviewFilter {
  platform?: Platform;
  category?: Category;
  sentiment?: Sentiment;
  bookmarked?: boolean;
  q?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
  sort?: "date" | "score";
}

/* ---------- AI 콘텐츠 ---------- */
export const CONTENT_KINDS = ["carousel", "reels", "news"] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];
export const CONTENT_KIND_LABEL: Record<ContentKind, string> = {
  carousel: "인스타 캐러셀",
  reels: "릴스/쇼츠 대본",
  news: "새소식 문구",
};

export const CarouselSchema = z.object({
  concept: z.string().describe("캐러셀 전체 컨셉 한 줄"),
  slides: z
    .array(
      z.object({
        index: z.number().int(),
        role: z.enum(["cover", "body", "closing"]),
        headline: z.string().describe("슬라이드 큰 글씨 (20자 이내)"),
        body: z.string().describe("보조 문구 (60자 이내, 없으면 빈 문자열)"),
        image_prompt: z.string().describe("이미지 생성용 프롬프트 (영문, 사진 스타일)"),
        design_note: z.string().describe("레이아웃·색·브랜딩 영역 지시"),
      })
    )
    .min(3)
    .max(5),
  caption: z.string().describe("인스타 게시물 캡션"),
  hashtags: z.array(z.string()).max(15),
});

export const ReelsSchema = z.object({
  title: z.string(),
  duration_sec: z.number().int().min(15).max(60),
  hook: z.string().describe("첫 2초 훅 문구"),
  scenes: z
    .array(
      z.object({
        order: z.number().int(),
        phase: z.enum(["opening", "highlight", "closing"]),
        duration_sec: z.number().int(),
        script: z.string().describe("나레이션/대사"),
        subtitle: z.string().describe("화면 자막"),
        visual: z.string().describe("촬영 장면 지시"),
      })
    )
    .min(3),
  bgm_style: z.string(),
  mood: z.string(),
  cta: z.string(),
});

export const NewsSchema = z.object({
  naver: z.object({
    title: z.string().describe("네이버 플레이스 새소식 제목 (25자 이내)"),
    body: z.string().describe("본문 (리뷰 인용 + 가게 소식, 300자 이내)"),
  }),
  daangn: z.object({
    title: z.string().describe("당근 새소식 제목"),
    body: z.string().describe("동네 이웃 톤 본문 (300자 이내)"),
  }),
});

export const ContentBundleSchema = z.object({
  key_quote: z.string().describe("리뷰에서 뽑은 핵심 인용 문장 (원문 그대로)"),
  carousel: CarouselSchema,
  reels: ReelsSchema,
  news: NewsSchema,
});
export type ContentBundle = z.infer<typeof ContentBundleSchema>;
export type Carousel = z.infer<typeof CarouselSchema>;
export type Reels = z.infer<typeof ReelsSchema>;
export type News = z.infer<typeof NewsSchema>;

export interface ContentRow {
  id: number;
  review_id: number;
  kind: ContentKind;
  payload: Carousel | Reels | News;
  key_quote: string;
  model: string;
  created_at: string;
}

/* ---------- 주간 베스트 ---------- */
export const WeeklyPickSchema = z.object({
  review_id: z.number().int(),
  rank: z.number().int().min(1).max(5),
  reason: z.string().describe("왜 베스트인지 한 줄"),
  suggested_format: z.enum(["carousel", "reels", "news"]).describe("가장 어울리는 콘텐츠 형식"),
});
export const WeeklySummarySchema = z.object({
  headline: z.string().describe("이번 주 리뷰 한 줄 요약"),
  praise_points: z.array(z.string()).max(5),
  concern_points: z.array(z.string()).max(5),
  picks: z.array(WeeklyPickSchema).min(1).max(5),
});
export type WeeklySummary = z.infer<typeof WeeklySummarySchema>;

export interface WeeklyRow {
  id: number;
  week_start: string;
  week_end: string;
  summary: WeeklySummary;
  review_count: number;
  model: string;
  created_at: string;
}

/* ---------- 설정 ---------- */
export const SettingsSchema = z.object({
  storeName: z.string().default(""),
  brandName: z.string().default(""),
  region: z.string().default(""),
  signatureMenus: z.string().default(""),
  tone: z.string().default("따뜻하고 담백한 사장님 말투, 과장 없이"),
  instagramHandle: z.string().default(""),
  naverPlaceUrl: z.string().default(""),
  baeminReviewUrl: z.string().default(""),
  coupangReviewUrl: z.string().default(""),
  extraNotes: z.string().default(""),
});
export type Settings = z.infer<typeof SettingsSchema>;
