// 상권 탭 — "우리 동네가 어떤지": 반경 안 점포(업종별 수 · 같은 업종 가게 · 지난 조사와 비교), 동 인구, 키워드 검색 흐름, 경쟁 가게 리뷰 증가.
// 자료는 리뷰 수집기의 npm run market (공공데이터 상가정보 · 통계청 SGIS · 네이버 데이터랩) 결과가 내보내기 파일로 온다.
import type { MarketArea, MarketCompetitor, MarketTrend, MarketTrendGroup } from "../export/types";

export interface AreaSummary {
  surveyedAt: string;
  radius: number;
  total: number;
  byLarge: { name: string; count: number }[]; // 업종 대분류별, 많은 순
  food: { name: string; count: number }[]; // 음식 중분류(한식·중식·카페…)별
  same: { id: string; name: string; small: string | null; addr: string | null }[]; // 우리와 같은 종류 가게
  prev: { surveyedAt: string; total: number; opened: { name: string; small: string | null }[]; closed: { name: string; small: string | null }[] } | null;
}

const isFood = (s: { large: string | null }) => /음식|식|외식/.test(s.large ?? "") || s.large === "음식";

/**
 * sameWords: 우리와 같은 종류로 볼 업종 소분류·중분류·상호 글자 (예: ["닭", "치킨", "닭갈비"]). 비면 "같은 업종"은 비운다.
 */
