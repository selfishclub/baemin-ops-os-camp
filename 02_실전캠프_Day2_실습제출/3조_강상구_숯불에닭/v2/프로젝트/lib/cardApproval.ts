import { parseAmount, parseDate } from "./bank/parse";
import { CARD_PRESETS, type ChannelId } from "./categories";

// 포스(오케이포스 ASP) "승인현황 (카드승인현황)" 엑셀 → 영업일자 × 카드사별 매출.
// "간편결제승인현황"도 같은 모양인데 매입사가 토스페이머니·토스페이계좌·토스페이카드 같은 페이사이고 "발급사" 칸이 따로 있다.
//  - 토스페이카드(발급사 = 카드사): 돈이 그 카드사에서 들어오므로 카드사 매출로 넣는다 (카드승인현황엔 안 잡힌다)
//  - 토스페이머니·토스페이계좌: 토스에서 들어오므로 간편결제 채널
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
  kind: "card" | "easy"; // 카드승인현황 | 간편결제승인현황
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

// 발급사 이름(KB국민체크·신한프리미엄·하나카드…) → 카드사. 통장 글과 달리 카드사 이름만 있는 칸이라 짧은 키워드로 찾아도 안전하다.
const BANK_WORDS: [string, ChannelId][] = [["BC", "card_bc"], ["비씨", "card_bc"], ["KB", "card_kb"], ["국민", "card_kb"], ["신한", "card_shinhan"], ["삼성", "card_samsung"], ["현대", "card_hyundai"], ["롯데", "card_lotte"], ["하나", "card_hana"], ["외환", "card_hana"], ["NH", "card_nh"], ["농협", "card_nh"], ["우리", "card_woori"]];
export function bankToChannel(name: string): ChannelId | null {
  const n = norm(name).toUpperCase();
  if (!n) return null;
  return BANK_WORDS.find(([w]) => n.includes(w.toUpperCase()))?.[1] ?? null;
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
  const issuerCardCol = col("발급사"); // 간편결제승인현황에만 있음
  const isEasyFile = issuerCardCol >= 0 && grid.slice(hi + 1).some((r) => /페이/.test(String(r?.[issuerCol] ?? "")));

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
    let channel: ChannelId;
    if (isEasyFile) {
      if (/카드/.test(issuer)) {
        // 토스페이카드 등: 발급사(카드사)로
        const bank = String(r[issuerCardCol] ?? "").trim();
        channel = bankToChannel(bank) ?? "hall_card";
        if (channel === "hall_card" && bank) unknown.add(`${issuer}(${bank})`);
      } else channel = "card_easy";
    } else {
      channel = issuerToChannel(issuer) ?? "hall_card";
      if (channel === "hall_card" && issuer) unknown.add(issuer);
    }
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
  return { kind: isEasyFile ? "easy" : "card", from: days[0].date, to: days[days.length - 1].date, days, total, byCard, unknownIssuers: [...unknown], sheetTotal };
}
