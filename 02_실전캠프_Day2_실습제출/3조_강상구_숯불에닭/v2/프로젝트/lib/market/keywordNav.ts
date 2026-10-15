// 키워드 네비게이션 — 배민아카데미 네이버 키워드 교육(스시도쿠 방식)의 틀을 장부 안에서 돌린다.
// 사장님이 교육에서 만든 엑셀(지역·랜드마크·메뉴·TPO 키워드와 월간 검색수)을 읽어
//   ① 지역 키워드 등급(1등·2등·3등) ② 지역 × 꼬리 조합 ③ 유형별 할 일 ④ 대표 키워드 5칸 초안 을 낸다.
// 강의 글은 여기 없다 — 판정 기준(숫자)과 사장님 자료만 쓴다. 검색수는 네이버 검색광고 키워드 도구(도우미) 또는 엑셀 값.

export const KEYWORD_NAV_KEY = "keyword_nav_v1";
export const KEYWORD_VOLUMES_KEY = "keyword_volumes_v1";

export type RegionKind = "주소" | "랜드마크";
export type RegionGrade = "1등" | "2등" | "3등";
/** 플레이스에서 그 키워드로 뜨게 하는 방법 — 엑셀 네비게이션 시트의 "유형" */
export type PlaceType = "대표상호" | "손님리뷰" | "한참" | "메뉴" | "기타";

export interface RegionRow {
  keyword: string;
  kind: RegionKind;
  volume: number | null; // 지역명만의 월간 검색수
  foodVolume: number | null; // 지역명 + 맛집 월간 검색수 (등급 기준)
}
export interface NavRow {
  keyword: string;
  volume: number | null;
  axis: "주소" | "조합";
  type: PlaceType | null;
  guide: string | null; // 엑셀 메모 ("대표키워드에 OO 삽입완료" 등)
  rankNote: number | null; // 엑셀에 적어 둔 순위
}
export interface KeywordNavData {
  fileName: string;
  uploadedAt: string;
  regions: RegionRow[];
  menus: { keyword: string; volume: number | null }[]; // 메뉴 (volume = 메인 지역 + 메뉴 검색수)
  tpo: string[];
  nav: NavRow[];
  brandWords: { seen: string; input: string }[]; // 대표상호 키워드 목록 (검색에 보이는 말 → 5칸에 넣는 말)
}

export interface VolumeEntry {
  total: number;
  pc: number;
  mobile: number;
  under10: boolean;
  at: string; // 조회한 날짜
  related?: boolean; // 내가 물은 게 아니라 네이버가 덧붙여 준 연관 키워드
  comp?: string | null; // 광고 경쟁 (낮음·중간·높음)
  adClicks?: number | null; // 이 키워드 광고 전체의 월 평균 클릭
  adDepth?: number | null; // 뜨는 광고 수
}
export type VolumeMap = Record<string, VolumeEntry>;

export const normalizeKeyword = (k: string) => k.replace(/\s+/g, "").trim();

const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (/^<\s*10$/.test(s)) return 5;
  if (!/\d/.test(s)) return null;
  const n = Number(s.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const toText = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());

// ── 등급 ─────────────────────────────────────────────────────────────────
/** 지역 + 맛집 월간 검색수로 등급. 1,000 이상 1등(모든 꼬리와 조합), 10~999 2등(맛집·식당·핵심 메뉴만), 그 밖 3등(조합 안 함) */
export function regionGrade(foodVolume: number | null): RegionGrade {
  if (foodVolume === null) return "3등";
  if (foodVolume >= 1000) return "1등";
  if (foodVolume >= 10) return "2등";
  return "3등";
}

/** 닉네임 주소(율량동·왕십리 같은 생활 지명)+맛집이 구+맛집의 절반 이상이면 구와 같이 쓴다 */
export const nicknameCountsAsDistrict = (nickFood: number, districtFood: number) => districtFood > 0 && nickFood >= districtFood * 0.5;

/** 도 단위처럼 생활권이 아닌 넓은 주소 (충청도·충북·경기) — 메인 권역에서 뺀다 */
export const isProvinceWord = (k: string) => /^(충청|충북|충남|전라|전북|전남|경상|경북|경남|경기|강원|제주)$|도$/.test(normalizeKeyword(k));

