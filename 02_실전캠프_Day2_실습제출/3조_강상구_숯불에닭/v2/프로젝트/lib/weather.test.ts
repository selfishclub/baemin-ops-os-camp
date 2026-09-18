import { describe, expect, it } from "vitest";
import { DEFAULT_CHANNELS } from "./categories";
import { analyzeWeather, expectedSales, kindFromCode, missingWeatherDates, sampleWeather, type DailyWeather } from "./weather";
import type { DailySale } from "./types";

const w = (date: string, kind: DailyWeather["kind"], tempMax = 25): DailyWeather => ({ date, kind, tempMax, tempMin: tempMax - 8, rainMm: kind === "비" ? 10 : 0, source: "sample" });

describe("날씨 × 매출", () => {
  it("WMO 코드 → 네 가지", () => {
    expect(kindFromCode(0)).toBe("맑음");
    expect(kindFromCode(3)).toBe("흐림");
    expect(kindFromCode(61)).toBe("비");
    expect(kindFromCode(71)).toBe("눈");
  });
  const sales: DailySale[] = [
    { date: "2026-09-14", channel: "hall_card", amount: 600_000 }, { date: "2026-09-14", channel: "baemin", amount: 300_000 }, // 월 맑음
    { date: "2026-09-15", channel: "hall_card", amount: 400_000 }, { date: "2026-09-15", channel: "baemin", amount: 450_000 }, // 화 비
    { date: "2026-09-21", channel: "hall_card", amount: 500_000 }, { date: "2026-09-21", channel: "baemin", amount: 350_000 }, // 월 맑음
    { date: "2026-09-22", channel: "hall_card", amount: 100_000 }, // 화, 날씨 없음 → 제외
  ];
  const weather = [w("2026-09-14", "맑음"), w("2026-09-15", "비"), w("2026-09-21", "맑음", 31)];
  it("날씨별 평균과 비 오는 날 효과", () => {
    const a = analyzeWeather(sales, weather, DEFAULT_CHANNELS);
    expect(a.days).toBe(3);
    const sunny = a.byKind.find((k) => k.kind === "맑음")!;
    expect(sunny).toMatchObject({ days: 2, avgSales: 875_000, avgHall: 550_000, avgDelivery: 325_000 });
    expect(a.rainEffect.delivery).toBe(38.5); // 450k vs 325k
    expect(a.rainEffect.hall).toBe(-27.3);
    expect(a.hot).toMatchObject({ days: 1, avgSales: 850_000 });
    expect(a.byWeekdayKind[0]["맑음"]).toMatchObject({ days: 2, avgSales: 875_000 });
  });
  it("예상 매출: 같은 요일·날씨 → 날씨 → 전체 순서", () => {
    const a = analyzeWeather(sales, weather, DEFAULT_CHANNELS);
    expect(expectedSales(a, "2026-09-28", "맑음")).toMatchObject({ amount: 875_000 }); // 월·맑음 2일
    expect(expectedSales(a, "2026-09-29", "비")!.basis).toContain("전체"); // 비 1일뿐
    expect(expectedSales(analyzeWeather([], [], DEFAULT_CHANNELS), "2026-09-28", "맑음")).toBeNull();
  });
  it("빠진 날씨 날짜와 가짜 날씨", () => {
    expect(missingWeatherDates(sales, weather, "2026-09-30")).toEqual(["2026-09-22"]);
    expect(sampleWeather("2026-09")).toHaveLength(30);
  });
});
