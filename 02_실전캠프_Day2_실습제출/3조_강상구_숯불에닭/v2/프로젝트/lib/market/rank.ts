// 상권 탭 — 네이버 플레이스 키워드 순위 추이 (리뷰 수집기의 npm run rank 기록).
// 순위는 작을수록 좋다. null 은 50위 밖이거나 그날 못 읽은 것 — 0으로 치지 않는다.
import type { RankPoint } from "../export/types";

export interface KeywordSummary {
  keyword: string;
  latestDate: string | null;
  rank: number | null; // 가장 최근에 읽은 순위
  weekAgoRank: number | null; // 7일 전 즈음(그 전 가장 가까운 날)
  change: number | null; // weekAgo − latest (양수 = 올라감)
  best: number | null; // 기록 중 가장 좋은 순위
  blog: number | null;
  visitor: number | null;
  save: number | string | null;
  total: number | null; // 검색 결과 가게 수
  days: number; // 읽은 날 수
  unreadDays: number; // 못 읽은 날 수 (note 있음)
}

const valid = (p: RankPoint) => !p.note;

export function keywordSummaries(history: RankPoint[], keywords?: string[]): KeywordSummary[] {
  const names = keywords?.length ? keywords : [...new Set(history.map((h) => h.keyword))];
  return names.map((keyword) => {
    const mine = history.filter((h) => h.keyword === keyword).sort((a, b) => a.date.localeCompare(b.date));
    const read = mine.filter(valid);
    const latest = read[read.length - 1] ?? null;
    let weekAgo: RankPoint | null = null;
    if (latest) {
      const target = shiftDate(latest.date, -7);
      weekAgo = [...read].reverse().find((p) => p.date <= target) ?? null;
    }
    const ranks = read.map((p) => p.rank).filter((r): r is number => r !== null);
    return {
      keyword,
      latestDate: latest?.date ?? null,
      rank: latest?.rank ?? null,
      weekAgoRank: weekAgo?.rank ?? null,
      change: latest && weekAgo && latest.rank !== null && weekAgo.rank !== null ? weekAgo.rank - latest.rank : null,
      best: ranks.length ? Math.min(...ranks) : null,
      blog: latest?.blog ?? null,
      visitor: latest?.visitor ?? null,
      save: latest?.save ?? null,
      total: latest?.total ?? null,
      days: read.length,
      unreadDays: mine.length - read.length,
    };
  });
}

/** 한 키워드의 날짜별 순위 (최근 n일, 오래된 것부터). 못 읽은 날은 rank null + note */
export function rankSeries(history: RankPoint[], keyword: string, days = 30): RankPoint[] {
  const mine = history.filter((h) => h.keyword === keyword).sort((a, b) => a.date.localeCompare(b.date));
  return mine.slice(-days);
}

export const shiftDate = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** 순위 글자 — 50위 밖 · 못 읽음 · n위 */
export function rankText(p: { rank: number | null; note?: string | null } | null | undefined): string {
  if (!p) return "–";
  if (p.note) return "못 읽음";
  return p.rank === null ? "50위 밖" : `${p.rank}위`;
}

// ── 대표 키워드 5칸 (카페스이 방식) ─────────────────────────────────────
// 스마트플레이스 "대표 키워드" 다섯 칸 중 네 칸은 늘 같은 말로 두고, 한 칸(시즌)만 검색이 오르기 한 달 전에 바꾼다.
export const PLACE_KEYWORDS_KEY = "place_keywords_v1";

export interface PlaceKeywords {
  slots: [string, string, string, string, string]; // ①지역+업종 ②대표 상품 ③동네·랜드마크 ④용도·선물 ⑤시즌(교체)
  season: Record<string, string>; // "1".."12" 월 → 그 달에 ⑤칸에 넣을 말
  changedAt: string | null; // ⑤칸을 마지막으로 바꾼 날 (1~2주 뒤 순위 측정용)
  todo: boolean[]; // 바꾸는 날 할 일 5개 체크
}

export const SLOT_LABELS = ["① 지역 + 업종", "② 대표 상품", "③ 동네 · 랜드마크", "④ 용도 · 선물", "⑤ 시즌 (이 칸만 바꿔요)"] as const;
export const SLOT_HINTS = ["예: 청주닭갈비", "예: 숯불닭갈비", "예: 율량동맛집", "예: 청주회식", "예: 청주연말모임 · 다음 달 것을 미리"] as const;
export const CHANGE_TODO = [
  "대표 키워드 ⑤칸 바꾸기 (나머지 네 칸은 그대로)",
  "상세설명 소개글에 새 시즌 말을 문장으로 1~2번 (단어만 나열하지 않기)",
  "대표 사진 첫 장을 시즌 메뉴로",
  "같은 시즌 광고그룹이 있으면 켜기",
  "1~2주 뒤 순위 다시 측정 — 바꾸기 전 순위와 비교",
] as const;

export const EMPTY_PLACE_KEYWORDS: PlaceKeywords = { slots: ["", "", "", "", ""], season: {}, changedAt: null, todo: [false, false, false, false, false] };

/** 다음 달에 ⑤칸에 넣을 말 — 적어 둔 게 있으면 */
export function nextSeasonKeyword(pk: PlaceKeywords, today: string): { month: number; keyword: string } | null {
  const m = Number(today.slice(5, 7));
  const next = (m % 12) + 1;
  const kw = (pk.season[String(next)] ?? "").trim();
  return kw ? { month: next, keyword: kw } : null;
}

// ── 키워드별 순위 변화 표 (날짜 × 키워드) ──────────────────────────────
export interface RankGridCell {
  rank: number | null; // null = 50위 밖
  unread: boolean; // 그날 못 읽음
  delta: number | null; // 직전에 읽은 날 대비 (양수 = 올라감)
}
export interface RankGrid {
  dates: string[]; // 오래된 날부터
  keywords: string[];
  cells: Record<string, Record<string, RankGridCell>>; // cells[keyword][date]
}

/** 최근 days 일의 날짜 × 키워드 순위 표. 직전에 읽은 날과 비교해 오르내림을 붙인다 */
export function rankGrid(history: RankPoint[], keywords: string[], days = 14, today?: string): RankGrid {
  const allDates = [...new Set(history.map((h) => h.date))].sort();
  const end = today ?? allDates[allDates.length - 1];
  const dates = end ? Array.from({ length: days }, (_, i) => shiftDate(end, i - days + 1)) : [];
  const cells: RankGrid["cells"] = {};
  for (const k of keywords) {
    cells[k] = {};
    const mine = history.filter((h) => h.keyword === k).sort((a, b) => a.date.localeCompare(b.date));
    let prevRank: number | null | undefined; // undefined = 아직 읽은 날 없음
    for (const p of mine) {
      if (!dates.includes(p.date)) {
        if (!p.note) prevRank = p.rank; // 표 밖(더 오래된) 날도 비교 기준으로 쓴다
        continue;
      }
      if (p.note) {
        cells[k][p.date] = { rank: null, unread: true, delta: null };
        continue;
      }
      const delta = prevRank === undefined || prevRank === null || p.rank === null ? null : prevRank - p.rank;
      cells[k][p.date] = { rank: p.rank, unread: false, delta };
      prevRank = p.rank;
    }
  }
  return { dates, keywords, cells };
}
