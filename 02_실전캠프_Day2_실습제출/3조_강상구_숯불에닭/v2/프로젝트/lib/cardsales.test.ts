import { describe, expect, it } from "vitest";
import { cardsalesMonth, CardsalesParseError, covered, isCardDeposit, mergeCardsales, mergeRanges, parseCardsalesPurchase, purchaseGaps, rangesToFetch, type CardPayout, type CardsalesData } from "./cardsales";
import type { DailySale, Transaction } from "./types";

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
    // 10/01 은 전에 150,000원(NH 100,000 + 씨티 50,000)이었는데 새로 200,000원이 왔다 → 새 것으로
    const again = mergeCardsales(first, { from: "2026-10-01", to: "2026-10-01", payouts: [{ channel: "card_nh", issuer: "농협NH카드", saleDate: "2026-10-01", payDate: "2026-10-05", count: 1, amount: 200000, fee: 0, pay: 200000 }] }, "t2");
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
  it("다른 카드사로 분류된 입금은 글자가 겹쳐도 더하지 않는다", () => {
    // 롯데카드 대금도 "PC-SC제일"로 들어온다 — 비씨 입금에 섞이면 안 된다
    const lotte = tx("2026-10-13", "PC-SC제일 롯데35160008", 62370, "card_lotte");
    expect(isCardDeposit(lotte, "card_bc")).toBe(false);
    expect(isCardDeposit(lotte, "card_lotte")).toBe(true);
    expect(isCardDeposit(tx("2026-10-13", "PC-SC제일 739166817B", 827548, "card_bc"), "card_bc")).toBe(true);
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

// 2026-11-17: 받아 둔 구간인데도 10/08·09·23·24 매입이 통째로 빠져 있어 "확인할 입금 12건"이 떴다.
// 그 나흘을 다시 받으니 12건이 한 번에 사라졌다 — 돈 문제가 아니라 자료 구멍이었다.
describe("자료 구멍 (매입이 빠진 거래일)", () => {
  const buy = (saleDate: string, amount: number): CardPayout => ({ channel: "card_kb", issuer: "KB카드", saleDate, payDate: saleDate, count: 1, amount, fee: 0, pay: amount });
  const sold = (date: string, amount: number): DailySale => ({ date, channel: "card_kb", amount });
  const data = (payouts: CardPayout[]): CardsalesData => ({ fetchedAt: "t", ranges: [{ from: "2026-10-01", to: "2026-10-31" }], payouts });

  it("매입이 통째로 빠진 날을 찾아 앞뒤 하루씩 넓힌 구간으로 준다", () => {
    const d = data([buy("2026-10-07", 500_000), buy("2026-10-10", 400_000)]);
    const sales = [sold("2026-10-07", 500_000), sold("2026-10-08", 600_000), sold("2026-10-09", 700_000), sold("2026-10-10", 400_000)];
    expect(purchaseGaps(d, sales, "2026-11-17")).toEqual([{ from: "2026-10-07", to: "2026-10-10" }]);
  });

  it("자정 넘긴 결제가 옆날로 간 정도(조금 모자람)는 구멍이 아니다", () => {
    const d = data([buy("2026-10-07", 480_000)]);
    expect(purchaseGaps(d, [sold("2026-10-07", 500_000)], "2026-11-17")).toEqual([]);
  });

  it("최근 사흘은 아직 매입이 올라오는 중이라 구멍으로 보지 않는다", () => {
    const d = data([]);
    expect(purchaseGaps(d, [sold("2026-10-30", 500_000)], "2026-11-01")).toEqual([]);
    expect(purchaseGaps(d, [sold("2026-10-30", 500_000)], "2026-11-05")).toEqual([{ from: "2026-10-29", to: "2026-10-31" }]);
  });

  it("아직 받아 본 적 없는 구간은 구멍이 아니다", () => {
    const d = data([]);
    expect(purchaseGaps(d, [sold("2026-09-15", 500_000)], "2026-11-17")).toEqual([]);
  });

  it("자료가 아예 없으면 묻지 않는다", () => {
    expect(purchaseGaps(null, [sold("2026-10-08", 500_000)], "2026-11-17")).toEqual([]);
  });
});

// 2026-11-18: 구멍 메우기가 매입일 11/15~11/17로 좁게 받아 와, 거래일 11/13이
// 1,617,000원에서 34,000원으로 줄어든 일이 있었다. 여신협회는 매입일로 조회하는데
// 우리는 거래일로 바꿔 넣어서, 구간 맨 앞 거래일은 늘 일부만 들어온다.
describe("매입 자료 합치기 — 덜 받아 온 날은 덮지 않는다", () => {
  const row = (saleDate: string, amount: number, issuer = "현대카드"): CardPayout => ({ channel: "card_hyundai", issuer, saleDate, payDate: "2026-11-17", count: 1, amount, fee: 0, pay: amount });
  const prev = { fetchedAt: "", ranges: [{ from: "2026-11-01", to: "2026-11-15" }], payouts: [row("2026-11-13", 1_617_000), row("2026-11-14", 1_051_000)] };

  it("전보다 적게 온 거래일은 전 것을 둔다", () => {
    const out = mergeCardsales(prev, { payouts: [row("2026-11-13", 34_000), row("2026-11-14", 1_051_000)], from: "2026-11-13", to: "2026-11-14" });
    const on = (d: string) => out.payouts.filter((p) => p.saleDate === d).reduce((a, p) => a + p.amount, 0);
    expect(on("2026-11-13")).toBe(1_617_000);
    expect(on("2026-11-14")).toBe(1_051_000);
  });

  it("아예 안 온 거래일도 전 것을 둔다", () => {
    const out = mergeCardsales(prev, { payouts: [row("2026-11-14", 1_051_000)], from: "2026-11-13", to: "2026-11-14" });
    expect(out.payouts.filter((p) => p.saleDate === "2026-11-13").reduce((a, p) => a + p.amount, 0)).toBe(1_617_000);
  });

  it("더 받아 온 날은 새 것으로 바꾼다 (늦게 올라온 매입)", () => {
    const out = mergeCardsales(prev, { payouts: [row("2026-11-13", 1_700_000)], from: "2026-11-13", to: "2026-11-13" });
    expect(out.payouts.filter((p) => p.saleDate === "2026-11-13").reduce((a, p) => a + p.amount, 0)).toBe(1_700_000);
    expect(out.payouts.filter((p) => p.saleDate === "2026-11-14").length).toBe(1);
  });

  it("전에 없던 거래일은 그냥 넣는다", () => {
    const out = mergeCardsales(prev, { payouts: [row("2026-11-16", 900_000)], from: "2026-11-16", to: "2026-11-16" });
    expect(out.payouts.filter((p) => p.saleDate === "2026-11-16").reduce((a, p) => a + p.amount, 0)).toBe(900_000);
    expect(out.payouts.length).toBe(3);
  });
});
