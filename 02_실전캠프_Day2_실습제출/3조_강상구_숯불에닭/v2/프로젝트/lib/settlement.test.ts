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

describe("자정 넘은 결제가 하루 늦게 따로 들어올 때 (2026-10 국민카드 실제 숫자)", () => {
  const kb: SettlementRule = { channel: "card_kb", mode: "days", days: 2, weekday: 0 };
  // 10/13(화) 영업일 매출 197,000 = 13일 102,000 + 14일 0시 0분 25초 95,000. 카드사는 102,000분을 10/15, 95,000분을 10/16에 넣었다
  const daily: DailySale[] = [
    { date: "2026-10-13", channel: "card_kb", amount: 197_000 },
    { date: "2026-10-15", channel: "card_kb", amount: 688_000 },
  ];
  const bank = [tx("2026-10-15", "card_kb", 101_080), { ...tx("2026-10-16", "card_kb", 94_050), id: "b16" }];

  it("모자란 묶음에 다음 날 짝 없는 입금을 합쳐 일치로 본다", () => {
    const r = settleChannel("card_kb", "2026-10", kb, daily, bank, "2026-10-16");
    const s = r.settlements.find((x) => x.payout === "2026-10-15")!;
    expect(s).toMatchObject({ deposit: 195_130, fee: 1_870, status: "일치" });
    expect(s.note).toContain("2026-10-16");
    expect(r.unmatchedDeposits).toEqual([]);
    expect(r.feeRate).toBe(0.9);
  });
  it("다음 날이 다른 묶음의 입금일이면 가져오지 않는다", () => {
    const d2 = [...daily, { date: "2026-10-14", channel: "card_kb", amount: 95_000 }];
    const r = settleChannel("card_kb", "2026-10", kb, d2, bank, "2026-10-16");
    expect(r.settlements.find((x) => x.payout === "2026-10-15")!.status).toBe("차이");
    expect(r.settlements.find((x) => x.payout === "2026-10-16")!.status).toBe("일치");
  });
  it("합쳐도 안 맞으면 그냥 둔다", () => {
    const r = settleChannel("card_kb", "2026-10", kb, daily, [tx("2026-10-15", "card_kb", 101_080), { ...tx("2026-10-16", "card_kb", 20_000), id: "b16" }], "2026-10-16");
    expect(r.settlements.find((x) => x.payout === "2026-10-15")!.status).toBe("차이");
    expect(r.unmatchedDeposits).toEqual([{ date: "2026-10-16", amount: 20_000 }]);
  });
  it("통째로 하루 늦게 들어온 묶음도 일치", () => {
    const r = settleChannel("card_kb", "2026-10", kb, [{ date: "2026-10-13", channel: "card_kb", amount: 100_000 }], [tx("2026-10-16", "card_kb", 99_100)], "2026-10-16");
    expect(r.settlements[0]).toMatchObject({ payout: "2026-10-15", deposit: 99_100, status: "일치" });
    expect(r.missing).toBe(0);
  });
  it("앞 묶음은 모자라고 뒤 묶음은 넘치면 둘을 합쳐 일치로 본다", () => {
    // 10/13 영업일 매출 197,000 중 95,000은 14일 0시 결제 → 카드사는 14일 매출과 같이 10/16에 넣음
    const d3: DailySale[] = [
      { date: "2026-10-13", channel: "card_kb", amount: 197_000 },
      { date: "2026-10-14", channel: "card_kb", amount: 100_000 },
    ];
    const r = settleChannel("card_kb", "2026-10", kb, d3, [tx("2026-10-15", "card_kb", 101_080), { ...tx("2026-10-16", "card_kb", 193_050), id: "b16" }], "2026-10-16");
    expect(r.settlements).toHaveLength(1);
    expect(r.settlements[0]).toMatchObject({ from: "2026-10-13", to: "2026-10-14", sales: 297_000, deposit: 294_130, status: "일치" });
    expect(r.unmatchedDeposits).toEqual([]);
  });
});