export function areaSummary(area: MarketArea, sameWords: string[] = []): AreaSummary {
  const count = (pick: (s: MarketArea["stores"][number]) => string | null) => {
    const m = new Map<string, number>();
    for (const s of area.stores) {
      const k = pick(s);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  };
  const words = sameWords.map((w) => w.replace(/\s/g, "")).filter(Boolean);
  const isSame = (s: MarketArea["stores"][number]) => words.length > 0 && words.some((w) => [s.small, s.mid, s.name].some((v) => (v ?? "").replace(/\s/g, "").includes(w)));
  let prev: AreaSummary["prev"] = null;
  if (area.prev) {
    const nowIds = new Set(area.stores.map((s) => s.id));
    const prevIds = new Set(area.prev.stores.map((s) => s.id));
    prev = {
      surveyedAt: area.prev.surveyedAt,
      total: area.prev.total,
      opened: area.stores.filter((s) => !prevIds.has(s.id)).map((s) => ({ name: s.name, small: s.small })),
      closed: area.prev.stores.filter((s) => !nowIds.has(s.id)).map((s) => ({ name: s.name, small: s.small })),
    };
  }
  return {
    surveyedAt: area.surveyedAt,
    radius: area.radius,
    total: area.total,
    byLarge: count((s) => s.large ?? "기타"),
    food: count((s) => (isFood(s) ? s.mid ?? "기타" : null)),
    same: area.stores.filter(isSame).map((s) => ({ id: s.id, name: s.name, small: s.small, addr: s.addr })),
    prev,
  };
}

export interface TrendSummary {
  name: string;
  peakMonths: number[]; // 평균의 1.2배를 넘는 달 (1~12)
  bestMonth: number | null;
  latestRatio: number | null;
  latestVsAvg: number | null; // 최근 달 ÷ 평균 (1.3이면 평소보다 30% 많이 찾음)
  prepareMonth: number | null; // 가장 많이 찾는 달의 한 달 전 — ⑤칸을 바꿀 때
}

export function trendSummary(g: MarketTrendGroup): TrendSummary {
  const data = g.data.filter((d) => Number.isFinite(d.ratio));
  if (!data.length) return { name: g.name, peakMonths: [], bestMonth: null, latestRatio: null, latestVsAvg: null, prepareMonth: null };
  const avg = data.reduce((a, d) => a + d.ratio, 0) / data.length;
  const month = (p: string) => Number(p.slice(5, 7));
  const peakMonths = [...new Set(data.filter((d) => avg > 0 && d.ratio >= avg * 1.2).map((d) => month(d.period)))];
  const best = [...data].sort((a, b) => b.ratio - a.ratio)[0];
  const bestMonth = best ? month(best.period) : null;
  const latest = data[data.length - 1];
  return {
    name: g.name,
    peakMonths,
    bestMonth,
    latestRatio: latest.ratio,
    latestVsAvg: avg > 0 ? Math.round((latest.ratio / avg) * 100) / 100 : null,
    prepareMonth: bestMonth === null ? null : bestMonth === 1 ? 12 : bestMonth - 1,
  };
}

export interface CompetitorRow {
  id: string;
  name: string;
  rankNow: number | null;
  rankFirst: number | null;
  visitorNow: number | null;
  visitorFirst: number | null;
  visitorGain: number | null; // 방문자 리뷰 증가 (그 기간)
  mine: boolean;
}

/** 키워드 하나의 경쟁 가게 변화 — 최근 상위 가게 기준, 처음 읽은 날과 비교. 우리 가게는 순위 밖이어도 넣는다 */
export function competitorRows(c: MarketCompetitor): { from: string; to: string; days: number; rows: CompetitorRow[] } {
  const firstBy = new Map(c.first.rows.map((r) => [r.id, r]));
  const mineId = c.latest.mine?.id ?? c.first.mine?.id ?? null;
  const rows: CompetitorRow[] = c.latest.rows.map((r) => {
    const f = firstBy.get(r.id);
    return { id: r.id, name: r.name, rankNow: r.rank, rankFirst: f?.rank ?? null, visitorNow: r.visitor, visitorFirst: f?.visitor ?? null, visitorGain: r.visitor !== null && f?.visitor != null ? r.visitor - f.visitor : null, mine: r.id === mineId };
  });
  if (mineId && !rows.some((r) => r.mine) && c.latest.mine) {
    const m = c.latest.mine;
    const f = c.first.mine;
    rows.push({ id: m.id, name: m.name, rankNow: m.rank, rankFirst: f?.rank ?? null, visitorNow: m.visitor, visitorFirst: f?.visitor ?? null, visitorGain: m.visitor !== null && f?.visitor != null ? m.visitor - f.visitor : null, mine: true });
  }
  const days = Math.round((Date.parse(c.latest.date) - Date.parse(c.first.date)) / 86_400_000);
  return { from: c.first.date, to: c.latest.date, days, rows };
}

// ── 다음 달 미리 잡을 키워드 ───────────────────────────────────────────
// 검색 흐름(12개월 상대 검색량)에서 "다음 달"에 평소보다 많이 찾는 키워드를 골라 준다.
// 작년 같은 달의 비율을 그 키워드의 1년 평균과 비교한다 (1.3 = 평소보다 30% 더 찾음).
export interface UpcomingKeyword {
  keyword: string;
  month: number; // 1~12
  index: number; // 그 달 비율 ÷ 1년 평균
  peakMonth: number | null;
  ratio: number; // 그 달 상대 검색량 (최대 100)
}

/** today 기준 monthsAhead 달 뒤(기본 다음 달)에 평소보다 많이 찾는 키워드, 많이 찾는 순 */
export function upcomingKeywords(trend: MarketTrend | null, today: string, monthsAhead = 1, minIndex = 1.1): UpcomingKeyword[] {
  if (!trend) return [];
  const m0 = Number(today.slice(5, 7));
  const month = ((m0 - 1 + monthsAhead) % 12) + 1;
  const out: UpcomingKeyword[] = [];
  for (const g of trend.groups) {
    const data = g.data.filter((d) => Number.isFinite(d.ratio));
    if (data.length < 6) continue;
    const avg = data.reduce((a, d) => a + d.ratio, 0) / data.length;
    if (avg <= 0) continue;
    const hit = [...data].reverse().find((d) => Number(d.period.slice(5, 7)) === month); // 가장 최근의 그 달
    if (!hit) continue;
    const index = Math.round((hit.ratio / avg) * 100) / 100;
    if (index < minIndex) continue;
    const best = [...data].sort((a, b) => b.ratio - a.ratio)[0];
    out.push({ keyword: g.name, month, index, peakMonth: best ? Number(best.period.slice(5, 7)) : null, ratio: hit.ratio });
  }
  return out.sort((a, b) => b.index - a.index);
}
