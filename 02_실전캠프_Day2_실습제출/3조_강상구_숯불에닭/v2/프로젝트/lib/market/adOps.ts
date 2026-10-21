// 광고 운영 — 카페스이 광고 노트(2026-10-20 받은 자료)에서 우리에게 없던 것을 숯불에닭에 맞게 옮긴 것.
//  1) 주간 광고 기록: 광고비 옆에 장부 매출을 자동으로 붙이고 "이번 주 바꾼 것 하나"를 적는다.
//     늘릴지 줄일지는 클릭이 아니라 매출(손님)로 정한다. 한 주에 하나만 바꾼다.
//  2) 더 날카로운 경고: 광고 문구 없는 묶음, 최소 노출선보다 낮은 입찰가, 충전금 남은 날, 묶음별 클릭·순위 급락, 유난히 비싼 묶음.
//  3) 예산: 월 상한 안에서 캠페인별 하루 한도 × 31일, 지난 30일 실제 광고비.
//  4) 손님 1명당 광고비 한도 = 손님 1명이 1년 동안 남겨 주는 이익 ÷ 3.
//  5) 운영 점검 목록 (했어요 표시).
// 숫자는 도우미가 네이버 검색광고 API 에서 읽어 온 것. 광고비(cost)는 VAT 뺀 금액이라, 청구 기준으로 볼 때는 1.1 을 곱한다.
import { channelKind, type Channel } from "../categories";
import { shiftDate } from "../daily";
import type { DailySale } from "../types";
import { totals, type NaverAdExport, type Totals, type AdAlert } from "./adStats";

export const AD_WEEK_NOTES_KEY = "ad_week_notes_v1"; // { "2026-10-19": "랜드마크 입찰가 70→300" } 주(월요일)별 한 줄
export const AD_BUDGET_KEY = "ad_budget_v1"; // { monthCap, ticket, visitsPerYear, marginPct }
export const AD_OPS_KEY = "ad_ops_checks_v1"; // { 항목id: "했어요" 누른 날 }

export const VAT = 1.1;
const won = (n: number) => Math.round(n).toLocaleString("ko-KR");

/** 광고비 전체를 셀 id — 캠페인 줄(파워링크·플레이스 다 들어감). 캠페인 성적이 없으면 키워드 줄로 */
export function spendIds(d: NaverAdExport): Set<string> {
  const camp = new Set(d.campaigns.map((c) => c.id));
  if (d.stats.some((r) => camp.has(r.id))) return camp;
  return new Set(d.keywords.map((k) => k.id));
}

/** 플레이스 캠페인의 광고그룹 — 키워드가 없고, 광고 문구 수(adCount)를 API 가 0 으로 돌려준다 */
export function placeGroupIds(d: NaverAdExport): Set<string> {
  const place = new Set(d.campaigns.filter((c) => c.type === "PLACE").map((c) => c.id));
  return new Set(d.groups.filter((g) => place.has(g.campaignId)).map((g) => g.id));
}

/** 그 날이 속한 주의 월요일 */
export function mondayOf(date: string): string {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0=일
  return shiftDate(date, dow === 0 ? -6 : 1 - dow);
}

// ── 1) 주간 광고 기록 ───────────────────────────────────────────
export interface WeekRow {
  monday: string;
  sunday: string;
  t: Totals; // 광고 (VAT 뺀 광고비)
  costVat: number; // 청구 기준 광고비
  sales: number; // 장부 전체 매출 (주문일 기준)
  hall: number; // 홀 매출 (배달앱 빼고 — 카드·현금·이체)
  adShare: number | null; // 광고비 ÷ 홀 매출 (%)
  changes: string[]; // 그 주에 "바꾼 기록"에 적힌 것
  note: string; // 사장님이 적은 "이번 주 바꾼 것 하나"
  partial: boolean; // 아직 끝나지 않은 주
}

