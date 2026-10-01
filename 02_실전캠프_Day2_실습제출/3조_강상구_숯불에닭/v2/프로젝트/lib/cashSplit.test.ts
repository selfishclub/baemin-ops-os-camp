import { describe, expect, it } from "vitest";
import { DEFAULT_CHANNELS, channelKind, groupChannels, isHall } from "./categories";
import { DEFAULT_RULES } from "./settlement";
import { effectiveChannelSales } from "./effective";

// 손님한테 카드 말고 받는 돈이 세 가지라 섞여 있었다.
//  - 홀 현금(실물): 포스에 안 찍히기도 하고, 통장에도 안 들어온다
//  - 현금영수증: 포스에 찍힌다. 통장에는 안 들어온다
//  - 계좌이체: 포스에 안 찍힌다. 통장에는 그날 그대로 들어온다
describe("현금 세 갈래", () => {
  const find = (id: string) => DEFAULT_CHANNELS.find((c) => c.id === id)!;

  it("기본 채널에 세 가지가 다 있다", () => {
    expect(find("hall_cash").kind).toBe("cash");
    expect(find("hall_cash_receipt").kind).toBe("cash");
    expect(find("hall_transfer").kind).toBe("transfer");
  });

  it("셋 다 홀 매출이다 (배달 아님)", () => {
    for (const id of ["hall_cash", "hall_cash_receipt", "hall_transfer"]) expect(isHall(id)).toBe(true);
  });

  it("채널 설정에 없어도 계좌이체로 알아본다", () => {
    expect(channelKind("hall_transfer")).toBe("transfer");
  });

  it("하루 합계에 계좌이체도 들어간다", () => {
    const g = groupChannels(DEFAULT_CHANNELS, { hall_card: 500_000, hall_cash: 61_000, hall_cash_receipt: 20_000, hall_transfer: 99_000, baemin: 300_000 });
    expect(g.cashTotal).toBe(81_000);
    expect(g.transferTotal).toBe(99_000);
    expect(g.total).toBe(980_000);
  });

  it("계좌이체는 그날 바로 들어오는 규칙이다", () => {
    expect(DEFAULT_RULES.find((r) => r.channel === "hall_transfer")).toMatchObject({ mode: "days", days: 0 });
  });

  it("현금 두 가지는 미입금이 0, 계좌이체는 통장과 짝을 맞춘다", () => {
    const month = "2026-09";
    const daily = [
      { date: "2026-09-05", channel: "hall_cash", amount: 61_000 },
      { date: "2026-09-05", channel: "hall_cash_receipt", amount: 20_000 },
      { date: "2026-09-05", channel: "hall_transfer", amount: 58_000 },
    ];
    const settlements = [{ channel: "hall_transfer", name: "계좌이체", orders: 58_000, deposited: 58_000, pending: 0, feeRate: 0 } as never];
    const out = effectiveChannelSales(month, [], daily as never, DEFAULT_CHANNELS, settlements);
    expect(out.find((o) => o.channel === "hall_cash")).toMatchObject({ orders: 61_000, deposit: 0, unsettled: 0 });
    expect(out.find((o) => o.channel === "hall_cash_receipt")).toMatchObject({ orders: 20_000, unsettled: 0 });
    expect(out.find((o) => o.channel === "hall_transfer")).toMatchObject({ orders: 58_000, deposit: 58_000, unsettled: 0 });
  });
});

import { payoutDate } from "./settlement";
describe("계좌이체 입금일", () => {
  // 손님이 토요일에 보낸 돈은 토요일에 들어온다. 영업일로 밀면 통장과 짝이 안 맞는다.
  it("+0영업일은 주말이어도 그날", () => {
    expect(payoutDate("2026-09-05", { channel: "hall_transfer", mode: "days", days: 0, weekday: 0 })).toBe("2026-09-05"); // 토
    expect(payoutDate("2026-09-13", { channel: "hall_transfer", mode: "days", days: 0, weekday: 0 })).toBe("2026-09-13"); // 일
  });
  it("+1영업일 이상은 그대로 영업일로 민다", () => {
    expect(payoutDate("2026-09-04", { channel: "hall_card", mode: "days", days: 2, weekday: 0 })).toBe("2026-09-08"); // 금 → 화
  });
});
