import { parseAmount, parseDate } from "./bank/parse";
import type { ChannelId } from "./categories";

// 포스(오케이포스 ASP) "당일매출종합현황 (일별종합)" 엑셀 → 날짜별 실매출·결제수단별 금액.
//
// 왜 필요한가 (2026-11-19):
// 「카드승인현황」에는 **간편결제(토스페이계좌·머니)가 없다**. 그래서 카드만 받아 놓으면 그날
// 간편결제 매출이 통째로 빠진다 — 2026-11-18 에 133,000원이 빠질 뻔했다. 일별종합에는 결제수단
// 칸이 다 있어서, 간편결제를 채우고 카드 합계가 포스 실매출과 맞는지 대조할 수 있다.
//
// 실측 (2026-11-18): 총매출 764,000 − 총할인 60,000 = 실매출 704,000
//                  = 신용카드 571,000 + 토스페이계좌 133,000. 카드사별 합계도 571,000이었다.

export class PosDailyError extends Error {}

type Cell = string | number | Date | null | undefined;
const norm = (c: Cell) => String(c ?? "").replace(/\s/g, "");

export interface PosDailyDay {
  date: string;
  grossSales: number; // 총매출
  discount: number; // 총할인
  netSales: number; // 실매출 (총매출 − 총할인)
  card: number; // 신용카드
  cash: number; // 단순현금
  cashReceipt: number; // 현금영수
  byChannel: Record<ChannelId, number>; // card_easy(간편결제) · card_zeropay 등 — 카드승인현황에 없는 결제수단만
  payCard: number; // 토스페이**카드** — 어느 카드사인지 이 파일로는 알 수 없다 (아래 설명)
  receipts: number; // 영수건수
}

export interface ParsedPosDaily {
  from: string;
  to: string;
  days: PosDailyDay[]; // 날짜 오름차순
  netSales: number; // 기간 실매출 합계
  byChannel: Record<ChannelId, number>; // 기간 합계
  payCard: number; // 기간 토스페이카드 합계
  payCardDays: string[]; // 토스페이카드가 있는 날 — 이 날은 간편결제를 손대지 않는다
}

/**
 * 토스페이**카드** 칸인가.
 *
 * 손님이 토스로 냈지만 실제로는 카드 결제라, 돈은 **그 카드사 입금에 섞여** 들어온다. 포스
 * 일별종합은 「신용카드」와 따로 적어 주는데 **어느 카드사인지는 안 적는다**. 그건 「간편결제
 * 승인현황」의 발급사 칸에만 있다. 그래서 이 금액은 간편결제로 넣으면 안 되고(통장에 간편결제
 * 입금으로 안 들어와 "미입금"으로 뜬다), 카드사도 모르니 혼자 정할 수 없다 — 알리기만 한다.
 *
 * 실제로 이렇게 잘못 들어가 있었다 (2026-11-19 확인): 11/13 토스페이카드 112,000원이 간편결제로
 * 잡혀 "입금일 지났는데 없음 112,000원"으로 떠 있었다. 11/16도 110,000원 중 70,000원이 토스페이카드.
 */
export const isPayCardColumn = (name: string) => {
  const n = norm(name);
  return n.includes("페이") && n.includes("카드");
};

/**
 * 결제수단 칸 이름 → 장부 채널.
 * 토스페이**카드**는 돈이 그 카드사에서 들어오고 포스에서도 「신용카드」에 이미 들어 있으므로 제외한다
 * ([[card-mismatch-check-order]] · 간편결제승인현황을 올릴 때와 같은 규칙).
 */
export function payMethodToChannel(name: string): ChannelId | null {
  const n = norm(name);
  if (!n || n.includes("카드")) return null; // 신용카드·제휴카드·선불카드·사원카드·토스페이카드
  if (n.includes("제로페이")) return "card_zeropay";
  if (n.includes("페이")) return "card_easy"; // 토스페이계좌·토스페이머니·카카오페이…
  return null;
}

