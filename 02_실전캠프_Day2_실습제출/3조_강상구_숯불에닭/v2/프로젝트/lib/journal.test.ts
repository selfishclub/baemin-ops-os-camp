import { describe, expect, it } from "vitest";
import { DEFAULT_CHANNELS } from "./categories";
import { computePnl } from "./pnl";
import type { Purchase } from "./costing/purchases";
import { BANK, PAYABLE, VAT_IN, VAT_OUT, buildJournal, entryBalanced, journalProfit, receivable, splitVat, trialBalance } from "./journal";
import type { ChannelSale, Transaction } from "./types";
import { vatBasisFrom } from "./vatBasis";

const tx = (id: string, out: number, inn: number, major: Transaction["major"], minor: string | null, channel: string | null = null): Transaction => ({ id, date: "2026-10-10", payee: id, out, in: inn, month: "2026-10", source: "bank", major, minor, channel, review: null });
const sales: ChannelSale[] = [
  { month: "2026-10", channel: "hall_card", name: "홀 카드", orders: 11_000_000, deposit: 11_000_000, count: 100 },
  { month: "2026-10", channel: "baemin", name: "배달의민족", orders: 1_100_000, deposit: 880_000, count: 30 },
  { month: "2026-10", channel: "hall_cash", name: "홀 현금", orders: 110_000, deposit: 0, count: 3 },
];
const txs = [
  tx("카드입금", 0, 10_500_000, "수입", "매출액", "hall_card"),
  tx("배민입금", 0, 880_000, "수입", "매출액", "baemin"),
  tx("임대인", 2_200_000, 0, "임대료", "임대료"),
  tx("알바", 1_000_000, 0, "노무관리비", "노무관리비급여"),
  tx("으뜸", 400_000, 0, "매출원가", "원재료비"),
  tx("세무서", 300_000, 0, "세금과공과", "부가세"),
  tx("생활비", 500_000, 0, "기타", "생활비"),
  tx("모름", 10_000, 0, null, null),
];
const line = (amount: number, taxFree = false) => ({ name: "x", unitPrice: amount, qty: 1, amount, category: "원재료비" as const, itemId: null, itemQty: 0, ...(taxFree ? { taxFree } : {}) });
const purchases: Purchase[] = [
  { id: "u", date: "2026-10-05", vendor: "으뜸", discount: 0, vat: 0, lines: [line(540_000, true)] },
  { id: "g", date: "2026-10-08", vendor: "본사", discount: 0, vat: 10_000, vatExcluded: true, lines: [line(100_000)] },
];

describe("복식장부 자동 분개", () => {
  const vat = vatBasisFrom(purchases);
  const pnl = computePnl(txs, sales, undefined, 0, [], vat);
  const entries = buildJournal({ month: "2026-10", txs, sales, channels: DEFAULT_CHANNELS, purchases, pnl, vat });
  const tb = trialBalance(entries);
  const bal = (a: string) => tb.rows.find((r) => r.account === a)?.balance ?? 0;

  it("모든 분개는 차변 = 대변, 시산표 합계도 같다", () => {
    expect(entries.every(entryBalanced)).toBe(true);
    expect(tb.debit).toBe(tb.credit);
  });
  it("매출은 공급가와 부가세예수금으로, 정산 입금은 미수금을 줄인다", () => {
    expect(splitVat(11_000_000)).toEqual([10_000_000, 1_000_000]);
    expect(bal("매출")).toBe(10_000_000 + 1_000_000 + 100_000);
    expect(bal(receivable("홀 카드"))).toBe(500_000); // 아직 안 들어온 카드 매출
    expect(bal(receivable("배달의민족"))).toBe(0); // 주문 − 수수료 − 입금
    expect(bal("현금")).toBe(110_000);
  });
  it("재료는 영수증으로 외상매입금, 이체로 갚는다 — 남은 외상 = 영수증 − 이체", () => {
    expect(bal(PAYABLE)).toBe(540_000 + 110_000 - 400_000);
  });
  it("부가세: 낸 부가세는 예수금을 줄이고, 생활비는 인출금, 미분류는 가지급금", () => {
    expect(bal(VAT_OUT)).toBe(1_000_000 + 100_000 + 10_000 - 300_000);
    expect(bal(VAT_IN)).toBeGreaterThan(200_000);
    expect(bal("인출금")).toBe(-500_000);
    expect(bal("미분류(가지급금)")).toBe(10_000);
    expect(bal(BANK)).toBe(10_500_000 + 880_000 - 2_200_000 - 1_000_000 - 400_000 - 300_000 - 500_000 - 10_000);
  });
  it("분개로 본 이익: 재료비를 영수증 기준으로 보는 것 말고는 손익과 같다", () => {
    // 손익은 재료비 = max(통장, 영수증) × 공급가 비율 − 의제매입, 분개는 영수증 공급가 − 의제매입
    const material = (540_000 + 100_000) - vat.deemedInput;
    const pnlMaterial = pnl.lines.find((l) => l.label === "매출원가")!.amount;
    expect(journalProfit(tb.rows) - pnl.operatingProfit).toBe(pnlMaterial - material);
  });
});

describe("비품 구입", () => {
  it("에어컨처럼 몇 년 쓰는 물건은 비용이 아니라 비품(자산)", () => {
    const t: Transaction = { id: "a", date: "2025-06-11", payee: "에어컨구매비용", out: 1_980_000, in: 0, month: "2025-06", source: "bank", major: "제외", minor: "비품 구입", channel: null, review: null };
    const e = buildJournal({ month: "2025-06", txs: [t], sales: [], channels: DEFAULT_CHANNELS, purchases: [], pnl: computePnl([t], []), vat: vatBasisFrom([]) });
    expect(e[0].lines).toEqual([{ account: "비품", debit: 1_980_000, credit: 0 }, { account: BANK, debit: 0, credit: 1_980_000 }]);
    expect(computePnl([t], []).operatingProfit).toBe(0);
  });
});
