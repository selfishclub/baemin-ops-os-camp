import type { ExportReview, LedgerExport, ReviewPlatform } from "./types";

export class ExportParseError extends Error {}

const PLATFORMS: ReviewPlatform[] = ["naver", "baemin", "coupang"];
const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

/** 내보내기 파일을 읽어 모양을 확인한다. 리뷰 수집기가 만든 파일이 아니면 왜 아닌지 말해 준다 */
export function parseLedgerExport(text: string): LedgerExport {
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ExportParseError("JSON 파일이 아니에요. 리뷰 수집기에서 npm run export:ledger 로 만든 data/ledger-export.json 을 올려 주세요.");
  }
  if (!raw || raw.kind !== "sootdak-ledger-export") throw new ExportParseError("손익장부용 내보내기 파일이 아니에요. (kind 가 다름)");
  if (raw.version !== 1) throw new ExportParseError(`이 장부는 내보내기 1판만 읽어요. (파일은 ${raw.version}판) 장부를 새로 받아 주세요.`);
  if (!Array.isArray(raw.reviews)) throw new ExportParseError("리뷰 목록이 없어요.");

  const reviews: ExportReview[] = raw.reviews
    .filter((r: any) => r && PLATFORMS.includes(r.platform) && r.id !== undefined)
    .map((r: any) => ({
      platform: r.platform,
      id: String(r.id),
      rating: num(r.rating),
      content: String(r.content ?? ""),
      menu: str(r.menu),
      date: str(r.date),
      visitDate: str(r.visitDate),
      author: String(r.author ?? "손님"),
      reply: str(r.reply),
      replyDate: str(r.replyDate),
      topics: Array.isArray(r.topics) ? r.topics.map(String) : [],
      complaintType: str(r.complaintType),
      ownerOnly: Boolean(r.ownerOnly),
      imageCount: Number(r.imageCount ?? 0),
      orderCount: num(r.orderCount),
      draft: r.draft && r.draft.text ? { text: String(r.draft.text), status: String(r.draft.status ?? "draft"), needsOwnerInput: Boolean(r.draft.needsOwnerInput) } : null,
    }));

  return {
    kind: "sootdak-ledger-export",
    version: 1,
    exportedAt: String(raw.exportedAt ?? ""),
    shop: raw.shop ?? undefined,
    reviews,
    rank: raw.rank && Array.isArray(raw.rank.history) ? { shop: String(raw.rank.shop ?? ""), shopId: str(raw.rank.shopId), keywords: Array.isArray(raw.rank.keywords) ? raw.rank.keywords.map(String) : [], history: raw.rank.history, latest: raw.rank.latest ?? null } : null,
    baemin: raw.baemin && Array.isArray(raw.baemin.settlements) ? raw.baemin : null,
    coupang: raw.coupang && Array.isArray(raw.coupang.settlements) ? raw.coupang : null,
    market: raw.market && typeof raw.market === "object" ? { area: raw.market.area ?? null, population: raw.market.population ?? null, trend: raw.market.trend ?? null, competitors: Array.isArray(raw.market.competitors) ? raw.market.competitors : [] } : null,
  };
}
