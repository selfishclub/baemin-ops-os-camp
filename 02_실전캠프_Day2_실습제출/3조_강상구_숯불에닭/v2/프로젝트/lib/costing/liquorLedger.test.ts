import { describe, expect, it } from "vitest";
import { bottlesPerBox, cleanLiquorName, liquorBrands, liquorDayToPurchase, newLiquorItems, parseLiquorLedgerGrid } from "./liquorLedger";
import type { Item } from "./types";

// 가짜 숫자로 만든 주류 매출원장 (실제 파일과 같은 모양)
const H1 = ["일자", "품목", null, "규격", "매출\n구분", "매출\n유형", "수량", null, "금액", null, null, "보증금", null, "총계", "입금총계", "현금", "주류카드", "보증금입금", "기타입금", "채권잔액", "금일외상"];
const H2 = [null, "코드", "품목명", null, null, null, "BOX", "EA", "공급가", "부가세", "소계", "용기", "공병", null, null, null, null, null, null, null, null];
const row = (date: string | null, code: string, name: string, spec: string, box: number, sub: number, crate: number, bottle: number, bal: number) =>
  [date, code, name, spec, "매출", "매출", box, 0, Math.round(sub / 1.1), sub - Math.round(sub / 1.1), sub, crate, bottle, sub + crate + bottle, 0, 0, 0, 0, 0, bal, null];
const payRow = (returned: number, bal: number) => [null, "", "", "", "", "입금", 0, 0, 0, 0, 0, 0, 0, 0, returned, 0, 0, returned, 0, bal, null];
const dayTotal = (box: number, sub: number, crate: number, bottle: number, returned: number, bal: number) =>
  ["< 일  계 >", "", "", "", "", "", box, 0, 0, 0, sub, crate, bottle, sub + crate + bottle, returned, 0, 0, returned, 0, bal, bal];

const grid = [
  H1,
  H2,
  row("2026-08-05", "00001", "신_가짜소주(유)", "360", 2, 60000, 4000, 6000, 70000),
  row(null, "00002", "가짜맥주(유)500", "500", 1, 30000, 2000, 2600, 104600),
  payRow(10000, 94600),
  dayTotal(3, 90000, 6000, 8600, 10000, 94600),
  row("2026-08-12", "00001", "신_가짜소주(유)", "360", 1, 30000, 2000, 3000, 129600),
  dayTotal(1, 30000, 2000, 3000, 0, 129600),
  ["< 월  계 >"],
  ["합계"],
];

const item = (id: string, name: string): Item => ({ id, name, baseUnit: "ea", standardCost: 0, category: "drink", active: true });

describe("주류 매출원장 읽기", () => {
  it("입고일마다 묶고 술값·보증금·빈병 반납을 나눈다", () => {
    const r = parseLiquorLedgerGrid(grid);
    expect(r.days.map((d) => d.date)).toEqual(["2026-08-05", "2026-08-12"]);
    const d = r.days[0];
    expect(d.lines).toHaveLength(2);
    expect(d.subtotal).toBe(90000);
    expect(d.deposit).toBe(14600);
    expect(d.returned).toBe(10000);
    expect(d.checked).toBe(true);
    expect(d.mismatch).toBeNull();
    expect(r.balance).toBe(129600);
    expect(r.totals).toEqual({ box: 4, subtotal: 120000, deposit: 19600, returned: 10000 });
    expect(r.notes).toEqual([]);
  });

  it("박스당 병 수로 병당 원가를 낸다 (소주 30병, 맥주 20병)", () => {
    const [soju, beer] = parseLiquorLedgerGrid(grid).days[0].lines;
    expect(soju).toMatchObject({ displayName: "가짜소주", bottles: 60, perBottle: 1000 });
    expect(beer).toMatchObject({ displayName: "가짜맥주", bottles: 20, perBottle: 1500 });
  });

  it("규격마다 박스당 병 수를 안다 (청하 300·카스제로 330ml 30병, 모르는 규격은 null)", () => {
    expect(bottlesPerBox(300)).toBe(30);
    expect(bottlesPerBox(330)).toBe(30);
    expect(bottlesPerBox(360)).toBe(30);
    expect(bottlesPerBox(500)).toBe(20);
    expect(bottlesPerBox(750)).toBeNull();
    expect(bottlesPerBox(null)).toBeNull();
  });

  it("일계와 안 맞으면 알려 준다", () => {
    const bad = grid.map((r, i) => (i === 5 ? dayTotal(3, 99999, 6000, 8600, 10000, 94600) : r));
    expect(parseLiquorLedgerGrid(bad).notes.join()).toContain("검산");
  });

  it("다른 엑셀이면 알아듣게 거절한다", () => {
    expect(() => parseLiquorLedgerGrid([["상품코드", "상품명"], ["1", "a"]])).toThrow("주류 매출원장");
  });

  it("술 이름에서 신_·(유)·용량을 뗀다", () => {
    expect(cleanLiquorName("신_후레쉬(유)")).toBe("후레쉬");
    expect(cleanLiquorName("신_카스맥주(유)500")).toBe("카스맥주");
    expect(cleanLiquorName("처음처럼리뉴얼(유)")).toBe("처음처럼");
    expect(cleanLiquorName("테라라이트500(유)")).toBe("테라라이트");
  });

  it("같은 술을 모아 본다", () => {
    const b = liquorBrands(parseLiquorLedgerGrid(grid));
    expect(b[0]).toMatchObject({ displayName: "가짜소주", box: 3, bottles: 90, subtotal: 90000 });
  });
});

describe("매입 영수증으로 바꾸기", () => {
  it("보증금은 원가에서 빼고 메모로만 남긴다", () => {
    const d = parseLiquorLedgerGrid(grid).days[0];
    const p = liquorDayToPurchase(d, "주류", []);
    expect(p.id).toBe("pu_liq_20260805");
    expect(p.lines.reduce((a, l) => a + l.amount, 0)).toBe(90000);
    expect(p.lines[0]).toMatchObject({ name: "가짜소주 360ml 박스", unitPrice: 30000, qty: 2 });
    expect(p.memo).toContain("보증금 14,600원");
    expect(p.memo).toContain("빈병 반납 10,000원");
  });

  it("원가율 품목이 있으면 병 수로 연결한다", () => {
    const d = parseLiquorLedgerGrid(grid).days[0];
    const p = liquorDayToPurchase(d, "주류", [item("i1", "가짜소주")]);
    expect(p.lines[0]).toMatchObject({ itemId: "i1", itemQty: 60 });
    expect(p.lines[1].itemId).toBeNull();
  });

  it("없는 술만 병 단위 품목으로 새로 만든다", () => {
    const r = parseLiquorLedgerGrid(grid);
    const made = newLiquorItems(r, [item("i1", "가짜소주")]);
    expect(made).toHaveLength(1);
    expect(made[0]).toMatchObject({ name: "가짜맥주", baseUnit: "ea", standardCost: 1500, category: "drink" });
  });
});