/** 메인 권역 — 1등 주소 가운데 검색수 가장 큰 것들(도 단위 제외). 동(면)+맛집이 구+맛집보다 크면 동이 메인(승격) */
export function mainRegions(regions: RegionRow[], limit = 3): RegionRow[] {
  const firsts = regions.filter((r) => r.kind === "주소" && regionGrade(r.foodVolume) === "1등");
  const local = firsts.filter((r) => !isProvinceWord(r.keyword));
  const sorted = (local.length ? local : firsts).sort((a, b) => (b.foodVolume ?? 0) - (a.foodVolume ?? 0));
  const out: RegionRow[] = [];
  for (const r of sorted) {
    // 이미 고른 권역을 품은 긴 이름(청주 + 율량동 → 청주율량동)은 같은 곳이라 뺀다
    if (out.some((o) => normalizeKeyword(r.keyword).includes(normalizeKeyword(o.keyword)))) continue;
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

// ── 조합 ─────────────────────────────────────────────────────────────────
/** 2등 지역과도 붙일 수 있는 "강한 꼬리" */
export const CORE_TAILS = ["맛집", "식당", "밥집", "음식점"];

export interface Combo {
  keyword: string;
  region: string;
  tail: string;
  grade: RegionGrade;
}

/** 지역 × 꼬리. 1등은 모든 꼬리, 2등은 강한 꼬리 + 핵심 메뉴만, 3등은 안 만든다 */
export function buildCombos(regions: RegionRow[], tails: string[], coreMenus: string[] = []): Combo[] {
  const out: Combo[] = [];
  const seen = new Set<string>();
  const core = new Set([...CORE_TAILS, ...coreMenus.map(normalizeKeyword)]);
  for (const r of regions) {
    const grade = regionGrade(r.foodVolume);
    if (grade === "3등") continue;
    for (const t0 of tails) {
      const t = normalizeKeyword(t0);
      if (!t) continue;
      if (grade === "2등" && !core.has(t)) continue;
      const k = normalizeKeyword(r.keyword) + t;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ keyword: k, region: r.keyword, tail: t, grade });
    }
  }
  return out;
}

// ── 검색수 찾기 ─────────────────────────────────────────────────────────
/** 조회한 값(최신) → 엑셀 값 순으로 */
export function volumeOf(keyword: string, data: KeywordNavData | null, volumes: VolumeMap): number | null {
  const k = normalizeKeyword(keyword);
  const v = volumes[k];
  if (v) return v.total;
  const row = data?.nav.find((n) => normalizeKeyword(n.keyword) === k);
  if (row && row.volume !== null) return row.volume;
  const reg = data?.regions.find((r) => normalizeKeyword(r.keyword) === k);
  if (reg && reg.volume !== null) return reg.volume;
  return null;
}

// ── 유형별 할 일 ───────────────────────────────────────────────────────
export const TYPE_ACTION: Record<PlaceType, string> = {
  대표상호: "5칸(대표 키워드)이나 상호에 그 말을 넣어야 뜬다",
  손님리뷰: "5칸에 넣어도 안 뜬다 — 영수증 리뷰 버튼·블로그 리뷰로 올린다",
  한참: "지역+맛집 같은 큰 말 — 플레이스 지수(클릭·저장·전화·예약)를 오래 쌓아야 한다",
  메뉴: "메뉴판에 그 메뉴가 정확히 있으면 뜬다 — 5칸에 넣을 필요 없다",
  기타: "유형을 아직 안 정했다 — 상위 가게들 5칸·상호를 보고 정한다",
};

/** 엑셀 유형 글자 → PlaceType */
export function placeType(raw: string | null | undefined): PlaceType | null {
  const s = toText(raw);
  if (!s) return null;
  if (s.includes("대표상호")) return "대표상호";
  if (s.includes("손님")) return "손님리뷰";
  if (s.includes("한참")) return "한참";
  if (s.includes("메뉴")) return "메뉴";
  return "기타";
}

// ── 기회 키워드 (인사이트) ─────────────────────────────────────────────
export interface Opportunity {
  keyword: string;
  volume: number;
  type: PlaceType | null;
  rank: number | null; // 추적 기록의 최근 순위 (null = 기록 없음 또는 50위 밖)
  measured: boolean; // 순위를 재 본 적 있음
  tracked: boolean;
  reason: string;
  guide: string | null;
}

const normalizeRanks = (ranks: Record<string, number | null>) => {
  const out: Record<string, number | null> = {};
  for (const [k, v] of Object.entries(ranks)) out[normalizeKeyword(k)] = v;
  return out;
};

