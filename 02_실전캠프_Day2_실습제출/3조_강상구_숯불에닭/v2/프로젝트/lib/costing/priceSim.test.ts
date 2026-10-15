import { describe, expect, it } from "vitest";
import { defaultFeeRatePct, simulatePrice, type PriceSimMenu } from "./priceSim";
import type { ChannelSale, Transaction } from "../types";

// 닭갈비 1인분: 평균 단가 12,000원, 원가 4,200원, 한 달 500개
const menu: PriceSimMenu = { code: "A", name: "닭갈비", quantity: 500, amount: 6_000_000, unitCost: 4_200 };

describe("가격 실험 — 1,000원 올리기", () => {
  const r = simulatePrice({ menu, priceDelta: 1_000, feeRatePct: 10, declinesPct: [0, 5, 10, 20] });
  if (r.status !== "ok") throw new Error(r.reason);

  it("인상분에서 수수료만 빼고 원가는 그대로", () => {
    expect(r.unitPrice).toBe(12_000);
    expect(r.newPrice).toBe(13_000);
    expect(r.addedPerUnit).toBe(900); // 1,000 − 10%
    expect(r.marginBefore).toBe(7_800);
    expect(r.marginAfter).toBe(8_700);
    expect(r.costRateBefore).toBe(35);
    expect(r.costRateAfter).toBe(32.3);
  });

  it("판매량 그대로면 한 달에 더 남는 돈 = 1개당 × 판매량", () => {
    expect(r.gainSameQty).toBe(450_000);
    expect(r.baseProfit).toBe(3_900_000);
    expect(r.scenarios[0]).toEqual({ declinePct: 0, quantity: 500, revenue: 6_500_000, profit: 4_350_000, diff: 450_000 });
  });

  it("손님이 줄어드는 가정마다 이익 차이를 낸다", () => {
    const d10 = r.scenarios.find((s) => s.declinePct === 10)!;
    expect(d10.quantity).toBe(450);
    expect(d10.profit).toBe(8_700 * 450);
    expect(d10.diff).toBe(8_700 * 450 - 3_900_000); // +15,000
    const d20 = r.scenarios.find((s) => s.declinePct === 20)!;
    expect(d20.diff).toBeLessThan(0); // 20% 줄면 손해
  });

  it("손해로 돌아서는 감소 한계와 최소 판매량", () => {
    expect(r.maxDeclinePct).toBe(r1((1 - 7_800 / 8_700) * 100)); // 약 10.3%
    expect(r.minQuantity).toBe(Math.ceil(3_900_000 / 8_700)); // 449개
  });
});

describe("가격 실험 — 모르는 값은 0으로 치지 않는다", () => {
  it("레시피가 없으면 더 들어오는 돈만 내고 마진 비교는 비운다", () => {
    const r = simulatePrice({ menu: { ...menu, unitCost: null }, priceDelta: 500, feeRatePct: 0, declinesPct: [0, 10] });
    if (r.status !== "ok") throw new Error(r.reason);
    expect(r.addedPerUnit).toBe(500);
    expect(r.gainSameQty).toBe(250_000);
    expect(r.marginBefore).toBeNull();
    expect(r.maxDeclinePct).toBeNull();
    expect(r.minQuantity).toBeNull();
    expect(r.scenarios[1].profit).toBeNull();
    expect(r.scenarios[1].diff).toBeNull();
  });

  it("판매가 없거나 금액이 0이면 계산하지 않는다", () => {
    expect(simulatePrice({ menu: { ...menu, quantity: 0 }, priceDelta: 500, feeRatePct: 0, declinesPct: [0] }).status).toBe("empty");
    expect(simulatePrice({ menu, priceDelta: 0, feeRatePct: 0, declinesPct: [0] }).status).toBe("empty");
  });

  it("내리기도 된다 — 마진이 줄고 감소 한계는 없다", () => {
    const r = simulatePrice({ menu, priceDelta: -1_000, feeRatePct: 10, declinesPct: [0] });
    if (r.status !== "ok") throw new Error(r.reason);
    expect(r.addedPerUnit).toBe(-900);
    expect(r.marginAfter).toBe(6_900);
    expect(r.maxDeclinePct).toBeLessThan(0); // 음수 = 오히려 판매가 늘어야 본전
  });
});

describe("수수료 기본값 — 장부에서 어림", () => {
  const sales: ChannelSale[] = [
    { month: "2026-09", channel: "hall_card", name: "카드", orders: 7_000_000, deposit: 0, count: 700 },
    { month: "2026-09", channel: "baemin", name: "배민", orders: 3_000_000, deposit: 2_400_000, count: 150 },
  ];
  const tx = (minor: string, out: number): Transaction => ({ id: "t", month: "2026-09", date: "2026-09-10", payee: "", out, in: 0, source: "bank", major: "영업비", minor, channel: null, review: null });

  it("배달앱 수수료 + 카드수수료를 모든 주문금액으로 나눈다", () => {
    // (600,000 + 100,000) / 10,000,000 = 7%
    expect(defaultFeeRatePct(sales, [tx("카드수수료", 100_000)])).toBe(7);
  });

  it("주문금액이 없으면 null", () => {
    expect(defaultFeeRatePct([], [])).toBeNull();
  });
});

const r1 = (n: number) => Math.round(n * 10) / 10;
