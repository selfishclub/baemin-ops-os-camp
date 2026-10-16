// 광고 노트 — 성적 (카페스이 광고 노트의 틀): 이번 주를 평소 4주와 비교하고 위험·주의·제안을 낸다.
// 숫자는 도우미가 네이버 검색광고 API 에서 읽어 온 것(노출·클릭·광고비·평균 순위). 광고비는 VAT 뺀 금액.
import { shiftDate } from "./rank";

export interface AdCampaignRow { id: string; name: string; type: string; dailyBudget: number | null; status: string; on: boolean }
export interface AdGroupRow { id: string; campaignId: string; name: string; bid: number | null; dailyBudget: number | null; status: string; on: boolean }
export interface AdKeywordRow { id: string; groupId: string; keyword: string; bid: number | null; useGroupBid: boolean; status: string; inspect: string | null; quality: number | null; on: boolean }
export interface AdStatRow { id: string; date: string; imp: number; clk: number; cost: number; ctr: number | null; cpc: number | null; avgRank: number | null }
export interface NaverAdExport {
  collectedAt: string | null;
  campaigns: AdCampaignRow[];
  groups: AdGroupRow[];
  keywords: AdKeywordRow[];
  stats: AdStatRow[];
}
export const EXPORT_NAVERAD_KEY = "export_naverad_v1";

export interface Totals { imp: number; clk: number; cost: number; ctr: number | null; cpc: number | null; avgRank: number | null }

const EMPTY: Totals = { imp: 0, clk: 0, cost: 0, ctr: null, cpc: null, avgRank: null };

/** ids 의 from~to 합계. 평균 순위는 노출 가중 */
export function totals(stats: AdStatRow[], ids: Set<string>, from: string, to: string): Totals {
  let imp = 0, clk = 0, cost = 0, rankW = 0, rankN = 0;
  for (const r of stats) {
    if (!ids.has(r.id) || r.date < from || r.date > to) continue;
    imp += r.imp;
    clk += r.clk;
    cost += r.cost;
    if (r.avgRank !== null && r.imp > 0) {
      rankW += r.avgRank * r.imp;
      rankN += r.imp;
    }
  }
  if (!imp && !clk && !cost) return EMPTY;
  return { imp, clk, cost, ctr: imp ? Math.round((clk / imp) * 10000) / 100 : null, cpc: clk ? Math.round(cost / clk) : null, avgRank: rankN ? Math.round((rankW / rankN) * 10) / 10 : null };
}

export const keywordIds = (d: NaverAdExport) => new Set(d.keywords.map((k) => k.id));

/** 지난 7일 vs 그 앞 4주의 주 평균 */
export interface WeekCompare { thisWeek: Totals; usual: Totals; from: string; to: string; usualWeeks: number }
export function compareWeek(d: NaverAdExport, today: string, ids: Set<string> = keywordIds(d)): WeekCompare {
  const to = today;
  const from = shiftDate(today, -6);
  const thisWeek = totals(d.stats, ids, from, to);
  const uFrom = shiftDate(from, -28);
  const uTo = shiftDate(from, -1);
  const firstDate = d.stats.filter((r) => ids.has(r.id)).map((r) => r.date).sort()[0] ?? uTo;
  const start = firstDate > uFrom ? firstDate : uFrom;
  const days = Math.max(0, Math.floor((Date.parse(uTo) - Date.parse(start)) / 86_400_000) + 1);
  const u = totals(d.stats, ids, start, uTo);
  const weeks = days / 7;
  const usual: Totals = weeks >= 1 ? { ...u, imp: Math.round(u.imp / weeks), clk: Math.round(u.clk / weeks), cost: Math.round(u.cost / weeks) } : EMPTY;
  return { thisWeek, usual, from, to, usualWeeks: Math.round(weeks * 10) / 10 };
}

/** 주별 흐름 (최근 n주, 오래된 주부터). 주의 시작은 today 기준 7일 단위 */
export function weeklySeries(d: NaverAdExport, today: string, weeks = 8, ids: Set<string> = keywordIds(d)): { from: string; to: string; t: Totals }[] {
  const out: { from: string; to: string; t: Totals }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const to = shiftDate(today, -7 * i);
    const from = shiftDate(to, -6);
    out.push({ from, to, t: totals(d.stats, ids, from, to) });
  }
  return out;
}

