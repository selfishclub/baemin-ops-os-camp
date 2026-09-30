import { describe, expect, it } from "vitest";
import { buildCostRateReport, convert, recipeUnitCost } from "./costRate";
import { parsePosAbcGrid, PosParseError } from "./okpos";
import sample from "./sample.json";
import type { Item, Menu, Recipe } from "./types";

const items = sample.items as Item[];
const menus = sample.menus as Menu[];
const recipes = sample.recipes as Recipe[];

describe("포스 ABC 엑셀 읽기", () => {
  const grid = [
    ["상품ABC분석"], [],
    ["조회일자 : 2026-09-01 ~ 2026-09-30   누적판매비율 : A등급 70 %"], [],
    ["등급", "No.", "대분류", "상품코드", "상품명", "실매출액", "판매수량", "점유율 (%)", "누계 (%)"],
    ["A", 1, "가짜지점", "002001", "양념닭갈비", 6300000, 420, 28.7, 28.7],
    ["B", 2, "가짜지점", "005001", "소주", "2,600,000", 520, 11.8, 40.5],
    ["합계", "", "", "", "", 8900000, 940, "", ""],
  ];
  it("머리줄·조회일자를 찾고 합계로 검산한다", () => {
    const r = parsePosAbcGrid(grid);
    expect(r.month).toBe("2026-09");
    expect(r.lines).toHaveLength(2);
    expect(r.totalAmount).toBe(8_900_000);
  });
  it("합계가 안 맞거나 두 달에 걸치면 막는다", () => {
    const bad = grid.map((r) => [...r]);
    bad[5][6] = 400;
    expect(() => parsePosAbcGrid(bad)).toThrow(PosParseError);
    const two = grid.map((r) => [...r]);
    two[2] = ["조회일자 : 2026-08-20 ~ 2026-09-10"];
    expect(() => parsePosAbcGrid(two)).toThrow(/두 달/);
  });
  it("포스 파일이 아니면 안내", () => {
    expect(() => parsePosAbcGrid([["거래일시", "적요"]])).toThrow(/상품코드/);
  });
});

describe("원가율", () => {
  it("단위 변환: g → kg, 다른 물리량은 오류", () => {
    expect(convert(350, "g", "kg")).toBeCloseTo(0.35, 10);
    expect(() => convert(1, "g", "ea")).toThrow();
  });
  it("메뉴 1개 레시피 원가 = Σ 사용량 × 기준단가", () => {
    const r = recipes.find((x) => x.menuId === "m_001")!;
    // 닭 0.35kg×7000 + 소스 0.06×4500 + 숯 0.12×1800 + 채소 0.08×3000 = 2450+270+216+240
    expect(recipeUnitCost(r, items).cost).toBe(3176);
  });
  it("이론 재료비·이론 원가율·미등록 메뉴·실제와의 차이", () => {
    const pos = { month: "2026-09", periodStart: "2026-09-01", periodEnd: "2026-09-30", lines: sample.posSales, totalAmount: sample.posSales.reduce((a, l) => a + l.amount, 0), totalQuantity: 0 };
    const rep = buildCostRateReport(pos, menus, recipes, items, 8_000_000);
    expect(rep.unmapped.map((u) => u.name)).toEqual(["국수", "치즈퐁듀"]); // 레시피 없음, 매출 큰 순
    expect(rep.coverage).toBeLessThan(100);
    expect(rep.rows[0].costRate).toBeGreaterThanOrEqual(rep.rows[1].costRate!); // 원가율 높은 순
    expect(rep.theoreticalRate).toBeGreaterThan(10);
    expect(rep.actualRate).toBe(Math.round((8_000_000 / pos.totalAmount) * 1000) / 10);
    expect(rep.gap).toBe(8_000_000 - rep.estimatedTotalCost);
    expect(rep.itemUsage[0].name).toBe("닭 원육");
  });
});

