import { describe, expect, it } from "vitest";
import { matchItem, parseDate, parseReceiptText } from "./receiptText";
import type { Item } from "./types";

const item = (id: string, name: string, baseUnit: Item["baseUnit"] = "ea"): Item => ({ id, name, baseUnit, standardCost: 0, category: "etc", active: true });

describe("영수증 텍스트 읽기", () => {
  it("정해진 형식을 그대로 읽는다", () => {
    const r = parseReceiptText(`거래처: 홈마트
날짜: 2026-09-20
상품명 | 단가 | 수량 | 금액
특란 30구 | 5,800 | 2 | 11,600
대파 1단 | 2,500 | 3 | 7,500
할인: 600
합계: 18,500`);
    expect(r.vendor).toBe("홈마트");
    expect(r.date).toBe("2026-09-20");
    expect(r.discount).toBe(600);
    expect(r.total).toBe(18500);
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]).toMatchObject({ name: "특란 30구", unitPrice: 5800, qty: 2, amount: 11600 });
    expect(r.notes).toEqual([]);
  });

  it("탭·한 칸 띄우기·줄 번호가 섞여도 읽는다", () => {
    const r = parseReceiptText(`상호 : 으뜸식품\n일자 2026.9.18\n1 닭갈비 원육 8,900 4 35,600\n2\t양배추\t3,000\t2\t6,000`);
    expect(r.vendor).toBe("으뜸식품");
    expect(r.date).toBe("2026-09-18");
    expect(r.lines.map((l) => l.name)).toEqual(["닭갈비 원육", "양배추"]);
    expect(r.lines[1].amount).toBe(6000);
  });

  it("숫자가 둘이면 수량·금액으로 읽고 단가를 계산한다", () => {
    const r = parseReceiptText("두부 | 2 | 3000");
    expect(r.lines[0]).toMatchObject({ qty: 2, amount: 3000, unitPrice: 1500 });
  });

  it("금액만 있으면 수량 1로 넣는다", () => {
    const r = parseReceiptText("종이컵 한 박스 | 24,000");
    expect(r.lines[0]).toMatchObject({ qty: 1, amount: 24000 });
  });

  it("상품 줄처럼 적힌 할인은 할인 합계로 뺀다", () => {
    const r = parseReceiptText("양파 | 1,000 | 2 | 2,000\n행사할인 | -500");
    expect(r.lines).toHaveLength(1);
    expect(r.discount).toBe(500);
  });

  it("단가×수량과 금액이 다르면 알려 주고 금액을 그대로 쓴다", () => {
    const r = parseReceiptText("콩기름 | 5,000 | 2 | 9,000");
    expect(r.lines[0].amount).toBe(9000);
    expect(r.notes.join()).toContain("콩기름");
  });

  it("영수증 합계와 읽은 합계가 다르면 알려 준다", () => {
    const r = parseReceiptText("양파 | 1,000 | 2 | 2,000\n합계: 5,000");
    expect(r.notes.join()).toContain("영수증 합계");
  });

  it("못 읽으면 못 읽었다고 한다", () => {
    expect(parseReceiptText("안녕하세요 영수증입니다").notes.join()).toContain("못 읽었어요");
  });

  it("날짜는 여러 모양을 받는다", () => {
    expect(parseDate("2026-09-20")).toBe("2026-09-20");
    expect(parseDate("26/9/5")).toBe("2026-09-05");
    expect(parseDate("9월 20일", "2026-09")).toBe("2026-09-20");
    expect(parseDate("없음")).toBe("");
  });
});

describe("품목 자동 연결", () => {
  const items = [item("i1", "특란"), item("i2", "닭갈비 원육", "kg"), item("i3", "대파", "kg"), item("i4", "쉬는 품목")];
  items[3].active = false;

  it("상품명에 품목 이름이 들어 있으면 연결한다", () => {
    expect(matchItem("특란 30구", items)?.id).toBe("i1");
    expect(matchItem("닭갈비원육 (냉장)", items)?.id).toBe("i2");
  });

  it("안 쓰는 품목·없는 품목은 연결하지 않는다", () => {
    expect(matchItem("쉬는 품목", items)).toBeNull();
    expect(matchItem("휴지", items)).toBeNull();
  });
});
