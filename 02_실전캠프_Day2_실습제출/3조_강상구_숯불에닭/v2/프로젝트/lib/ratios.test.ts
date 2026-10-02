import { describe, expect, it } from "vitest";
import { computePnl } from "./pnl";
import { computeRatios, normalizeLimits } from "./ratios";
import type { Major } from "./categories";
import type { ChannelSale, Transaction } from "./types";

const tx = (payee: string, out: number, major: Major, minor: string): Transaction => ({
  id: payee, month: "2026-09", date: "2026-09-10", payee, out, in: 0, source: "bank", major, minor, channel: null, review: null,
});
const sales: ChannelSale[] = [{ month: "2026-09", channel: "hall_card", name: "홀", orders: 10_000_000, deposit: 9_900_000, count: 100 }];

describe("매출 대비 비율", () => {
  const pnl = computePnl(
    [tx("가나식품", 3_800_000, "매출원가", "원재료비"), tx("급여", 2_000_000, "노무관리비", "노무관리비급여"), tx("월세", 900_000, "임대료", "임대료")],
    sales,
  );

  it("원가·인건비·합계·임대료를 매출로 나눈다", () => {
    const r = computeRatios(pnl);
    expect(r.map((x) => x.pct)).toEqual([38, 20, 58, 9]);
  });

  it("기준을 넘은 것만 over", () => {
    const r = computeRatios(pnl);
    expect(r.filter((x) => x.over).map((x) => x.key)).toEqual(["cost"]);
  });

  it("사장님이 기준을 바꾸면 그 기준으로", () => {
    const r = computeRatios(pnl, { cost: 40, labor: 15, prime: 60, rent: 10 });
    expect(r.filter((x) => x.over).map((x) => x.key)).toEqual(["labor"]);
  });

  it("매출이 없으면 비율도 없다 (0%로 보이지 않게)", () => {
    const r = computeRatios(computePnl([tx("가나식품", 100_000, "매출원가", "원재료비")], []));
    expect(r.every((x) => x.pct === null && !x.over)).toBe(true);
  });

  it("이상한 기준값은 기본값으로", () => {
    expect(normalizeLimits({ cost: 0, labor: 25, prime: 300 } as never)).toEqual({ cost: 35, labor: 25, prime: 60, rent: 10 });
    expect(normalizeLimits(null).cost).toBe(35);
  });
});
