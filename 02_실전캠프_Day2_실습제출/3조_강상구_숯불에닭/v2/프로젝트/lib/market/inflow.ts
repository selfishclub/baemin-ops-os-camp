import type { MarketInflow } from "../export/types";

// 스마트플레이스 유입 키워드 — 손님이 어떤 말로 검색해 우리 플레이스에 들어왔나.
// 가게 이름 검색(이미 우리를 아는 손님)과 그 밖의 검색(새 손님이 찾은 말)을 나눠 본다.

export type InflowRange = "d7" | "d30" | "d90";

export interface InflowRow {
  keyword: string;
  pv: number;
  share: number; // 그 기간 유입 중 몇 %
  tracked: boolean; // 순위 추적 중인가
  rank: number | null; // 추적 중이면 최근 순위 (50위 밖이면 null)
}

export interface InflowSummary {
  start: string;
  end: string;
  total: number;
  brand: { pv: number; keywords: number }; // 가게 이름 검색
  noKeyword: number; // "(검색어 없음)"
  rows: InflowRow[]; // 가게 이름 검색을 뺀 나머지, 많은 순
}

// 가게 이름(과 흔한 오타) — 이 말이 들어간 검색은 이미 우리를 아는 손님
const BRAND = /숯불에\s?닭|숯불의\s?닭|숮불에\s?닭|숯불에닥/;
const norm = (s: string) => s.replace(/\s+/g, "");

export function inflowSummary(inflow: MarketInflow | null | undefined, range: InflowRange, ranks: Map<string, number | null>): InflowSummary | null {
  const r = inflow?.ranges?.[range];
  if (!r) return null;
  const total = r.items.reduce((a, x) => a + x.pv, 0);
  const brandItems = r.items.filter((x) => BRAND.test(x.keyword));
  const noKeyword = r.items.filter((x) => x.keyword.includes("검색어 없음")).reduce((a, x) => a + x.pv, 0);
  const rows = r.items
    .filter((x) => !BRAND.test(x.keyword) && !x.keyword.includes("검색어 없음"))
    .sort((a, b) => b.pv - a.pv)
    .map((x) => {
      const k = norm(x.keyword);
      return { keyword: x.keyword, pv: x.pv, share: total ? Math.round((x.pv / total) * 1000) / 10 : 0, tracked: ranks.has(k), rank: ranks.get(k) ?? null };
    });
  return { start: r.start, end: r.end, total, brand: { pv: brandItems.reduce((a, x) => a + x.pv, 0), keywords: brandItems.length }, noKeyword, rows };
}

/** 추적 키워드 요약(최근 순위)에서 키워드 → 순위 (띄어쓰기 무시) */
export function rankMap(summaries: { keyword: string; rank: number | null }[]): Map<string, number | null> {
  return new Map(summaries.map((s) => [norm(s.keyword), s.rank]));
}
