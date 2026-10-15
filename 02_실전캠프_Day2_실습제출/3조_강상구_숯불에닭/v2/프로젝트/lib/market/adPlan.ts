// 광고 시작안 — 파워링크를 아직 안 켠 가게가 "어느 키워드부터, 얼마로" 시작할지 고르는 계산.
// 카페스이 광고 노트의 틀(광고그룹·키워드별 성적·동네 먼저, 먼 손님은 파워링크로)과
// 배민아카데미 교육의 순서(메뉴 → TPO → 맛집)를 합쳤다. 숫자는 네이버 검색광고 키워드 도구·예상 입찰가에서 온다.
// 광고를 실제로 만들거나 켜는 일은 여기 없다 — 네이버 광고 화면에서 사장님이 직접 한다.
import { CORE_TAILS, FOOD_TAILS, isOurs, mainRegions, normalizeKeyword, volumeOf, type KeywordNavData, type VolumeMap } from "./keywordNav";

export const AD_PLAN_KEY = "ad_plan_v1";

export type AdGroup = "동네 메뉴" | "동네 상황" | "랜드마크" | "넓은 지역" | "기타";
export const AD_GROUP_ORDER: AdGroup[] = ["동네 메뉴", "동네 상황", "랜드마크", "넓은 지역", "기타"];
export const AD_GROUP_NOTE: Record<AdGroup, string> = {
  "동네 메뉴": "이미 먹을 걸 정한 근처 손님 — 전환이 가장 높아요. 여기부터 켜요",
  "동네 상황": "회식·가족모임·데이트처럼 상황으로 찾는 근처 손님 — 메뉴 다음",
  랜드마크: "큰 장소 근처에서 찾는 손님 — 플레이스 5칸과 같이 가요",
  "넓은 지역": "청주 전체·충북처럼 멀리 있는 손님 — 자연 순위로는 못 잡으니 파워링크가 닿는 자리. 비싸고 넓어서 마지막",
  기타: "어느 묶음인지 분명하지 않아요",
};

export interface BidInfo {
  top1: number | null; // 모바일 1위 예상 입찰가
  minShow: number | null; // 광고가 뜨기 시작하는 최소 입찰가
}

export interface AdCandidate {
  keyword: string;
  group: AdGroup;
  volume: number; // 월간 검색수
  comp: string | null; // 광고 경쟁 (낮음·중간·높음)
  adClicks: number | null; // 이 키워드 광고 전체가 한 달에 받는 클릭 (평균)
  adDepth: number | null; // 뜨는 광고 수
  bid: BidInfo;
  organicRank: number | null; // 우리 플레이스 자연 순위 (기록 있을 때)
  measured: boolean;
  score: number; // 클수록 먼저
  verdict: "추천" | "보류" | "나중";
  reason: string;
  estClicksPerMonth: number | null; // 최소 입찰가 근처로 켰을 때 기대 클릭 (거칠게)
  estCostPerMonth: number | null; // 그때 월 광고비 (거칠게)
}

const BROAD = (k: string, data: KeywordNavData) => {
  // 메인 권역(청주·율량동)보다 넓은 주소: 도 단위, "시" 단위 전체, 메인이 아닌 큰 주소
  const mains = mainRegions(data.regions, 3).map((r) => normalizeKeyword(r.keyword));
  const n = normalizeKeyword(k);
  if (/^(충청|충북|충남|전라|전북|전남|경상|경북|경남|경기|강원|제주)|도(맛집|식당|밥집|음식)/.test(n)) return true;
  // 메인 권역 가운데 가장 넓은 것(검색수 1등 = 보통 시)으로 시작하고 꼬리가 맛집류이면 넓은 지역
  const widest = mains[0];
  if (widest && n.startsWith(widest) && !mains.slice(1).some((m) => n.includes(m))) {
    const tail = n.slice(widest.length);
    if (CORE_TAILS.some((t) => tail === t || tail === t + "추천")) return true;
  }
  return false;
};

