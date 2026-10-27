import { describe, expect, it } from "vitest";
import { DEFAULT_OPENING, balanceSheet, openingEntry } from "./books";
import { ACC_DEPRECIATION, BANK, CAPITAL, LOAN, depreciationEntry, entryBalanced, trialBalance, type JournalEntry } from "./journal";
import { NOT_IN_TAX_BOOKS, taxProfit, taxView } from "./taxAccounts";

describe("시작 잔액 · 재무상태표", () => {
  it("시작 잔액: 자산 − 부채 − 감가상각누계액 = 자본금", () => {
    const e = openingEntry({ ...DEFAULT_OPENING, balances: { ...DEFAULT_OPENING.balances, [BANK]: 5_000_000 } });
    expect(entryBalanced(e)).toBe(true);
    const capital = e.lines.find((l) => l.account === CAPITAL)!.credit;
    expect(capital).toBe(5_000_000 + 40_000_000 + 11_980_000 - DEFAULT_OPENING.balances[ACC_DEPRECIATION] - 17_964_541);
  });
  it("감가상각은 비용과 누계액으로, 재무상태표는 자산 = 부채 + 자본", () => {
    const sale: JournalEntry = { date: "2026-09-30", memo: "매출", source: "매출", lines: [{ account: BANK, debit: 1_100_000, credit: 0 }, { account: "매출", debit: 0, credit: 1_000_000 }, { account: "부가세예수금", debit: 0, credit: 100_000 }] };
    const repay: JournalEntry = { date: "2026-09-25", memo: "대출", source: "통장", lines: [{ account: LOAN, debit: 300_000, credit: 0 }, { account: BANK, debit: 0, credit: 300_000 }] };
    const card: JournalEntry = { date: "2026-09-30", memo: "카드", source: "매출", lines: [{ account: "미수금-국민카드", debit: 50_000, credit: 0 }, { account: "미수금-신한카드", debit: 0, credit: 20_000 }, { account: BANK, debit: 0, credit: 30_000 }] };
    const dep = depreciationEntry("2026-09", 199_667);
    const bs = balanceSheet([openingEntry(DEFAULT_OPENING), sale, repay, card, ...dep]);
    expect(bs.totalAssets).toBe(bs.totalLiabilities + bs.totalEquity);
    expect(bs.liabilities.find((r) => r.account === LOAN)!.amount).toBe(17_964_541 - 300_000);
    expect(bs.assets.find((r) => r.account === "미수금")!.amount).toBe(30_000);
    expect(bs.equity.find((r) => r.account.startsWith("이익"))!.amount).toBe(1_000_000 - 199_667);
  });
  it("세무사 계정으로 묶고, 급여는 세무 장부 이익에서 뺀다", () => {
    const e: JournalEntry = {
      date: "2026-10-31",
      memo: "x",
      source: "통장",
      lines: [
        { account: "매출", debit: 0, credit: 10_000_000 },
        { account: "임대료", debit: 2_400_000, credit: 0 },
        { account: "노무관리비급여", debit: 3_000_000, credit: 0 },
        { account: "배달앱 수수료", debit: 500_000, credit: 0 },
        { account: BANK, debit: 4_100_000, credit: 0 },
      ],
    };
    const v = taxView(trialBalance([e]).rows);
    expect(v.map((r) => r.tax)).toEqual(["식음료매출", "지급임차료", "판매수수료", NOT_IN_TAX_BOOKS]);
    expect(v.find((r) => r.tax === "지급임차료")).toMatchObject({ amount: 2_400_000, avg2025: 2_400_000 });
    expect(taxProfit(v)).toBe(10_000_000 - 2_400_000 - 500_000);
    expect(taxView(trialBalance([e]).rows, { "배달앱 수수료": "수수료비용" }).find((r) => r.tax === "수수료비용")!.sources[0].rule.sure).toBe(true);
  });
});
