import { salesStartLate } from "./pnl";
import type { ChannelSale, Transaction } from "./types";
// 지난 매출 (참고용) — 장부를 쓰기 전(2024-09 ~) 포스 매출을 따로 보관한다.
// 정산·오늘 탭에는 넣지 않는다. 손익에는 통장 자료가 있는 달만 쓴다(비용 없는 달이 흑자로 찍히니까 — 아래 pnlSales). 상권 읽어 주기·해마다 견줘 보기·예측에도 쓴다.
// 포스에는 배달이 안 찍혀서 홀 매출(포스)과 배달(배민·쿠팡 주문 수집)을 따로 받아 같은 날에 합친다.

export const HISTORY_KEY = "history_sales_v1";

export interface HistoryDay {
  date: string; // "2025-01-15"
  hall: number; // 포스 실매출 (원)
  receipts: number | null; // 영수 건수
  customers: number | null; // 고객 수
  baemin?: number; // 배민 주문 금액 (원)
  coupang?: number; // 쿠팡이츠 주문 금액 (원)
}

/** 그날 전체 매출 = 홀 + 배달 */
export const dayTotal = (d: HistoryDay) => d.hall + (d.baemin ?? 0) + (d.coupang ?? 0);

export const DELIVERY_FILE_KIND = "sootdak-delivery-history";

/** 리뷰 수집기가 만든 배달 지난 매출 파일 → 하루치 (홀은 0, 포스 파일과 합칠 때 채워짐) */
export function parseDeliveryHistory(json: unknown): HistoryDay[] | null {
  const doc = json as { kind?: string; days?: { date?: string; baemin?: number; coupang?: number }[] };
  if (doc?.kind !== DELIVERY_FILE_KIND || !Array.isArray(doc.days)) return null;
  return doc.days
    .filter((d) => typeof d.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.date) && (typeof d.baemin === "number" || typeof d.coupang === "number"))
    .map((d) => ({
      date: d.date!,
      hall: 0,
      receipts: null,
      customers: null,
      // 파일에 있는 칸만 넣는다 (0도 넣는다) — 없는 칸은 합칠 때 예전 값을 지키게
      ...(typeof d.baemin === "number" ? { baemin: Math.round(d.baemin) } : {}),
      ...(typeof d.coupang === "number" ? { coupang: Math.round(d.coupang) } : {}),
    }));
}

/** 엑셀 날짜 일련번호(46311) → "2026-10-16" */
function serialToDate(n: number): string {
  return new Date(Date.UTC(1899, 11, 30) + n * 86_400_000).toISOString().slice(0, 10);
}

function cellDate(v: unknown): string | null {
  if (typeof v === "number" && v > 30000 && v < 80000) return serialToDate(v);
  if (typeof v === "string") {
    const m = v.trim().match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }
  return null;
}

