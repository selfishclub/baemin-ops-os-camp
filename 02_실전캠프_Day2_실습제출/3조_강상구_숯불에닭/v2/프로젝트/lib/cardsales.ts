import { CARD_PRESETS, type ChannelId } from "./categories";
import { issuerToChannel } from "./cardApproval";
import { nextMonth } from "./month";
import type { DailySale, Month, Transaction } from "./types";

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

/**
 * 새로 받은 구간의 거래일 것은 새 것으로 바꾸고, 나머지는 둔다.
 *
 * 다만 여신협회는 **매입일**로 조회하는데 우리는 **거래일**로 바꿔 넣는다. 그래서 구간 양 끝의
 * 거래일은 일부만 들어온다 — 매입일 11/15~11/17로 받으면 거래일 11/13 중 11/14에 매입된 줄이
 * 빠진 채로 온다. 그걸 그대로 덮으면 이미 받아 둔 줄이 사라진다.
 * (2026-11-18: 구멍 메우기가 좁게 받아 와 거래일 11/13이 1,617,000원에서 34,000원으로 줄었다.)
 *
 * 그래서 **전보다 적게 온 거래일은 덜 받은 것으로 보고 전 것을 둔다.** 취소·환불로 진짜 줄어든
 * 날이면 옛 숫자가 남지만, 그건 통장 대조에서 "차이"로 보인다 — 말없이 사라지는 것보다 낫다.
 */
export function mergeCardsales(prev: CardsalesData | null, next: { payouts: CardPayout[]; from: string; to: string }, now = new Date().toISOString()): CardsalesData {
  const prevRows = prev?.payouts ?? [];
  const sum = (rows: CardPayout[], day: string) => rows.reduce((a, p) => a + (p.saleDate === day ? p.amount : 0), 0);
  const short = new Set<string>();
  for (const p of prevRows) {
    if (p.saleDate < next.from || p.saleDate > next.to || short.has(p.saleDate)) continue;
    if (sum(next.payouts, p.saleDate) < sum(prevRows, p.saleDate)) short.add(p.saleDate);
  }
  const kept = prevRows.filter((p) => p.saleDate < next.from || p.saleDate > next.to || short.has(p.saleDate));
  const incoming = next.payouts.filter((p) => !short.has(p.saleDate));
  return {
    fetchedAt: now,
    ranges: mergeRanges([...(prev?.ranges ?? []), { from: next.from, to: next.to }]),
    payouts: [...kept, ...incoming].sort((a, b) => a.saleDate.localeCompare(b.saleDate) || a.issuer.localeCompare(b.issuer)),
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
  // 이미 다른 카드사로 분류된 입금은 남의 것이다 — 롯데카드 대금도 비씨처럼 "PC-SC제일"로 들어와서
  // 글자만 보면 비씨 입금에 롯데 몫이 더해졌다 (2026-10-13·16 비씨 "차이")
  if (t.channel) return false;
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

/** 이 달 지급예정을 다 보려면 받아야 할 거래일 구간: 지난달 말 일주일 ~ 이 달 말(오늘 전날까지). 28일씩 나눈다.
 *  여신협회는 매입일로 31일까지만 묻는데, 가져오기는 거래일 구간을 매입일 +1일 ~ +4일로 늘려 묻는다(3일 더 길어짐).
 *  31일로 나누면 34일이 돼 "31일까지만 조회돼요"로 막혔다 (2026-11-27, 10/25~11/24 → 매입일 10/26~11/27 33일) */
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
    const b = addDays(a, 27) < to ? addDays(a, 27) : to;
    out.push({ from: a, to: b });
    a = addDays(b, 1);
  }
  return out;
}

/** 받아 둔 구간이 이 구간을 다 덮나 */
export function covered(data: CardsalesData | null, r: { from: string; to: string }): boolean {
  return !!data?.ranges.some((x) => x.from <= r.from && x.to >= r.to);
}

// ── 자료 구멍 ──────────────────────────────────────────────────
// 받아 둔 구간인데도 그날 매입이 통째로(또는 거의) 빠져 있는 날이 생긴다. 그러면 지급예정액이
// 실제보다 작게 잡혀서, 통장에 제대로 들어온 돈이 "차이"로 빨갛게 뜬다.
// 2026-11-17에 뜬 "확인할 입금 12건"이 전부 이것이었다 — 10/08·09·23·24 매입이 빠져 있었고,
// 그 나흘을 다시 받으니 12건이 한 번에 사라졌다. 돈 문제가 아니라 자료 문제다.
const GAP_MIN = 100_000; // 이보다 적게 빠진 건 자정 넘긴 결제가 옆날로 간 것 (늘 조금씩 있다)
const GAP_RATIO = 0.3; // 그날 포스 카드 매출의 30% 넘게 빠졌을 때만

/** 포스엔 카드 매출이 있는데 여신협회 매입이 크게 빠진 날 → 다시 받을 구간 (거래일 기준) */
export function purchaseGaps(data: CardsalesData | null, sales: DailySale[], today: string): { from: string; to: string }[] {
  if (!data?.ranges.length) return [];
  const buy = new Map<string, number>();
  for (const p of data.payouts) buy.set(p.saleDate, (buy.get(p.saleDate) ?? 0) + p.amount);
  const pos = new Map<string, number>();
  for (const s of sales) {
    if (!s.channel.startsWith("card_") || s.channel === "card_easy" || s.channel === "card_zeropay") continue;
    pos.set(s.date, (pos.get(s.date) ?? 0) + s.amount);
  }
  // 카드사는 거래 다음 날(KB는 이틀 뒤) 매입을 올린다. 최근 사흘은 아직 올라오는 중이라 구멍이 아니다
  const until = addDays(today, -3);
  const days: string[] = [];
  for (const [d, p] of [...pos.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (d > until || !data.ranges.some((r) => r.from <= d && r.to >= d)) continue;
    const short = p - (buy.get(d) ?? 0);
    if (short >= GAP_MIN && short >= p * GAP_RATIO) days.push(d);
  }
  // 이어진 날은 한 구간으로 묶고, 앞뒤로 하루씩 넓힌다 (자정 넘긴 결제가 옆날에 가 있다)
  const out: { from: string; to: string }[] = [];
  for (const d of days) {
    const last = out[out.length - 1];
    if (last && d <= addDays(last.to, 2)) last.to = d;
    else out.push({ from: d, to: d });
  }
  return out.map((r) => ({ from: addDays(r.from, -1), to: addDays(r.to, 1) }));
}
