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
