import { describe, expect, it } from "vitest";
import { dayTotals, weekdayReport } from "./weekday";
import type { DailySale } from "./types";

// 2026-09-07 월, 09-08 화, 09-12 토, 09-14 월
const sales: DailySale[] = [
  { date: "2026-09-07", channel: "hall_card", amount: 800_000 },
  { date: "2026-09-07", channel: "baemin", amount: 200_000 },
  { date: "2026-09-08", channel: "hall_card", amount: 500_000 },
  { date: "2026-09-12", channel: "hall_card", amount: 300_000 },
  { date: "2026-09-12", channel: "baemin", amount: 900_000 },
  { date: "2026-09-14", channel: "hall_card", amount: 400_000 },
];

describe("요일별 평균 매출", () => {
  it("같은 날 여러 채널을 하루로 합친다", () => {
    expect(dayTotals(sales)).toEqual([
      { date: "2026-09-07", total: 1_000_000, delivery: 200_000 },
      { date: "2026-09-08", total: 500_000, delivery: 0 },
      { date: "2026-09-12", total: 1_200_000, delivery: 900_000 },
      { date: "2026-09-14", total: 400_000, delivery: 0 },
    ]);
  });

  it("쉰 날(매출 0)은 평균에서 뺀다", () => {
    const withOff = [...sales, { date: "2026-09-21", channel: "hall_card", amount: 0 }];
    expect(dayTotals(withOff)).toHaveLength(4);
    expect(weekdayReport(withOff).openDays).toBe(4);
  });

  it("같은 요일은 평균을 낸다", () => {
    const mon = weekdayReport(sales).rows.find((r) => r.label === "월")!;
    expect(mon.days).toBe(2);
    expect(mon.total).toBe(1_400_000);
    expect(mon.avg).toBe(700_000);
  });

  it("월요일부터 일요일 차례로 7줄", () => {
    expect(weekdayReport(sales).rows.map((r) => r.label)).toEqual(["월", "화", "수", "목", "금", "토", "일"]);
  });

  it("장사가 제일 잘 되는·안 되는 요일을 짚는다", () => {
    const r = weekdayReport(sales);
    expect(r.best?.label).toBe("토");
    expect(r.worst?.label).toBe("화");
    expect(r.avg).toBe(775_000); // 3,100,000 ÷ 영업 4일
  });

  it("장사 안 한 요일은 평균 0, 최고·최저에서 빠진다", () => {
    const wed = weekdayReport(sales).rows.find((r) => r.label === "수")!;
    expect(wed.days).toBe(0);
    expect(wed.avg).toBe(0);
  });

  it("요일별 배달 비중도 낸다", () => {
    const sat = weekdayReport(sales).rows.find((r) => r.label === "토")!;
    expect(sat.deliveryPct).toBe(75);
  });

  it("아무것도 없으면 빈 표", () => {
    const r = weekdayReport([]);
    expect(r.openDays).toBe(0);
    expect(r.best).toBeNull();
    expect(r.rows).toHaveLength(7);
  });
});
