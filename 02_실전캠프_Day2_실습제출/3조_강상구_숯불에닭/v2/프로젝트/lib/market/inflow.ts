import type { MarketInflow } from "../export/types";

// 스마트플레이스 유입 키워드 — 손님이 어떤 말로 검색해 우리 플레이스에 들어왔나.
// 가게 이름 검색(이미 우리를 아는 손님)과 그 밖의 검색(새 손님이 찾은 말)을 나눠 본다.

export type InflowRange = "d7" | "d30" | "d90" | `${number}-${number}` | `${number}-${number}-${number}/${number}-${number}-${number}`;

/** 한국 시간 이번 달까지 선택 가능. 월별 자료가 없는 달도 목록에 남긴다. */
export function inflowMonths(now = new Date()): string[] {
  const end = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit" }).formatToParts(now);
  const last = `${end.find(p => p.type === "year")!.value}-${end.find(p => p.type === "month")!.value}`;
  const months: string[] = [];
  for (let year = 2024, month = 9; ; month++) {
    if (month > 12) { year++; month = 1; }
    const key = `${year}-${String(month).padStart(2, "0")}`;
    if (key > last) break;
    months.unshift(key);
  }
  return months;
}

const nextDay = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/**
 * 수집기가 하루씩 받아 둔 자료를 더해 그 기간을 만든다.
 *
 * 수집기(auto-collect)는 밤마다 **하루치**만 받아 둔다. 월별 자료는 월간 수집을 따로 돌려야
 * 갱신돼서, 진행 중인 달은 months 에 옛날 끝날짜로 남아 있다 (2026-11-17 기준 2026-11 은
 * 11/01~11/04 에서 멈춰 있었다). 그래서 달력에서 이번 달을 고르면 저장된 기간이 없어
 * Aside 창으로 직접 조회하다가 네이버 로그인이 풀리면 실패했다.
 *
 * 유입 수(pv)는 더해지는 값이라 하루치를 더하면 월별 자료와 같다 — 2026-10 하루치 31일분을
 * 더하니 월별 자료와 1,215회·212개 말까지 똑같았다 (차이 0).
 *
 * 하루라도 빠지면 그 기간은 만들지 않는다. 적게 나온 숫자를 맞는 것처럼 보여 주지 않기 위해서다.
 */
export function inflowFromDays(inflow: MarketInflow | null | undefined, start: string, end: string): { start: string; end: string; items: { keyword: string; pv: number }[]; days: number; missing: string[] } | null {
  if (!inflow?.periods || start > end) return null;
  const sum = new Map<string, number>();
  const missing: string[] = [];
  let days = 0;
  for (let day = start; day <= end; day = nextDay(day)) {
    const p = inflow.periods[`${day}/${day}`];
    if (!p) {
      missing.push(day);
      continue;
    }
    days++;
    for (const it of p.items) sum.set(it.keyword, (sum.get(it.keyword) ?? 0) + it.pv);
  }
  if (days === 0) return null;
  return { start, end, items: [...sum].map(([keyword, pv]) => ({ keyword, pv })).sort((a, b) => b.pv - a.pv), days, missing };
}

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
  const r = range.includes("/") ? inflow?.periods?.[range] : /^\d{4}-\d{2}$/.test(range) ? inflow?.months?.[range] : inflow?.ranges?.[range as "d7" | "d30" | "d90"];
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
