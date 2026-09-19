import { describe, expect, it } from "vitest";
import { addBusinessDays, payoutDate, prevMonthPayoutsInto, settleChannel, type SettlementRule } from "./settlement";
import type { DailySale, Transaction } from "./types";

const tx = (date: string, channel: string, amount: number): Transaction => ({
  id: date + channel, month: date.slice(0, 7), date, payee: "입금", out: 0, in: amount,
  source: "bank", major: "수입", minor: "매출액", channel, review: null,
});

describe("정산 주기 규칙", () => {
  it("영업일 더하기: 주말·공휴일 건너뜀", () => {
    expect(addBusinessDays("2026-09-17", 2)).toBe("2026-09-21"); // 목 → 월
    expect(addBusinessDays("2026-09-18", 1)).toBe("2026-09-21"); // 금 → 월
    expect(addBusinessDays("2026-10-01", 2, ["2026-10-05"])).toBe("2026-10-06"); // 공휴일 건너뜀
  });
  it("주 단위: 다음 주 지정 요일", () => {
    const weekly: SettlementRule = { channel: "baemin", mode: "weekly", days: 0, weekday: 0 };
    expect(payoutDate("2026-09-16", weekly)).toBe("2026-09-21"); // 수 → 다음 주 월
    expect(payoutDate("2026-09-20", weekly)).toBe("2026-09-21"); // 일 → 다음 날 월
    expect(payoutDate("2026-09-21", weekly)).toBe("2026-09-28");
  });
});

describe("입금 짝 맞추기", () => {
  const card: SettlementRule = { channel: "hall_card", mode: "days", days: 2, weekday: 0 };
  const daily: DailySale[] = [
    { date: "2026-09-14", channel: "hall_card", amount: 500_000 }, // 월 → 9/16 입금
    { date: "2026-09-15", channel: "hall_card", amount: 400_000 }, // 화 → 9/17 입금
    { date: "2026-09-17", channel: "hall_card", amount: 300_000 }, // 목 → 9/21 입금 (예정)
  ];
  const bank = [tx("2026-09-16", "hall_card", 494_000), tx("2026-09-17", "hall_card", 250_000), tx("2026-09-02", "hall_card", 100_000)];

  it("하루치 매출과 그 입금일의 입금을 짝짓고 수수료율을 구한다", () => {
    const r = settleChannel("hall_card", "2026-09", card, daily, bank, "2026-09-18");
    const s = r.settlements;
    expect(s[0]).toMatchObject({ from: "2026-09-14", payout: "2026-09-16", deposit: 494_000, fee: 6_000, feeRate: 1.2, status: "일치" });
    expect(s[1]).toMatchObject({ payout: "2026-09-17", deposit: 250_000, status: "차이" }); // 30% 넘게 적음
    expect(s[2]).toMatchObject({ payout: "2026-09-21", deposit: 0, status: "예정" });
    expect(r.pending).toBe(300_000);
    expect(r.feeRate).toBe(round1(((6_000 + 150_000) / 900_000) * 100));
    expect(r.unmatchedDeposits).toEqual([{ date: "2026-09-02", amount: 100_000 }]);
  });
  it("입금일이 지났는데 없으면 미입금", () => {
    const r = settleChannel("hall_card", "2026-09", card, daily, [], "2026-09-30");
    expect(r.settlements.every((s) => s.status === "미입금")).toBe(true);
    expect(r.missing).toBe(1_200_000);
  });
  it("주 단위: 한 주치가 한 묶음", () => {
    const weekly: SettlementRule = { channel: "baemin", mode: "weekly", days: 0, weekday: 0 };
    const d: DailySale[] = [
      { date: "2026-09-14", channel: "baemin", amount: 300_000 },
      { date: "2026-09-18", channel: "baemin", amount: 200_000 },
    ];
    const r = settleChannel("baemin", "2026-09", weekly, d, [tx("2026-09-21", "baemin", 425_000)], "2026-09-25");
    expect(r.settlements).toHaveLength(1);
    expect(r.settlements[0]).toMatchObject({ from: "2026-09-14", to: "2026-09-18", sales: 500_000, payout: "2026-09-21", fee: 75_000, feeRate: 15 });
  });
  it("지난달 주문분이 이 달에 들어오는 날짜", () => {
    const prev: DailySale[] = [{ date: "2026-08-31", channel: "hall_card", amount: 1 }];
    expect(prevMonthPayoutsInto("2026-09", card, prev)).toEqual(["2026-09-02"]);
  });
});

const round1 = (n: number) => Math.round(n * 10) / 10;

