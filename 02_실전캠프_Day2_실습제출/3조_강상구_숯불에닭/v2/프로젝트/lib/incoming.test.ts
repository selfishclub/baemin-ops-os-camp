import { describe, expect, it } from "vitest";
import type { CardsalesData, CardPayout } from "./cardsales";
import { feeRateOf, incomingDays, incomingOn, lastKnownSale, lastSettledSale, netRateOf, unpostedSales, type DeliverySource } from "./incoming";
import type { SettlementRule } from "./settlement";
import type { DailySale } from "./types";

// 2026-11-17 실제 자료로 맞춘 것. 캐시노트가 그날 보여 준 금액과 맞춰 보며 만들었다.
//  - 여신협회에 올라온 거래일: 현대·신한 11/14까지, KB국민은 11/12까지 (국민카드는 이틀 느리다)
//  - 11/15(일) 매출은 +2영업일 = 11/17(화)에 들어온다

const pay = (p: Partial<CardPayout> & { channel: CardPayout["channel"]; saleDate: string; payDate: string; amount: number }): CardPayout => ({
  issuer: "", count: 1, fee: 0, pay: p.amount, ...p,
});

const sale = (date: string, channel: DailySale["channel"], amount: number): DailySale => ({ date, channel, amount });

const RULES: SettlementRule[] = [
  { channel: "card_hyundai", mode: "days", days: 2, weekday: 0 },
  { channel: "card_kb", mode: "days", days: 2, weekday: 0 },
  { channel: "card_samsung", mode: "calendar", days: 2, weekday: 0 },
  { channel: "baemin", mode: "days", days: 3, weekday: 0 },
];

// 현대카드: 11/13·11/14 매입이 올라와 있고 수수료율 1%
const HYUNDAI: CardPayout[] = [
  pay({ channel: "card_hyundai", issuer: "현대카드", saleDate: "2026-11-13", payDate: "2026-11-17", amount: 63_000, fee: 630, pay: 62_370 }),
  pay({ channel: "card_hyundai", issuer: "현대카드", saleDate: "2026-11-14", payDate: "2026-11-17", amount: 344_000, fee: 3_440, pay: 340_560 }),
];

const data = (payouts: CardPayout[]): CardsalesData => ({ fetchedAt: "2026-11-16T16:00:00Z", ranges: [{ from: "2026-09-22", to: "2026-11-14" }], payouts });

// 배민 — 주문일 + 3영업일. 정산 건은 11/15 주문분까지 만들어져 있다 (2026-11-17 실제 자료)
const BAEMIN: DeliverySource = {
  channel: "baemin",
  name: "배달의민족",
  settlements: [
    { depositDueDate: "2026-11-12", periodStart: "2026-11-09", periodEnd: "2026-11-09", depositAmount: 89_022 },
    { depositDueDate: "2026-11-13", periodStart: "2026-11-10", periodEnd: "2026-11-10", depositAmount: 29_512 },
    { depositDueDate: "2026-11-16", periodStart: "2026-11-11", periodEnd: "2026-11-11", depositAmount: 22_012 },
    { depositDueDate: "2026-11-17", periodStart: "2026-11-12", periodEnd: "2026-11-12", depositAmount: 107_076 },
    { depositDueDate: "2026-11-18", periodStart: "2026-11-13", periodEnd: "2026-11-15", depositAmount: 232_523 },
  ],
};

// 위 정산 건과 짝이 되는 포스 배민 매출 — 입금률이 0.8 근처로 나온다
const BAEMIN_SALES = [sale("2026-11-09", "baemin", 111_000), sale("2026-11-10", "baemin", 37_000), sale("2026-11-11", "baemin", 28_000), sale("2026-11-12", "baemin", 134_000), sale("2026-11-13", "baemin", 120_000), sale("2026-11-14", "baemin", 90_000), sale("2026-11-15", "baemin", 80_000)];