/** 키워드가 어느 광고그룹인가 */
export function adGroupOf(keyword: string, data: KeywordNavData): AdGroup {
  const n = normalizeKeyword(keyword);
  const mains = mainRegions(data.regions, 3).map((r) => normalizeKeyword(r.keyword));
  const landmark = data.regions.filter((r) => r.kind === "랜드마크").map((r) => normalizeKeyword(r.keyword));
  const menus = data.menus.map((m) => normalizeKeyword(m.keyword)).filter(Boolean);
  const tpo = data.tpo.map(normalizeKeyword).filter(Boolean);
  if (BROAD(n, data)) return "넓은 지역";
  if (landmark.some((l) => n.includes(l))) return "랜드마크";
  const inMain = mains.some((m) => n.includes(m)) || data.regions.some((r) => r.kind === "주소" && n.includes(normalizeKeyword(r.keyword)));
  if (!inMain) return "기타";
  const rest = mains.reduce((acc, m) => acc.replace(m, ""), n);
  if (menus.some((m) => rest.includes(m)) || /닭|고기|국수|닭발|구이/.test(rest)) return "동네 메뉴";
  if (tpo.some((t) => rest.includes(t)) || /회식|모임|데이트|가족|부모님|단체|점심|저녁|포장|배달|생일|접대|소개팅|아이/.test(rest)) return "동네 상황";
  if (CORE_TAILS.some((t) => rest.startsWith(t) || rest.endsWith(t))) return "동네 상황";
  return "기타";
}

const COMP_FACTOR: Record<string, number> = { 낮음: 1.0, 중간: 0.75, 높음: 0.55 };
const GROUP_FACTOR: Record<AdGroup, number> = { "동네 메뉴": 1.0, "동네 상황": 0.85, 랜드마크: 0.7, "넓은 지역": 0.4, 기타: 0.3 };

/**
 * 광고 시작안 후보. 검색수 ≥ minVolume 인 우리 키워드를 묶음별 점수로 정렬한다.
 * 점수 = log10(검색수) × 경쟁 계수 × 묶음 계수 × 입찰가 계수(싸면 ↑). 우리 플레이스가 이미 3위 안이면 "보류"(공짜 노출이 있다).
 */
export function planAds(
  data: KeywordNavData,
  volumes: VolumeMap,
  bids: Record<string, BidInfo>,
  ranks: Record<string, number | null>,
  opts: { minVolume?: number; limit?: number } = {},
): AdCandidate[] {
  const minVolume = opts.minVolume ?? 50;
  const nr: Record<string, number | null> = {};
  for (const [k, v] of Object.entries(ranks)) nr[normalizeKeyword(k)] = v;
  const bare = new Set(data.regions.map((r) => normalizeKeyword(r.keyword)));
  const keys = new Set<string>();
  for (const n of data.nav) if (n.axis === "조합") keys.add(normalizeKeyword(n.keyword));
  for (const k of Object.keys(volumes)) keys.add(normalizeKeyword(k));
  const out: AdCandidate[] = [];
  for (const k of keys) {
    if (bare.has(k) || !isOurs(k, data)) continue;
    const volume = volumeOf(k, data, volumes);
    if (volume === null || volume < minVolume) continue;
    const v = volumes[k];
    const bid = bids[k] ?? { top1: null, minShow: null };
    const group = adGroupOf(k, data);
    const measured = k in nr;
    const organicRank = measured ? nr[k] : null;
    const compF = COMP_FACTOR[v?.comp ?? ""] ?? 0.8;
    const bidF = bid.minShow === null ? 0.9 : bid.minShow <= 300 ? 1.1 : bid.minShow <= 700 ? 1.0 : bid.minShow <= 1500 ? 0.8 : 0.6;
    let score = Math.log10(Math.max(10, volume)) * compF * GROUP_FACTOR[group] * bidF;
    let verdict: AdCandidate["verdict"] = "추천";
    let reason = "";
    if (measured && organicRank !== null && organicRank <= 3) {
      verdict = "보류";
      reason = `플레이스 자연 순위 ${organicRank}위 — 공짜로 이미 보여요. 광고는 나중에`;
      score *= 0.5;
    } else if (group === "넓은 지역") {
      verdict = "나중";
      reason = "넓고 비싼 자리 — 동네 키워드가 자리 잡은 뒤에";
    } else if (group === "기타") {
      verdict = "나중";
      reason = "묶음이 분명하지 않아요 — 직접 보고 정하기";
    } else {
      const bits: string[] = [];
      bits.push(`검색 ${volume.toLocaleString("ko-KR")}`);
      if (v?.comp) bits.push(`경쟁 ${v.comp}`);
      if (bid.minShow !== null) bits.push(`최소 ${bid.minShow.toLocaleString("ko-KR")}원`);
      if (measured) bits.push(organicRank === null ? "자연 순위 50위 밖" : `자연 ${organicRank}위`);
      reason = bits.join(" · ");
    }
    // 거친 기대값: 이 키워드 광고 전체 월 클릭의 1/광고수 만큼을 우리가 받고, 클릭마다 최소 입찰가 근처를 낸다
    const share = v?.adClicks !== null && v?.adClicks !== undefined && v.adDepth ? Math.max(1, Math.round(v.adClicks / Math.max(1, v.adDepth))) : v?.adClicks ?? null;
    const estClicksPerMonth = share;
    const estCostPerMonth = share !== null && bid.minShow !== null ? share * bid.minShow : null;
    out.push({ keyword: k, group, volume, comp: v?.comp ?? null, adClicks: v?.adClicks ?? null, adDepth: v?.adDepth ?? null, bid, organicRank, measured, score, verdict, reason, estClicksPerMonth, estCostPerMonth });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, opts.limit ?? 60);
}

