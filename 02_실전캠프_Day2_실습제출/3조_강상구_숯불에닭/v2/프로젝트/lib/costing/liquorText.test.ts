import { describe, expect, it } from "vitest";
import { liquorDayToPurchase } from "./liquorLedger";
import { parseLiquorText } from "./liquorText";
import type { Item } from "./types";

// 지시문대로 나온 글 (실제 주류 판매계산서와 같은 모양, 숫자는 가짜)
const canonical = `거래처: (유)가짜주류
날짜: 2026-08-23
품목 | 용량 | 박스 | 낱병 | 술값 | 보증금
가짜소주 | 360 | 1 | 0 | 43000 | 5500
가짜맥주 | 500 | 5 | 0 | 197500 | 23000
술값소계: 240500
보증금소계: 28500
빈병회수: 79800
채권잔액: 3001700`;

// 사장님이 쓰던 표 (금액에 보증금이 들어 있고, 비고로 알려 줌)
const legacy = `날짜	거래처	품목명	수량	단가	금액	분류	결제수단	비고
2026-08-23	(유)가짜주류	가짜소주 360ml	1	48500	48500	주류비	외상	용기보증금 5500원 포함
2026-08-23	(유)가짜주류	가짜맥주 500ml	5	44100	220500	주류비	외상	용기보증금 23000원 포함`;

const item = (id: string, name: string): Item => ({ id, name, baseUnit: "ea", standardCost: 0, category: "drink", active: true });

describe("주류 영수증 붙여넣기", () => {
  it("지시문 형식을 읽고 술값·보증금·회수·채권잔액을 나눈다", () => {
    const r = parseLiquorText(canonical);
    expect(r.vendor).toBe("(유)가짜주류");
    expect(r.day.date).toBe("2026-08-23");
    expect(r.day.subtotal).toBe(240500);
    expect(r.day.deposit).toBe(28500);
    expect(r.day.returned).toBe(79800);
    expect(r.balance).toBe(3001700);
    expect(r.notes).toEqual([]);
  });

  it("박스당 병 수로 병당 원가를 낸다", () => {
    const [soju, beer] = parseLiquorText(canonical).day.lines;
    expect(soju).toMatchObject({ specMl: 360, bottles: 30, perBottle: 1433 });
    expect(beer).toMatchObject({ specMl: 500, bottles: 100, perBottle: 1975 });
  });

  it("보증금이 금액에 들어 있는 표도 읽는다 (술값 = 금액 − 보증금)", () => {
    const r = parseLiquorText(legacy);
    expect(r.day.lines.map((l) => l.subtotal)).toEqual([43000, 197500]);
    expect(r.day.deposit).toBe(28500);
    expect(r.day.lines[0].specMl).toBe(360); // 품목명 끝의 용량을 읽는다
    expect(r.vendor).toBe("(유)가짜주류");
    expect(r.day.date).toBe("2026-08-23");
  });

  it("술값 소계가 줄 합계와 다르면 알려 준다", () => {
    const bad = canonical.replace("술값소계: 240500", "술값소계: 999999");
    expect(parseLiquorText(bad).notes.join()).toContain("술값 검산");
  });

  it("모르는 규격은 병당 원가를 짐작하지 않고 알려 준다", () => {
    const odd = canonical.replace("가짜소주 | 360 |", "가짜약주 | 750 |");
    const r = parseLiquorText(odd);
    expect(r.day.lines[0].bottles).toBeNull();
    expect(r.notes.join()).toContain("한 박스에 몇 병");
  });

  it("주류 영수증이 아니면 알아듣게 거절한다", () => {
    expect(() => parseLiquorText("안녕하세요\n고맙습니다")).toThrow("주류 영수증");
  });
});

describe("매입 영수증으로 바꾸기", () => {
  it("술값만 원가로 넣고 보증금·회수는 메모로 남긴다", () => {
    const r = parseLiquorText(canonical);
    const p = liquorDayToPurchase(r.day, r.vendor, []);
    expect(p.lines.reduce((a, l) => a + l.amount, 0)).toBe(240500);
    expect(p.memo).toContain("보증금 28,500원");
    expect(p.memo).toContain("빈병 반납 79,800원");
  });

  it("원가율 품목이 있으면 병 수로 연결한다", () => {
    const r = parseLiquorText(canonical);
    const p = liquorDayToPurchase(r.day, r.vendor, [item("i1", "가짜맥주")]);
    expect(p.lines[1]).toMatchObject({ itemId: "i1", itemQty: 100 });
    expect(p.lines[0].itemId).toBeNull();
  });
});
