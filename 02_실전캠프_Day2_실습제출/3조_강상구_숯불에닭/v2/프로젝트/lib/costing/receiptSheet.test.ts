import { describe, expect, it } from "vitest";
import { parseReceiptSheets, receiptDiscount, receiptTotal, sheetReceiptToPurchase, toPurchaseCategory } from "./receiptSheet";
import type { Item } from "./types";

// 가짜 숫자로 만든 영수증 정리 파일 (실제 파일과 같은 모양)
const itemsSheet = [
  ["구매일시", "거래처", "비용분류", "품목", "단가", "수량", "품목금액", "결제수단", "검토상태"],
  ["2026-08-03 17:22", "가짜마트", "식재료", "특란 30구", "7,000원", "2원", "14,000원", "체크카드", "확인"],
  ["2026-08-03 17:22", "가짜마트", "세제/위생", "주방세제 3L", "5,000원", "1원", "5,000원", "체크카드", "확인"],
  ["2026-08-04 09:25", "가짜분식", "식비/기타", "김밥", "4,000원", "1원", "4,000원", "체크카드", "확인"],
  ["2026-08-05 14:20", "가짜상회", "식재료", "양파 15kg", "20,000원", "1원", "20,000원", "체크카드", "확인"],
  ["2026-08-05 14:25", "가짜상회", "주류", "청주(BOX)", "15,000원", "1원", "15,000원", "체크카드", "확인 필요"],
];
const summarySheet = [
  ["날짜", "거래처", "영수증결제액", "할인액", "손익반영액", "결제수단", "메모"],
  ["2026-08-03", "가짜마트", "17,000원", "-2,000원", "17,000원", "체크카드", "영수증 총액 기준"],
  ["2026-08-04", "가짜분식", "4,000원", "0원", "4,000원", "체크카드", ""],
  ["2026-08-05", "가짜상회", "15,000원", "0원", "15,000원", "체크카드", ""],
  ["2026-08-05", "가짜상회", "20,000원", "0원", "20,000원", "체크카드", ""],
];
const sheets = [
  { name: "품목별내역", grid: itemsSheet },
  { name: "영수증요약", grid: summarySheet },
];
const item = (id: string, name: string, baseUnit: Item["baseUnit"] = "ea"): Item => ({ id, name, baseUnit, standardCost: 0, category: "etc", active: true });

describe("영수증 정리 파일 읽기", () => {
  it("구매일시·거래처로 영수증을 묶는다", () => {
    const { receipts } = parseReceiptSheets(sheets);
    expect(receipts.map((r) => `${r.date} ${r.time} ${r.vendor} ${r.lines.length}`)).toEqual([
      "2026-08-03 17:22 가짜마트 2",
      "2026-08-04 09:25 가짜분식 1",
      "2026-08-05 14:20 가짜상회 1",
      "2026-08-05 14:25 가짜상회 1",
    ]);
    expect(receipts[0].lines[0]).toMatchObject({ name: "특란 30구", unitPrice: 7000, qty: 2, amount: 14000 });
  });

  it("결제액을 기준으로 할인을 맞춘다", () => {
    const [mart] = parseReceiptSheets(sheets).receipts;
    expect(mart.itemSum).toBe(19000);
    expect(mart.paid).toBe(17000);
    expect(receiptDiscount(mart)).toBe(2000);
    expect(receiptTotal(mart)).toBe(17000);
  });

  it("같은 날 같은 거래처가 두 건이면 금액이 맞는 것끼리 짝짓는다", () => {
    const r = parseReceiptSheets(sheets).receipts;
    expect(r[2].paid).toBe(20000);
    expect(r[3].paid).toBe(15000);
  });

  it("식비·기타뿐인 영수증은 가게 비용이 아닐 수 있다고 표시한다", () => {
    const r = parseReceiptSheets(sheets).receipts;
    expect(r[1].personal).toBe(true);
    expect(r[0].personal).toBe(false);
  });

  it("검토가 안 끝난 줄은 알려 준다", () => {
    expect(parseReceiptSheets(sheets).notes.join()).toContain("검토상태");
  });

  it("요약 시트가 없으면 할인 0", () => {
    const [mart] = parseReceiptSheets([sheets[0]]).receipts;
    expect(mart.paid).toBeNull();
    expect(receiptDiscount(mart)).toBe(0);
  });

  it("다른 엑셀이면 알아듣게 거절한다", () => {
    expect(() => parseReceiptSheets([{ name: "x", grid: [["상품코드", "매출액"]] }])).toThrow("영수증 정리 파일");
  });
});

describe("매입 영수증으로 바꾸기", () => {
  it("분류를 매입 영수증 분류로 바꾼다", () => {
    expect(toPurchaseCategory("식재료")).toBe("원재료비");
    expect(toPurchaseCategory("음료")).toBe("원재료비");
    expect(toPurchaseCategory("세제/위생")).toBe("소모품비");
    expect(toPurchaseCategory("주방용품")).toBe("소모품비");
    expect(toPurchaseCategory("식비/기타")).toBe("기타");
  });

  it("품목을 연결하고 묶음 수로 수량을 잡는다", () => {
    const [mart] = parseReceiptSheets(sheets).receipts;
    const p = sheetReceiptToPurchase(mart, [item("egg", "특란")], true);
    expect(p.id).toBe("pu_rx_202608031722_가짜마트");
    expect(p.discount).toBe(2000);
    expect(p.lines[0]).toMatchObject({ category: "원재료비", itemId: "egg", itemQty: 60 });
    expect(p.lines[1]).toMatchObject({ category: "소모품비", itemId: null });
  });

  it("연결을 끄면 품목에 붙이지 않는다", () => {
    const [mart] = parseReceiptSheets(sheets).receipts;
    expect(sheetReceiptToPurchase(mart, [item("egg", "특란")], false).lines[0].itemId).toBeNull();
  });
});