export function weeklyRecord(
  d: NaverAdExport | null,
  sales: DailySale[],
  channels: Channel[],
  log: { date: string; text: string }[],
  notes: Record<string, string>,
  today: string,
  weeks = 8,
): WeekRow[] {
  const ids = d ? spendIds(d) : new Set<string>();
  const thisMonday = mondayOf(today);
  const out: WeekRow[] = [];
  for (let i = 0; i < weeks; i++) {
    const monday = shiftDate(thisMonday, -7 * i);
    const sunday = shiftDate(monday, 6);
    const t = d ? totals(d.stats, ids, monday, sunday) : { imp: 0, clk: 0, cost: 0, ctr: null, cpc: null, avgRank: null };
    let all = 0;
    let hall = 0;
    for (const s of sales) {
      if (s.date < monday || s.date > sunday) continue;
      all += s.amount;
      if (channelKind(s.channel, channels) !== "delivery") hall += s.amount;
    }
    const costVat = Math.round(t.cost * VAT);
    out.push({
      monday,
      sunday,
      t,
      costVat,
      sales: all,
      hall,
      adShare: hall > 0 && costVat > 0 ? Math.round((costVat / hall) * 1000) / 10 : null,
      changes: log.filter((l) => l.date >= monday && l.date <= sunday).map((l) => l.text),
      note: notes[monday] ?? "",
      partial: sunday >= today,
    });
  }
  return out;
}

/** 이번 주(또는 지난주) 홀 매출을 그 앞 4주 평균과 비교 — 광고를 늘릴지 줄일지 매출로 보는 한 줄 */
export function hallVersusUsual(rows: WeekRow[]): { week: WeekRow; usual: number; pct: number | null } | null {
  const done = rows.filter((r) => !r.partial);
  if (!done.length) return null;
  const week = done[0];
  const prev = done.slice(1, 5).filter((r) => r.hall > 0);
  if (!prev.length) return { week, usual: 0, pct: null };
  const usual = Math.round(prev.reduce((a, r) => a + r.hall, 0) / prev.length);
  return { week, usual, pct: usual ? Math.round(((week.hall - usual) / usual) * 100) : null };
}

// ── 2) 더 날카로운 경고 ─────────────────────────────────────────
/** 키워드가 실제로 쓰는 입찰가 (묶음 입찰가를 쓰면 묶음 것) */
export function effectiveBid(d: NaverAdExport, k: NaverAdExport["keywords"][number]): number | null {
  if (k.useGroupBid) return d.groups.find((g) => g.id === k.groupId)?.bid ?? null;
  return k.bid;
}

/** 켜진 키워드 중 입찰가가 네이버 최소 노출선보다 낮아 아예 안 뜨는 것 */
export function belowMinBid(d: NaverAdExport): { keyword: string; group: string; bid: number; min: number }[] {
  const onGroups = new Map(d.groups.filter((g) => g.on).map((g) => [g.id, g.name]));
  const out: { keyword: string; group: string; bid: number; min: number }[] = [];
  for (const k of d.keywords) {
    if (!k.on || !onGroups.has(k.groupId) || k.minBid == null) continue;
    const bid = effectiveBid(d, k);
    if (bid !== null && bid < k.minBid) out.push({ keyword: k.keyword, group: onGroups.get(k.groupId)!, bid, min: k.minBid });
  }
  return out.sort((a, b) => b.min - b.bid - (a.min - a.bid));
}

/** 충전금이 며칠치 남았나 (최근 14일 하루 평균, VAT 포함) */
export function bizmoneyDays(d: NaverAdExport, today: string): { left: number; perDay: number; days: number | null } | null {
  if (d.bizmoney == null) return null;
  const ids = spendIds(d);
  const from = shiftDate(today, -13);
  const t = totals(d.stats, ids, from, today);
  // 최근 14일 중 광고를 켠 뒤 지난 날로 나눈다 — 켠 지 하루면 하루치로 (14로 나누면 며칠치가 부풀려진다)
  //  끝은 성적이 들어온 마지막 날 — 오늘처럼 아직 성적이 없는 날까지 세면 하루 광고비가 작게 잡힌다
  const spent = d.stats.filter((r) => ids.has(r.id) && r.date >= from && r.date <= today && r.cost > 0).map((r) => r.date).sort();
  const last = d.stats.filter((r) => r.date <= today).map((r) => r.date).sort().pop() ?? today;
  const days = spent.length ? Math.floor((Date.parse(last) - Date.parse(spent[0])) / 86_400_000) + 1 : 14;
  const perDay = Math.round((t.cost * VAT) / Math.max(1, Math.min(14, days)));
  return { left: d.bizmoney, perDay, days: perDay > 0 ? Math.floor(d.bizmoney / perDay) : null };
}

/** 광고그룹 하나의 기간 합계 — 그룹 자체 성적 줄이 있으면 그것, 없으면 그 키워드 합 (플레이스 그룹은 키워드가 없다) */
export function groupTotals(d: NaverAdExport, groupId: string, from: string, to: string): Totals {
  const own = totals(d.stats, new Set([groupId]), from, to);
  if (own.imp || own.clk || own.cost) return own;
  return totals(d.stats, new Set(d.keywords.filter((k) => k.groupId === groupId).map((k) => k.id)), from, to);
}

