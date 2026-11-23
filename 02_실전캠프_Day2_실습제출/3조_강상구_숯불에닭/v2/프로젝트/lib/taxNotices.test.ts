import { describe, expect, it } from "vitest";
import { findPayment, matchPayments, paymentMonths, sortNotices, taxStatus, type TaxNotice } from "./taxNotices";
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

describe("분납 — 통장 한 줄이 여러 회차에 붙지 않는다", () => {
  // 2026-11-23 실제: 부가세 예정고지 1,450,660원을 3번에 나눠 낸다. 1차만 11/1에 냈다.
  const n1 = notice({ id: "v1", title: "2026년 2기 부가세 예정고지 (3회 분납 1차)", due: "2026-11-02" });
  const n2 = notice({ id: "v2", title: "2026년 2기 부가세 예정고지 (3회 분납 2차)", due: "2026-11-30" });
  const n3 = notice({ id: "v3", title: "2026년 2기 부가세 예정고지 (3회 분납 3차)", due: "2026-12-31" });
  const paid1 = tx("2026-11-01", 1_450_660);

  it("1차만 냈으면 2차·3차는 아직 안 낸 것으로 둔다", () => {
    const m = matchPayments([n1, n2, n3], [paid1]);
    expect(m.get("v1")?.date).toBe("2026-11-01");
    expect(m.has("v2")).toBe(false);
    expect(m.has("v3")).toBe(false);
    expect(taxStatus(n2, [paid1], "2026-11-23", m.get("v2") ?? null)).toEqual({ state: "open", daysLeft: 7 });
    // 혼자 찾게 두면 같은 줄에 붙어 버린다 — 그래서 matchPayments 가 필요하다
    expect(taxStatus(n2, [paid1], "2026-11-23").state).toBe("paid");
  });

  it("2차도 내면 각자 제 줄에 붙는다", () => {
    const paid2 = tx("2026-11-28", 1_450_660);
    const m = matchPayments([n1, n2, n3], [paid1, paid2]);
    expect(m.get("v1")?.date).toBe("2026-11-01");
    expect(m.get("v2")?.date).toBe("2026-11-28");
    expect(m.has("v3")).toBe(false);
  });

  it("기한이 이른 회차가 먼저 가져간다 (넣은 차례와 상관없이)", () => {
    const m = matchPayments([n3, n2, n1], [paid1]);
    expect(m.get("v1")?.date).toBe("2026-11-01");
    expect(m.size).toBe(1);
  });
});
