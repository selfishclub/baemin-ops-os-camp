import { describe, expect, it } from "vitest";
import { cardsalesMonth, CardsalesParseError, covered, mergeCardsales, mergeRanges, parseCardsalesPurchase, rangesToFetch, type CardsalesData } from "./cardsales";
import type { Transaction } from "./types";

// 여신협회 "기간별 매입내역 - 세부내역" 엑셀 모양 (카드번호는 가짜)
const HEAD = ["No.", "거래일자", "매입일자", "승인번호", "카드사", "제휴카드사", "카드번호", "카드종류", "매입금액", "가맹점수수료", "수수료포인트", "수수료포인트률", "기타수수료", "수수료합계(B)", "부가세대리납부금액(C)", "지급금액(A-B-C)", "지급예정일", "MPM QR결제여부"];
const row = (n: number, sale: string, issuer: string, amount: number, fee: number, payDate: string) => [String(n), sale, sale, "000", issuer, "", "1234-****-****-0000", "신용카드", amount.toLocaleString(), String(fee), "0", "0", "0", fee.toLocaleString(), "0", (amount - fee).toLocaleString(), payDate, "-"];
const SHEET = [
  ["기간별 매입내역 조회 - 세부내역"],
  ["건수", "4", "합계", "300,000"],
  HEAD,
  row(1, "2026-09-30", "KB카드", 100000, 800, "20261002"),
  row(2, "2026-09-30", "KB카드", 50000, 400, "20261002"),
  row(3, "2026-10-01", "농협NH카드", 100000, 900, "20261005"),
  row(4, "2026-10-01", "씨티은행", 50000, 500, "20261005"),
];

const tx = (date: string, payee: string, amount: number, channel: string | null = null): Transaction => ({ id: `${date}-${payee}-${amount}`, month: date.slice(0, 7), date, payee, out: 0, in: amount, source: "bank", major: null, minor: null, channel, review: null });

describe("여신협회 매입내역 읽기", () => {
  it("카드사·거래일·지급예정일로 묶고 카드번호는 버린다", () => {
    const r = parseCardsalesPurchase(SHEET);
    expect(r.count).toBe(4);
    expect(r.total).toBe(300000);
    expect(r.from).toBe("2026-09-30");
    expect(r.to).toBe("2026-10-01");
    expect(r.payouts).toHaveLength(3);
    const kb = r.payouts.find((p) => p.issuer === "KB카드")!;
    expect(kb).toMatchObject({ channel: "card_kb", saleDate: "2026-09-30", payDate: "2026-10-02", count: 2, amount: 150000, fee: 1200, pay: 148800 });
    expect(r.payouts.find((p) => p.issuer === "농협NH카드")!.channel).toBe("card_nh");
    expect(r.payouts.find((p) => p.issuer === "씨티은행")!.channel).toBeNull();
    expect(JSON.stringify(r.payouts)).not.toContain("1234");
  });
  it("다른 엑셀이면 알려 준다", () => {
    expect(() => parseCardsalesPurchase([["날짜", "금액"], ["2026-10-01", "1"]])).toThrow(CardsalesParseError);
  });
});

describe("받아 둔 자료 합치기", () => {
  it("겹치는 구간은 하나로", () => {
    expect(mergeRanges([{ from: "2026-10-01", to: "2026-10-10" }, { from: "2026-09-20", to: "2026-09-30" }, { from: "2026-10-05", to: "2026-10-20" }])).toEqual([{ from: "2026-09-20", to: "2026-10-20" }]);
    expect(mergeRanges([{ from: "2026-10-01", to: "2026-10-05" }, { from: "2026-10-08", to: "2026-10-09" }])).toHaveLength(2);
  });
  it("새로 받은 거래일 것은 바꾸고 나머지는 둔다", () => {
    const first = mergeCardsales(null, parseCardsalesPurchase(SHEET), "t1");
    const again = mergeCardsales(first, { from: "2026-10-01", to: "2026-10-01", payouts: [{ channel: "card_nh", issuer: "농협NH카드", saleDate: "2026-10-01", payDate: "2026-10-05", count: 1, amount: 1, fee: 0, pay: 1 }] }, "t2");
    expect(again.payouts).toHaveLength(2); // KB 9/30 + 새 NH 10/1 (씨티 10/1 은 새 자료에 없으니 사라짐)
    expect(again.ranges).toEqual([{ from: "2026-09-30", to: "2026-10-01" }]);
    expect(covered(again, { from: "2026-09-30", to: "2026-10-01" })).toBe(true);
    expect(covered(again, { from: "2026-09-29", to: "2026-10-01" })).toBe(false);
  });
});