export function adOpsAlerts(d: NaverAdExport, today: string): AdAlert[] {
  const out: AdAlert[] = [];
  const from = shiftDate(today, -6);
  const uFrom = shiftDate(from, -28);
  const uTo = shiftDate(from, -1);

  // 광고 문구 없는 묶음 — 키워드가 있어도 광고가 안 나간다
  const place = placeGroupIds(d);
  const noCopy = d.groups.filter((g) => g.on && g.adCount === 0 && !place.has(g.id));
  if (noCopy.length) out.push({ level: "위험", text: `광고 문구가 없는 묶음 ${noCopy.length}개 (${noCopy.map((g) => g.name).join(", ")}) — 문구가 없으면 광고가 안 나가요. 광고주센터에서 문구를 하나 이상 넣으세요` });

  // 최소 노출선보다 낮은 입찰가
  const low = belowMinBid(d);
  const onKw = d.keywords.filter((k) => k.on && d.groups.some((g) => g.id === k.groupId && g.on));
  if (low.length) {
    const share = onKw.length ? low.length / onKw.length : 0;
    out.push({
      level: share >= 0.3 ? "위험" : "주의",
      text: `입찰가가 네이버 최소 노출선보다 낮은 키워드 ${low.length}개 — 이 키워드들은 아예 안 떠요 (${low
        .slice(0, 4)
        .map((x) => `${x.keyword} ${won(x.bid)}→${won(x.min)}원`)
        .join(", ")}${low.length > 4 ? " …" : ""}). 핵심 키워드만 최소선까지 올리세요`,
    });
  }

  // 7일째 노출 0 (켜진 캠페인이 있는데)
  const ids = spendIds(d);
  const week = totals(d.stats, ids, from, today);
  const reviewing = onKw.filter((k) => k.inspect === "UNDER_REVIEW").length;
  if (d.campaigns.some((c) => c.on) && onKw.length && week.imp === 0) {
    // 키워드 대부분이 네이버 검토 중이면 아직 안 뜨는 게 정상 — 위험으로 띄우지 않는다
    const allReviewing = d.keywords.length > 0 && d.keywords.every((k) => k.inspect === "UNDER_REVIEW"); // 이건 기존 경고("모두 검토 중")가 이미 알려 준다
    if (allReviewing) {
      /* 같은 말을 두 번 띄우지 않는다 */
    } else if (reviewing >= onKw.length * 0.5) out.push({ level: "제안", text: `켜진 키워드 ${onKw.length}개 중 ${reviewing}개가 아직 네이버 검토 중이라 광고가 안 떠요 (보통 1~2 영업일). 검토가 끝나도 안 뜨면 아래 입찰가부터 보세요` });
    else out.push({ level: "위험", text: `최근 7일 동안 광고가 한 번도 안 떴어요 (노출 0번)${low.length ? " — 위의 입찰가부터 확인하세요" : " — 캠페인·묶음이 켜져 있는지 보세요"}` });
  }

  // 충전금
  const bm = bizmoneyDays(d, today);
  if (bm) {
    if (bm.days !== null && bm.days <= 7) out.push({ level: "위험", text: `충전금이 약 ${bm.days}일치 남았어요 (잔액 ${won(bm.left)}원, 하루 평균 ${won(bm.perDay)}원) — 떨어지면 광고가 멈춰요. 광고주센터에서 충전하세요` });
    else if (bm.days !== null && bm.days <= 16) out.push({ level: "주의", text: `충전금이 약 ${bm.days}일치 남았어요 (잔액 ${won(bm.left)}원, 하루 평균 ${won(bm.perDay)}원) — 다음 주 안에 충전을 준비하세요` });
    else if (bm.days === null && bm.left < 10_000) out.push({ level: "주의", text: `충전금이 ${won(bm.left)}원 남았어요` });
  }

  // 묶음별: 클릭 급락 · 순위 하락 · 유난히 비싼 클릭
  const usualWeeks = 4;
  const rows = d.groups
    .filter((g) => g.on)
    .map((g) => {
      const t = groupTotals(d, g.id, from, today);
      const u = groupTotals(d, g.id, uFrom, uTo);
      return { g, t, u: { imp: u.imp / usualWeeks, clk: u.clk / usualWeeks, avgRank: u.avgRank, cpc: u.cpc } };
    });
  for (const r of rows) {
    if (r.u.clk >= 5 && r.t.clk < r.u.clk * 0.5) out.push({ level: "주의", text: `${r.g.name}: 지난 7일 클릭 ${r.t.clk}번 (평소 ${Math.round(r.u.clk)}번, -${Math.round((1 - r.t.clk / r.u.clk) * 100)}%) — 문구·입찰가를 바꿨는지, 휴무·품절이 있었는지 먼저 보세요` });
    if (r.t.avgRank !== null && r.u.avgRank !== null && r.u.imp >= 30 && r.t.avgRank - r.u.avgRank >= 1.5) out.push({ level: "주의", text: `${r.g.name}: 광고 순위 ${r.t.avgRank}위 (평소 ${r.u.avgRank}위) — 리뷰·소식이 뜸했는지 먼저 보고, 2주 연속이면 입찰가를 10원씩 올려 보세요` });
  }
  const priced = rows.filter((r) => r.t.clk >= 3 && r.t.cpc !== null);
  for (const r of priced) {
    const others = priced.filter((o) => o !== r).map((o) => o.t.cpc as number).sort((a, b) => a - b);
    if (!others.length) continue;
    const mid = others[Math.floor(others.length / 2)];
    if ((r.t.cpc as number) >= mid * 1.8) out.push({ level: "주의", text: `${r.g.name}: 클릭 1번에 ${won(r.t.cpc as number)}원 (다른 묶음 보통 ${won(mid)}원) — 끄거나 입찰가를 낮춰 다른 묶음으로 예산을 옮기세요` });
  }
  return out;
}

