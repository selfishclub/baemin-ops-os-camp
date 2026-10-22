import { describe, expect, it } from "vitest";
import { adEfficiency, applyConfirms, channelSaleFromOrders, matchSettlements, perOrderBreakdown } from "./settle";
import type { BaeminExport, BaeminOrderDay, BaeminSettlement } from "../export/types";
import type { Transaction } from "../types";

const tx = (date: string, amount: number, channel: string | null = "baemin"): Transaction => ({ id: date + amount, month: date.slice(0, 7), date, payee: "우아한형제들", out: 0, in: amount, source: "bank", major: "수입", minor: "배달앱", channel, review: null });
const st = (giveId: string, due: string, amount: number): BaeminSettlement => ({ giveId, depositDueDate: due, status: "입금요청", periodStart: "2026-09-01", periodEnd: "2026-09-07", depositAmount: amount, adCost: 0, adDaily: [], adjustment: 0 });

describe("정산 건과 통장 입금 짝 맞추기", () => {
  it("금액이 같고 가까운 날의 배민 입금을 붙인다 · 늦게 들어온 날수", () => {
    const rows = matchSettlements([st("a", "2026-09-10", 1_000_000)], [tx("2026-09-12", 1_000_000)], "2026-10-15");
    expect(rows[0]).toMatchObject({ state: "입금 확인", bankDate: "2026-09-12", daysLate: 2, bankGap: 0 });
  });

  it("같은 통장 줄을 두 정산에 붙이지 않는다", () => {
    const rows = matchSettlements([st("a", "2026-09-10", 500_000), st("b", "2026-09-17", 500_000)], [tx("2026-09-11", 500_000), tx("2026-09-30", 1_000, null)], "2026-10-15");
    expect(rows.map((r) => r.state)).toEqual(["입금 확인", "입금 대기"]);
  });

  it("예정일이 안 지났으면 예정, 지났는데 없으면 입금 대기 · 다른 채널 입금은 안 본다", () => {
    const rows = matchSettlements([st("a", "2026-10-20", 300_000), st("b", "2026-10-01", 300_000)], [tx("2026-10-02", 300_000, "coupang")], "2026-10-15");
    expect(rows.find((r) => r.giveId === "a")!.state).toBe("예정");
    expect(rows.find((r) => r.giveId === "b")!.state).toBe("입금 대기");
  });

  it("통장 자료가 예정일 앞에서 끝나면 입금 대기가 아니라 예정(확인 전)", () => {
    const rows = matchSettlements([st("a", "2026-10-22", 35_833)], [tx("2026-10-21", 172_888)], "2026-10-22");
    expect(rows[0]).toMatchObject({ state: "예정", note: expect.stringContaining("10-21까지") });
  });

  it("쿠팡이츠 — 출금 가능 금액이 같이 들어와 조금 더 큰 입금도 짝으로 (같은 금액 짝은 먼저)", () => {
    const rows = matchSettlements(
      [st("a", "2026-10-20", 70_569), st("b", "2026-10-21", 11_572)],
      [tx("2026-10-20", 73_155, "coupang"), tx("2026-10-21", 11_572, "coupang")],
      "2026-10-22",
      "coupang",
    );
    expect(rows[0]).toMatchObject({ state: "입금 확인", bankDate: "2026-10-20", bankGap: -2586, note: expect.stringContaining("2,586원 더") });
    expect(rows[1]).toMatchObject({ state: "입금 확인", bankGap: 0 });
  });

  it("배민은 금액이 다르면 짝으로 보지 않는다", () => {
    const rows = matchSettlements([st("a", "2026-10-20", 70_569)], [tx("2026-10-20", 73_155), tx("2026-10-23", 1_000)], "2026-10-25");
    expect(rows[0].state).toBe("입금 대기");
  });
});

