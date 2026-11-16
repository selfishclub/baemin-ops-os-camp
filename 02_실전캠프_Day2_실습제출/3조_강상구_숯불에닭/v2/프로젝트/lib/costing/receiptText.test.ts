import { describe, expect, it } from "vitest";
import { learnLinks, matchItem, parseDate, parseReceiptText } from "./receiptText";
import type { Purchase } from "./purchases";
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

  it("이름이 안 겹쳐도 예전에 손으로 이어 둔 상품명이면 같은 품목에 잇는다 (으뜸 닭갈비(드럼))", () => {
    const buy = (date: string, name: string, itemId: string | null): Purchase => ({ id: date, date, vendor: "으뜸식품", discount: 0, lines: [{ name, unitPrice: 7800, qty: 10, amount: 78000, category: "원재료비", itemId, itemQty: 10 }] });
    expect(matchItem("닭갈비(드럼) 국내산", items)).toBeNull();
    const learned = learnLinks([buy("2026-11-13", "닭갈비(드럼) 국내산", "i2"), buy("2026-11-14", "닭갈비 (드럼)국내산", null)]);
    expect(matchItem("닭갈비(드럼) 국내산", items, learned)?.id).toBe("i2");
    expect(matchItem("닭갈비 (드럼) 국내산", items, learned)?.id).toBe("i2");
    // 기억한 품목을 안 쓰게 됐으면 기억은 버리고 이름으로만 찾는다
    expect(matchItem("쉬는 품목", items, learnLinks([buy("2026-11-01", "쉬는 품목", "i4")]))).toBeNull();
    // 같은 이름을 나중에 다른 품목으로 고쳐 이었으면 최근 것을 따른다
    const relinked = learnLinks([buy("2026-11-02", "대파 한단", "i3"), buy("2026-10-01", "대파 한단", "i1")]);
    expect(matchItem("대파 한단", items, relinked)?.id).toBe("i3");
  });
});

describe("영수증 텍스트 — 부가세·면세", () => {
  it("부가세 줄과 (면세) 표시를 읽는다, 과세·면세 물품 합계 줄은 상품이 아니다", () => {
    const r = parseReceiptText(`거래처: 가짜마트\n날짜: 2026-10-22\n판계란 30구 (면세) | 5980 | 10 | 59800\n과자 | 3980 | 2 | 7960\n면세물품: 59,800\n과세물품: 7,236\n부가세: 724\n합계: 67760`);
    expect(r.vat).toBe(724);
    expect(r.lines.map((l) => [l.name, !!l.taxFree])).toEqual([["판계란 30구", true], ["과자", false]]);
    expect(r.notes).toEqual([]);
  });
  it("마트 영수증처럼 금액 뒤 #도 면세로 본다, 부가세가 없으면 모름(null)", () => {
    const r = parseReceiptText(`백오이 3 | 990 | 1 | 990 #\n합계: 990`);
    expect([r.lines[0].taxFree, r.vat]).toEqual([true, null]);
  });
});

describe("부가세를 못 읽었을 때 (2026-11-14)", () => {
  const head = "거래처: 코카콜라음료\n날짜: 2026-11-11\n코카콜라 510PET ×24 | 22200 | 1 | 22200\n";

  it('"모름"은 0이 아니라 모름으로 둔다 — 0으로 두면 단가가 10% 부풀려진다', () => {
    expect(parseReceiptText(head + "부가세: 모름").vat).toBeNull();
    expect(parseReceiptText(head + "부가세: 안 보임").vat).toBeNull();
    expect(parseReceiptText(head + "부가세: 없음").vat).toBeNull();
    expect(parseReceiptText(head + "부가세: -").vat).toBeNull();
  });

  it("숫자로 적혀 있으면 그대로 읽는다", () => {
    expect(parseReceiptText(head + "부가세: 2,018").vat).toBe(2018);
    expect(parseReceiptText(head + "부가세: 0").vat).toBe(0);
  });

  it("부가세 줄이 아예 없으면 모름", () => {
    expect(parseReceiptText(head).vat).toBeNull();
  });
});
