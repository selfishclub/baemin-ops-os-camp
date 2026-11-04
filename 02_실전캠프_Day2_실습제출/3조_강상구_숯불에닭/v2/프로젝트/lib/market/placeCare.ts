// 플레이스 관리 — 전자책 "네이버 알고리즘의 허점을 찾아라"(애드랭크 두더지)에서 합법적으로 쓸 수 있는 부분만 옮긴 계산.
//  · 내 칸과 상위 가게 대표 키워드 비교 · 소개글·손님 리뷰에 그 말이 있는지 · 최근 14일 점검 · 작업 전후 비교
//  · 리워드 트래픽·리뷰 구매·중복 등록은 넣지 않는다 (네이버 정책 위반·제재 위험)
import type { ExportReview, MarketInflow, PlaceInfoExport, RankPoint } from "../export/types";
import { inflowDailyEntries } from "./inflowInsights";

export const PLACE_CARE_KEY = "place_care_v1";

export type WorkKind = "소개글" | "대표 키워드" | "사진" | "소식·쿠폰" | "메뉴" | "체험단" | "기타";
export const WORK_KINDS: WorkKind[] = ["소개글", "대표 키워드", "사진", "소식·쿠폰", "메뉴", "체험단", "기타"];

export interface PlaceWork {
  id: string;
  date: string;
  kind: WorkKind;
  note: string;
}

export interface PlaceCare {
  words: string[]; // 소개글·리뷰에서 찾아볼 말
  work: PlaceWork[];
  setup: Record<string, boolean>;
  routine: Record<string, string>; // 루틴 id → 마지막으로 한 날
}

export const EMPTY_PLACE_CARE: PlaceCare = { words: ["회식", "단체", "모임", "가족", "주차", "포장", "예약"], work: [], setup: {}, routine: {} };

export const SETUP_ITEMS: { id: string; label: string; why: string }[] = [
  { id: "desc", label: "소개글 700~1500자", why: "지역+메뉴+방문 목적을 문장으로. 소개 → 분위기 → 메뉴 → 위치·행사 → 이용 정보 순서" },
  { id: "way", label: "찾아오는 길에 건물·교차로 이름", why: "실제 있는 건물·교차로와 동선을 쓰고, 끝에 길찾기 안내 한 줄" },
  { id: "site", label: "웹사이트 칸 채우기", why: "홈페이지가 없으면 블로그·인스타 링크도 괜찮음" },
  { id: "book", label: "네이버 예약 켜기", why: "예약·주문 같은 행동이 쌓이는 통로 (책의 주장, 효과 크기는 미확인)" },
  { id: "phone", label: "스마트콜 2차 번호 등록", why: "대표 번호가 통화 중이어도 전화를 놓치지 않음" },
  { id: "news", label: "쿠폰·소식 칸 채우기", why: "최근 활동이 보이고 손님 선택에 도움. 실제로 줄 수 있는 혜택만" },
  { id: "photo", label: "고화질 사진 10장 이상", why: "강점 먼저. 과한 보정·글자 넣은 사진은 피하기" },
];

export const ROUTINE_ITEMS: { id: string; label: string; days: number; why: string }[] = [
  { id: "review", label: "손님 영수증 리뷰 안내", days: 14, why: "요청은 하되 리뷰 대가·조건 혜택은 넣지 않기" },
  { id: "news", label: "소식 올리기", days: 14, why: "메뉴·시즌·행사 안내 한 건" },
  { id: "desc", label: "소개글에 계절·행사 말 반영", days: 30, why: "앞부분에 지금 찾는 말을 문장으로" },
  { id: "photo", label: "계절 사진 교체", days: 30, why: "대표 사진과 갤러리 최신화" },
  { id: "rival", label: "상위 가게 키워드·리뷰 변화 보기", days: 30, why: "이 화면의 상위 가게 표와 상권 탭 경쟁 가게 표" },
];

const squash = (s: string) => s.replace(/\s+/g, "");
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** 장부에 적어 둔 칸과 네이버에 실제 올라간 칸이 같은가. 순서는 보지 않는다 (네이버가 칸 순서를 바꿔 보여 준다) */
export function slotMismatch(ledger: string[], actual: string[] | null): { onlyLedger: string[]; onlyNaver: string[] } | null {
  if (!actual) return null;
  const a = ledger.map(squash).filter(Boolean);
  const b = actual.map(squash).filter(Boolean);
  return { onlyLedger: a.filter((x) => !b.includes(x)), onlyNaver: b.filter((x) => !a.includes(x)) };
}

export interface RivalWord {
  word: string;
  count: number; // 몇 곳이 쓰나
  shops: string[];
  inMine: boolean; // 내 칸 어딘가에 그 말이 들어 있나
}