/** 키워드 노출 현황 — 등록 N개 중 광고가 뜬 것·클릭이 생긴 것 */
export function exposureSummary(d: NaverAdExport, from: string, to: string): { on: number; shown: number; clicked: number } {
  const on = d.keywords.filter((k) => k.on);
  let shown = 0;
  let clicked = 0;
  for (const k of on) {
    const t = totals(d.stats, new Set([k.id]), from, to);
    if (t.imp > 0) shown++;
    if (t.clk > 0) clicked++;
  }
  return { on: on.length, shown, clicked };
}

// ── 3) 예산 ─────────────────────────────────────────────────────
export interface AdBudget {
  monthCap: number; // 한 달 광고비 상한 (VAT 포함)
  ticket: number | null; // 손님 1명 한 번에 쓰는 돈 (객단가)
  visitsPerYear: number | null; // 1년에 몇 번 오나
  marginPct: number | null; // 매출에서 남는 비율 (영업이익률 %)
}
export const DEFAULT_AD_BUDGET: AdBudget = { monthCap: 0, ticket: null, visitsPerYear: null, marginPct: null }; // monthCap 0 = 아직 안 정함

export interface BudgetRow { name: string; type: string; on: boolean; daily: number | null; monthMax: number | null; groupsOn: number }
export function budgetPlan(d: NaverAdExport, cap: number, today: string): { rows: BudgetRow[]; monthMax: number; over: boolean; last30: number } {
  const rows: BudgetRow[] = d.campaigns.map((c) => {
    const gs = d.groups.filter((g) => g.campaignId === c.id && g.on);
    const groupSum = gs.reduce((a, g) => a + (g.dailyBudget ?? 0), 0);
    // 캠페인 하루 한도와 켜진 묶음 한도 합 중 작은 쪽이 실제 하루 최대
    const daily = !c.on ? 0 : c.dailyBudget && groupSum ? Math.min(c.dailyBudget, groupSum) : c.dailyBudget || groupSum || null;
    return { name: c.name, type: c.type === "PLACE" ? "플레이스" : c.type === "WEB_SITE" ? "파워링크" : c.type, on: c.on, daily, monthMax: daily === null ? null : Math.round(daily * 31 * VAT), groupsOn: gs.length };
  });
  const monthMax = rows.reduce((a, r) => a + (r.monthMax ?? 0), 0);
  const last30 = Math.round(totals(d.stats, spendIds(d), shiftDate(today, -29), today).cost * VAT);
  return { rows, monthMax, over: cap > 0 && monthMax > cap, last30 };
}

/** 손님 1명당 광고비 한도 = 1명이 1년에 남겨 주는 이익 ÷ 3 */
export function customerAdLimit(b: AdBudget): { yearProfit: number; limit: number } | null {
  if (!b.ticket || !b.visitsPerYear || b.marginPct === null || b.marginPct <= 0) return null;
  const yearProfit = Math.round(b.ticket * b.visitsPerYear * (b.marginPct / 100));
  return { yearProfit, limit: Math.round(yearProfit / 3) };
}

