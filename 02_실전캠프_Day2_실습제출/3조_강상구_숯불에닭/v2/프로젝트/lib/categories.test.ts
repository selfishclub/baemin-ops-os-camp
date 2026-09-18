import { describe, expect, it } from "vitest";
import { CARD_PRESETS, DEFAULT_CHANNELS, groupChannels } from "./categories";

describe("채널 묶기", () => {
  it("카드·현금·배달 합계와 전체", () => {
    const channels = [...DEFAULT_CHANNELS.map((c) => ({ ...c, active: c.id !== "hall_card" })), { id: "card_bc", name: "BC카드", kind: "card" as const, active: true }, { id: "card_kb", name: "KB국민카드", kind: "card" as const, active: true }];
    const g = groupChannels(channels, { card_bc: 300_000, card_kb: 200_000, hall_cash: 50_000, baemin: 400_000, hall_card: 999 });
    expect(g.card.map((c) => c.id)).toEqual(["card_bc", "card_kb"]);
    expect(g.cardTotal).toBe(500_000);
    expect(g.deliveryTotal).toBe(400_000);
    expect(g.total).toBe(950_000); // 꺼진 홀 카드는 제외
  });
  it("카드사 목록의 id는 겹치지 않는다", () => {
    expect(new Set(CARD_PRESETS.map((c) => c.id)).size).toBe(CARD_PRESETS.length);
  });
});