/** 식당 손님이 치는 꼬리말 — 지역 말과 함께 들어 있어야 "우리 키워드"로 본다 */
export const FOOD_TAILS = ["맛집", "식당", "밥집", "음식", "먹거리", "카페", "술집", "고기", "닭", "회식", "데이트", "점심", "저녁", "모임", "가족", "부모님", "포장", "배달", "단체", "현지인", "가성비", "핫플", "분위기", "야장", "룸"];

/** 우리 키워드인가 — 우리 지역 말 + 식당 꼬리말(또는 엑셀의 메뉴·TPO)이 같이 들어 있어야. 네이버 연관 키워드(항공권·주차장·가볼만한곳)를 걸러 낸다 */
export function isOurs(keyword: string, data: KeywordNavData | null): boolean {
  if (!data) return true;
  const k = normalizeKeyword(keyword);
  if (!data.regions.some((r) => k.includes(normalizeKeyword(r.keyword)))) return false;
  const tails = [...FOOD_TAILS, ...data.menus.map((m) => normalizeKeyword(m.keyword)), ...data.tpo.map(normalizeKeyword)];
  return tails.some((t) => t && k.includes(t));
}

/**
 * 검색수가 있는데(≥ minVolume) 아직 상위(≤ goodRank)가 아닌 키워드. 검색수 큰 순.
 * ranks: 추적 기록의 최근 순위 (키워드 → 순위, null = 50위 밖). 기록이 없으면 "아직 안 재 봤다"로 둔다.
 */
export function opportunities(data: KeywordNavData, volumes: VolumeMap, ranks: Record<string, number | null>, tracked: string[], opts: { minVolume?: number; goodRank?: number; limit?: number } = {}): Opportunity[] {
  const minVolume = opts.minVolume ?? 100;
  const goodRank = opts.goodRank ?? 5;
  const trackedSet = new Set(tracked.map(normalizeKeyword));
  const nr = normalizeRanks(ranks);
  const out: Opportunity[] = [];
  const seen = new Set<string>();
  const bare = new Set(data.regions.map((r) => normalizeKeyword(r.keyword))); // 지역 이름 그 자체(청주공항)는 조합이 아니다
  const keys = [...data.nav.filter((n) => n.axis === "조합").map((n) => n.keyword), ...Object.keys(volumes).filter((k) => isOurs(k, data) && !bare.has(normalizeKeyword(k)))];
  for (const raw of keys) {
    const k = normalizeKeyword(raw);
    if (seen.has(k)) continue;
    seen.add(k);
    const vol = volumeOf(k, data, volumes);
    if (vol === null || vol < minVolume) continue;
    const navRow = data.nav.find((x) => normalizeKeyword(x.keyword) === k);
    const measured = k in nr;
    const rank = measured ? nr[k] : null;
    if (measured && rank !== null && rank <= goodRank) continue; // 이미 잡은 키워드
    const reason = !measured ? "아직 순위를 안 재 봤어요" : rank === null ? "50위 밖" : `${rank}위 — 더 올릴 수 있어요`;
    out.push({ keyword: k, volume: vol, type: navRow?.type ?? null, rank, measured, tracked: trackedSet.has(k), reason, guide: navRow?.guide ?? null });
  }
  return out.sort((a, b) => b.volume - a.volume).slice(0, opts.limit ?? 40);
}

// ── 대표 키워드 5칸 초안 ───────────────────────────────────────────────
export const SLOT_MAX = 15; // 스마트플레이스 대표 키워드 한 칸 글자 수
export interface SlotDraft {
  slots: string[]; // 5칸
  used: { word: string; volume: number; keyword: string }[]; // 넣은 말 (검색수 큰 순)
  leftover: { word: string; volume: number }[]; // 자리가 없어 못 넣은 말
  skipped: { word: string; why: string }[]; // 안 넣은 말과 이유
}

const ADMIN_SUFFIX = /(특별시|광역시|시|구|군|동|읍|면|리)$/;

/** 행정구역 이름인가 — 주소 목록에 있거나, 주소 + 시·구·동 같은 꼬리 (청주시·청원구) */
export function isAddressWord(word: string, addressWords: Iterable<string>): boolean {
  const w = normalizeKeyword(word);
  const set = new Set([...addressWords].map(normalizeKeyword));
  if (set.has(w)) return true;
  const stem = w.replace(ADMIN_SUFFIX, "");
  return stem !== w && stem.length >= 2 && set.has(stem);
}