/** 묶음별로 나눠 담기 (묶음 순서 고정) */
export function groupCandidates(cands: AdCandidate[]): { group: AdGroup; items: AdCandidate[] }[] {
  return AD_GROUP_ORDER.map((group) => ({ group, items: cands.filter((c) => c.group === group) })).filter((g) => g.items.length > 0);
}

// ── 사장님이 고른 시작안 (저장) ─────────────────────────────────────────
export interface AdPlanItem {
  keyword: string;
  group: AdGroup;
  bid: number | null; // 넣기로 한 입찰가
  status: "예정" | "켬" | "꺼둠";
}
export interface AdPlan {
  dailyBudget: number; // 일 예산 (원)
  items: AdPlanItem[];
  log: { date: string; text: string }[]; // 바꾼 기록 (카페스이 광고 노트의 "바꾼 기록")
  startedAt: string | null; // 광고를 켠 날
}
export const EMPTY_AD_PLAN: AdPlan = { dailyBudget: 10000, items: [], log: [], startedAt: null };

/** 일 예산으로 하루에 받을 수 있는 클릭 — 고른 키워드의 입찰가 평균으로 거칠게 */
export function budgetOutlook(plan: AdPlan): { avgBid: number | null; clicksPerDay: number | null; monthCost: number } {
  const bids = plan.items.filter((i) => i.status !== "꺼둠" && i.bid !== null).map((i) => i.bid as number);
  const avgBid = bids.length ? Math.round(bids.reduce((a, b) => a + b, 0) / bids.length) : null;
  return { avgBid, clicksPerDay: avgBid ? Math.floor(plan.dailyBudget / avgBid) : null, monthCost: plan.dailyBudget * 30 };
}

/** 시작 전 체크리스트 — 카페스이 광고 노트 "지금 광고 세팅"에 들어가는 항목을 시작 순서로 */
export const START_CHECKLIST = [
  "네이버 광고 → 캠페인 만들기: 파워링크, 하루 예산은 시작안 금액으로",
  "광고그룹을 묶음별로 따로 만들기 (동네 메뉴 / 동네 상황 / 랜드마크) — 성적을 묶음별로 보려고",
  "지역 설정: 청주시(또는 청원구)만, 노출 시간: 영업시간 + 1시간 전",
  "모바일 입찰가를 PC보다 높게 — 손님 대부분이 휴대폰으로 찾아요",
  "연결 주소(랜딩): 네이버 플레이스 페이지 또는 네이버 예약 — 홈페이지가 없어도 돼요",
  "소재(광고 문구)에 메뉴 이름과 동네 이름을 그대로 — 검색한 말이 문구에 있으면 더 눌러요",
  "2주 뒤 이 화면에서 성적 보기 — 클릭 0인 키워드는 끄고, 클릭 1번 값이 비싼 키워드는 입찰가 내리기",
] as const;

/** 지역 꼬리말인지 (광고 소재 문구용 힌트) */
export const isFoodTail = (w: string) => FOOD_TAILS.includes(normalizeKeyword(w));
