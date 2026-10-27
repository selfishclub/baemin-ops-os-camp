// 복식장부 1~2단계 (2026-10-27) — 지금 장부 자료를 자동으로 분개(차변·대변)하고 시산표를 만든다.
//  - 사장님이 따로 입력하는 건 없다. 통장 거래·채널 매출·매입 영수증·손익의 어림값을 그대로 분개한다
//  - 금액은 손익과 같이 부가세 뺀 공급가로, 부가세는 부가세예수금(매출)·부가세대급금(매입) 계정에 따로 쌓는다
//  - 3단계(2026-10-27): 계정 이름을 세무사 장부(2025 재무제표)에 맞추고, 시작 잔액·감가상각·재무상태표는 lib/books.ts
import { EXCLUDED_MAJOR, OWNER_DRAW, channelKind, type Channel } from "./categories";
import { cardFeeOf, feeOf } from "./channels";
import { lineGrossPaid, lineSupply, type Purchase } from "./costing/purchases";
import { CARD_CREDIT_LABEL, type Pnl } from "./pnl";
import { expandSplits } from "./txSplit";
import type { ChannelSale, Transaction } from "./types";
import { hasInputVat, isVatPayment, type VatBasis } from "./vatBasis";

export type AccountType = "자산" | "부채" | "자본" | "수익" | "비용";

export interface JournalLine {
  account: string;
  debit: number;
  credit: number;
}

export interface JournalEntry {
  date: string;
  memo: string;
  source: "매출" | "수수료" | "통장" | "매입" | "어림" | "부가세" | "감가상각" | "시작";
  lines: JournalLine[];
}

// 계정과목 — 세무사 장부와 맞출 때(3단계) 이름을 바꾼다
export const BANK = "보통예금";
export const CASH = "현금";
export const VAT_OUT = "부가세예수금";
export const VAT_IN = "부가세대급금";
export const PAYABLE = "외상매입금";
export const ACCRUED = "미지급비용";
export const DRAW = "인출금";
export const SALES = "매출";
export const OTHER_INCOME = "기타수입";
export const MATERIAL = "원재료비";
export const SUSPENSE = "미분류(가지급금)";
export const LOAN = "장기차입금";
export const DEPOSIT = "임차보증금";
export const EQUIPMENT = "비품";
export const ACC_DEPRECIATION = "감가상각누계액";
export const DEPRECIATION = "감가상각비";
export const WITHHELD = "예수금";
export const CAPITAL = "자본금";
export const receivable = (channelName: string) => `미수금-${channelName}`;

const EXCLUDED_ACCOUNT: Record<string, string> = { "내 계좌 이체": DRAW, "손익에 안 넣음": DRAW, "대출·상환": LOAN, "보증금·예치금": "보증금", "비품 구입": EQUIPMENT };

export function accountType(account: string): AccountType {
  // 감가상각누계액은 비품을 깎는 자산(잔액이 음수로 보인다)
  if ([BANK, CASH, VAT_IN, "보증금", DEPOSIT, EQUIPMENT, ACC_DEPRECIATION, SUSPENSE, "미수금"].includes(account) || account.startsWith("미수금-")) return "자산";
  if ([VAT_OUT, PAYABLE, ACCRUED, LOAN, WITHHELD].includes(account)) return "부채";
  if (account === DRAW || account === CAPITAL) return "자본";
  if (account === SALES || account === OTHER_INCOME) return "수익";
  return "비용";
}

const r0 = (n: number) => Math.round(n);
/** 부가세 포함 금액 → [공급가, 부가세] (원 단위, 합이 원래 금액) */
export const splitVat = (gross: number): [number, number] => {
  const supply = r0(gross / 1.1);
  return [supply, gross - supply];
};

const line = (account: string, debit: number, credit = 0): JournalLine => ({ account, debit: r0(debit), credit: r0(credit) });
const dr = (account: string, n: number) => (n >= 0 ? line(account, n) : line(account, 0, -n));
const cr = (account: string, n: number) => (n >= 0 ? line(account, 0, n) : line(account, -n));
const monthEnd = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
const isMaterialCat = (c: string) => c === "원재료비" || c === "기타재료비";