describe("다른 달 주문분 입금은 짝이 안 맞는 입금으로 띄우지 않는다", () => {
  const kb: SettlementRule = { channel: "card_kb", mode: "days", days: 2, weekday: 0 };
  const daily: DailySale[] = [
    { date: "2026-09-01", channel: "card_kb", amount: 100_000 }, // 화 → 9/3
    { date: "2026-09-30", channel: "card_kb", amount: 200_000 }, // 수 → 10/2
  ];
  it("월초의 지난달 말 주문분, 다음 달의 다음 달 주문분은 빠지고, 이 달 안의 엉뚱한 입금은 남는다", () => {
    const txs = [
      tx("2026-09-01", "card_kb", 500_000), // 8/28 주문분
      { ...tx("2026-09-02", "card_kb", 300_000), id: "a" }, // 8/31 주문분
      { ...tx("2026-09-03", "card_kb", 99_100), id: "b" },
      { ...tx("2026-09-17", "card_kb", 12_345), id: "c" }, // 이 달 안 엉뚱한 입금
      { ...tx("2026-10-02", "card_kb", 198_200), id: "d" },
      { ...tx("2026-10-07", "card_kb", 400_000), id: "e" }, // 10월 주문분
    ];
    const r = settleChannel("card_kb", "2026-09", kb, daily, txs, "2026-10-16");
    expect(r.unmatchedDeposits).toEqual([{ date: "2026-09-17", amount: 12_345 }]);
    expect(r.settlements.every((s) => s.status === "일치")).toBe(true);
  });
  it("연휴로 늦어져도 다음 달 1일 매출 입금일부터는 다음 달 몫", () => {
    // 10/3(토)·10/5(월 대체공휴일) 연휴: 9/30 → 10/2, 10/1 → 10/6. 10/6·10/7 입금은 10월 주문분
    const txs = [tx("2026-10-02", "card_kb", 198_200), { ...tx("2026-10-06", "card_kb", 173_540), id: "x" }, { ...tx("2026-10-07", "card_kb", 931_230), id: "y" }];
    const r = settleChannel("card_kb", "2026-09", kb, [{ date: "2026-09-30", channel: "card_kb", amount: 200_000 }], txs, "2026-10-16", ["2026-10-05"]);
    expect(r.unmatchedDeposits).toEqual([]);
  });
  it("이 달 매출이 하나도 없으면 다 띄운다 (매출 미입력 알림용)", () => {
    const r = settleChannel("card_kb", "2026-09", kb, [], [tx("2026-09-01", "card_kb", 500_000)], "2026-09-30");
    expect(r.unmatchedDeposits).toHaveLength(1);
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
    expect(r.unmatchedDeposits).toEqual([]); // 9/2 입금은 8월 말 주문분 — 8월 화면에서 맞춘다
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
    expect(r.unmatchedDeposits).toEqual([]); // 9/3 입금은 지난달 주문분 — 이 달 목록에 띄우지 않는다
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
  it("환급만 단독으로 들어온 입금은 짝이 안 맞는 입금으로 띄우지 않는다", () => {
    // 2026-10-08 쿠팡이츠: 9월분 상생 요금제 환급 25,950원만 따로 들어왔다 (붙일 매출 묶음이 없다)
    const rule: SettlementRule = { channel: "coupang", mode: "days", days: 4, weekday: 0, manual: true };
    const daily: DailySale[] = [{ date: "2026-10-06", channel: "coupang", amount: 50_000 }]; // 화 → 10/12
    const txs = [tx("2026-10-08", "coupang", 25_950)];
    const before = settleChannel("coupang", "2026-10", rule, daily, txs, "2026-10-09");
    expect(before.unmatchedDeposits).toEqual([{ date: "2026-10-08", amount: 25_950 }]);
    const adj = [{ channel: "coupang" as const, date: "2026-10-08", amount: 25_950, note: "상생 요금제 월 환급 (9월분)" }];
    const after = settleChannel("coupang", "2026-10", rule, daily, txs, "2026-10-09", [], adj);
    expect(after.unmatchedDeposits).toEqual([]);
    expect(after.fee).toBe(-25_950); // 환급만큼 그 달 수수료가 준다
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

describe("같은 날 두 건으로 들어온 정산 나누기", () => {
  // 2026-09-23 배민: 09-18~20분(326,993)과 09-21분(42,585)이 같은 날 두 건으로 들어왔다.
  // 합쳐서 한 묶음에 주면 그 줄 수수료율이 6.7%로 내려가고 09-21은 미입금으로 남는다.
  const rule: SettlementRule = { channel: "baemin", mode: "days", days: 3, weekday: 0 };
  const holidays = ["2026-09-24", "2026-09-25"];
  const daily: DailySale[] = [
    { date: "2026-09-18", channel: "baemin", amount: 41_000 },
    { date: "2026-09-19", channel: "baemin", amount: 123_500 },
    { date: "2026-09-20", channel: "baemin", amount: 231_500 },
    { date: "2026-09-21", channel: "baemin", amount: 54_000 },
  ];
  const two: Transaction[] = [
    { ...tx("2026-09-23", "baemin", 326_993), id: "a" },
    { ...tx("2026-09-23", "baemin", 42_585), id: "b" },
  ];

  it("뒤쪽 미입금 묶음에 한 건을 떼어 주면 양쪽 다 맞는다", () => {
    const r = settleChannel("baemin", "2026-09", rule, daily, two, "2026-09-29", holidays);
    const big = r.settlements.find((s) => s.from === "2026-09-18")!;
    const late = r.settlements.find((s) => s.from === "2026-09-21")!;
    expect(big.deposit).toBe(326_993);
    expect(big.feeRate).toBe(17.4);
    expect(late.status).toBe("일치");
    expect(late.deposit).toBe(42_585);
    expect(late.feeRate).toBe(21.1);
    expect(r.missing).toBe(0);
  });

  it("수수료도 두 묶음 몫이 다 잡힌다", () => {
    const r = settleChannel("baemin", "2026-09", rule, daily, two, "2026-09-29", holidays);
    expect(r.fee).toBe(41_000 + 123_500 + 231_500 + 54_000 - 326_993 - 42_585);
  });

  it("한 건만 들어온 날은 그대로 둔다", () => {
    const one = [{ ...tx("2026-09-23", "baemin", 369_578), id: "a" }];
    const r = settleChannel("baemin", "2026-09", rule, daily, one, "2026-09-29", holidays);
    expect(r.settlements.find((s) => s.from === "2026-09-18")!.deposit).toBe(369_578);
    expect(r.settlements.find((s) => s.from === "2026-09-21")!.status).toBe("미입금");
  });

  it("떼어 줘도 앞 묶음이 안 맞으면 나누지 않는다", () => {
    const odd = [
      { ...tx("2026-09-23", "baemin", 42_585), id: "a" },
      { ...tx("2026-09-23", "baemin", 1_000), id: "b" },
    ];
    const r = settleChannel("baemin", "2026-09", rule, daily, odd, "2026-09-29", holidays);
    expect(r.settlements.find((s) => s.from === "2026-09-21")!.status).toBe("미입금");
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

describe("달력 N일 규칙 (삼성카드)", () => {
  const cal = { channel: "card_samsung", mode: "calendar" as const, days: 2, weekday: 0 };
  it("달력으로 2일 뒤, 주말이면 다음 월요일", async () => {
    const { payoutDate } = await import("./settlement");
    expect(payoutDate("2026-09-01", cal)).toBe("2026-09-03"); // 화 → 목
    expect(payoutDate("2026-09-18", cal)).toBe("2026-09-21"); // 금 → 일 → 월
    expect(payoutDate("2026-09-19", cal)).toBe("2026-09-21"); // 토 → 월
    expect(payoutDate("2026-09-13", cal)).toBe("2026-09-15"); // 일 → 화
  });
  it("공휴일도 건너뛴다", async () => {
    const { payoutDate } = await import("./settlement");
    expect(payoutDate("2026-09-22", cal, ["2026-09-24", "2026-09-25"])).toBe("2026-09-28"); // 화 → 목(추석) → 월
  });
});
