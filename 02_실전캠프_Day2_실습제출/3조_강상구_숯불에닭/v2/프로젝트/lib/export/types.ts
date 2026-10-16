import type { NaverAdExport } from "../market/adStats";
// 리뷰 수집기(review-onetouch)의 "손익장부용 내보내기" 파일 모양 — npm run export:ledger 가 만드는 JSON.
// 리뷰 · 답글 초안 · 네이버 플레이스 순위 · 배민 정산(수집했다면)이 한 파일에 들어온다.
// 손익장부는 인터넷 DB 없이 내 PC 브라우저에 저장하므로, 이 파일을 올려서 리뷰 · 상권 · 정산 탭을 채운다.

export type ReviewPlatform = "naver" | "baemin" | "coupang";

export interface ExportReview {
  platform: ReviewPlatform;
  id: string;
  rating: number | null; // 네이버는 별점 없는 리뷰가 있다
  content: string;
  menu: string | null;
  date: string | null; // ISO 시각 (리뷰 쓴 때)
  visitDate: string | null;
  author: string; // 가린 닉네임 (jin***)
  reply: string | null; // 사장님 답글
  replyDate: string | null;
  topics: string[]; // 수집기가 붙인 주제 꼬리표
  complaintType: string | null; // 불만 종류 (있으면 불만 리뷰)
  ownerOnly: boolean; // 사장님만 보는 리뷰 (배민)
  imageCount: number;
  orderCount?: number | null;
  draft: { text: string; status: string; needsOwnerInput: boolean } | null; // 답글 초안
}

export interface RankPoint {
  date: string; // "2026-10-13"
  keyword: string;
  rank: number | null; // null = 50위 밖 또는 못 읽음
  blog: number | null;
  visitor: number | null;
  save: number | string | null; // 네이버는 "25,000+" 같은 글자로 줄 때가 있다
  total: number | null;
  note?: string | null;
}

export interface RankTop {
  rank: number | null;
  name: string;
  blog: number | null;
  visitor: number | null;
  save: number | string | null;
}

export interface RankDay {
  date: string;
  results: { keyword: string; total: number | null; mine: RankTop | null; top: RankTop[]; adNames: string[] }[];
}

export interface RankExport {
  shop: string;
  shopId: string | null;
  keywords: string[];
  history: RankPoint[];
  latest: RankDay | null; // 가장 최근에 제대로 읽은 날 (경쟁 가게 목록)
}

export interface BaeminSettlement {
  giveId: string;
  depositDueDate: string; // 입금(예정)일
  status: string; // 입금요청 · 입금완료 …
  periodStart: string; // 정산 대상 주문 기간
  periodEnd: string;
  depositAmount: number; // 실제 입금(예정)액
  adCost: number; // 이 정산에서 빠진 우리가게클릭 광고비 (부가세 포함)
  adDaily: { date: string; amount: number }[];
  adjustment: number; // 조정·보상·광고 지원 등
}

export interface BaeminOrderDay {
  date: string;
  orders: number;
  settledOrders: number; // 정산이 채워진 주문 (비용을 아는 주문)
  unsettledOrders: number;
  gross: number; // 주문금액
  discount: number; // 점주 부담 할인
  otherRevenue: number; // 가게배달팁 등
  deductions: { brokerage: number; payment: number; delivery: number; vat: number; unclassified: number; ad?: number }; // ad = 주문당 광고비 (쿠팡이츠)
}

export interface BaeminStatsMonth {
  orderAmount: number | null;
  orderCount: number | null;
  groups: Record<string, { cost: number | null; orderCount: number; orderAmount: number }>; // CPC = 우리가게클릭
}

export interface BaeminExport {
  collectedAt: string;
  orderRange: { start: string; end: string } | null;
  settlements: BaeminSettlement[];
  orders: BaeminOrderDay[];
  stats: Record<string, BaeminStatsMonth>; // "2026-09" →
  unknownCodes: { code: string; count: number }[];
  // 쿠팡이츠만: 정산 예정 잔액 · 예정 입금 · 매입세금계산서(달별 수수료·광고비)
  balance?: { expected: number; withdrawable: number } | null;
  expected?: { date: string; amount: number }[];
  taxInvoices?: { seq: string; issueDate: string; month: string; note: string; supply: number; vat: number; total: number }[];
}

// ── 상권 조사 (npm run market) ──────────────────────────────────────────
export interface MarketStore {
  id: string;
  name: string;
  large: string | null; // 업종 대분류 (음식·소매·…)
  mid: string | null; // 중분류 (한식·카페·…)
  small: string | null; // 소분류 (닭/오리요리·커피전문점·…)
  addr: string | null;
  lat?: number | null;
  lng?: number | null;
}
export interface MarketArea {
  surveyedAt: string;
  center: { lat: number; lng: number };
  radius: number; // m
  total: number;
  stores: MarketStore[];
  prev?: MarketArea | null; // 지난 조사 (다른 달)
}
export interface MarketPopulation {
  admName: string; // 충청북도 청주시 청원구 율량동
  admCd: string;
  year: number;
  total: number;
  avgAge: number | null;
  households: number | null;
  fetchedAt: string;
}
export interface MarketTrendGroup {
  name: string;
  keywords: string[];
  data: { period: string; ratio: number }[]; // "2026-10", 상대 검색량 (최대 100)
}
export interface MarketTrend {
  fetchedAt: string;
  start: string;
  end: string;
  groups: MarketTrendGroup[];
}
export interface MarketCompetitorRow {
  id: string;
  rank: number | null;
  name: string;
  visitor: number | null;
  blog: number | null;
}
export interface MarketCompetitor {
  keyword: string;
  first: { date: string; rows: MarketCompetitorRow[]; mine: MarketCompetitorRow | null };
  latest: { date: string; rows: MarketCompetitorRow[]; mine: MarketCompetitorRow | null };
}
export interface MarketExport {
  area: MarketArea | null;
  population: MarketPopulation | null;
  trend: MarketTrend | null;
  competitors: MarketCompetitor[];
}

export interface LedgerExport {
  kind: "sootdak-ledger-export";
  version: 1;
  exportedAt: string;
  shop?: { name: string | null };
  reviews: ExportReview[];
  rank: RankExport | null;
  baemin: BaeminExport | null;
  coupang?: BaeminExport | null; // 쿠팡이츠 — 같은 모양 (주문별 정산 항목으로 만듦)
  market?: MarketExport | null;
  naverAd?: NaverAdExport | null; // 네이버 광고 구조·성적 (lib/market/adStats.ts)
}

// 저장 키 (설정 칸에 통째로 둔다)
export const EXPORT_REVIEWS_KEY = "export_reviews_v1";
export const EXPORT_RANK_KEY = "export_rank_v1";
export const EXPORT_BAEMIN_KEY = "export_baemin_v1";
export const EXPORT_META_KEY = "export_meta_v1";
export const EXPORT_MARKET_KEY = "export_market_v1";
export const EXPORT_COUPANG_KEY = "export_coupang_v1";
export { EXPORT_NAVERAD_KEY } from "../market/adStats";

export interface ExportMeta {
  exportedAt: string;
  uploadedAt: string;
  reviews: number;
  rankPoints: number;
  settlements: number;
}

// 상권 조사 저장 키는 위 EXPORT_MARKET_KEY (2026-10-15)
