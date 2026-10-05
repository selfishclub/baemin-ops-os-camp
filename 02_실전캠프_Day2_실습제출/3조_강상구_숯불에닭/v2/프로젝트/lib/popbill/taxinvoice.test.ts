import { describe, expect, it } from "vitest";
import { toDate, toDraft, toDrafts, usedConfirmNums, vendorOf } from "./taxinvoice";
import type { TaxinvoiceDetail } from "./types";

const ti = (p: Partial<TaxinvoiceDetail> = {}): TaxinvoiceDetail => ({
  ntsconfirmNum: "20261003-11111111-2222", writeDate: "20261003",
  invoicerCorpNum: "2428100582", invoicerCorpName: "주식회사 으뜸식품",
  supplyCostTotal: "409,090", taxTotal: "40,910", totalAmount: "450,000", ...p,
});

describe("전자세금계산서 → 매입 영수증 초안", () => {
  it("거래처·날짜·합계를 채운다", () => {
    const d = toDraft(ti(), "x1")!;
    expect(d).toMatchObject({ date: "2026-10-03", vendor: "주식회사 으뜸식품", discount: 0 });
    expect(d.lines[0].amount).toBe(450000);
    expect(d.supplyCost + d.tax).toBe(450000);
  });

  it("승인번호를 메모에 남겨 둔다 (두 번 안 넣으려고)", () => {
    expect(toDraft(ti(), "x1")!.memo).toContain("20261003-11111111-2222");
  });

  it("상호가 비면 사업자번호로 대신한다", () => {
    expect(vendorOf(ti({ invoicerCorpName: "", invoicerCornName: "" }))).toBe("사업자 2428100582");
  });

  it("문서 오타(invoicerCornName)로 와도 읽는다", () => {
    expect(vendorOf({ ...ti(), invoicerCorpName: undefined, invoicerCornName: "청주주류" })).toBe("청주주류");
  });

  it("날짜나 금액이 없으면 버린다", () => {
    expect(toDraft(ti({ writeDate: "", issueDate: "" }), "x")).toBeNull();
    expect(toDraft(ti({ totalAmount: "0" }), "x")).toBeNull();
  });

  it("품목명이 오면 그대로 쓰고, 없으면 채우라고 적어 둔다", () => {
    expect(toDraft(ti({ itemName: "닭갈비 외" }), "x")!.lines[0].name).toBe("닭갈비 외");
    expect(toDraft(ti(), "x")!.lines[0].name).toContain("영수증 보고 채우세요");
  });

  it("이미 가져온 승인번호는 건너뛴다", () => {
    let n = 0;
    const { drafts, skipped } = toDrafts([ti(), ti({ ntsconfirmNum: "다른거" })], ["20261003-11111111-2222"], () => `id${++n}`);
    expect(drafts).toHaveLength(1);
    expect(skipped).toBe(1);
    expect(drafts[0].ntsconfirmNum).toBe("다른거");
  });

  it("한 번에 같은 계산서가 두 장 와도 하나만 넣는다", () => {
    let n = 0;
    const { drafts } = toDrafts([ti(), ti()], [], () => `id${++n}`);
    expect(drafts).toHaveLength(1);
  });

  it("영수증 메모에서 쓰인 승인번호를 찾아낸다", () => {
    const used = usedConfirmNums([{ id: "p", date: "2026-10-03", vendor: "으뜸", lines: [], discount: 0, memo: "전자세금계산서 자동 가져오기 · 승인번호 20261003-11111111-2222 · 공급가 1" }]);
    expect(used).toEqual(["20261003-11111111-2222"]);
  });

  it("날짜 바꾸기", () => {
    expect(toDate("20261003")).toBe("2026-10-03");
    expect(toDate("202610")).toBe("");
  });
});