/** 광고그룹별 (기간 합계 + 직전 같은 길이 기간 대비) */
export interface GroupStat { group: AdGroupRow; t: Totals; prev: Totals; keywords: number; on: boolean }
export function byGroup(d: NaverAdExport, from: string, to: string): GroupStat[] {
  const len = Math.floor((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
  const pFrom = shiftDate(from, -len), pTo = shiftDate(from, -1);
  return d.groups
    .map((g) => {
      const ids = new Set(d.keywords.filter((k) => k.groupId === g.id).map((k) => k.id));
      return { group: g, t: totals(d.stats, ids, from, to), prev: totals(d.stats, ids, pFrom, pTo), keywords: ids.size, on: g.on };
    })
    .sort((a, b) => b.t.cost - a.t.cost);
}

/** 키워드별 (기간 합계). 광고비 큰 순, 성적 없는 것은 뒤 */
export interface KeywordStat { k: AdKeywordRow; groupName: string; t: Totals; bidShown: number | null }
export function byKeyword(d: NaverAdExport, from: string, to: string): KeywordStat[] {
  const gName = new Map(d.groups.map((g) => [g.id, g.name]));
  const gBid = new Map(d.groups.map((g) => [g.id, g.bid]));
  return d.keywords
    .map((k) => ({ k, groupName: gName.get(k.groupId) ?? "?", t: totals(d.stats, new Set([k.id]), from, to), bidShown: k.useGroupBid ? gBid.get(k.groupId) ?? null : k.bid }))
    .sort((a, b) => b.t.cost - a.t.cost || b.t.imp - a.t.imp || a.k.keyword.localeCompare(b.k.keyword, "ko"));
}

/** 검토 상태 글자 */
export function inspectText(k: AdKeywordRow): string {
  if (k.inspect === "UNDER_REVIEW") return "검토 중";
  if (k.inspect === "REJECTED" || k.inspect === "DENIED") return "거절";
  if (k.status === "PAUSED" && !k.on) return "꺼둠";
  if (k.status === "PAUSED") return "중지";
  if (k.status === "ELIGIBLE") return "운영";
  return k.status || "–";
}

// ── 이번 주 챙길 것 (위험 · 주의 · 제안) ─────────────────────────────────
export interface AdAlert { level: "위험" | "주의" | "제안"; text: string; keyword?: string }

export function adAlerts(d: NaverAdExport, today: string): AdAlert[] {
  const out: AdAlert[] = [];
  const ids = keywordIds(d);
  const cmp = compareWeek(d, today, ids);
  const from = cmp.from, to = cmp.to;
  const campaign = d.campaigns.find((c) => c.type === "WEB_SITE") ?? d.campaigns[0];
  const gName = new Map(d.groups.map((g) => [g.id, g.name]));

  // 상태
  if (campaign && !campaign.on) out.push({ level: "위험", text: `캠페인 "${campaign.name}"이 꺼져 있어요 — 광고가 안 나가요` });
  const review = d.keywords.filter((k) => k.inspect === "UNDER_REVIEW").length;
  const rejected = d.keywords.filter((k) => k.inspect === "REJECTED" || k.inspect === "DENIED");
  if (rejected.length) out.push({ level: "주의", text: `검토에서 거절된 키워드 ${rejected.length}개: ${rejected.slice(0, 5).map((k) => k.keyword).join(", ")}` });
  if (review > 0 && review === d.keywords.length) out.push({ level: "주의", text: `키워드 ${review}개가 모두 검토 중이에요 — 보통 1~2 영업일, 끝나면 자동으로 나가요` });

  // 돈 흐름 (평소 4주가 있을 때만)
  if (cmp.usualWeeks >= 1 && cmp.usual.cost > 0) {
    if (cmp.thisWeek.cost > cmp.usual.cost * 1.5 && cmp.thisWeek.clk <= cmp.usual.clk) out.push({ level: "위험", text: `이번 주 광고비가 평소보다 ${Math.round((cmp.thisWeek.cost / cmp.usual.cost - 1) * 100)}% 늘었는데 클릭은 안 늘었어요 — 클릭 1번 값이 비싸진 키워드를 보세요` });
    if (cmp.thisWeek.cpc !== null && cmp.usual.cpc !== null && cmp.thisWeek.cpc > cmp.usual.cpc * 1.3) out.push({ level: "주의", text: `클릭 1번 값이 평소 ${cmp.usual.cpc.toLocaleString("ko-KR")}원 → 이번 주 ${cmp.thisWeek.cpc.toLocaleString("ko-KR")}원` });
    if (cmp.thisWeek.clk < cmp.usual.clk * 0.5 && cmp.usual.clk >= 5) out.push({ level: "주의", text: `이번 주 클릭이 평소의 절반 밑이에요 (${cmp.thisWeek.clk}번, 평소 ${cmp.usual.clk}번)` });
  }
  // 하루 예산 소진
  if (campaign?.dailyBudget) {
    const camp = new Set([campaign.id]);
    let hit = 0;
    for (let i = 0; i < 7; i++) {
      const day = shiftDate(today, -i);
      const t = totals(d.stats, camp, day, day);
      if (t.cost >= campaign.dailyBudget * 0.95) hit++;
    }
    if (hit >= 3) out.push({ level: "제안", text: `최근 7일 중 ${hit}일은 하루 예산을 다 썼어요 — 싼 키워드가 묻히고 있으면 예산을 조금 올리거나 비싼 키워드 입찰가를 내리세요` });
  }
  // 키워드별
  const kws = byKeyword(d, from, to);
  for (const r of kws) {
    const g = gName.get(r.k.groupId) ?? "";
    // 같은 묶음의 다른 키워드들 평균 클릭 1번 값
    const others = new Set(d.keywords.filter((k) => k.groupId === r.k.groupId && k.id !== r.k.id).map((k) => k.id));
    const ot = totals(d.stats, others, from, to);
    const oc = ot.clk >= 3 ? ot.cpc : null;
    if (r.t.clk >= 3 && oc && r.t.cpc !== null && r.t.cpc > oc * 2) out.push({ level: "위험", keyword: r.k.keyword, text: `"${r.k.keyword}"(${g}) 클릭 1번에 ${r.t.cpc.toLocaleString("ko-KR")}원 — 같은 묶음 다른 키워드(${oc.toLocaleString("ko-KR")}원)의 두 배가 넘어요. 입찰가를 내리거나 끄세요` });
    else if (r.t.imp >= 100 && r.t.clk === 0) out.push({ level: "주의", keyword: r.k.keyword, text: `"${r.k.keyword}"(${g}) ${r.t.imp}번 보였는데 아무도 안 눌렀어요 — 광고 문구가 그 말과 안 맞을 수 있어요` });
    else if (r.t.clk >= 5 && r.t.avgRank !== null && r.t.avgRank > 3) out.push({ level: "제안", keyword: r.k.keyword, text: `"${r.k.keyword}"(${g}) 잘 눌리는데 평균 ${r.t.avgRank}위예요 — 입찰가를 조금 올리면 더 받아요` });
  }
  // 운영 중인데 7일간 노출 0
  const eligible = d.keywords.filter((k) => k.status === "ELIGIBLE" && k.on);
  const noImp = eligible.filter((k) => totals(d.stats, new Set([k.id]), from, to).imp === 0);
  if (eligible.length && noImp.length >= Math.max(3, Math.ceil(eligible.length * 0.3))) out.push({ level: "제안", text: `운영 중인 키워드 ${eligible.length}개 중 ${noImp.length}개는 이번 주 한 번도 안 보였어요 — 검색이 없는 말이거나 입찰가가 낮아요 (${noImp.slice(0, 5).map((k) => k.keyword).join(", ")}${noImp.length > 5 ? " …" : ""})` });

  const order = { 위험: 0, 주의: 1, 제안: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]).slice(0, 12);
}

/** 광고비 → 장부에 적을 달별 합계 (VAT 포함 추정: 네이버는 광고비에 10% 부가세를 더해 청구) */
export function monthlyCost(d: NaverAdExport, month: string, vat = true): number {
  const ids = keywordIds(d);
  const t = totals(d.stats, ids, `${month}-01`, `${month}-31`);
  return Math.round(t.cost * (vat ? 1.1 : 1));
}