const toNum = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/** 오케이포스 「일별종합」 엑셀(첫 시트, header:1 로 읽은 줄들) → 하루치 목록. 모양이 아니면 null */
export function parseOkposDaily(rows: unknown[][]): HistoryDay[] | null {
  const head = rows.findIndex((r) => r.includes("실매출") && r.includes("영수건수"));
  if (head < 0) return null;
  const h = rows[head].map((c) => String(c).trim());
  const col = { date: h.indexOf("일자"), hall: h.indexOf("실매출"), receipts: h.indexOf("영수건수"), customers: h.indexOf("고객수") };
  if (col.date < 0 || col.hall < 0) return null;
  const out: HistoryDay[] = [];
  for (const r of rows.slice(head + 1)) {
    const date = cellDate(r[col.date]);
    const hall = toNum(r[col.hall]);
    if (!date || hall === null) continue; // "합계" 줄 등
    out.push({ date, hall: Math.round(hall), receipts: col.receipts >= 0 ? toNum(r[col.receipts]) : null, customers: col.customers >= 0 ? toNum(r[col.customers]) : null });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** 같은 날은 합친다 — 포스 파일은 홀 칸만, 배달 파일은 배달 칸만 새 것으로 바꾼다 */
export function mergeHistory(old: HistoryDay[], add: HistoryDay[]): HistoryDay[] {
  const by = new Map(old.map((d) => [d.date, d]));
  for (const d of add) {
    const prev = by.get(d.date);
    if (!prev) by.set(d.date, d);
    else if (d.baemin !== undefined || d.coupang !== undefined) by.set(d.date, { ...prev, ...(d.baemin !== undefined ? { baemin: d.baemin } : {}), ...(d.coupang !== undefined ? { coupang: d.coupang } : {}) });
    else by.set(d.date, { ...prev, hall: d.hall, receipts: d.receipts, customers: d.customers });
  }
  return [...by.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** 장부가 15일 이상 들어간 달. 그보다 적은 달(장부 시작 달 등)은 지난 매출을 기준으로 본다 */
export function ledgerMonths(dates: Iterable<string>): Set<string> {
  const days = new Map<string, Set<string>>();
  for (const d of dates) {
    const k = d.slice(0, 7);
    days.set(k, (days.get(k) ?? new Set()).add(d));
  }
  return new Set([...days].filter(([, s]) => s.size >= 15).map(([k]) => k));
}

/** 달마다 합계(홀+배달)·영업일 */
export function historyByMonth(days: HistoryDay[]): Map<string, { total: number; delivery: number; days: number }> {
  const m = new Map<string, { total: number; delivery: number; days: number }>();
  for (const d of days) {
    const t = dayTotal(d);
    if (t <= 0) continue;
    const k = d.date.slice(0, 7);
    const cur = m.get(k) ?? { total: 0, delivery: 0, days: 0 };
    m.set(k, { total: cur.total + t, delivery: cur.delivery + t - d.hall, days: cur.days + 1 });
  }
  return m;
}

// ── 손익에 「지난 매출」 쓰기 (2026-10-27 사장님 "지난 매출 기준으로 바꿔 줘") ──
// 장부에 일별 매출이 없는 달(장부 쓰기 전 2024-09 ~ 2026-08)은 통장 입금액 대신 포스 홀 매출 + 배민·쿠팡 주문 금액을 매출로 본다.
// 통장 입금액 기준은 설 연휴처럼 카드 입금이 다음 달로 밀리면 그 달이 적자로 보인다 (2025-01).
// 배달앱 수수료 = 주문 금액 − 그 달 그 배달앱 입금액 (9·10월 손익과 같은 방식). 입금이 없거나 이상하면 주문의 80%를 입금으로 본다.
export const HISTORY_DELIVERY_DEPOSIT_RATE = 0.8;

export function historyChannelSales(month: string, days: HistoryDay[], txs: Pick<Transaction, "date" | "in" | "channel">[]): ChannelSale[] {
  const mine = days.filter((d) => d.date.startsWith(month));
  const sum = (f: (d: HistoryDay) => number | null | undefined) => mine.reduce((a, d) => a + (f(d) ?? 0), 0);
  const hall = sum((d) => d.hall);
  if (!mine.length || hall + sum((d) => d.baemin) + sum((d) => d.coupang) <= 0) return [];
  const bankIn = (ch: string) => txs.filter((t) => t.channel === ch && t.in > 0 && t.date.startsWith(month)).reduce((a, t) => a + t.in, 0);
  const delivery = (channel: string, name: string, orders: number): ChannelSale | null => {
    if (orders <= 0) return null;
    const got = bankIn(channel);
    const deposit = got >= orders * 0.5 && got <= orders ? got : Math.round(orders * HISTORY_DELIVERY_DEPOSIT_RATE);
    return { month, channel, name, orders, deposit, count: 0 };
  };
  return [
    { month, channel: "hall_card", name: "홀 (포스 매출)", orders: hall, deposit: hall, count: sum((d) => d.receipts) },
    delivery("baemin", "배달의민족", sum((d) => d.baemin)),
    delivery("coupang", "쿠팡이츠", sum((d) => d.coupang)),
  ].filter((s): s is ChannelSale => !!s);
}

/** 손익에 넣을 매출: 장부 일별 매출이 한 달 치 있으면 그것, 없거나 달 중간부터면 「지난 매출」, 그것도 없으면 통장 입금액(빈 목록) */
export function pnlSales(month: string, daily: { date: string }[], effective: ChannelSale[], history: HistoryDay[], txs: Pick<Transaction, "date" | "in" | "channel">[]): { sales: ChannelSale[]; fromHistory: boolean } {
  const hasDaily = daily.some((d) => d.date.startsWith(month));
  if (hasDaily && !salesStartLate(month, daily)) return { sales: effective, fromHistory: false };
  // 통장 자료가 없는 달은 비용이 없으니 지난 매출을 넣지 않는다
  const hist = txs.some((t) => t.date.startsWith(month)) ? historyChannelSales(month, history, txs) : [];
  return hist.length ? { sales: hist, fromHistory: true } : { sales: hasDaily ? [] : effective, fromHistory: false };
}