export function parsePosDaily(grid: Cell[][]): ParsedPosDaily {
  const hi = grid.slice(0, 30).findIndex((r) => r?.some((c) => norm(c) === "실매출") && r.some((c) => norm(c) === "총매출"));
  if (hi < 0) throw new PosDailyError("포스 ‘당일매출종합현황 (일별종합)’ 파일이 아닌 것 같아요. 총매출·실매출 칸을 못 찾았어요.");
  const header = grid[hi];
  const col = (name: string) => header.findIndex((c) => norm(c) === name);
  const dateCol = col("일자");
  const cGross = col("총매출");
  const cDiscount = col("총할인");
  const cNet = col("실매출");
  const cCard = col("신용카드");
  const cCash = col("단순현금");
  const cReceipt = col("현금영수");
  const cCount = col("영수건수");
  if (dateCol < 0 || cNet < 0) throw new PosDailyError("일별종합 파일에서 일자·실매출 칸을 못 찾았어요.");
  // 결제수단 칸 중 카드승인현황에 안 잡히는 것들 (간편결제·제로페이)
  const payCols: { col: number; channel: ChannelId }[] = [];
  const payCardCols: number[] = [];
  header.forEach((c, i) => {
    const name = String(c ?? "");
    if (isPayCardColumn(name)) { payCardCols.push(i); return; }
    const channel = payMethodToChannel(name);
    if (channel && !payCols.some((p) => p.col === i)) payCols.push({ col: i, channel });
  });

  const days: PosDailyDay[] = [];
  for (const r of grid.slice(hi + 1)) {
    if (!r || r.length === 0) continue;
    if (norm(r[0]) === "합계") continue; // 맨 아래 합계 줄은 날짜가 아니다
    const date = parseDate(r[dateCol]);
    if (!date) continue;
    const byChannel: Record<ChannelId, number> = {};
    for (const p of payCols) {
      const amount = parseAmount(r[p.col]);
      if (amount) byChannel[p.channel] = (byChannel[p.channel] ?? 0) + amount;
    }
    days.push({
      date,
      grossSales: cGross >= 0 ? parseAmount(r[cGross]) : 0,
      discount: cDiscount >= 0 ? parseAmount(r[cDiscount]) : 0,
      netSales: parseAmount(r[cNet]),
      card: cCard >= 0 ? parseAmount(r[cCard]) : 0,
      cash: cCash >= 0 ? parseAmount(r[cCash]) : 0,
      cashReceipt: cReceipt >= 0 ? parseAmount(r[cReceipt]) : 0,
      byChannel,
      payCard: payCardCols.reduce((a, i) => a + parseAmount(r[i]), 0),
      receipts: cCount >= 0 ? parseAmount(r[cCount]) : 0,
    });
  }
  if (!days.length) throw new PosDailyError("일별종합 파일에 날짜 줄이 하나도 없어요.");
  days.sort((a, b) => a.date.localeCompare(b.date));
  const byChannel: Record<ChannelId, number> = {};
  for (const d of days) for (const [ch, amt] of Object.entries(d.byChannel)) byChannel[ch] = (byChannel[ch] ?? 0) + amt;
  return {
    from: days[0].date,
    to: days[days.length - 1].date,
    days,
    netSales: days.reduce((a, d) => a + d.netSales, 0),
    byChannel,
    payCard: days.reduce((a, d) => a + d.payCard, 0),
    payCardDays: days.filter((d) => d.payCard > 0).map((d) => d.date),
  };
}

export interface PosCardGap {
  date: string;
  pos: number; // 포스 일별종합의 신용카드
  file: number; // 카드승인현황에서 센 그날 카드사 합계
  gap: number; // 포스 − 파일
}

/**
 * 카드승인현황으로 센 날짜별 카드 합계가 포스 일별종합의 「신용카드」와 맞는지 본다.
 * 어긋나면 카드 자료가 덜 왔거나 카드사로 안 묶인 승인이 있다는 뜻이다.
 */
