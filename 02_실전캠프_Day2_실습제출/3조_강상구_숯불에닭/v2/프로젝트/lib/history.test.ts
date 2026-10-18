import { describe, expect, it } from "vitest";
import { historyByMonth, mergeHistory, parseOkposDaily } from "./history";
import { buildInsights, ownOutlook, withHistory, type DaySales } from "./market/insight";

// 오케이포스 「일별종합」 엑셀 첫 시트를 header:1 로 읽은 모양 (2026-10-10~16 실제 파일과 같은 머리줄)
const HEAD = ["일자", "요일", "총매출", "총할인", "실매출", "가액", "부가세", "영수건수", "영수단가", "고객수", "객단가"];
const rows: unknown[][] = [
  [" (일별종합)"],
  ["조회일자 : 2026-10-10 ~ 2026-10-16"],
  ["일자", "요일", "매출현황", "매출현황", "매출현황"],
  HEAD,
  [46311, "금", 1902000, 2000, 1900000, 1727369, 172631, 26, 73076.9, 28, 67857.1],
  [46310, "목", 1100000, 0, 1100000, 1000041, 99959, 10, 110000, 10, 110000],
  ["합계", "", 3002000, 2000, 3000000, 0, 0, 36, 0, 38, 0],
];

describe("지난 매출 (포스 일별종합)", () => {
  it("날짜 일련번호·실매출·건수를 읽고 합계 줄은 뺀다", () => {
    expect(parseOkposDaily(rows)).toEqual([
      { date: "2026-10-15", hall: 1_100_000, receipts: 10, customers: 10 },
      { date: "2026-10-16", hall: 1_900_000, receipts: 26, customers: 28 },
    ]);
  });
  it("일별종합이 아니면 null", () => {
    expect(parseOkposDaily([["카드승인현황"], ["승인일자", "카드사"]])).toBeNull();
  });
  it("같은 날은 새 것으로", () => {
    const a = [{ date: "2026-10-15", hall: 1, receipts: null, customers: null }];
    const b = [{ date: "2026-10-15", hall: 2, receipts: null, customers: null }, { date: "2026-10-14", hall: 3, receipts: null, customers: null }];
    expect(mergeHistory(a, b).map((d) => [d.date, d.hall])).toEqual([["2026-10-14", 3], ["2026-10-15", 2]]);
    expect(historyByMonth(b).get("2026-10")).toEqual({ hall: 5, days: 2 });
  });
});

/** 달마다 하루 매출을 정해 하루치 목록을 만든다 */
function year(from: string, to: string, perMonth: Record<string, number>): DaySales[] {
  const out: DaySales[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) {
    const date = new Date(t).toISOString().slice(0, 10);
    out.push({ date, total: perMonth[date.slice(5, 7)] ?? 1_500_000 });
  }
  return out;
}

describe("우리 가게 지난 기록으로 앞으로 석 달", () => {
  const hist = year("2024-09-01", "2026-08-26", { "12": 1_100_000, "01": 1_000_000 }).map((d) => ({ date: d.date, hall: d.total, receipts: null, customers: null }));
  const ledger = year("2026-08-27", "2026-10-18", {});

  it("같은 달 가장 최근 해와 1년 평균을 견준다", () => {
    const o = ownOutlook(withHistory(ledger, hist), "2026-11-10");
    expect(o.map((x) => [x.month, x.year])).toEqual([[12, 2025], [1, 2026], [2, 2026]]);
    expect(o[0].vsAvg).toBeLessThan(-20);
    expect(o[2].vsAvg).toBeGreaterThan(0);
  });
  it("장부와 겹치는 날은 장부를 쓴다", () => {
    const merged = withHistory([{ date: "2026-08-27", total: 9 }], [{ date: "2026-08-27", hall: 1, receipts: null, customers: null }]);
    expect(merged).toEqual([{ date: "2026-08-27", total: 9 }]);
  });
  it("지난 매출이 있으면 보고서 없이도 문장이 나온다", () => {
    const ids = buildInsights(null, ledger, [], [], "2026-11-10", hist).map((x) => x.id);
    expect(ids).toContain("ownSeason");
    expect(buildInsights(null, ledger, [], [], "2026-11-10").map((x) => x.id)).not.toContain("ownSeason");
  });
});