describe("주문 1건당 쪼개기", () => {
  const days: BaeminOrderDay[] = [
    { date: "2026-09-01", orders: 10, settledOrders: 10, unsettledOrders: 0, gross: 200_000, discount: 10_000, otherRevenue: 0, deductions: { brokerage: 13_600, payment: 6_000, delivery: 30_000, vat: 4_960, unclassified: 0 } },
    { date: "2026-09-02", orders: 12, settledOrders: 10, unsettledOrders: 2, gross: 200_000, discount: 0, otherRevenue: 10_000, deductions: { brokerage: 13_600, payment: 6_000, delivery: 30_000, vat: 4_960, unclassified: 1_000 } },
    { date: "2026-10-01", orders: 5, settledOrders: 5, unsettledOrders: 0, gross: 100_000, discount: 0, otherRevenue: 0, deductions: { brokerage: 0, payment: 0, delivery: 0, vat: 0, unclassified: 0 } },
  ];
  const p = perOrderBreakdown(days, "2026-09");

  it("이 달 정산된 주문만 더하고, 정산 전 주문은 따로 센다", () => {
    expect(p.orders).toBe(20);
    expect(p.unsettledOrders).toBe(2);
    expect(p.gross).toBe(400_000);
    expect(p.net).toBe(400_000 + 10_000 - 10_000 - 27_200 - 12_000 - 60_000 - 9_920 - 1_000);
  });

  it("1건당 금액과 실입금 비율", () => {
    expect(p.per).toMatchObject({ gross: 20_000, brokerage: 1_360, payment: 600, delivery: 3_000, vat: 496, discount: 500 });
    expect(p.per!.net).toBe(Math.round(p.net / 20));
    expect(p.netRate).toBe(Math.round((p.net / 400_000) * 1000) / 10);
  });

  it("쿠팡이츠처럼 주문당 광고비가 있으면 빼고 센다", () => {
    const d: BaeminOrderDay[] = [{ date: "2026-10-01", orders: 2, settledOrders: 2, unsettledOrders: 0, gross: 60_000, discount: 0, otherRevenue: 0, deductions: { brokerage: 4_680, payment: 1_800, delivery: 6_000, vat: 1_548, ad: 3_000, unclassified: 0 } }];
    const q = perOrderBreakdown(d, "2026-10");
    expect(q.ad).toBe(3_000);
    expect(q.per!.ad).toBe(1_500);
    expect(q.net).toBe(60_000 - 4_680 - 1_800 - 6_000 - 1_548 - 3_000);
  });

  it("정산 탭 채널 숫자로 바꾸기 · 주문 없으면 null", () => {
    expect(channelSaleFromOrders(days, "2026-09")).toEqual({ orders: 400_000, deposit: p.net, count: 20 });
    expect(channelSaleFromOrders(days, "2026-08")).toBeNull();
  });
});

describe("광고 효율 (우리가게클릭)", () => {
  const b: BaeminExport = {
    collectedAt: "", orderRange: null, settlements: [], orders: [], unknownCodes: [],
    stats: { "2026-09": { orderAmount: 5_000_000, orderCount: 250, groups: { CPC: { cost: 120_000, orderCount: 40, orderAmount: 800_000 }, BAEMIN_CLUB: { cost: 30_000, orderCount: 0, orderAmount: 0 } } } },
  };
  it("광고비 1만원당 매출 · 1건당 광고비", () => {
    const a = adEfficiency(b, "2026-09")!;
    expect(a).toMatchObject({ cost: 120_000, adOrders: 40, allOrders: 250, adSales: 800_000, costPerAdOrder: 3_000, costPerAllOrder: 480, adShareOfSales: 15 });
    expect(a.salesPer10k).toBe(Math.round((800_000 / 120_000) * 10_000));
  });
  it("자료 없는 달은 null, 광고비 모르는 달은 비움", () => {
    expect(adEfficiency(b, "2026-08")).toBeNull();
    expect(adEfficiency(null, "2026-09")).toBeNull();
  });
});

describe("확인 기록 (자동으로 못 맞춘 정산 건)", () => {
  const base = { giveId: "coupang-2026-10-01", depositDueDate: "2026-10-01", status: "정산완료", periodStart: "2026-09-24", periodEnd: "2026-09-26", depositAmount: 114_323, adCost: 0, adDaily: [], adjustment: 0, orders: 3 };
  it("입금 대기 건에 기록이 있으면 입금 확인으로, 메모와 실제 입금일을 단다", () => {
    const rows = matchSettlements([base], [], "2026-10-19", "coupang");
    expect(rows[0].state).toBe("입금 대기");
    const out = applyConfirms(rows, [{ channel: "coupang", giveId: "coupang-2026-10-01", bankDate: "2026-10-01", note: "9/23~26분 합쳐 214,289원" }], "coupang");
    expect(out[0]).toMatchObject({ state: "입금 확인", bankDate: "2026-10-01", daysLate: 0, note: "9/23~26분 합쳐 214,289원" });
  });
  it("다른 채널 기록이나 없는 건은 그대로", () => {
    const rows = matchSettlements([base], [], "2026-10-19", "coupang");
    expect(applyConfirms(rows, [{ channel: "baemin", giveId: "coupang-2026-10-01", bankDate: null, note: "" }], "coupang")[0].state).toBe("입금 대기");
  });
});