/** 상위 가게가 대표 키워드로 많이 쓰는 말. 책의 "내 목록에 없는 키워드" 표 */
export function rivalWords(info: PlaceInfoExport | null, mine: string[]): RivalWord[] {
  if (!info) return [];
  const joined = mine.map(squash).join("|");
  const map = new Map<string, Set<string>>();
  for (const p of info.places) {
    for (const k of p.keywords ?? []) {
      const w = squash(k);
      if (!w) continue;
      if (!map.has(w)) map.set(w, new Set());
      map.get(w)!.add(p.name);
    }
  }
  return [...map.entries()]
    .map(([word, shops]) => ({ word, count: shops.size, shops: [...shops], inMine: joined.includes(word) }))
    .sort((x, y) => y.count - x.count || x.word.localeCompare(y.word));
}

export interface WordCoverage {
  word: string;
  inDescription: number; // 소개글에 몇 번
  reviews: number; // 네이버 손님 리뷰 몇 건에
  recentReviews: number; // 그중 최근 90일
  verdict: "둘 다 있음" | "소개글에 넣을 말" | "리뷰에 없는 말" | "둘 다 없음";
}

/** 공급자(소개글)와 손님(리뷰)이 모두 말하는 단어인가 — 책의 "둘 다 언급하면 믿는다"를 확인하는 표. 네이버 리뷰만 센다 */
export function wordCoverage(words: string[], description: string | null, reviews: ExportReview[], today: string): WordCoverage[] {
  const naver = reviews.filter((r) => r.platform === "naver");
  const since = addDays(today, -90);
  const clean = (description ?? "").replace(/\s+/g, "");
  return words.map(squash).filter(Boolean).map((word) => {
    const inDescription = clean.split(word).length - 1;
    const hits = naver.filter((r) => squash(r.content ?? "").includes(word));
    const verdict: WordCoverage["verdict"] = inDescription > 0 && hits.length > 0 ? "둘 다 있음" : hits.length > 0 ? "소개글에 넣을 말" : inDescription > 0 ? "리뷰에 없는 말" : "둘 다 없음";
    return { word, inDescription, reviews: hits.length, recentReviews: hits.filter((r) => (r.date ?? "").slice(0, 10) >= since).length, verdict };
  });
}

const dailyMap = (inflow: MarketInflow | null | undefined) => new Map((inflow ? inflowDailyEntries(inflow) : []).map((d) => [d.start, d.items.reduce((n, i) => n + i.pv, 0)]));

/** 구간 합. 하루라도 자료가 비면 비교가 틀어지므로 null */
function sumDays(daily: Map<string, number>, start: string, days: number): number | null {
  let total = 0;
  for (let i = 0; i < days; i++) {
    const v = daily.get(addDays(start, i));
    if (v === undefined) return null;
    total += v;
  }
  return total;
}

/** 순위 자료가 있는 날짜 중 기준일에 가장 가까운(이전) 날 */
function nearestRead(dates: string[], date: string): string | null {
  return [...dates].reverse().find((d) => d <= date) ?? null;
}

function rankMoves(history: RankPoint[], from: string, to: string) {
  const at = (d: string) => new Map(history.filter((p) => p.date === d && !p.note).map((p) => [p.keyword, p.rank]));
  const a = at(from);
  const b = at(to);
  let up = 0, down = 0, same = 0, lost = 0, gained = 0;
  const lostWords: string[] = [];
  for (const [k, r] of a) {
    if (!b.has(k)) continue;
    const n = b.get(k)!;
    if (r !== null && n !== null) {
      if (n < r) up++;
      else if (n > r) down++;
      else same++;
    } else if (r !== null && n === null) {
      lost++;
      if (!k.includes("@")) lostWords.push(k);
    } else if (r === null && n !== null) gained++;
  }
  return { up, down, same, lost, gained, lostWords };
}

function reviewsAt(history: RankPoint[], date: string) {
  const rows = history.filter((p) => p.date === date && !p.note);
  const max = (key: "visitor" | "blog") => rows.reduce<number | null>((m, p) => (p[key] !== null && p[key] !== undefined && (m === null || p[key]! > m) ? p[key]! : m), null);
  return { visitor: max("visitor"), blog: max("blog") };
}

export interface Health14 {
  from: string;
  to: string;
  moves: ReturnType<typeof rankMoves>;
  visitorGain: number | null;
  blogGain: number | null;
  inflowRecent: number | null;
  inflowBefore: number | null;
  inflowEnd: string | null;
  checks: { label: string; tone: "ok" | "warn" | "info"; text: string }[];
}

