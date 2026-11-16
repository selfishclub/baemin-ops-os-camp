import { describe, expect, it } from "vitest";
import type { CardsalesData, CardPayout } from "./cardsales";
import { feeRateOf, incomingDays, incomingOn, lastKnownSale } from "./incoming";
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
];

// 현대카드: 11/13·11/14 매입이 올라와 있고 수수료율 1%
const HYUNDAI: CardPayout[] = [
  pay({ channel: "card_hyundai", issuer: "현대카드", saleDate: "2026-11-13", payDate: "2026-11-17", amount: 63_000, fee: 630, pay: 62_370 }),
  pay({ channel: "card_hyundai", issuer: "현대카드", saleDate: "2026-11-14", payDate: "2026-11-17", amount: 344_000, fee: 3_440, pay: 340_560 }),
];

const data = (payouts: CardPayout[]): CardsalesData => ({ fetchedAt: "2026-11-16T16:00:00Z", ranges: [{ from: "2026-09-22", to: "2026-11-14" }], payouts });

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

  it("매입이 올라와 있는 마지막 거래일을 카드사별로 본다", () => {
    const d = data([...HYUNDAI, pay({ channel: "card_kb", issuer: "KB카드", saleDate: "2026-11-12", payDate: "2026-11-16", amount: 100_000, fee: 930, pay: 99_070 })]);
    expect(lastKnownSale(d, "card_hyundai")).toBe("2026-11-14");
    expect(lastKnownSale(d, "card_kb")).toBe("2026-11-12");
    expect(lastKnownSale(d, "card_lotte")).toBeNull();
  });
});
