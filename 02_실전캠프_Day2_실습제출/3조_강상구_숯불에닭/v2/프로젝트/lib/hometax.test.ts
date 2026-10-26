import { describe, expect, it } from "vitest";
import type { Purchase } from "./costing/purchases";
import { cardReceiptVat, hometaxMonth, mergeHometax, parseHometaxSheet, sameVendor } from "./hometax";
import { vatBasisFrom } from "./vatBasis";

// 홈택스 "매입 전자(수정) 세금계산서 목록조회" 엑셀 첫 시트 모양 (2026-10 실제 파일과 같은 머리줄, 거래처·숫자는 가짜)
const HEAD = ["작성일자", "승인번호", "발급일자", "전송일자", "공급자사업자등록번호", "종사업장번호", "상호", "대표자명", "주소", "공급받는자사업자등록번호", "종사업장번호", "상호", "대표자명", "주소", "합계금액", "공급가액", "세액", "전자세금계산서분류", "전자세금계산서종류", "발급유형", "비고", "영수/청구 구분", "공급자 이메일", "공급받는자 이메일1", "공급받는자 이메일2", "품목일자", "품목명"];
const row = (date: string, ap: string, biz: string, name: string, rep: string, total: number, supply: number, vat: number, item: string) => [date, ap, date, date, biz, "", name, rep, "주소", "000-00-00000", "", "우리가게", "사장", "주소", String(total), String(supply), String(vat), "세금계산서", "일반", "자체발급", "", "영수", "", "", "", date, item];
const sheet = (title = "매입 전자(수정) 세금계산서 목록조회"): unknown[][] => [
  ["사업자 등록번호", "000-00-00000", "상호", "우리가게"],
  [],
  ["총 합계금액", "1", "총 공급가액", "1", "총 세액", "1"],
  [],
  [title, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "대표 품목"],
  HEAD,
  row("2026-09-30", "A1", "111-11-11111", "주식회사 가짜본사", "김본사", 5_200_580, 4_727_800, 472_780, "9월 소스"),
  row("2026-09-30", "A2", "222-22-22222", "(유)가짜주류", "이주류", 2_977_000, 2_706_348, 270_652, "카스"),
  row("2026-09-01", "A3", "333-33-33333", " ", "박임대", 2_640_000, 2_400_000, 240_000, "월임대료"),
];

describe("홈택스 매입 자료", () => {
  it("세금계산서 목록 엑셀을 읽는다 — 상호가 비면 대표자명", () => {
    const r = parseHometaxSheet(sheet());
    expect([r.kind, r.error, r.rows.length]).toEqual(["세금계산서", null, 3]);
    expect(r.rows[2]).toMatchObject({ vendor: "박임대", supply: 2_400_000, vat: 240_000, free: false });
  });
  it("매출 파일·다른 파일은 거절한다", () => {
    expect(parseHometaxSheet(sheet("매출 전자(수정) 세금계산서 목록조회")).error).toMatch(/매출/);
    expect(parseHometaxSheet([["상품코드", "상품명"]]).error).toMatch(/엑셀이 아니에요/);
  });
  it("계산서(면세) 목록은 세액 칸이 없다", () => {
    const head = ["작성일자", "승인번호", "발급일자", "전송일자", "공급자사업자등록번호", "종사업장번호", "상호", "대표자명", "합계금액", "공급가액", "품목명"];
    const r = parseHometaxSheet([["매입 전자(수정) 계산서 목록조회"], head, ["2026-09-30", "F1", "", "", "444-44-44444", "", "주식회사 가짜식품", "권닭", "5,475,000", "5,475,000", "계육외"]]);
    expect(r.kind).toBe("계산서");
    expect(r.rows[0]).toMatchObject({ vat: 0, free: true, supply: 5_475_000 });
  });
  it("같은 승인번호는 한 번만", () => {
    const rows = parseHometaxSheet(sheet()).rows;
    const a = mergeHometax(null, rows);
    expect(mergeHometax(a.store, rows)).toMatchObject({ added: 0 });
  });
  it("거래처 이름 맞추기", () => {
    expect([sameVendor("본사(가짜본사)", "주식회사 가짜본사"), sameVendor("주류", "(유)가짜주류"), sameVendor("홈마트", "(유)가짜주류")]).toEqual([true, true, false]);
  });
  it("그 달 거래처별로 묶고 매입 영수증 공급가와 견준다, 카드 영수증 부가세는 따로 더한다", () => {
    const store = mergeHometax(null, parseHometaxSheet(sheet()).rows).store;
    const line = (amount: number) => ({ name: "x", unitPrice: amount, qty: 1, amount, category: "원재료비" as const, itemId: null, itemQty: 0 });
    const ps: Purchase[] = [
      { id: "h", date: "2026-09-21", vendor: "본사(가짜본사)", discount: 0, vat: 59_400, vatExcluded: true, lines: [line(594_000)] },
      { id: "m", date: "2026-09-22", vendor: "홈마트", discount: 0, vat: 905, lines: [line(9_960)] },
    ];
    const hm = hometaxMonth(store, "2026-09", ps)!;
    expect([hm.taxCount, hm.vat]).toEqual([3, 983_432]);
    expect(hm.vendors.find((v) => v.vendor.includes("본사"))).toMatchObject({ receipts: 594_000, receiptCount: 1 });
    expect(cardReceiptVat(ps, hm)).toBe(905);
    expect(vatBasisFrom(ps, undefined, hm).inputActual).toBe(983_432 + 905);
    expect(hometaxMonth(store, "2026-10", ps)).toBeNull();
  });
});

describe("홈택스 품목 시트", () => {
  it("로열티·배송비는 물건값에서 빼고 영수증과 견준다", () => {
    const items = [["승인번호", "품목순번", "공급자등록번호", "공급받는자등록번호", "일자", "품목명", "규격", "수량", "단가", "공급가액", "세액"], ["A1", "1", "", "", "", "9월 소스", "", "", "", "4,266,000", "426,600"], ["A1", "2", "", "", "", "9월 로열티", "", "", "", "442,000", "44,200"], ["A1", "3", "", "", "", "9월 배송비", "", "", "", "19,800", "1,980"]];
    const r = parseHometaxSheet(sheet(), items);
    expect(r.rows[0].goods).toBe(4_266_000);
    expect(r.rows[1].goods).toBeUndefined();
    const hm = hometaxMonth(mergeHometax(null, r.rows).store, "2026-09", [])!;
    expect(hm.vendors[0]).toMatchObject({ supply: 4_727_800, goods: 4_266_000 });
  });
});

describe("배달앱 수수료 세금계산서", () => {
  it("수수료·광고뿐인 곳은 같은 이름 쇼핑 영수증과 견주지 않고, 그 영수증 부가세는 카드 부가세로 센다", () => {
    const store = mergeHometax(null, parseHometaxSheet([["매입 전자(수정) 세금계산서 목록조회"], HEAD, row("2026-09-30", "C1", "555-55-55555", "쿠팡 주식회사", "로저스", 41_306, 37_550, 3_756, "coupangeats Product Ad")]).rows).store;
    const ps: Purchase[] = [{ id: "c", date: "2026-09-11", vendor: "쿠팡 (해피락)", discount: 0, vat: 1_809, lines: [{ name: "x", unitPrice: 19_900, qty: 1, amount: 19_900, category: "기타재료비", itemId: null, itemQty: 0 }] }];
    const hm = hometaxMonth(store, "2026-09", ps)!;
    expect(hm.vendors[0]).toMatchObject({ goods: 0, receipts: null });
    expect(cardReceiptVat(ps, hm)).toBe(1_809);
  });
});