describe("상품ABC 이어 붙이기", () => {
  const rep = (start: string, end: string, lines: [string, number, number][]) => ({
    month: start.slice(0, 7),
    periodStart: start,
    periodEnd: end,
    lines: lines.map(([code, amount, quantity]) => ({ code, name: code, amount, quantity })),
    totalAmount: lines.reduce((a, l) => a + l[1], 0),
    totalQuantity: lines.reduce((a, l) => a + l[2], 0),
  });
  const prev = rep("2026-08-01", "2026-08-21", [["A", 100000, 10], ["B", 50000, 5]]);

  it("바로 다음 날 파일은 메뉴별로 더해 이어 붙인다", async () => {
    const { mergePosReports } = await import("./okpos");
    const r = mergePosReports(prev, rep("2026-08-22", "2026-08-22", [["A", 10000, 1], ["C", 7000, 1]]));
    expect(r.mode).toBe("append");
    if (r.mode === "conflict") return;
    expect(r.report.periodStart).toBe("2026-08-01");
    expect(r.report.periodEnd).toBe("2026-08-22");
    expect(r.report.totalAmount).toBe(167000);
    expect(r.report.lines.find((l) => l.code === "A")).toMatchObject({ amount: 110000, quantity: 11 });
    expect(r.report.lines.find((l) => l.code === "C")).toMatchObject({ amount: 7000, quantity: 1 });
    expect(r.gapDays).toBe(0);
  });

  it("중간에 빈 날이 있으면 알려 준다", async () => {
    const { mergePosReports } = await import("./okpos");
    const r = mergePosReports(prev, rep("2026-08-24", "2026-08-24", [["A", 1, 1]]));
    expect(r.mode === "append" && r.gapDays).toBe(2);
  });

  it("기존 기간을 다 덮는 파일은 통째로 바꾼다", async () => {
    const { mergePosReports } = await import("./okpos");
    expect(mergePosReports(prev, rep("2026-08-01", "2026-08-22", [["A", 1, 1]])).mode).toBe("replace");
  });

  it("일부만 겹치면 막는다 (두 번 세지 않게)", async () => {
    const { mergePosReports } = await import("./okpos");
    expect(mergePosReports(prev, rep("2026-08-20", "2026-08-22", [["A", 1, 1]])).mode).toBe("conflict");
  });

  it("다른 달이거나 처음이면 새로", async () => {
    const { mergePosReports } = await import("./okpos");
    expect(mergePosReports(null, prev).mode).toBe("new");
  });
});

describe("서비스·할인으로 나간 몫", () => {
  // 음료는 차림표에 전부 2,000원인데 포스 실매출은 그보다 적다 = 서비스로 나간 것
  const menu = (id: string, code: string, name: string, listPrice: number | null): Menu => ({ id, name, posCode: code, price: 0, listPrice, active: true });
  const drinkMenus: Menu[] = [
    menu("m1", "c1", "가짜환타", 2000),
    menu("m2", "c2", "가짜콜라", 2000),
    menu("m3", "c3", "가짜커피", null), // 제값을 안 넣은 메뉴
  ];
  const pos = {
    month: "2026-09",
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    lines: [
      { code: "c1", name: "가짜환타", amount: 24_000, quantity: 17 }, // 제값이면 34,000
      { code: "c2", name: "가짜콜라", amount: 106_000, quantity: 56 }, // 제값이면 112,000
      { code: "c3", name: "가짜커피", amount: 50_000, quantity: 10 },
    ],
    totalAmount: 180_000,
    totalQuantity: 83,
  };
  const rep = buildCostRateReport(pos, drinkMenus, [], [], 0);
  const row = (name: string) => [...rep.rows, ...rep.unmapped].find((r) => r.name === name)!;

  it("제값 × 판매수량 − 실매출", () => {
    expect(row("가짜환타").giveaway).toBe(10_000);
    expect(row("가짜콜라").giveaway).toBe(6_000);
  });

  it("몇 개분인지도 센다", () => {
    expect(row("가짜환타").giveawayQty).toBe(5);
    expect(row("가짜콜라").giveawayQty).toBe(3);
  });

  it("제값을 안 넣은 메뉴는 계산하지 않는다", () => {
    expect(row("가짜커피").listPrice).toBeNull();
    expect(row("가짜커피").giveaway).toBeNull();
  });

  it("합계는 제값을 넣은 메뉴만", () => {
    expect(rep.giveaway).toBe(16_000);
    expect(rep.giveawayFull).toBe(146_000); // 34,000 + 112,000
    expect(rep.giveawayRate).toBe(11);
    expect(rep.pricedMenus).toBe(2);
  });

  it("제값보다 많이 받았으면 0으로 본다 (가격을 올렸을 때)", () => {
    const up = { ...pos, lines: [{ code: "c1", name: "가짜환타", amount: 40_000, quantity: 17 }] };
    expect(buildCostRateReport(up, drinkMenus, [], [], 0).giveaway).toBe(0);
  });
});