export interface JournalInput {
  month: string;
  txs: Transaction[]; // 그 달 귀속 통장 거래 (나눠 분류한 줄 포함)
  sales: ChannelSale[]; // 손익과 같은 채널 매출 (settlement.effectiveSales)
  channels: Channel[];
  purchases: Purchase[]; // 그 달 매입 영수증
  pnl: Pnl; // 어림값(아직 안 나간 인건비·고정비)을 가져온다
  vat: VatBasis; // 의제매입세액
}

export function buildJournal(inp: JournalInput): JournalEntry[] {
  const { month, channels } = inp;
  const end = monthEnd(month);
  const nameOf = (id: string) => channels.find((c) => c.id === id)?.name ?? id;
  const out: JournalEntry[] = [];

  // ① 매출 — 채널마다 이 달 주문금액. 카드·배달·이체는 들어올 돈(미수금), 현금은 현금
  for (const s of inp.sales) {
    if (!s.orders) continue;
    const [supply, vat] = splitVat(s.orders);
    const kind = channelKind(s.channel, channels);
    const debitAccount = kind === "cash" ? CASH : receivable(nameOf(s.channel));
    out.push({ date: end, memo: `${nameOf(s.channel)} ${month} 매출`, source: "매출", lines: [dr(debitAccount, s.orders), cr(SALES, supply), cr(VAT_OUT, vat)] });
    // 배달앱 수수료 = 주문금액 − 정산금액 (손익과 같은 방식)
    const fee = feeOf(s);
    if (fee) {
      const [fs, fv] = splitVat(fee);
      out.push({ date: end, memo: `${nameOf(s.channel)} 수수료`, source: "수수료", lines: [dr("배달앱 수수료", fs), dr(VAT_IN, fv), cr(receivable(nameOf(s.channel)), fee)] });
    }
    // 카드 수수료 (카드 매출 × 0.89% 어림, 부가세 없음) — 카드사 미수금이 그만큼 덜 들어온다
    const cf = cardFeeOf(s);
    if (cf) out.push({ date: end, memo: `${nameOf(s.channel)} 카드 수수료 (어림)`, source: "수수료", lines: [dr("카드수수료", cf), cr(receivable(nameOf(s.channel)), cf)] });
  }

  // ② 통장 — 나눠 분류한 줄은 몫마다
  for (const t of expandSplits(inp.txs)) {
    const amount = t.out - t.in; // + 나간 돈, − 들어온 돈
    if (!amount) continue;
    const memo = t.payee;
    const entry = (lines: JournalLine[]) => out.push({ date: t.date, memo, source: "통장", lines });
    if (!t.major) {
      entry([dr(SUSPENSE, amount), cr(BANK, amount)]);
      continue;
    }
    if (t.major === "수입") {
      // 정산 입금은 미수금을 줄이고, 채널 없는 입금은 기타 수입
      entry([dr(BANK, -amount), cr(t.channel ? receivable(nameOf(t.channel)) : OTHER_INCOME, -amount)]);
      continue;
    }
    const minor = t.minor ?? "기타";
    if (t.major === EXCLUDED_MAJOR) {
      entry([dr(EXCLUDED_ACCOUNT[minor] ?? DRAW, amount), cr(BANK, amount)]);
      continue;
    }
    if (t.major === OWNER_DRAW.major && minor === OWNER_DRAW.minor) {
      entry([dr(DRAW, amount), cr(BANK, amount)]);
      continue;
    }
    if (isVatPayment(t.major, minor)) {
      entry([dr(VAT_OUT, amount), cr(BANK, amount)]);
      continue;
    }
    if (t.major === "매출원가") {
      // 재료 대금은 매입 영수증(외상매입금)을 갚는 것으로 본다
      entry([dr(PAYABLE, amount), cr(BANK, amount)]);
      continue;
    }
    if (hasInputVat(t.major, minor)) {
      const [s, v] = splitVat(amount);
      entry([dr(minor, s), dr(VAT_IN, v), cr(BANK, amount)]);
    } else entry([dr(minor, amount), cr(BANK, amount)]);
  }

  // ③ 매입 영수증 — 재료 줄만 (소모품 등은 통장 분류로 이미 비용). 공급가는 원재료비, 부가세는 대급금, 낼 돈은 외상매입금
  for (const p of inp.purchases) {
    let gross = 0;
    let supply = 0;
    for (const l of p.lines ?? []) {
      if (!isMaterialCat(l.category)) continue;
      gross += lineGrossPaid(p, l);
      supply += lineSupply(p, l);
    }
    if (!gross) continue;
    out.push({ date: p.date, memo: p.vendor, source: "매입", lines: [dr(MATERIAL, supply), dr(VAT_IN, gross - supply), cr(PAYABLE, gross)] });
  }
  // 카드 매출 세액공제 — 낼 부가세가 줄어든 만큼 이익 (손익표 세금과공과의 마이너스 줄과 같다)
  const credit = inp.pnl.vat && inp.pnl.lines.find((l) => l.label === "세금과공과")?.minors?.some((m) => m.label === CARD_CREDIT_LABEL) ? inp.pnl.vat.cardCredit : 0;
  if (credit) out.push({ date: end, memo: "카드 매출 세액공제 (부가세에서 깎아 줌)", source: "부가세", lines: [dr(VAT_OUT, credit), cr(CARD_CREDIT_LABEL, credit)] });
  if (inp.vat.deemedInput) {
    out.push({ date: end, memo: "의제매입세액공제 (면세 재료)", source: "부가세", lines: [dr(VAT_IN, inp.vat.deemedInput), cr(MATERIAL, inp.vat.deemedInput)] });
  }

  // ④ 어림 — 아직 통장에서 안 나간 인건비·고정비 (손익과 같은 금액)
  for (const e of inp.pnl.estimates) {
    if (e.kind === "material" || !e.amount) continue;
    out.push({ date: end, memo: `${e.what} (어림)`, source: "어림", lines: [dr(e.kind === "labor" ? "노무관리비급여" : (e.minor ?? e.what.replace(/\s*\(.*$/, "")), e.amount), cr(ACCRUED, e.amount)] });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** 비품 감가상각 한 달 몫 — 돈은 안 나가지만 비품 값이 줄어드는 비용 */
export function depreciationEntry(month: string, amount: number): JournalEntry[] {
  if (amount <= 0) return [];
  return [{ date: monthEnd(month), memo: "비품 감가상각 (한 달 몫)", source: "감가상각", lines: [dr(DEPRECIATION, amount), cr(ACC_DEPRECIATION, amount)] }];
}

export interface TrialRow {
  account: string;
  type: AccountType;
  debit: number;
  credit: number;
  balance: number; // 자산·비용은 차변 − 대변, 부채·자본·수익은 대변 − 차변
}

const TYPE_ORDER: AccountType[] = ["자산", "부채", "자본", "수익", "비용"];

export function trialBalance(entries: JournalEntry[]): { rows: TrialRow[]; debit: number; credit: number } {
  const by = new Map<string, TrialRow>();
  for (const e of entries)
    for (const l of e.lines) {
      const r = by.get(l.account) ?? { account: l.account, type: accountType(l.account), debit: 0, credit: 0, balance: 0 };
      r.debit += l.debit;
      r.credit += l.credit;
      by.set(l.account, r);
    }
  const rows = [...by.values()].map((r) => ({ ...r, balance: r.type === "자산" || r.type === "비용" ? r.debit - r.credit : r.credit - r.debit }));
  rows.sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || b.debit + b.credit - (a.debit + a.credit));
  return { rows, debit: rows.reduce((a, r) => a + r.debit, 0), credit: rows.reduce((a, r) => a + r.credit, 0) };
}

/** 분개로 본 이 달 이익 = 수익 − 비용 (인출금·부가세는 이익이 아니다) */
export function journalProfit(rows: TrialRow[]): number {
  return rows.filter((r) => r.type === "수익").reduce((a, r) => a + r.balance, 0) - rows.filter((r) => r.type === "비용").reduce((a, r) => a + r.balance, 0);
}

/** 한 분개의 차변 합 = 대변 합인지 (자동 분개라 늘 맞아야 한다 — 어긋나면 계산 실수) */
export const entryBalanced = (e: JournalEntry) => e.lines.reduce((a, l) => a + l.debit - l.credit, 0) === 0;
