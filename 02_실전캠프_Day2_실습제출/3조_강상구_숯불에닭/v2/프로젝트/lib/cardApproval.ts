import { parseAmount, parseDate } from "./bank/parse";
import { CARD_PRESETS, type ChannelId } from "./categories";

// 포스(오케이포스 ASP) "승인현황 (카드승인현황)" 엑셀 → 영업일자 × 카드사별 매출.
// 승인 한 건이 한 줄. 자정 넘어 결제한 것도 "영업일자" 기준으로 전날에 붙는다(승인일자와 다를 수 있음).

export class CardApprovalError extends Error {}

type Cell = string | number | Date | null | undefined;
const norm = (c: Cell) => String(c ?? "").replace(/\s/g, "");

export interface CardApprovalDay {
  date: string;
  byCard: Record<ChannelId, number>; // card_shinhan → 금액 (취소는 뺀 값)
  count: number; // 승인 건수
}

export interface ParsedCardApproval {
  from: string;
  to: string;
  days: CardApprovalDay[]; // 날짜 오름차순
  total: number;
  byCard: Record<ChannelId, number>; // 기간 전체 카드사별 합계
  unknownIssuers: string[]; // 카드사 목록에 없는 매입사 이름 (→ "기타 카드"로 넣음)
  sheetTotal: number | null; // 파일 맨 아래 "합계" 줄 (검산용)
}

// 매입사 이름 → 카드사 채널. "하나카드"·"하나(구외환)" 둘 다 하나카드로.
export function issuerToChannel(name: string): ChannelId | null {
  const n = norm(name).toUpperCase();
  if (!n) return null;
  for (const p of CARD_PRESETS) {
    if (p.id === "card_easy") continue; // 간편결제는 승인현황에 카드사로 안 나온다
    if (p.keywords.some((k) => n.includes(k.toUpperCase()))) return p.id;
  }
  return null;
}

export function parseCardApproval(grid: Cell[][]): ParsedCardApproval {
  const top = grid.slice(0, 30);
  const hi = top.findIndex((r) => r.some((c) => norm(c).includes("영업일자")) && r.some((c) => norm(c).includes("매입사")) && r.some((c) => norm(c).includes("승인금액")));
  if (hi < 0) throw new CardApprovalError("포스 ‘승인현황 (카드승인현황)’ 파일이 아닌 것 같아요. 영업일자·매입사·승인금액 칸을 못 찾았어요.");
  const header = grid[hi];
  const col = (name: string) => header.findIndex((c) => norm(c).includes(name));
  const dateCol = col("영업일자");
  const issuerCol = col("매입사");
  const amountCol = header.length - 1 - [...header].reverse().findIndex((c) => norm(c).includes("승인금액")); // 마지막 "승인금액"
  const kindCol = col("승인"); // "승인 구분" (승인/취소)

  const byDate = new Map<string, CardApprovalDay>();
  const unknown = new Set<string>();
  let sheetTotal: number | null = null;
  for (const r of grid.slice(hi + 1)) {
    if (!r || r.length === 0) continue;
    if (norm(r[0]) === "합계") {
      sheetTotal = parseAmount(r[amountCol]);
      continue;
    }
    if (norm(r[0]) === "No." || typeof r[0] !== "number") continue; // 두 번째 머리줄·빈 줄
    const date = parseDate(r[dateCol]);
    if (!date) continue;
    let amount = parseAmount(r[amountCol]);
    if (kindCol >= 0 && norm(r[kindCol]).includes("취소")) amount = -Math.abs(amount);
    const issuer = String(r[issuerCol] ?? "").trim();
    const channel = issuerToChannel(issuer) ?? "hall_card";
    if (channel === "hall_card" && issuer) unknown.add(issuer);
    const day = byDate.get(date) ?? { date, byCard: {}, count: 0 };
    day.byCard[channel] = (day.byCard[channel] ?? 0) + amount;
    day.count += 1;
    byDate.set(date, day);
  }
  if (byDate.size === 0) throw new CardApprovalError("승인 줄이 하나도 없어요. 조회 기간에 승인 내역이 있는 파일인지 확인해 주세요.");

  const days = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  const byCard: Record<ChannelId, number> = {};
  let total = 0;
  for (const d of days) {
    for (const [k, v] of Object.entries(d.byCard)) {
      byCard[k] = (byCard[k] ?? 0) + v;
      total += v;
    }
  }
  return { from: days[0].date, to: days[days.length - 1].date, days, total, byCard, unknownIssuers: [...unknown], sheetTotal };
}