/** 조합 키워드에서 "지역을 뺀 꼬리"를 꺼낸다 — 청주포장맛집 → 포장 (맛집·식당 같은 큰 말은 뺀다). 지역만 남으면 그 지역(명암타워맛집 → 명암타워) */
export function brandWordOf(keyword: string, regions: string[], brandWords: { seen: string; input: string }[]): string | null {
  let k = normalizeKeyword(keyword);
  for (const big of CORE_TAILS) k = k.replace(big, "");
  k = k.replace(/(추천|근처|주변)$/g, "");
  if (!k) return null;
  const regs = [...regions].map(normalizeKeyword).sort((a, b) => b.length - a.length);
  if (regs.includes(k) || isAddressWord(k, regs)) return k; // 지역·행정구역 그대로
  const hit = regs.find((r) => k.startsWith(r) || k.endsWith(r));
  if (hit) k = k.replace(hit, "");
  if (!k) return hit ?? null;
  const map = brandWords.find((b) => normalizeKeyword(b.seen) === k);
  return map ? normalizeKeyword(map.input) : k;
}

/**
 * 대표상호 유형 키워드의 "넣을 말"을 검색수 큰 순으로 5칸(한 칸 15자)에 채운다.
 * 상호에 이미 있는 말, 주소(행정구역) 그대로인 말은 넣지 않는다 — 네이버가 이미 안다.
 */
export function draftSlots(data: KeywordNavData, volumes: VolumeMap, opts: { shopName?: string; addressWords?: string[]; fixed?: string[] } = {}): SlotDraft {
  const regionNames = data.regions.map((r) => r.keyword);
  const addressWords = new Set((opts.addressWords ?? data.regions.filter((r) => r.kind === "주소").map((r) => r.keyword)).map(normalizeKeyword));
  const shop = normalizeKeyword(opts.shopName ?? "");
  const cands = new Map<string, { volume: number; keyword: string }>();
  for (const n of data.nav) {
    if (n.type !== "대표상호" || n.axis !== "조합") continue; // 랜드마크 이름만의 검색수(호텔 찾는 사람 등)는 식당 수요가 아니라 조합 행만 본다
    const vol = volumeOf(n.keyword, data, volumes) ?? 0;
    if (vol < 10) continue;
    const w = brandWordOf(n.keyword, regionNames, data.brandWords);
    if (!w) continue;
    const prev = cands.get(w);
    if (!prev || prev.volume < vol) cands.set(w, { volume: Math.max(vol, prev?.volume ?? 0), keyword: n.keyword });
  }
  const sorted = [...cands.entries()].sort((a, b) => b[1].volume - a[1].volume);
  const slots: string[] = (opts.fixed ?? []).slice(0, 5).map(normalizeKeyword);
  while (slots.length < 5) slots.push("");
  const used: SlotDraft["used"] = [];
  const leftover: SlotDraft["leftover"] = [];
  const skipped: SlotDraft["skipped"] = [];
  const placed = () => slots.join("|");
  for (const [word, { volume, keyword }] of sorted) {
    if (shop && shop.includes(word)) {
      skipped.push({ word, why: "상호에 이미 있어요" });
      continue;
    }
    if (isAddressWord(word, addressWords)) {
      skipped.push({ word, why: "주소 그대로인 말은 네이버가 이미 알아요" });
      continue;
    }
    if (placed().includes(word)) {
      skipped.push({ word, why: "이미 들어 있어요" });
      continue;
    }
    if (word.length > SLOT_MAX) {
      skipped.push({ word, why: "한 칸(15자)보다 길어요" });
      continue;
    }
    const i = slots.findIndex((s) => s.length + word.length <= SLOT_MAX);
    if (i < 0) {
      leftover.push({ word, volume });
      continue;
    }
    slots[i] += word;
    used.push({ word, volume, keyword });
  }
  return { slots, used, leftover, skipped };
}

/** 지금 5칸에 들어 있는 말과 초안을 비교 — 초안엔 있는데 지금 칸엔 없는 말, 지금 칸엔 있는데 근거(검색수) 없는 말 */
export function compareSlots(current: string[], draft: SlotDraft, knownWords: string[] = []): { missing: string[]; unknown: string[] } {
  const cur = current.map(normalizeKeyword).join("|");
  const missing = draft.used.filter((u) => !cur.includes(u.word)).map((u) => u.word);
  const words = [...new Set([...draft.used.map((u) => u.word), ...draft.leftover.map((l) => l.word), ...knownWords.map(normalizeKeyword)])].filter((w) => w.length >= 2);
  const unknown: string[] = [];
  for (const slot of current.map(normalizeKeyword)) {
    let rest = slot;
    for (const w of [...words].sort((a, b) => b.length - a.length)) rest = rest.split(w).join("|");
    for (const piece of rest.split("|")) if (piece.length >= 2) unknown.push(piece);
  }
  return { missing, unknown };
}