describe("직접 출금 신청하는 앱 (쿠팡이츠)", () => {
  const rule: SettlementRule = { channel: "coupang", mode: "days", days: 4, weekday: 0, manual: true };
  const daily: DailySale[] = [
    { date: "2026-09-08", channel: "coupang", amount: 54_000 }, // 화 → 9/14 정산
    { date: "2026-09-09", channel: "coupang", amount: 70_500 }, // 수 → 9/15 정산
    { date: "2026-09-14", channel: "coupang", amount: 79_000 }, // 월 → 9/18 정산
    { date: "2026-09-16", channel: "coupang", amount: 20_000 }, // 수 → 9/22 정산 (예정)
  ];
  it("하루 늦게 두 날치를 한 번에 출금해도 순서대로 짝이 맞는다", () => {
    const txs = [tx("2026-09-03", "coupang", 132_853), tx("2026-09-15", "coupang", 89_662)];
    const r = settleChannel("coupang", "2026-09", rule, daily, txs, "2026-09-19");
    const merged = r.settlements.find((s) => s.from === "2026-09-08")!;
    expect(merged.to).toBe("2026-09-09");
    expect(merged.sales).toBe(124_500);
    expect(merged.deposit).toBe(89_662);
    expect(merged.payout).toBe("2026-09-15");
    expect(merged.status).toBe("일치");
    expect(r.unmatchedDeposits).toEqual([{ date: "2026-09-03", amount: 132_853 }]); // 지난달 주문분
    expect(r.settlements.find((s) => s.from === "2026-09-14")!.status).toBe("미입금"); // 9/18 정산인데 아직 출금 안 함
    expect(r.settlements.find((s) => s.from === "2026-09-16")!.status).toBe("예정");
    expect(r.missing).toBe(79_000);
    expect(r.pending).toBe(20_000);
  });
  it("일반 규칙이라도 하루 늦게 두 날치가 같이 들어오면 앞 묶음과 합친다", () => {
    const txs = [tx("2026-09-15", "coupang", 89_662)];
    const r = settleChannel("coupang", "2026-09", { ...rule, manual: false }, daily, txs, "2026-09-19");
    const merged = r.settlements.find((s) => s.from === "2026-09-08")!;
    expect(merged).toMatchObject({ to: "2026-09-09", sales: 124_500, status: "일치" });
  });
});

describe("환급 포함 표시 · 늦은 입금 합치기", () => {
  it("입금에 섞인 환급을 표시하면 일치가 되고 그 달 수수료에서 빠진다", () => {
    const rule: SettlementRule = { channel: "coupang", mode: "days", days: 4, weekday: 0, manual: true };
    const daily: DailySale[] = [{ date: "2026-09-01", channel: "coupang", amount: 31_000 }]; // 화 → 9/7
    const txs = [tx("2026-09-07", "coupang", 55_710)]; // 정산 24,017 + 월 환급 31,693
    const before = settleChannel("coupang", "2026-09", rule, daily, txs, "2026-09-19");
    expect(before.settlements[0].status).toBe("차이");
    const after = settleChannel("coupang", "2026-09", rule, daily, txs, "2026-09-19", [], [{ channel: "coupang", date: "2026-09-07", amount: 31_693, note: "상생 요금제 월 환급" }]);
    expect(after.settlements[0]).toMatchObject({ status: "일치", deposit: 24_017, fee: 6_983, extra: 31_693 });
    expect(after.fee).toBe(6_983 - 31_693); // 환급만큼 수수료가 준다
    expect(after.deposited).toBe(55_710);
  });
  it("카드 입금이 하루 늦게 앞날 것과 같이 들어오면 두 묶음을 합친다", () => {
    const rule: SettlementRule = { channel: "card_hyundai", mode: "days", days: 2, weekday: 0 };
    const daily: DailySale[] = [
      { date: "2026-09-02", channel: "card_hyundai", amount: 219_000 }, // 수 → 9/4(금) 예정인데 안 옴
      { date: "2026-09-03", channel: "card_hyundai", amount: 55_000 }, // 목 → 9/7(월)
    ];
    const txs = [tx("2026-09-07", "card_hyundai", 271_260)]; // 두 날치 99%
    const r = settleChannel("card_hyundai", "2026-09", rule, daily, txs, "2026-09-19");
    expect(r.settlements).toHaveLength(1);
    expect(r.settlements[0]).toMatchObject({ from: "2026-09-02", to: "2026-09-03", sales: 274_000, deposit: 271_260, status: "일치", feeRate: 1 });
    expect(r.missing).toBe(0);
  });
});

describe("배달앱 판정 기준", () => {
  it("배달앱은 입금이 매출의 50%만 넘으면 일치, 카드는 70%", () => {
    const daily: DailySale[] = [{ date: "2026-09-07", channel: "coupang", amount: 19_000 }]; // 월 → 9/11
    const r = settleChannel("coupang", "2026-09", { channel: "coupang", mode: "days", days: 4, weekday: 0 }, daily, [tx("2026-09-11", "coupang", 12_398)], "2026-09-19");
    expect(r.settlements[0].status).toBe("일치"); // 배달비·광고비 빠져 65%
    const c = settleChannel("card_kb", "2026-09", { channel: "card_kb", mode: "days", days: 2, weekday: 0 }, [{ date: "2026-09-07", channel: "card_kb", amount: 19_000 }], [tx("2026-09-09", "card_kb", 12_398)], "2026-09-19");
    expect(c.settlements[0].status).toBe("차이");
  });
});
