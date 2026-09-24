import { describe, expect, it } from "vitest";
import { lastDayOfMonth, matchesTx, monthsToLoad, quickRange, searchTxs, shiftDays, txTotals } from "./txSearch";
import type { Transaction } from "./types";

// 가짜 거래 몇 줄 (실제 자료와 같은 모양)
const tx = (id: string, date: string, payee: string, out: number, inn = 0, major: string | null = "매출원가", minor: string | null = "원재료비"): Transaction =>
  ({ id, date, month: date.slice(0, 7), payee, out, in: inn, source: "bank", major, minor, channel: null, review: null }) as unknown as Transaction;

const rows = [
  tx("t1", "2026-08-31", "NH체크 홈마트", 12000),
  tx("t2", "2026-09-02", "NH체크 홈마트", 30000),
  tx("t3", "2026-09-10", "NH콕송금 황란영", 2640000, 0, "임대료", "임대료"),
  tx("t4", "2026-09-12", "NH체크 다이소", -1000), // 카드 취소
  tx("t5", "2026-09-23", "신한가맹점 SHC1", 0, 103950, "수입", "매출액"),
  tx("t6", "2026-09-24", "NH체크 대파촌", 51200, 0, null, null),
];

describe("통장 거래 찾기", () => {
  it("기간 밖은 뺀다", () => {
    expect(searchTxs(rows, { from: "2026-09-01", to: "2026-09-12" }).map((t) => t.id)).toEqual(["t2", "t3", "t4"]);
  });

  it("기간을 비우면 전부 본다", () => {
    expect(searchTxs(rows, {})).toHaveLength(6);
  });

  it("시작·끝을 거꾸로 넣어도 알아서 바로잡는다", () => {
    expect(searchTxs(rows, { from: "2026-09-12", to: "2026-09-01" }).map((t) => t.id)).toEqual(["t2", "t3", "t4"]);
  });

  it("거래처와 분류에서 글자를 찾고, 띄어쓰기는 무시한다", () => {
    expect(searchTxs(rows, { text: "홈마트" }).map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(searchTxs(rows, { text: "임 대 료" }).map((t) => t.id)).toEqual(["t3"]);
  });

  it("입금·출금·미분류로 나눠 본다", () => {
    expect(searchTxs(rows, { kind: "입금" }).map((t) => t.id)).toEqual(["t5"]);
    expect(searchTxs(rows, { kind: "출금" }).map((t) => t.id)).toEqual(["t1", "t2", "t3", "t4", "t6"]); // 취소(t4)도 출금 줄
    expect(searchTxs(rows, { kind: "미분류" }).map((t) => t.id)).toEqual(["t6"]);
  });

  it("기간과 글자를 같이 건다", () => {
    expect(matchesTx(rows[0], { from: "2026-09-01", text: "홈마트" })).toBe(false);
    expect(matchesTx(rows[1], { from: "2026-09-01", text: "홈마트" })).toBe(true);
  });

  it("찾은 줄의 수와 입금·출금 합계를 낸다", () => {
    expect(txTotals(searchTxs(rows, { text: "홈마트" }))).toEqual({ count: 2, in: 0, out: 42000 });
    expect(txTotals(searchTxs(rows, { from: "2026-09-12", to: "2026-09-23" }))).toEqual({ count: 2, in: 103950, out: -1000 });
  });

  it("날짜 순으로 보여 준다", () => {
    expect(searchTxs([rows[5], rows[0], rows[2]], {}).map((t) => t.date)).toEqual(["2026-08-31", "2026-09-10", "2026-09-24"]);
  });
});

describe("빠른 기간 버튼", () => {
  it("이 달 전체·지난달은 1일부터 말일까지", () => {
    expect(quickRange("month", "2026-09", "2026-09-25")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(quickRange("prev", "2026-09", "2026-09-25")).toEqual({ from: "2026-08-01", to: "2026-08-31" });
  });

  it("최근 7일은 오늘까지 이레", () => {
    expect(quickRange("week", "2026-09", "2026-09-25")).toEqual({ from: "2026-09-19", to: "2026-09-25" });
  });

  it("말일을 달마다 맞게 센다", () => {
    expect(lastDayOfMonth("2026-02")).toBe("2026-02-28");
    expect(lastDayOfMonth("2028-02")).toBe("2028-02-29");
    expect(lastDayOfMonth("2026-12")).toBe("2026-12-31");
  });

  it("달을 넘는 날짜 계산", () => {
    expect(shiftDays("2026-09-01", -1)).toBe("2026-08-31");
  });
});

describe("어느 달을 더 불러올까", () => {
  it("이미 가진 달은 빼고 알려 준다", () => {
    expect(monthsToLoad("2026-07-15", "2026-09-24", ["2026-09"])).toEqual(["2026-07", "2026-08"]);
    expect(monthsToLoad("2026-09-01", "2026-09-30", ["2026-09"])).toEqual([]);
  });
});
