import { CARD_PRESETS, type ChannelId } from "./categories";
import { issuerToChannel } from "./cardApproval";
import { nextMonth } from "./month";
import type { Month, Transaction } from "./types";

// 여신금융협회 카드매출조회(cardsales.or.kr) "기간별 매입내역 - 세부내역" 엑셀 → 카드사별 입금 예정과 통장 대조.
//  - 결제 한 건마다 거래일·카드사·매입금액·수수료·지급금액·지급예정일이 있다.
//  - 장부에는 건별로 두지 않고 (카드사, 거래일, 지급예정일)로 묶어 둔다. 카드번호·승인번호는 저장하지 않는다.
//  - 사장님 PC(전체판) 전용. 도우미가 Aside 에서 받아 오거나, 엑셀 파일을 직접 올린다.

export const CARDSALES_KEY = "cardsales_purchase_v1";

export interface CardPayout {
  channel: ChannelId | null; // 장부 카드사 채널 (모르는 카드사면 null)
  issuer: string; // 여신협회 표의 카드사 이름 그대로
  saleDate: string; // 거래일 "2026-09-16"
  payDate: string; // 지급예정일 "2026-09-18"
  count: number;
  amount: number; // 매입금액
  fee: number; // 수수료 합계 (+ 부가세 대리납부)
  pay: number; // 지급금액 = 통장에 들어올 돈
}

export interface CardsalesData {
  fetchedAt: string;
  ranges: { from: string; to: string }[]; // 받아 둔 거래일 구간 (합쳐 둠)
  payouts: CardPayout[];
}

export class CardsalesParseError extends Error {}

const num = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/[,\s원]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const ymd = (v: unknown) => {
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{4})[-./]?(\d{2})[-./]?(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
};

/** 엑셀 시트(행 목록) → 카드사·거래일·지급예정일 묶음. 머리줄은 이름으로 찾는다 (열 순서가 바뀌어도 되게) */
export function parseCardsalesPurchase(rows: unknown[][]): { payouts: CardPayout[]; from: string; to: string; total: number; count: number } {
  const hi = rows.findIndex((r) => r.some((c) => String(c).includes("지급예정일")) && r.some((c) => String(c).trim() === "카드사"));
  if (hi < 0) throw new CardsalesParseError("여신협회 '기간별 매입내역 세부내역' 엑셀이 아닌 것 같아요 (카드사·지급예정일 칸을 못 찾았어요).");
  const head = rows[hi].map((c) => String(c).replace(/\s+/g, ""));
  const col = (pred: (h: string) => boolean) => head.findIndex(pred);
  const c = {
    sale: col((h) => h === "거래일자"),
    issuer: col((h) => h === "카드사"),
    amount: col((h) => h === "매입금액"),
    fee: col((h) => h.startsWith("수수료합계")),
    vat: col((h) => h.startsWith("부가세대리납부")),
    pay: col((h) => h.startsWith("지급금액")),
    payDate: col((h) => h.includes("지급예정일")),
  };
  if (Object.values(c).some((i) => i < 0)) throw new CardsalesParseError("여신협회 엑셀의 칸 이름이 예상과 달라요 (거래일자·카드사·매입금액·수수료합계·지급금액·지급예정일).");

  const groups = new Map<string, CardPayout>();
  let from = "";
  let to = "";
  let total = 0;
  let count = 0;
  for (const r of rows.slice(hi + 1)) {
    const saleDate = ymd(r[c.sale]);
    const payDate = ymd(r[c.payDate]);
    const issuer = String(r[c.issuer] ?? "").trim();
    if (!saleDate || !payDate || !issuer) continue;
    const amount = num(r[c.amount]);
    const fee = num(r[c.fee]) + num(r[c.vat]);
    const pay = num(r[c.pay]);
    const key = `${issuer}|${saleDate}|${payDate}`;
    const g = groups.get(key) ?? { channel: issuerToChannel(issuer), issuer, saleDate, payDate, count: 0, amount: 0, fee: 0, pay: 0 };
    g.count += 1;
    g.amount += amount;
    g.fee += fee;
    g.pay += pay;
    groups.set(key, g);
    if (!from || saleDate < from) from = saleDate;
    if (!to || saleDate > to) to = saleDate;
    total += amount;
    count += 1;
  }
  if (!count) throw new CardsalesParseError("여신협회 엑셀에 결제 줄이 없어요.");
  return { payouts: [...groups.values()].sort((a, b) => a.saleDate.localeCompare(b.saleDate) || a.issuer.localeCompare(b.issuer)), from, to, total, count };
}