describe("들어올 돈 — 확정(여신협회) + 짐작(포스)", () => {
  it("매입이 다 올라온 카드사는 여신협회 숫자 그대로", () => {
    const d = incomingOn("2026-11-17", { sales: [], cardsales: data(HYUNDAI), rules: RULES, channels: ["card_hyundai"] });
    expect(d.amount).toBe(402_930);
    expect(d.estimated).toBe(0);
    expect(d.partial).toBe(false);
    expect(d.lines[0].from).toEqual(["2026-11-13", "2026-11-14"]);
  });

  it("아직 안 올라온 거래일은 포스 매출 × (1 − 실측 수수료율)로 더한다", () => {
    // 11/15(일) 현대 82,000원 → 수수료 1% 떼고 81,180원, +2영업일이라 11/17(화) 입금
    const d = incomingOn("2026-11-17", { sales: [sale("2026-11-15", "card_hyundai", 82_000)], cardsales: data(HYUNDAI), rules: RULES, channels: ["card_hyundai"] });
    expect(d.estimated).toBe(81_180);
    expect(d.amount).toBe(484_110);
    expect(d.partial).toBe(true);
    expect(d.lines[0].estFrom).toEqual(["2026-11-15"]);
    expect(d.lines[0].feeRate).toBe(1);
  });

  it("이미 여신협회가 아는 거래일은 두 번 세지 않는다", () => {
    const sales = [sale("2026-11-13", "card_hyundai", 63_000), sale("2026-11-14", "card_hyundai", 344_000)];
    const d = incomingOn("2026-11-17", { sales, cardsales: data(HYUNDAI), rules: RULES, channels: ["card_hyundai"] });
    expect(d.estimated).toBe(0);
    expect(d.amount).toBe(402_930);
  });

  it("하루가 반만 올라왔으면 나머지만 더한다 (2026-11-14 하나카드 실제 건)", () => {
    // 포스 336,000원인데 여신협회엔 132,000원만 올라와 있었다. 나머지 204,000원이 같은 11/17 입금에 들어왔다.
    // (자정 넘겨 받은 결제를 포스는 전날로, 카드사는 다음 날로 적어서 이렇게 갈린다)
    const hana = [
      pay({ channel: "card_hana", issuer: "하나카드", saleDate: "2026-11-13", payDate: "2026-11-17", amount: 236_000, fee: 1_770, pay: 234_230 }),
      pay({ channel: "card_hana", issuer: "하나카드", saleDate: "2026-11-14", payDate: "2026-11-17", amount: 132_000, fee: 990, pay: 131_010 }),
    ];
    const sales = [sale("2026-11-13", "card_hana", 236_000), sale("2026-11-14", "card_hana", 336_000)];
    expect(unpostedSales(data(hana), "card_hana", sales)).toEqual([{ date: "2026-11-14", amount: 204_000 }]);
    const d = incomingOn("2026-11-17", { sales, cardsales: data(hana), rules: RULES, channels: ["card_hana"] });
    expect(d.confirmed).toBe(365_240);
    expect(d.estimated).toBe(202_470); // 204,000 × (1 − 0.75%) — 캐시노트와 같은 금액
  });

  it("오래된 자료 구멍은 들어올 돈으로 세지 않는다 (10/23~24 하나카드처럼 매입을 못 받은 날)", () => {
    const hana = [
      pay({ channel: "card_hana", issuer: "하나카드", saleDate: "2026-10-25", payDate: "2026-10-27", amount: 211_000, fee: 1_583, pay: 209_417 }),
      pay({ channel: "card_hana", issuer: "하나카드", saleDate: "2026-11-13", payDate: "2026-11-17", amount: 236_000, fee: 1_770, pay: 234_230 }),
    ];
    const sales = [sale("2026-10-23", "card_hana", 146_000), sale("2026-10-24", "card_hana", 464_000), sale("2026-11-13", "card_hana", 236_000)];
    expect(unpostedSales(data(hana), "card_hana", sales)).toEqual([]);
  });

  it("KB국민카드처럼 매입이 통째로 안 올라온 카드사는 전부 짐작으로 센다 (11/13~15 → 11/17)", () => {
    // 11/12까지만 올라와 있다. 수수료율은 그 전 자료에서 0.93%
    const kb = [pay({ channel: "card_kb", issuer: "KB카드", saleDate: "2026-11-12", payDate: "2026-11-16", amount: 100_000, fee: 930, pay: 99_070 })];
    const sales = [sale("2026-11-13", "card_kb", 34_000), sale("2026-11-14", "card_kb", 132_000), sale("2026-11-15", "card_kb", 194_000)];
    const d = incomingOn("2026-11-17", { sales, cardsales: data(kb), rules: RULES, channels: ["card_kb"] });
    expect(d.confirmed).toBe(0);
    expect(d.estimated).toBe(356_652); // 캐시노트 356,638원 (수수료율 소수점 차이만큼만 다르다)
    expect(d.lines[0].estFrom).toEqual(["2026-11-13", "2026-11-14", "2026-11-15"]);
  });

  it("실측 수수료율이 없는 채널은 짐작하지 않는다 (간편결제·제로페이는 여신협회에 안 나온다)", () => {
    const d = incomingOn("2026-11-17", { sales: [sale("2026-11-15", "card_easy", 112_000)], cardsales: data(HYUNDAI), rules: RULES, channels: ["card_easy"] });
    expect(d.lines).toEqual([]);
    expect(feeRateOf(data(HYUNDAI), "card_easy")).toBeNull();
  });

  it("삼성카드는 달력 2일 뒤 — 휴일이면 다음 영업일로 민다", () => {
    const samsung = [pay({ channel: "card_samsung", issuer: "삼성카드", saleDate: "2026-11-10", payDate: "2026-11-12", amount: 50_000, fee: 500, pay: 49_500 })];
    const sales = [sale("2026-11-14", "card_samsung", 100_000)]; // 토 + 2일 = 11/16(월)
    const d = incomingOn("2026-11-16", { sales, cardsales: data(samsung), rules: RULES, channels: ["card_samsung"] });
    expect(d.estimated).toBe(99_000);
  });

  it("오늘·내일·모레를 한 번에", () => {
    const sales = [sale("2026-11-15", "card_hyundai", 82_000), sale("2026-11-16", "card_hyundai", 50_000)];
    const days = incomingDays("2026-11-17", 3, { sales, cardsales: data(HYUNDAI), rules: RULES, channels: ["card_hyundai"] });
    expect(days.map((d) => d.date)).toEqual(["2026-11-17", "2026-11-18", "2026-11-19"]);
    expect(days[0].amount).toBe(484_110);
    expect(days[1].amount).toBe(49_500); // 11/16(월) 매출 → 11/18(수)
    expect(days[2].amount).toBe(0); // 11/17 장사분은 아직 포스에 없다
  });

  it("같은 날 카드와 배달을 같이 센다 — 배달 줄은 뒤에 온다", () => {
    const d = incomingOn("2026-11-17", { sales: [], cardsales: data(HYUNDAI), rules: RULES, channels: ["card_hyundai"], delivery: [BAEMIN] });
    expect(d.lines.map((l) => [l.kind, l.name, l.amount])).toEqual([
      ["card", "현대카드", 402_930],
      ["delivery", "배달의민족", 107_076],
    ]);
    expect(d.amount).toBe(510_006);
  });

  it("배달앱은 정산 건이 확정, 정산 건이 아직 없는 매출일만 실측 입금률로 짐작한다", () => {
    // 11/16(월) 배민 매출 100,000원 → +3영업일 = 11/19(목)
    const sales = [...BAEMIN_SALES, sale("2026-11-16", "baemin", 100_000)];
    const d = incomingOn("2026-11-19", { sales, cardsales: null, rules: RULES, channels: [], delivery: [BAEMIN] });
    expect(lastSettledSale(BAEMIN)).toBe("2026-11-15");
    const rate = netRateOf(BAEMIN, BAEMIN_SALES)!;
    expect(Math.round(rate * 1000) / 10).toBe(79.9); // 매출의 79.9%가 들어온다
    expect(d.confirmed).toBe(0);
    expect(d.estimated).toBe(Math.round(100_000 * rate));
    expect(d.lines[0].feeRate).toBe(20.09); // 수수료·배달비로 20.09%
  });

  it("정산 건이 이미 있는 매출일은 두 번 세지 않는다", () => {
    const d = incomingOn("2026-11-18", { sales: BAEMIN_SALES, cardsales: null, rules: RULES, channels: [], delivery: [BAEMIN] });
    expect(d.confirmed).toBe(232_523);
    expect(d.estimated).toBe(0);
  });

  it("견줄 정산 건이 3건이 안 되면 짐작하지 않는다", () => {
    const thin: DeliverySource = { ...BAEMIN, settlements: BAEMIN.settlements.slice(0, 2) };
    expect(netRateOf(thin, BAEMIN_SALES)).toBeNull();
  });

  it("기간에 포스 매출이 없는 정산 건(환급만 들어온 날 등)은 입금률 계산에서 뺀다", () => {
    const withRefund: DeliverySource = { ...BAEMIN, settlements: [...BAEMIN.settlements, { depositDueDate: "2026-11-06", periodStart: "2026-11-06", periodEnd: "2026-11-06", depositAmount: 28_128 }] };
    expect(netRateOf(withRefund, BAEMIN_SALES)).toBe(netRateOf(BAEMIN, BAEMIN_SALES));
  });

  it("매입이 올라와 있는 마지막 거래일을 카드사별로 본다", () => {
    const d = data([...HYUNDAI, pay({ channel: "card_kb", issuer: "KB카드", saleDate: "2026-11-12", payDate: "2026-11-16", amount: 100_000, fee: 930, pay: 99_070 })]);
    expect(lastKnownSale(d, "card_hyundai")).toBe("2026-11-14");
    expect(lastKnownSale(d, "card_kb")).toBe("2026-11-12");
    expect(lastKnownSale(d, "card_lotte")).toBeNull();
  });
});