export function posCardGaps(daily: ParsedPosDaily, cardByDate: Map<string, number>): PosCardGap[] {
  const gaps: PosCardGap[] = [];
  for (const d of daily.days) {
    const file = cardByDate.get(d.date);
    if (file === undefined) continue; // 카드 파일에 없는 날은 비교하지 않는다
    if (file !== d.card) gaps.push({ date: d.date, pos: d.card, file, gap: d.card - file });
  }
  return gaps;
}

export interface PayCardAssign {
  date: string;
  channel: ChannelId; // 토스페이카드 값을 넣을 카드사
  amount: number;
}

/**
 * 토스페이카드가 어느 카드사 몫인지 **여신협회 매입으로** 알아낸다 — 간편결제승인현황 없이.
 *
 * 토스페이카드는 카드승인현황엔 없는데 여신협회 매입엔 들어 있다(그 카드사가 매입했으니까).
 * 그래서 같은 거래일에 `여신협회 매입 − 카드승인현황` 이 그 카드사만 토스페이카드만큼 남는다.
 *
 * 다만 **하루씩 밀려 올라오는 매입**이 섞인다 (2026-11-12 현대 −119,000 → 11-13 +231,000).
 * 하루만 보면 231,000 이라 안 맞으므로 **구간 누계**로 본다. 밀린 건 다음 날 되돌아와 지워지고,
 * 남는 누계가 토스페이카드다 — 11/13 현대 누계 +112,000, 11/16 하나 누계 +70,000 으로
 * 포스가 말한 금액과 원 단위까지 같았다 (2026-11-19 확인).
 *
 * 딱 한 카드사만 들어맞을 때에만 정한다. 둘 이상이거나 하나도 없으면 손대지 않고 알린다 —
 * 틀린 카드사에 넣으면 그 카드사 입금 대조가 둘 다 깨진다.
 */
export function assignPayCard(
  days: { date: string; payCard: number }[],
  cardByDay: Map<string, Record<ChannelId, number>>,
  purchaseByDay: Map<string, Record<ChannelId, number>>,
): { assigned: PayCardAssign[]; unresolved: string[] } {
  const assigned: PayCardAssign[] = [];
  const unresolved: string[] = [];
  const cum: Record<ChannelId, number> = {};
  const taken: Record<ChannelId, number> = {};
  let blind = false; // 여신협회 매입이 없는 날부터는 누계를 믿을 수 없다
  for (const d of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    const purchase = purchaseByDay.get(d.date);
    if (!purchase) {
      blind = true;
      if (d.payCard > 0) unresolved.push(d.date);
      continue;
    }
    const file = cardByDay.get(d.date) ?? {};
    for (const ch of new Set([...Object.keys(purchase), ...Object.keys(file)])) {
      cum[ch] = (cum[ch] ?? 0) + (purchase[ch] ?? 0) - (file[ch] ?? 0);
    }
    if (d.payCard <= 0) continue;
    if (blind) { unresolved.push(d.date); continue; }
    const hits = Object.keys(cum).filter((ch) => cum[ch] - (taken[ch] ?? 0) === d.payCard);
    if (hits.length !== 1) { unresolved.push(d.date); continue; }
    taken[hits[0]] = (taken[hits[0]] ?? 0) + d.payCard;
    assigned.push({ date: d.date, channel: hits[0], amount: d.payCard });
  }
  return { assigned, unresolved };
}

/**
 * 그날 카드승인현황에 없는 결제수단으로 채울 금액 (간편결제·제로페이).
 * 토스페이카드의 카드사를 못 찾았으면(assigned=false) 그 금액을 잠시 간편결제에 얹는다 —
 * 그날을 건너뛰면 토스페이머니·계좌까지 통째로 빠진다 (2026-11-27 머니 237,000 + 계좌 75,000).
 * 나중에 카드사를 찾아 다시 넣으면 간편결제는 포스 값으로 바뀌고 토스페이카드는 카드사 몫이 된다.
 */
export function posOnlyFill(d: Pick<PosDailyDay, "byChannel" | "payCard">, assigned: boolean): Record<string, number> {
  const out: Record<string, number> = { ...d.byChannel };
  if (d.payCard > 0 && !assigned) out.card_easy = (out.card_easy ?? 0) + d.payCard;
  return out;
}