describe("통장과 대조", () => {
  const data = mergeCardsales(null, parseCardsalesPurchase(SHEET), "t");
  it("같은 날 같은 금액이면 일치, 카드사 글자로도 찾는다", () => {
    const m = cardsalesMonth(data, "2026-10", [tx("2026-10-02", "KB카드 가맹점대금", 148800), tx("2026-10-05", "NH카드", 99100)], "2026-10-10");
    const kb = m.checks.find((c) => c.issuer === "KB카드")!;
    expect(kb.status).toBe("일치");
    expect(m.checks.find((c) => c.issuer === "농협NH카드")!.status).toBe("일치");
    expect(m.checks.find((c) => c.issuer === "씨티은행")!.status).toBe("미입금"); // 장부 카드사가 없으니 짝을 못 지음
  });
  it("장부 채널로 분류된 입금도 짝이 된다", () => {
    const m = cardsalesMonth(data, "2026-10", [tx("2026-10-02", "가맹점입금", 148800, "card_kb")], "2026-10-10");
    expect(m.checks.find((c) => c.issuer === "KB카드")!.status).toBe("일치");
  });
  it("금액이 다르면 차이, 늦게 들어오면 늦게 들어옴, 통장 끝 뒤면 예정", () => {
    const m = cardsalesMonth(data, "2026-10", [tx("2026-10-02", "KB카드", 140000), tx("2026-10-06", "NH카드", 99100)], "2026-10-10");
    expect(m.checks.find((c) => c.issuer === "KB카드")!.status).toBe("차이");
    const nh = m.checks.find((c) => c.issuer === "농협NH카드")!;
    expect(nh.status).toBe("늦게 들어옴");
    expect(nh.depositDate).toBe("2026-10-06");
    const m2 = cardsalesMonth(data, "2026-10", [], "2026-10-03");
    expect(m2.checks.find((c) => c.issuer === "KB카드")!.status).toBe("미입금");
    expect(m2.checks.find((c) => c.issuer === "농협NH카드")!.status).toBe("예정");
  });
  it("수수료율은 이 달 거래일 것으로, 지급예정은 이 달 지급일 것으로", () => {
    const m = cardsalesMonth(data, "2026-10", [], "2026-10-03");
    const kb = m.issuers.find((s) => s.issuer === "KB카드")!;
    expect(kb.amount).toBe(0); // 거래일은 9/30 (지난달)
    expect(kb.expected).toBe(148800); // 지급은 10/2 (이 달)
    const nh = m.issuers.find((s) => s.issuer === "농협NH카드")!;
    expect(nh.amount).toBe(100000);
    expect(nh.feeRate).toBe(0.9);
    expect(m.totals.missing).toBe(148800);
  });
});

describe("받을 구간", () => {
  it("지난달 말 일주일부터 어제까지, 31일씩 나눠서", () => {
    expect(rangesToFetch("2026-10", "2026-10-17")).toEqual([{ from: "2026-09-24", to: "2026-10-16" }]);
    expect(rangesToFetch("2026-09", "2026-10-17")).toEqual([
      { from: "2026-08-25", to: "2026-09-24" },
      { from: "2026-09-25", to: "2026-09-30" },
    ]);
    expect(rangesToFetch("2026-11", "2026-10-17")).toEqual([]);
  });
});

describe("저장 모양", () => {
  it("CardsalesData 는 JSON 으로 그대로 저장된다", () => {
    const d: CardsalesData = mergeCardsales(null, parseCardsalesPurchase(SHEET), "t");
    expect(JSON.parse(JSON.stringify(d))).toEqual(d);
  });
});
