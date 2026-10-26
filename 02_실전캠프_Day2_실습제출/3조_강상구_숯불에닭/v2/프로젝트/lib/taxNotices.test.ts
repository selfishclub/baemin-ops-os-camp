import { describe, expect, it } from "vitest";
import { findPayment, paymentMonths, sortNotices, taxStatus, type TaxNotice } from "./taxNotices";
import type { Transaction } from "./types";

const notice = (o: Partial<TaxNotice> = {}): TaxNotice => ({ id: "tn1", kind: "부가세", title: "2026년 2기 부가세 예정고지", amount: 1_450_660, due: "2026-11-02", addedAt: "2026-10-26", ...o });
const tx = (date: string, out: number, major: Transaction["major"] = "세금과공과"): Transaction => ({ id: date + out, date, payee: "국세 납부", out, in: 0, month: date.slice(0, 7), source: "bank", major, minor: "부가세", channel: null, review: null });

describe("세금 고지서", () => {
  it("통장에서 같은 금액이 기한 언저리에 나가면 냈다고 본다", () => {
    expect(taxStatus(notice(), [tx("2026-10-30", 1_450_660)], "2026-11-05")).toEqual({ state: "paid", date: "2026-10-30", payee: "국세 납부" });
  });
  it("금액이 다르거나 너무 먼 날이면 짝으로 안 본다", () => {
    expect(findPayment(notice(), [tx("2026-10-30", 1_450_000), tx("2026-07-25", 1_450_660)])).toBeNull();
  });
  it("세금과공과로 분류된 줄을 먼저 고른다", () => {
    expect(findPayment(notice(), [tx("2026-11-01", 1_450_660, "영업비"), tx("2026-11-02", 1_450_660)])?.date).toBe("2026-11-02");
  });
  it("안 냈으면 남은 날·지난 날", () => {
    expect(taxStatus(notice(), [], "2026-10-26")).toEqual({ state: "open", daysLeft: 7 });
    expect(taxStatus(notice(), [], "2026-11-02")).toEqual({ state: "open", daysLeft: 0 });
    expect(taxStatus(notice(), [], "2026-11-04")).toEqual({ state: "late", daysLate: 2 });
  });
  it("통장 달은 기한 두 달 전 ~ 한 달 뒤, 해를 넘겨도", () => {
    expect(paymentMonths("2026-11-02")).toEqual(["2026-09", "2026-10", "2026-11", "2026-12"]);
    expect(paymentMonths("2027-01-25")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
  });
  it("안 낸 것 먼저(기한 가까운 순), 낸 것은 뒤(최근 순)", () => {
    const a = notice({ id: "a", due: "2026-11-30" }), b = notice({ id: "b", due: "2026-11-02" }), c = notice({ id: "c", due: "2026-07-25" }), d = notice({ id: "d", due: "2026-05-31" });
    const paid = new Set(["c", "d"]);
    expect(sortNotices([d, c, a, b], (n) => (paid.has(n.id) ? { state: "paid", date: "", payee: "" } : { state: "open", daysLeft: 1 })).map((n) => n.id)).toEqual(["b", "a", "c", "d"]);
  });
});