/** 최근 14일 점검 — 네이버가 약 14일 단위로 본다는 책의 관찰(공식 발표 아님)에 맞춘 비교 창 */
export function health14(history: RankPoint[], inflow: MarketInflow | null | undefined, today: string): Health14 | null {
  const dates = [...new Set(history.filter((p) => !p.note).map((p) => p.date))].sort();
  if (dates.length < 2) return null;
  const to = dates[dates.length - 1];
  const from = nearestRead(dates, addDays(to, -14));
  if (!from || from === to) return null;
  const moves = rankMoves(history, from, to);
  const a = reviewsAt(history, from);
  const b = reviewsAt(history, to);
  const visitorGain = a.visitor !== null && b.visitor !== null ? b.visitor - a.visitor : null;
  const blogGain = a.blog !== null && b.blog !== null ? b.blog - a.blog : null;

  const daily = dailyMap(inflow);
  const inflowEnd = [...daily.keys()].sort().pop() ?? null;
  const inflowRecent = inflowEnd ? sumDays(daily, addDays(inflowEnd, -13), 14) : null;
  const inflowBefore = inflowEnd ? sumDays(daily, addDays(inflowEnd, -27), 14) : null;

  const checks: Health14["checks"] = [];
  const net = moves.up + moves.gained - moves.down - moves.lost;
  checks.push({
    label: "순위",
    tone: net < 0 ? "warn" : "ok",
    text: net < 0 ? `내린 말이 더 많아요 (오름 ${moves.up + moves.gained} · 내림 ${moves.down + moves.lost}). 상권 탭 경쟁 가게 표에서 앞지른 가게를 먼저 보세요.` : `오른 말이 같거나 많아요 (오름 ${moves.up + moves.gained} · 내림 ${moves.down + moves.lost}).`,
  });
  if (inflowRecent !== null && inflowBefore !== null) {
    const fell = inflowRecent < inflowBefore * 0.8;
    checks.push({ label: "검색 유입", tone: fell ? "warn" : "ok", text: `${inflowRecent}회 ← 앞선 14일 ${inflowBefore}회${fell ? ". 20% 넘게 줄었어요. 어떤 말이 빠졌는지 스마트플레이스 탭에서 보세요." : ""}` });
  } else {
    checks.push({ label: "검색 유입", tone: "info", text: "28일 치 일별 자료가 없어서 비교하지 않았어요." });
  }
  if (inflowEnd && Date.parse(today) - Date.parse(inflowEnd) > 3 * 86_400_000) {
    checks.push({ label: "유입 자료", tone: "warn", text: `${inflowEnd}까지만 있어요. 최근 며칠은 안 보여요.` });
  }
  if (visitorGain !== null) {
    checks.push({ label: "방문자 리뷰", tone: visitorGain <= 0 ? "warn" : "ok", text: visitorGain <= 0 ? "14일 동안 늘지 않았어요. 결제 손님께 영수증 리뷰를 안내해 보세요 (대가 없이)." : `14일 동안 ${visitorGain}개 늘었어요.` });
  }
  if (blogGain !== null) checks.push({ label: "블로그 리뷰", tone: "info", text: `14일 동안 ${blogGain >= 0 ? "+" : ""}${blogGain}개` });
  checks.push({ label: "전화·길찾기", tone: "info", text: "자동 수집 안 됨. 스마트플레이스 통계 화면에서 직접 보세요." });
  return { from, to, moves, visitorGain, blogGain, inflowRecent, inflowBefore, inflowEnd, checks };
}

export interface WorkEffect {
  from: string | null;
  to: string | null;
  days: number | null;
  moves: ReturnType<typeof rankMoves> | null;
  inflowBefore: number | null;
  inflowAfter: number | null;
  overlaps: PlaceWork[]; // 앞뒤 7일 안의 다른 작업 — 있으면 원인을 가릴 수 없다
}

/** 작업 전날 순위 vs 최근 순위(작업 뒤 14일 안), 전후 7일 유입 */
export function workEffect(work: PlaceWork, all: PlaceWork[], history: RankPoint[], inflow: MarketInflow | null | undefined): WorkEffect {
  const dates = [...new Set(history.filter((p) => !p.note).map((p) => p.date))].sort();
  const from = nearestRead(dates, addDays(work.date, -1));
  const limit = addDays(work.date, 14);
  const after = dates.filter((d) => d > work.date && d <= limit);
  const to = after.length ? after[after.length - 1] : null;
  const daily = dailyMap(inflow);
  return {
    from,
    to,
    days: to ? Math.round((Date.parse(to) - Date.parse(work.date)) / 86_400_000) : null,
    moves: from && to ? rankMoves(history, from, to) : null,
    inflowBefore: sumDays(daily, addDays(work.date, -7), 7),
    inflowAfter: sumDays(daily, addDays(work.date, 1), 7),
    overlaps: all.filter((w) => w.id !== work.id && Math.abs(Date.parse(w.date) - Date.parse(work.date)) <= 7 * 86_400_000),
  };
}

/** 루틴이 밀렸나. 한 적 없으면 밀린 것으로 본다 */
export function routineDue(last: string | undefined, days: number, today: string): boolean {
  return !last || addDays(last, days) <= today;
}
