import { describe, expect, it } from "vitest";
import { missingFixedCosts } from "./missingFixed";
import type { Major } from "./categories";
import type { Rule, Transaction } from "./types";

const tx = (month: string, date: string, payee: string, out: number, major: Major, minor: string): Transaction => ({
  id: date + payee, month, date, payee, out, in: 0, source: "bank", major, minor, channel: null, review: null,
});
const rules: Rule[] = [
  { id: "r1", keyword: "월세", direction: "out", major: "임대료", minor: "임대료", channel: null },
  { id: "r2", keyword: "통신요금", direction: "out", major: "영업비", minor: "통신비", channel: null },
];
const prev = [
  tx("2026-08", "2026-08-25", "월세 김건물", 900_000, "임대료", "임대료"),
  tx("2026-08", "2026-08-05", "통신요금 8월", 55_000, "영업비", "통신비"),
  tx("2026-08", "2026-08-12", "가나식품", 400_000, "매출원가", "원재료비"), // 재료비는 매달 금액·거래처가 달라서 안 본다
];

describe("지난달엔 있었는데 이번 달엔 없는 고정비", () => {
  it("월세가 빠졌으면 알린다 (통신요금은 이름에 달이 붙어도 같은 거래처로 본다)", () => {
    const now = [tx("2026-09", "2026-09-05", "통신요금 9월", 55_000, "영업비", "통신비")];
    const m = missingFixedCosts(prev, now, rules, "2026-09-30");
    expect(m.map((x) => x.key)).toEqual(["월세"]);
    expect(m[0].prevAmount).toBe(900_000);
  });

  it("아직 낼 날이 안 됐으면 조용히 (8/25 + 한 달 + 3일 = 9/28 전)", () => {
    expect(missingFixedCosts(prev, [], rules, "2026-09-20").map((x) => x.key)).toEqual(["통신요금"]);
    expect(missingFixedCosts(prev, [], rules, "2026-09-27").map((x) => x.key)).toEqual(["통신요금"]);
    expect(missingFixedCosts(prev, [], rules, "2026-09-28").map((x) => x.key)).toEqual(["월세", "통신요금"]);
  });

  it("재료비 같은 정기 아닌 항목은 안 본다", () => {
    expect(missingFixedCosts(prev, [], rules, "2026-10-31").some((x) => x.key === "가나식품")).toBe(false);
  });

  it("규칙 탭 고정비에 적어 둔 거래처는 이미 채우고 있으니 뺀다", () => {
    const fc = [{ id: "f", name: "월세", payeeKeyword: "월세", major: "임대료" as Major, minor: "임대료", amount: 900_000, active: true }];
    expect(missingFixedCosts(prev, [], rules, "2026-10-31", fc).map((x) => x.key)).toEqual(["통신요금"]);
  });

  it("이름에 달이 박힌 거래처는 규칙이 달마다 따로 있어도 같은 곳으로 본다", () => {
    // 통장에 "전기료 전기요금09월" → "전기료 전기요금10월"로 찍히고, 규칙도 달마다 따로 만들어져 있다.
    const monthRules: Rule[] = [
      { id: "e9", keyword: "전기료 전기요금09월", direction: "out", major: "영업비", minor: "수도광열비", channel: null },
      { id: "e10", keyword: "전기료 전기요금10월", direction: "out", major: "영업비", minor: "수도광열비", channel: null },
    ];
    const p = [tx("2026-09", "2026-09-28", "전기료 전기요금09월", 1_029_510, "영업비", "수도광열비")];
    const n = [tx("2026-10", "2026-10-26", "전기료 전기요금10월", 500_360, "영업비", "수도광열비")];
    expect(missingFixedCosts(p, n, monthRules, "2026-10-31")).toHaveLength(0);
  });

  it("정말 빠진 건 통장에 찍힌 이름으로 보여 준다", () => {
    const p = [tx("2026-09", "2026-09-17", "자동납부 청주대학교", 10_000, "영업비", "지급수수료")];
    const m = missingFixedCosts(p, [], rules, "2026-10-31");
    expect(m.map((x) => x.label)).toEqual(["자동납부 청주대학교"]);
  });

  it("31일에 낸 돈은 다음 달 말일 기준", () => {
    const p = [tx("2026-08", "2026-08-31", "월세", 900_000, "임대료", "임대료")];
    expect(missingFixedCosts(p, [], rules, "2026-10-02")).toHaveLength(0);
    expect(missingFixedCosts(p, [], rules, "2026-10-03")).toHaveLength(1);
  });
});