// ── 5) 운영 점검 목록 ───────────────────────────────────────────
// 카페스이 사장님이 네이버 광고 강의 기준으로 정리한 점검 틀을, 숯불에닭(파워링크 + 플레이스 회식)에 맞게 우리 말로 옮김.
export interface OpsItem { id: string; title: string; how: string }
export interface OpsArea { area: string; items: OpsItem[] }
export const AD_OPS_CHECKLIST: OpsArea[] = [
  {
    area: "① 광고비 넣기 전 — 플레이스부터",
    items: [
      { id: "place-photo", title: "대표 사진과 추천 메뉴 3개", how: "첫 화면 추천 메뉴 3개에 가격·사진까지. 김 나고 밝은 숯불 사진으로" },
      { id: "place-desc", title: "상세 설명 최신으로", how: "회식·단체·주차·영업시간(금토 새벽 2시까지)을 첫 줄에" },
      { id: "place-reply", title: "리뷰 답글을 두 번째 광고로", how: "답글 끝에 한 줄씩 — 예: 「단체 회식 예약 받아요」「포장 미리 주문 가능」" },
      { id: "place-booking", title: "예약·전화 받기 열어 두기", how: "늦은 밤에 마음 정한 손님은 전화를 못 해요. 네이버 예약이나 톡톡을 열어 두기" },
      { id: "place-news", title: "소식은 가게 앞 전광판처럼", how: "주 1회 — 베스트 리뷰 한 줄을 제목으로, 리뷰 사진을 내용으로" },
      { id: "place-coupon", title: "플레이스 쿠폰 하나", how: "쿠폰 유무로 노출 차이가 커요. 예: 단체 예약 시 음료 1병" },
    ],
  },
  {
    area: "② 어디에 · 얼마나",
    items: [
      { id: "manual-run", title: "새 광고그룹은 직접 운영으로", how: "그룹을 만들 때 자동·수동 고르는 칸이 있으면 수동을 직접 고르기 (확인 필요)" },
      { id: "customer-limit", title: "손님 1명당 광고비 한도 정하기", how: "아래 예산 카드의 계산기 — 1명이 1년 동안 남겨 주는 이익 ÷ 3" },
      { id: "month-cap", title: "한 달 상한 정하고 하루 한도로 걸기", how: "캠페인·묶음에 하루 한도를 직접 걸어야 상한을 안 넘어요. 연말 회식철은 특히" },
    ],
  },
  {
    area: "③ 광고비 새는 곳",
    items: [
      { id: "time-split", title: "시간대 나누기", how: "스마트플레이스 통계에서 손님이 많이 찾는 시간을 보고, 그 시간 묶음만 입찰가·문구를 따로" },
      { id: "negative", title: "제외 검색어 주 1회", how: "실제로 노출된 검색어를 보고 안 맞는 말 빼기 (닭 요리 아닌 것, 다른 지역 등)" },
      { id: "region", title: "지역 좁히기", how: "동네 묶음은 율량동·청원구 반경으로, 랜드마크·넓은 지역 묶음만 넓게" },
      { id: "copy-number", title: "문구에 숫자 · 대상 · NEW", how: "예: 「NEW 숯불 닭갈비」「단체 20명까지」「율량동 회식」" },
      { id: "one-change", title: "한 번에 하나만 바꾸기", how: "키워드·입찰가·문구를 한꺼번에 바꾸면 무엇이 효과였는지 몰라요. 주간 기록에 하나만" },
    ],
  },
  {
    area: "④ 클릭한 손님이 오게",
    items: [
      { id: "phone-test", title: "직원 폰으로 직접 눌러 보기", how: "검색 → 전화·길찾기·예약을 하나씩 눌러 보고, 지도 핀이 가게 입구에 있는지" },
    ],
  },
  {
    area: "⑤ 늘릴까 줄일까",
    items: [
      { id: "weekly-sales", title: "주간 기록의 매출로 판단", how: "클릭이 아니라 홀 매출로. 클릭만 늘고 매출이 그대로면 접기" },
      { id: "right-bid", title: "적정 입찰가 찾기", how: "입찰가를 올려도 클릭은 안 늘고 비용만 오르면, 그 바로 전 값이 적정가" },
      { id: "dead-keywords", title: "안 뜨는 키워드부터", how: "최소 노출선보다 낮은 키워드·노출 0 키워드를 먼저 정리" },
      { id: "ctr-3", title: "클릭률 3% 넘기기", how: "가장 큰 묶음부터 문구를 하나씩 바꿔 비교" },
    ],
  },
];
