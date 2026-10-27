import { describe, expect, it } from "vitest";
import { DELIVERY_FILE_KIND, historyByMonth, historyChannelSales, mergeHistory, parseDeliveryHistory, parseOkposDaily, pnlSales } from "./history";
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
    expect(historyByMonth(b).get("2026-10")).toEqual({ total: 5, delivery: 0, days: 2 });
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

describe("배달 지난 매출", () => {
  const pos = [{ date: "2025-01-10", hall: 1_000_000, receipts: 12, customers: 20 }];
  it("포스 홀 칸은 지키고 배달 칸만 더한다 — 순서가 바뀌어도", () => {
    const deliv = parseDeliveryHistory({ kind: DELIVERY_FILE_KIND, days: [{ date: "2025-01-10", baemin: 80_000, coupang: 0 }, { date: "2025-01-11", baemin: 50_000 }, { date: "x" }] })!;
    expect(deliv).toHaveLength(2);
    const a = mergeHistory(pos, deliv);
    const b = mergeHistory(deliv, pos);
    expect(a.find((d) => d.date === "2025-01-10")).toEqual({ date: "2025-01-10", hall: 1_000_000, receipts: 12, customers: 20, baemin: 80_000, coupang: 0 });
    expect(b.find((d) => d.date === "2025-01-10")).toEqual(a.find((d) => d.date === "2025-01-10"));
    expect(historyByMonth(a).get("2025-01")).toEqual({ total: 1_130_000, delivery: 130_000, days: 2 });
  });
  it("쿠팡 파일을 나중에 올려도 배민 칸은 남는다", () => {
    const withB = mergeHistory(pos, parseDeliveryHistory({ kind: DELIVERY_FILE_KIND, days: [{ date: "2025-01-10", baemin: 80_000 }] })!);
    const withC = mergeHistory(withB, parseDeliveryHistory({ kind: DELIVERY_FILE_KIND, days: [{ date: "2025-01-10", coupang: 30_000 }] })!);
    expect(withC[0]).toMatchObject({ hall: 1_000_000, baemin: 80_000, coupang: 30_000 });
  });
  it("배달 파일이 아니면 null", () => {
    expect(parseDeliveryHistory({ days: [] })).toBeNull();
  });
});

describe("우리 가게 지난 기록으로 앞으로 석 달", () => {
  const hist = year("2024-09-01", "2026-08-26", { "12": 1_100_000, "01": 1_000_000 }).map((d) => ({ date: d.date, hall: d.total, receipts: null, customers: null }));
  const ledger = year("2026-08-27", "2026-10-18", {});

  it("같은 달 가장 최근 해와 1년 평균을 견준다", () => {
    const o = ownOutlook(withHistory(ledger, hist), "2026-11-10");
    expect(o.map((x) => [x.month, x.year])).toEqual([[12, 2025], [1, 2026], [2, 2026]]);
    expect(o[0].vsAvg).toBeLessThan(-20);
    expect(o[2].vsAvg).toBeGreaterThan(0);
  });
  it("장부가 제대로 들어간 달은 겹치는 날 장부를 쓴다", () => {
    const merged = withHistory(ledger, [{ date: "2026-09-02", hall: 1, receipts: null, customers: null }]);
    expect(merged.find((d) => d.date === "2026-09-02")).toEqual(ledger.find((d) => d.date === "2026-09-02"));
  });
  it("장부 시작 달처럼 며칠만 들어간 달은 지난 매출을 쓰고, 지난 매출에 없는 날만 장부로", () => {
    const merged = withHistory(
      [{ date: "2026-08-30", total: 82_000 }, { date: "2026-08-31", total: 18_000 }],
      [{ date: "2026-08-30", hall: 875_000, receipts: null, customers: null, baemin: 82_000 }],
    );
    expect(merged).toEqual([{ date: "2026-08-30", total: 957_000 }, { date: "2026-08-31", total: 18_000 }]);
  });
  it("지난 매출이 있으면 보고서 없이도 문장이 나온다", () => {
    const ids = buildInsights(null, ledger, [], [], "2026-11-10", hist).map((x) => x.id);
    expect(ids).toContain("ownSeason");
    expect(buildInsights(null, ledger, [], [], "2026-11-10").map((x) => x.id)).not.toContain("ownSeason");
  });
});

describe("손익에 지난 매출 쓰기", () => {
  const days = [
    { date: "2025-01-10", hall: 1_000_000, receipts: 10, customers: 10, baemin: 200_000, coupang: 100_000 },
    { date: "2025-01-11", hall: 500_000, receipts: 5, customers: 5 },
  ];
  const tx = (date: string, inn: number, channel: string | null) => ({ date, in: inn, channel });
  it("홀은 포스 매출, 배달은 주문 금액 − 그 달 입금액이 수수료", () => {
    const s = historyChannelSales("2025-01", days, [tx("2025-01-15", 160_000, "baemin"), tx("2025-01-20", 1_400_000, "card_kb")]);
    expect(s.map((x) => [x.channel, x.orders, x.deposit])).toEqual([["hall_card", 1_500_000, 1_500_000], ["baemin", 200_000, 160_000], ["coupang", 100_000, 80_000]]);
  });
  it("장부 일별 매출이 한 달 치면 그것, 없거나 달 중간부터면 지난 매출, 통장이 없으면 안 씀", () => {
    const eff = [{ month: "2025-01", channel: "hall_card", name: "x", orders: 9, deposit: 9, count: 1 }];
    const bank = [tx("2025-01-05", 1, null)];
    expect(pnlSales("2025-01", [{ date: "2025-01-01" }], eff, days, bank)).toEqual({ sales: eff, fromHistory: false });
    expect(pnlSales("2025-01", [{ date: "2025-01-27" }], eff, days, bank).fromHistory).toBe(true);
    expect(pnlSales("2025-01", [], [], days, bank).fromHistory).toBe(true);
    expect(pnlSales("2025-01", [], [], days, []).fromHistory).toBe(false);
  });
});
