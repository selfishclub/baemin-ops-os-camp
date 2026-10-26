import { describe, expect, it } from "vitest";
import type { Purchase } from "./costing/purchases";
import { computePayables, vendorKey, type PayablesSetting } from "./payables";
import type { Transaction } from "./types";

const pu = (id: string, date: string, vendor: string, amount: number, o: Partial<Purchase> = {}): Purchase => ({
  id,
  date,
  vendor,
  discount: 0,
  lines: [{ name: "x", unitPrice: amount, qty: 1, amount, category: "원재료비", itemId: null, itemQty: 0 }],
  ...o,
});
const tx = (date: string, payee: string, out: number): Transaction => ({ id: `${date}${payee}${out}`, date, payee, out, in: 0, month: date.slice(0, 7), source: "bank", major: "매출원가", minor: "원재료비", channel: null, review: null });
const setting = (o: Partial<PayablesSetting> = {}): PayablesSetting => ({ since: "2026-10-01", settled: {}, statements: {}, ...o });

describe("미지급금", () => {
  it("거래처 이름은 (주)·주식회사·띄어쓰기를 떼고 맞춘다", () => {
    expect(vendorKey("(주)그루온")).toBe(vendorKey("주식회사 그루온"));
  });
  it("외상 영수증 − 통장 이체 = 남은 돈, 체크카드로 바로 낸 영수증은 뺀다", () => {
    const ps = [pu("a", "2026-10-03", "으뜸식품", 450_000), pu("b", "2026-10-16", "으뜸식품", 210_000), pu("c", "2026-10-20", "홈마트", 59_200)];
    const txs = [tx("2026-10-16", "NH콕송금 주식회사 으뜸식품", 450_000), tx("2026-10-20", "NH체크 홈마트", 59_200)];
    const r = computePayables(ps, txs, setting());
    expect(r.rows.map((x) => [x.vendor, x.billed, x.paid, x.due])).toEqual([["으뜸식품", 660_000, 450_000, 210_000]]);
    expect(r.total).toBe(210_000);
  });
  it("부가세 별도 명세표는 부가세 포함, 주류는 보증금 순액까지", () => {
    const ps = [
      pu("g", "2026-10-21", "(주)그루온", 652_000, { vat: 65_200, vatExcluded: true }),
      pu("l", "2026-10-23", "청주주류", 617_000, { vat: 56_091, deposit: -4_900 }),
    ];
    const r = computePayables(ps, [], setting());
    expect(r.rows.map((x) => [x.vendor, x.due])).toEqual([
      ["(주)그루온", 717_200],
      ["청주주류", 612_100],
    ]);
  });
  it("통장 이름이 '주류구매 유한회사 청주주류'여도 청주주류로 본다", () => {
    const r = computePayables([pu("l", "2026-10-01", "청주주류", 1_000_000)], [tx("2026-10-31", "주류구매 유한회사 청주주류", 1_000_000)], setting());
    expect(r.rows.map((x) => x.due)).toEqual([0]);
    expect(r.total).toBe(0);
  });
  it("'여기까지 다 냈어요' 날짜 전은 빼고, 시작일 전 영수증도 뺀다", () => {
    const ps = [pu("o", "2026-09-30", "삼우상사", 120_000), pu("a", "2026-10-08", "삼우상사", 120_000), pu("b", "2026-10-20", "삼우상사", 120_000)];
    expect(computePayables(ps, [], setting()).total).toBe(240_000);
    expect(computePayables(ps, [], setting({ settled: { [vendorKey("삼우상사")]: "2026-10-10" } })).total).toBe(120_000);
  });
  it("시작일에 있던 외상을 더하고, 가맹수수료 이체는 재료 대금으로 안 본다", () => {
    const k = vendorKey("삼우상사");
    const ps = [pu("a", "2026-10-01", "삼우상사", 240_000), pu("b", "2026-10-08", "삼우상사", 480_000), pu("g", "2026-10-08", "(주)그루온", 100_000)];
    const fee = { ...tx("2026-10-12", "NH콕송금 주식회사그루온", 1_001_880), major: "가맹수수료" as const, minor: "가맹수수료" };
    const r = computePayables(ps, [tx("2026-10-09", "NH콕송금 김윤호(삼우상사)", 720_000), fee], setting({ opening: { [k]: 720_000 } }));
    expect(r.rows.map((x) => [x.vendor, x.due])).toEqual([
      ["삼우상사", 720_000],
      ["(주)그루온", 100_000],
    ]);
  });
  it("부가세 모르는 영수증 수와 거래처 잔액을 같이 준다", () => {
    const k = vendorKey("코카콜라음료");
    const r = computePayables([pu("c", "2026-10-07", "코카콜라음료", 44_400)], [], setting({ statements: { [k]: { amount: 44_400, date: "2026-10-25" } } }));
    expect(r.rows[0]).toMatchObject({ vatUnknown: 1, statement: { amount: 44_400 } });
  });
});
