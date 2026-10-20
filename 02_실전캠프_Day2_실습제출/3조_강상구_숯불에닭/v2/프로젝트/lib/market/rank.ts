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
  applied?: string[]; // 마지막으로 "오늘 바꿨어요" 누른 때의 다섯 칸 (다음 바꿈과 비교용)
  changes?: SlotChange[]; // 바꾼 기록 — 뺀 말·넣은 말 (효과 추적용)
}

/** 대표 키워드를 바꾼 기록 한 번 */
export interface SlotChange {
  date: string;
  removed: string[]; // 뺀 말 (예: 테라스야장)
  added: string[]; // 넣은 말 (예: 율량3지구)
  note?: string;
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

// ── 대표 키워드 바꾼 뒤 효과 ───────────────────────────────────────────
const squash = (k: string) => k.replace(/\s+/g, "");

/** 칸마다 앞뒤 같은 부분을 떼고 바뀐 조각만 — "가성비…아이랑테라스야장" → "가성비…아이랑율량3지구" 이면 뺀 "테라스야장", 넣은 "율량3지구" */
export function diffSlots(before: string[], after: string[]): { removed: string[]; added: string[] } {
  const removed: string[] = [];
  const added: string[] = [];
  for (let i = 0; i < Math.max(before.length, after.length); i++) {
    const a = squash(before[i] ?? "");
    const b = squash(after[i] ?? "");
    if (a === b) continue;
    let p = 0;
    while (p < a.length && p < b.length && a[p] === b[p]) p++;
    let q = 0;
    while (q < a.length - p && q < b.length - p && a[a.length - 1 - q] === b[b.length - 1 - q]) q++;
    const r = a.slice(p, a.length - q);
    const n = b.slice(p, b.length - q);
    if (r) removed.push(r);
    if (n) added.push(n);
  }
  return { removed, added };
}

/** 여러 키워드 앞에 공통으로 붙는 지역 말 (청주·율량·율량동) — 이 말이 겹친다고 같은 말로 치지 않는다 */
export function regionStems(keywords: string[]): string[] {
  const ks = keywords.map(squash).filter(Boolean);
  const count = new Map<string, number>();
  for (const k of ks) for (const len of [2, 3]) if (k.length > len) count.set(k.slice(0, len), (count.get(k.slice(0, len)) ?? 0) + 1);
  return [...count.entries()].filter(([, n]) => n >= 2 && n >= ks.length * 0.2).map(([w]) => w).sort((a, b) => b.length - a.length);
}

/** 조각이 이 키워드와 관계있나 — 조각 전체가 들어 있거나, 지역 말을 뗀 뒤 두 글자 이상 말이 겹치면 ("테라스야장" ↔ "율량동야장") */
export function touches(fragment: string, keyword: string, stems: string[] = [], minLen = 2): boolean {
  let f = squash(fragment);
  let k = squash(keyword);
  if (!f || !k) return false;
  if (k.includes(f)) return true;
  for (const st of stems) {
    k = k.split(st).join(" ");
    f = f.split(st).join(" ");
  }
  const pieces = f.split(" ").filter((x) => x.length >= minLen);
  for (const piece of pieces) {
    for (let len = Math.min(piece.length, 6); len >= minLen; len--) {
      for (let i = 0; i + len <= piece.length; i++) if (k.includes(piece.slice(i, i + len))) return true;
    }
  }
  return false;
}

export interface ChangeEffectRow { keyword: string; kind: "넣은 말" | "뺀 말" | "그대로"; before: number | null; beforeDate: string | null; now: number | null; nowDate: string | null; delta: number | null }

/** 바꾼 날(포함) 전 마지막 순위 vs 가장 최근 순위. delta 양수 = 올라감. 50위 밖은 51로 계산 */
export function changeEffect(history: RankPoint[], change: SlotChange, keywords: string[]): { rows: ChangeEffectRow[]; days: number | null } {
  const read = history.filter((p) => !p.note);
  const lastDate = read.reduce((m, p) => (p.date > m ? p.date : m), "");
  const rows: ChangeEffectRow[] = [];
  const stems = regionStems(keywords);
  for (const keyword of keywords) {
    const kind: ChangeEffectRow["kind"] = change.added.some((f) => touches(f, keyword, stems)) ? "넣은 말" : change.removed.some((f) => touches(f, keyword, stems)) ? "뺀 말" : "그대로";
    const mine = read.filter((p) => p.keyword === keyword).sort((a, b) => a.date.localeCompare(b.date));
    const before = [...mine].reverse().find((p) => p.date <= change.date) ?? null;
    const now = mine.length ? mine[mine.length - 1] : null;
    const val = (p: RankPoint | null) => (p ? p.rank ?? 51 : null);
    const b = val(before);
    const n = now && now.date > change.date ? val(now) : null;
    rows.push({ keyword, kind, before: before?.rank ?? null, beforeDate: before?.date ?? null, now: now && now.date > change.date ? now.rank : null, nowDate: now && now.date > change.date ? now.date : null, delta: b !== null && n !== null ? b - n : null });
  }
  const days = lastDate && lastDate > change.date ? Math.round((Date.parse(lastDate) - Date.parse(change.date)) / 86_400_000) : null;
  return { rows, days };
}