/** 겹치는 거래일 구간을 하나로 */
export function mergeRanges(ranges: { from: string; to: string }[]): { from: string; to: string }[] {
  const dayAfter = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const s = [...ranges].sort((a, b) => a.from.localeCompare(b.from));
  const out: { from: string; to: string }[] = [];
  for (const r of s) {
    const last = out[out.length - 1];
    if (last && r.from <= dayAfter(last.to)) last.to = r.to > last.to ? r.to : last.to;
    else out.push({ ...r });
  }
  return out;
}

/** 새로 받은 구간의 거래일 것은 새 것으로 바꾸고, 나머지는 둔다 */
export function mergeCardsales(prev: CardsalesData | null, next: { payouts: CardPayout[]; from: string; to: string }, now = new Date().toISOString()): CardsalesData {
  const kept = (prev?.payouts ?? []).filter((p) => p.saleDate < next.from || p.saleDate > next.to);
  return {
    fetchedAt: now,
    ranges: mergeRanges([...(prev?.ranges ?? []), { from: next.from, to: next.to }]),
    payouts: [...kept, ...next.payouts].sort((a, b) => a.saleDate.localeCompare(b.saleDate) || a.issuer.localeCompare(b.issuer)),
  };
}

// ── 대조 ───────────────────────────────────────────────────────
export type PayoutStatus = "일치" | "늦게 들어옴" | "차이" | "미입금" | "예정";

export interface PayoutCheck {
  channel: ChannelId | null;
  issuer: string;
  payDate: string;
  expected: number; // 여신협회 지급금액 합계
  deposited: number; // 통장에서 짝지은 입금
  depositDate: string | null;
  status: PayoutStatus;
}

export interface IssuerSummary {
  channel: ChannelId | null;
  issuer: string;
  count: number;
  amount: number; // 이 달 거래일 매입
  fee: number;
  feeRate: number; // %
  expected: number; // 이 달 지급예정
  deposited: number;
  missing: number;
  pending: number;
  matchedAny: boolean;
}

export interface CardsalesMonth {
  checks: PayoutCheck[];
  issuers: IssuerSummary[];
  totals: { amount: number; fee: number; feeRate: number; expected: number; deposited: number; missing: number; pending: number };
}

const TOL = (n: number) => Math.max(10, Math.abs(n) * 0.005);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** 통장 입금 중 이 카드사 것: 장부 채널이 그 카드사이거나, 입금 내용에 카드사 글자가 있으면 */
export function isCardDeposit(t: Transaction, channel: ChannelId): boolean {
  if (t.in <= 0) return false;
  if (t.channel === channel) return true;
  const p = CARD_PRESETS.find((x) => x.id === channel);
  return !!p && p.keywords.some((k) => t.payee.toUpperCase().includes(k.toUpperCase()));
}

/**
 * 이 달에 들어올(들어온) 카드 대금을 통장과 맞춘다.
 *  - 지급예정일이 이 달인 묶음만 본다. 같은 카드사·같은 날은 한 번에 들어오므로 날짜별로 합친다.
 *  - 그날 통장 입금 합계가 예정액과 같으면 일치. 그날 없으면 3일 안에 같은 금액이 들어왔는지 본다(늦게 들어옴).
 *  - lastBankDate(올린 통장의 마지막 날) 뒤면 예정, 그 전인데 없으면 미입금.
 *  - 매입·수수료율은 거래일이 이 달인 것으로 센다.
 */
