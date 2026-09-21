import { describe, expect, it } from "vitest";
import type { Transaction } from "../types";
import type { Purchase } from "./purchases";
import { cardPayee, isCardTx, matchCardReceipts } from "./receiptMatch";

// 가짜 거래·가짜 영수증
let n = 0;
const tx = (date: string, payee: string, out: number, extra: Partial<Transaction> = {}): Transaction =>
  ({ id: `t${++n}`, month: date.slice(0, 7), date, payee, out, in: 0, source: "bank", major: "매출원가", minor: "원재료비", channel: null, review: null, ...extra }) as Transaction;
const buy = (id: string, date: string, vendor: string, amount: number, discount = 0): Purchase => ({
  id,
  date,
  vendor,
  discount,
  lines: [{ name: "물건", unitPrice: amount, qty: 1, amount, category: "원재료비", itemId: null, itemQty: 0 }],
});

describe("영수증 없는 체크카드 결제", () => {
  it("체크카드 결제만 본다", () => {
    expect(isCardTx(tx("2026-08-03", "NH체크 가짜마트", 1000))).toBe(true);
    expect(isCardTx(tx("2026-08-03", "NH콕송금 가짜식품", 1000))).toBe(false);
    expect(cardPayee("NH체크 가짜마트")).toBe("가짜마트");
  });

  it("금액이 같은 영수증(날짜 ±3일)과 짝짓고, 남은 결제를 보여 준다", () => {
    const txs = [tx("2026-08-03", "NH체크 가짜마트", 58500), tx("2026-08-05", "NH체크 가짜상회", 12000)];
    const r = matchCardReceipts(txs, [buy("p1", "2026-08-04", "가짜마트", 58500)]);
    expect(r.matched.map((m) => m.purchases[0].id)).toEqual(["p1"]);
    expect(r.missing.map((t) => t.out)).toEqual([12000]);
  });

  it("할인이 있으면 할인 뺀 금액(결제액)으로 맞춘다", () => {
    const r = matchCardReceipts([tx("2026-08-12", "NH체크 (주)가짜유통", 69780)], [buy("p1", "2026-08-12", "가짜식자재마트", 79780, 10000)]);
    expect(r.missing).toEqual([]);
  });

  it("한 번에 여러 곳을 결제했으면 영수증 두세 장의 합으로 찾는다", () => {
    const r = matchCardReceipts([tx("2026-08-01", "NH체크 네이버페이", 128100)], [buy("a", "2026-08-01", "가짜김", 94000), buy("b", "2026-08-01", "가짜떡", 34100)]);
    expect(r.matched[0].purchases.map((p) => p.id).sort()).toEqual(["a", "b"]);
  });

  it("날짜가 3일 넘게 떨어지면 짝이 아니다", () => {
    const r = matchCardReceipts([tx("2026-08-01", "NH체크 가짜마트", 5000)], [buy("p1", "2026-08-06", "가짜마트", 5000)]);
    expect(r.missing).toHaveLength(1);
  });

  it("같은 날 카드 취소는 원래 결제와 함께 뺀다", () => {
    const txs = [tx("2026-08-08", "NH체크 가짜생활", 16000), tx("2026-08-08", "NH체크 가짜생활", -16000), tx("2026-08-08", "NH체크 가짜생활", 10000)];
    const r = matchCardReceipts(txs, [buy("p1", "2026-08-08", "가짜생활", 10000)]);
    expect(r.cancelled).toHaveLength(1);
    expect(r.missing).toEqual([]);
    expect(r.cardCount).toBe(2);
  });

  it("개인 결제·청구서·필요 없다고 한 결제와 거래처는 뺀다", () => {
    const personal = tx("2026-08-09", "NH체크 인터넷상거래", 79800, { major: "제외", minor: "손익에 안 넣음" });
    const bill = tx("2026-08-18", "NH체크 가짜통신", 100510, { major: "영업비", minor: "통신비" });
    const once = tx("2026-08-10", "NH체크 가짜철도", 15400, { major: "영업비", minor: "잡비" });
    const always = tx("2026-08-11", "NH체크 가짜주차", 7000, { major: "영업비", minor: "잡비" });
    const r = matchCardReceipts([personal, bill, once, always], [], { txIds: [once.id], payees: ["가짜주차"] });
    expect(r.missing).toEqual([]);
    expect(r.exempt.map((e) => `${e.tx.out}:${e.manual}`).sort()).toEqual(["100510:false", "15400:true", "7000:true", "79800:false"]);
  });

  it("한 영수증을 두 결제에 쓰지 않는다", () => {
    const txs = [tx("2026-08-14", "NH체크 가짜마트", 9600), tx("2026-08-15", "NH체크 가짜마트", 9600)];
    const r = matchCardReceipts(txs, [buy("p1", "2026-08-14", "가짜마트", 9600)]);
    expect(r.matched).toHaveLength(1);
    expect(r.missing).toHaveLength(1);
  });
});