// ── 엑셀 읽기 ──────────────────────────────────────────────────────────
type Grid = unknown[][];
export interface Workbook {
  sheets: Record<string, Grid>; // 시트 이름 → 행렬 (header: 1)
}

const findSheet = (wb: Workbook, ...names: string[]): Grid | null => {
  for (const n of names) {
    const key = Object.keys(wb.sheets).find((s) => s.replace(/\s/g, "").includes(n));
    if (key) return wb.sheets[key];
  }
  return null;
};

/** 교육 엑셀(키워드정리·네비게이션·대표상호키워드 시트)을 읽는다. 시트가 없으면 그 부분만 빈다 */
export function parseWorkbook(wb: Workbook, fileName: string, uploadedAt: string): KeywordNavData {
  const regions: RegionRow[] = [];
  const menus: KeywordNavData["menus"] = [];
  const tpo: string[] = [];
  const seenR = new Set<string>();
  const summary = findSheet(wb, "키워드정리");
  if (summary) {
    // 열: B 주소 · C 검색수 · D +맛집 · E 랜드마크 · F 검색수 · G +맛집 · H 메뉴 · I 지역+메뉴 검색수 · J TPO
    for (const row of summary.slice(3)) {
      const addr = toText(row[1]);
      if (addr && !seenR.has(addr)) {
        seenR.add(addr);
        regions.push({ keyword: addr, kind: "주소", volume: toNum(row[2]), foodVolume: toNum(row[3]) });
      }
      const lm = toText(row[4]);
      if (lm && !seenR.has(lm) && !/검색|노출|입력/.test(lm)) {
        seenR.add(lm);
        regions.push({ keyword: lm, kind: "랜드마크", volume: toNum(row[5]), foodVolume: toNum(row[6]) });
      }
      const menu = toText(row[7]);
      if (menu && menu.length <= 10 && !menus.some((m) => m.keyword === menu)) menus.push({ keyword: menu, volume: toNum(row[8]) });
      const t = toText(row[9]);
      if (t && !tpo.includes(t)) tpo.push(t);
    }
  }
  const nav: NavRow[] = [];
  const navSheet = findSheet(wb, "네비게이션");
  if (navSheet) {
    // 열: A 유형(주소/조합) · B 키워드 · C 월간 검색수 · F 순위 · G 플레이스 유형 · I 플레이스 가이드
    for (const row of navSheet.slice(2)) {
      const kw = toText(row[1]);
      const axis = toText(row[0]);
      if (!kw || (axis !== "주소" && axis !== "조합")) continue;
      nav.push({ keyword: kw, volume: toNum(row[2]), axis, type: placeType(toText(row[6])), guide: toText(row[8]) || null, rankNote: toNum(row[5]) });
    }
  }
  const brandWords: KeywordNavData["brandWords"] = [];
  const brand = findSheet(wb, "대표상호키워드", "대표상호");
  if (brand) {
    for (const row of brand.slice(1)) {
      const seen = toText(row[1]);
      const input = toText(row[2]);
      if (seen && input) brandWords.push({ seen, input });
    }
  }
  return { fileName, uploadedAt, regions, menus, tpo, nav, brandWords };
}

/** 메뉴 장악 현황 — 메인 권역 × 메뉴 조합 가운데 검색수 있는 것의 순위 */
export function menuCoverage(data: KeywordNavData, volumes: VolumeMap, ranks: Record<string, number | null>, minVolume = 50): { keyword: string; volume: number; rank: number | null; measured: boolean }[] {
  const mains = mainRegions(data.regions, 2).map((r) => normalizeKeyword(r.keyword));
  const nr = normalizeRanks(ranks);
  const out: { keyword: string; volume: number; rank: number | null; measured: boolean }[] = [];
  for (const m of mains) {
    for (const menu of data.menus) {
      const k = m + normalizeKeyword(menu.keyword);
      const vol = volumeOf(k, data, volumes);
      if (vol === null || vol < minVolume) continue;
      out.push({ keyword: k, volume: vol, rank: nr[k] ?? null, measured: k in nr });
    }
  }
  return out.sort((a, b) => b.volume - a.volume);
}