export function cardsalesMonth(data: CardsalesData | null, month: Month, txs: Transaction[], lastBankDate: string): CardsalesMonth {
  const start = `${month}-01`;
  const end = `${nextMonth(month)}-01`;
  const payouts = data?.payouts ?? [];

  // 지급예정 (카드사·지급예정일)로 합침
  const due = new Map<string, PayoutCheck>();
  for (const p of payouts) {
    if (p.payDate < start || p.payDate >= end) continue;
    const key = `${p.issuer}|${p.payDate}`;
    const c = due.get(key) ?? { channel: p.channel, issuer: p.issuer, payDate: p.payDate, expected: 0, deposited: 0, depositDate: null, status: "예정" as PayoutStatus };
    c.expected += p.pay;
    due.set(key, c);
  }

  const used = new Set<string>(); // 이미 짝지은 "채널|날짜"
  const sumOn = (channel: ChannelId, date: string) => txs.filter((t) => t.date === date && isCardDeposit(t, channel)).reduce((a, t) => a + t.in, 0);
  const checks = [...due.values()].sort((a, b) => a.payDate.localeCompare(b.payDate) || a.issuer.localeCompare(b.issuer));
  for (const c of checks) {
    if (!c.channel) {
      c.status = c.payDate > lastBankDate ? "예정" : "미입금";
      continue;
    }
    const same = sumOn(c.channel, c.payDate);
    if (same > 0) {
      c.deposited = same;
      c.depositDate = c.payDate;
      used.add(`${c.channel}|${c.payDate}`);
      c.status = Math.abs(same - c.expected) <= TOL(c.expected) ? "일치" : "차이";
      continue;
    }
    // 하루~사흘 늦게 들어왔나 (그날 다른 예정이 없는 날의 입금만)
    let late = false;
    for (let k = 1; k <= 3 && !late; k++) {
      const d = addDays(c.payDate, k);
      if (used.has(`${c.channel}|${d}`)) continue;
      if (checks.some((o) => o.channel === c.channel && o.payDate === d)) continue;
      const s = sumOn(c.channel, d);
      if (s > 0 && Math.abs(s - c.expected) <= TOL(c.expected)) {
        c.deposited = s;
        c.depositDate = d;
        used.add(`${c.channel}|${d}`);
        c.status = "늦게 들어옴";
        late = true;
      }
    }
    if (!late) c.status = !lastBankDate || c.payDate > lastBankDate ? "예정" : "미입금";
  }

  // 카드사별 요약
  const by = new Map<string, IssuerSummary>();
  const get = (issuer: string, channel: ChannelId | null) => {
    const s = by.get(issuer) ?? { channel, issuer, count: 0, amount: 0, fee: 0, feeRate: 0, expected: 0, deposited: 0, missing: 0, pending: 0, matchedAny: false };
    by.set(issuer, s);
    return s;
  };
  for (const p of payouts) {
    if (p.saleDate < start || p.saleDate >= end) continue;
    const s = get(p.issuer, p.channel);
    s.count += p.count;
    s.amount += p.amount;
    s.fee += p.fee;
  }
  for (const c of checks) {
    const s = get(c.issuer, c.channel);
    s.expected += c.expected;
    s.deposited += c.deposited;
    if (c.status === "미입금") s.missing += c.expected;
    if (c.status === "예정") s.pending += c.expected;
    if (c.deposited > 0) s.matchedAny = true;
  }
  const issuers = [...by.values()].map((s) => ({ ...s, feeRate: s.amount ? Math.round((s.fee / s.amount) * 10000) / 100 : 0 })).sort((a, b) => b.amount - a.amount || b.expected - a.expected);
  const sum = (k: "amount" | "fee" | "expected" | "deposited" | "missing" | "pending") => issuers.reduce((a, s) => a + s[k], 0);
  const amount = sum("amount");
  const fee = sum("fee");
  return {
    checks,
    issuers,
    totals: { amount, fee, feeRate: amount ? Math.round((fee / amount) * 10000) / 100 : 0, expected: sum("expected"), deposited: sum("deposited"), missing: sum("missing"), pending: sum("pending") },
  };
}

/** 이 달 지급예정을 다 보려면 받아야 할 거래일 구간: 지난달 말 일주일 ~ 이 달 말(오늘 전날까지). 31일씩 나눈다 */
export function rangesToFetch(month: Month, today: string): { from: string; to: string }[] {
  const start = `${month}-01`;
  const lastDay = addDays(`${nextMonth(month)}-01`, -1);
  const yesterday = addDays(today, -1);
  const to = lastDay < yesterday ? lastDay : yesterday;
  const from = addDays(start, -7);
  if (to < from) return [];
  const out: { from: string; to: string }[] = [];
  let a = from;
  while (a <= to) {
    const b = addDays(a, 30) < to ? addDays(a, 30) : to;
    out.push({ from: a, to: b });
    a = addDays(b, 1);
  }
  return out;
}

/** 받아 둔 구간이 이 구간을 다 덮나 */
export function covered(data: CardsalesData | null, r: { from: string; to: string }): boolean {
  return !!data?.ranges.some((x) => x.from <= r.from && x.to >= r.to);
}
