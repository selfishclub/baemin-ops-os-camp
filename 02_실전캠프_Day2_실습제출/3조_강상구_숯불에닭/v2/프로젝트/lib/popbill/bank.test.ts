import { describe, expect, it } from "vitest";
import { earliestAllowed, splitPeriods, toBankRows, toDate, toPayee, toPopbillDate } from "./bank";
import type { BankDetail } from "./types";

const row = (p: Partial<BankDetail>): BankDetail => ({
  tid: "t1", trdate: "20261003", trdt: "20261003190044", accIn: "0", accOut: "29000",
  balance: "41168023", remark1: "", remark2: "", remark3: "", remark4: "", ...p,
});

describe("팝빌 계좌조회 → 통장 줄", () => {
  it("날짜를 장부 모양으로 바꾼다", () => {
    expect(toDate("20261003")).toBe("2026-10-03");
    expect(toDate("20261003190044")).toBe("2026-10-03");
    expect(toDate("")).toBe("");
  });

  it("거래처는 비어 있지 않은 비고를 붙여 만든다", () => {
    expect(toPayee(row({ remark3: "NH체크", remark1: "쿠팡(주)" }))).toBe("NH체크 쿠팡(주)");
    expect(toPayee(row({ remark3: "NH체크" }))).toBe("NH체크");
  });

  it("같은 글이 두 번 들어가지 않는다", () => {
    expect(toPayee(row({ remark3: "홈마트", remark1: "홈마트", remark2: "홈마트" }))).toBe("홈마트");
  });

  it("입금·출금 금액에서 쉼표를 걷어낸다", () => {
    const [r] = toBankRows([row({ accOut: "29,000", accIn: "0" })]);
    expect(r).toMatchObject({ date: "2026-10-03", out: 29000, in: 0 });
  });

  it("입금·출금이 둘 다 0인 줄은 버린다", () => {
    expect(toBankRows([row({ accIn: "0", accOut: "0" })])).toHaveLength(0);
  });

  it("날짜 오름차순으로 돌려준다", () => {
    const rows = toBankRows([row({ trdate: "20261004", tid: "b" }), row({ trdate: "20261001", tid: "a" })]);
    expect(rows.map((r) => r.date)).toEqual(["2026-10-01", "2026-10-04"]);
  });

  it("거래내역 아이디와 잔액을 같이 들고 온다 (대조용)", () => {
    const [r] = toBankRows([row({ tid: "abc", balance: "41,168,023" })]);
    expect(r.tid).toBe("abc");
    expect(r.balance).toBe(41168023);
  });
});

describe("수집 기간 쪼개기", () => {
  // 팝빌은 한 번에 1개월까지만 수집된다
  it("한 달 안이면 그대로 한 번", () => {
    expect(splitPeriods("2026-10-01", "2026-10-05")).toEqual([{ from: "2026-10-01", to: "2026-10-05" }]);
  });

  it("달을 넘으면 달마다 끊는다", () => {
    expect(splitPeriods("2026-09-28", "2026-11-03")).toEqual([
      { from: "2026-09-28", to: "2026-09-30" },
      { from: "2026-10-01", to: "2026-10-31" },
      { from: "2026-11-01", to: "2026-11-03" },
    ]);
  });

  it("2월처럼 날수가 다른 달도 맞는다", () => {
    expect(splitPeriods("2027-02-20", "2027-03-02")).toEqual([
      { from: "2027-02-20", to: "2027-02-28" },
      { from: "2027-03-01", to: "2027-03-02" },
    ]);
  });

  it("팝빌에 보낼 날짜 모양", () => {
    expect(toPopbillDate("2026-10-03")).toBe("20261003");
  });

  it("조회일로부터 3개월 전까지만", () => {
    expect(earliestAllowed("2026-10-05")).toBe("2026-07-05");
  });
});
