import { describe, expect, it } from "vitest";
import { expandSplits, splitCheck, splitTotal, type TxSplit } from "./txSplit";
import type { Transaction } from "./types";

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: "t1", month: "2026-09", date: "2026-09-30", payee: "가짜관리사무소", out: 494_440, in: 0,
  source: "bank", major: "임대료", minor: "관리비", channel: null, review: null, ...over,
});
const splits: TxSplit[] = [
  { major: "임대료", minor: "관리비", amount: 264_000 },
  { major: "영업비", minor: "수도광열비", amount: 230_440, note: "전기·수도" },
];

describe("통장 한 줄 나눠서 분류", () => {
  it("나눈 금액 합계가 그 줄 금액과 맞는지 본다", () => {
    expect(splitTotal(splits)).toBe(494_440);
    expect(splitCheck(tx(), splits)).toMatchObject({ target: 494_440, total: 494_440, gap: 0, ok: true });
  });

  it("합계가 안 맞으면 ok가 아니다", () => {
    const short = [{ major: "임대료" as const, minor: "관리비", amount: 200_000 }];
    expect(splitCheck(tx(), short)).toMatchObject({ gap: 294_440, ok: false });
  });

  it("출금 줄을 몫마다 한 줄로 편다", () => {
    const rows = expandSplits([tx({ splits })]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ major: "임대료", minor: "관리비", out: 264_000, in: 0 });
    expect(rows[1]).toMatchObject({ major: "영업비", minor: "수도광열비", out: 230_440, in: 0 });
    expect(rows.map((r) => r.id)).toEqual(["t1#1", "t1#2"]);
  });

  it("입금 줄이면 들어온 돈으로 편다", () => {
    const income = tx({ out: 0, in: 100_000, major: "수입", minor: "매출액" });
    const rows = expandSplits([{ ...income, splits: [
      { major: "수입", minor: "매출액", amount: 70_000 },
      { major: "수입", minor: "기타매출", amount: 30_000 },
    ] }]);
    expect(rows.map((r) => [r.in, r.out])).toEqual([[70_000, 0], [30_000, 0]]);
  });

  it("합계가 안 맞으면 펴지 않고 원래 줄 그대로 둔다", () => {
    const rows = expandSplits([tx({ splits: [{ major: "임대료", minor: "관리비", amount: 1 }] })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].out).toBe(494_440);
  });

  it("나눈 게 없는 줄은 건드리지 않는다", () => {
    const plain = tx();
    expect(expandSplits([plain])[0]).toBe(plain);
  });
});
