import { describe, expect, it } from "vitest";
import type { Transaction } from "../types";
import type { Purchase, PurchaseCategory, PurchaseLine } from "./purchases";
import { findTxForPurchase, txCategoryForPurchase, txFromPurchase } from "./purchaseToTx";

const line = (name: string, amount: number, category: PurchaseCategory = "원재료비"): PurchaseLine => ({ name, unitPrice: amount, qty: 1, amount, category, itemId: null, itemQty: 0 });
const buy = (date: string, vendor: string, lines: PurchaseLine[], discount = 0): Purchase => ({ id: "p1", date, vendor, lines, discount });
const tx = (id: string, date: string, payee: string, out: number, major: string | null = null): Transaction =>
  ({ id, date, month: date.slice(0, 7), payee, out, in: 0, source: "bank", major, minor: major ? "원재료비" : null, channel: null, review: major ? null : "처음 보는 거래처" }) as unknown as Transaction;

describe("영수증 분류를 통장 줄 분류로", () => {
  it("금액이 가장 큰 줄의 분류를 쓴다", () => {
    expect(txCategoryForPurchase(buy("2026-08-03", "가짜마트", [line("특란", 30000), line("행주", 5000, "소모품비")]))).toEqual({ major: "매출원가", minor: "원재료비" });
    expect(txCategoryForPurchase(buy("2026-08-03", "가짜생활", [line("특란", 3000), line("행주", 9000, "소모품비")]))).toEqual({ major: "영업비", minor: "소모품비" });
    expect(txCategoryForPurchase(buy("2026-08-03", "가짜분식", [line("김밥", 4000, "기타")]))).toEqual({ major: "영업비", minor: "잡비" });
  });

  it("줄이 없으면 아무것도 안 준다", () => {
    expect(txCategoryForPurchase(buy("2026-08-03", "빈영수증", []))).toBeNull();
  });
});

describe("짝이 되는 통장 줄 찾기", () => {
  const p = buy("2026-08-14", "가짜마트", [line("특란", 35000)]);

  it("금액이 같고 날짜가 ±3일 안인 체크카드 줄을 찾는다", () => {
    const txs = [tx("t1", "2026-08-16", "NH체크 가짜마트", 35000)];
    expect(findTxForPurchase(p, txs)?.id).toBe("t1");
  });

  it("날짜가 멀거나 금액이 다르면 안 찾는다", () => {
    expect(findTxForPurchase(p, [tx("t1", "2026-08-20", "NH체크 가짜마트", 35000)])).toBeNull();
    expect(findTxForPurchase(p, [tx("t1", "2026-08-14", "NH체크 가짜마트", 34000)])).toBeNull();
  });

  it("체크카드가 아니면 안 찾는다 (송금·자동이체)", () => {
    expect(findTxForPurchase(p, [tx("t1", "2026-08-14", "NH콕송금 가짜마트", 35000)])).toBeNull();
  });

  it("이미 분류한 줄은 건드리지 않는다", () => {
    expect(findTxForPurchase(p, [tx("t1", "2026-08-14", "NH체크 가짜마트", 35000, "매출원가")])).toBeNull();
  });

  it("후보가 둘이면 헷갈리니 아무것도 안 한다", () => {
    const txs = [tx("t1", "2026-08-13", "NH체크 가짜마트", 35000), tx("t2", "2026-08-15", "NH체크 다른곳", 35000)];
    expect(findTxForPurchase(p, txs)).toBeNull();
  });

  it("할인이 있으면 실제 결제액으로 맞춘다", () => {
    const withDiscount = buy("2026-08-14", "가짜마트", [line("특란", 35000)], 2000);
    expect(findTxForPurchase(withDiscount, [tx("t1", "2026-08-14", "NH체크 가짜마트", 33000)])?.id).toBe("t1");
  });
});

describe("고칠 통장 줄 만들기", () => {
  it("분류를 채우고 확인 표시를 지운다", () => {
    const p = buy("2026-08-14", "가짜생활", [line("행주", 9000, "소모품비")]);
    const out = txFromPurchase(p, [tx("t1", "2026-08-14", "NH체크 가짜생활", 9000)]);
    expect(out).toMatchObject({ id: "t1", major: "영업비", minor: "소모품비", review: null });
  });

  it("짝이 없으면 null", () => {
    const p = buy("2026-08-14", "가짜마트", [line("특란", 35000)]);
    expect(txFromPurchase(p, [])).toBeNull();
  });
});
