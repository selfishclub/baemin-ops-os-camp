import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { parseSbizReport } from "./sbizReport";
import { buildInsights, monthPace, openDays, rainGap, seasonOutlook, usualStartHour, weekdayCompare, type DaySales } from "./insight";
import type { DailyWeather } from "../weather";

// 실제 소상공인365 보고서 화면 글자 (공개 통계, 2026-10-19 받음)
const text = readFileSync(new URL("./fixtures/sbiz-report.txt", import.meta.url), "utf8");
const r = parseSbizReport(text, "2026-10-19")!;

describe("소상공인365 보고서 읽기", () => {
  it("지역·업종·13개월", () => {
    expect(r.region).toBe("율량.사천동");
    expect(r.industry).toBe("닭/오리고기 구이/찜");
    expect(r.months).toHaveLength(13);
    expect(r.asOf).toBe("2026-07");
    expect(r.months[0]).toEqual({ month: "2025-07", sales: 24_710_000, count: 386, stores: 17, footTraffic: 30017 });
    expect(r.months[12]).toEqual({ month: "2026-07", sales: 23_280_000, count: 339, stores: 16, footTraffic: 32666 });
  });
  it("요일·시간·나이·단골", () => {
    expect(r.salesWeekday).toEqual([10.6, 11.8, 16.3, 13.5, 13.9, 21.3, 12.6]);
    expect(r.footWeekday).toEqual([34082, 33807, 34113, 35068, 34884, 28777, 26417]);
    expect(r.salesHours?.find((h) => h.label === "12~14시")?.pct).toBe(25.7);
    expect(r.salesAge?.map((a) => a.pct)).toEqual([0.2, 6.0, 13.8, 19.6, 29.2, 31.1]);
    expect(r.malePct).toBe(62.2);
    expect(r.regularPct).toBe(16.3);
  });
  it("표를 탭으로 복사해도 읽는다", () => {
    const tabbed = parseSbizReport(text.replace(/ /g, "\t"), "2026-10-19");
    expect(tabbed?.months[0].sales).toBe(24_710_000);
  });
  it("보고서가 아니면 null", () => {
    expect(parseSbizReport("아무 글", "2026-10-19")).toBeNull();
  });
});

/** from 부터 n일, 요일별 매출(월~일) */
function makeDays(from: string, n: number, byWeekday: number[]): DaySales[] {
  const out: DaySales[] = [];
  const d = new Date(`${from}T00:00:00`);
  for (let i = 0; i < n; i++) {
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    out.push({ date, total: byWeekday[(d.getDay() + 6) % 7] });
    d.setDate(d.getDate() + 1);
  }
  return out;
}

describe("상권 읽어 주기", () => {
  const days = makeDays("2026-09-01", 48, [1_180_000, 1_050_000, 1_490_000, 1_360_000, 2_050_000, 2_110_000, 1_570_000]);

  it("요일 비율을 동네와 견준다", () => {
    const wk = weekdayCompare(r, days)!;
    expect(wk.find((w) => w.label === "수")!.gap).toBeLessThan(-2);
    expect(wk.find((w) => w.label === "금")!.gap).toBeGreaterThan(4);
    expect(weekdayCompare(r, days.slice(0, 10))).toBeNull();
  });

  it("비 온 날 차이", () => {
    const weather: DailyWeather[] = days.map((d, i) => ({ date: d.date, kind: i % 5 === 0 ? "비" : "맑음", tempMax: 20, tempMin: 10, rainMm: i % 5 === 0 ? 8 : i % 5 === 1 ? 0.3 : 0, source: "open-meteo" }));
    const rain = days.map((d, i) => (i % 5 === 0 ? { ...d, total: d.total * 0.7 } : d));
    expect(rainGap(rain, weather)!.pct).toBeLessThan(-20);
  });

  it("앞으로 석 달은 하루 평균으로 — 2월은 28일이라 합계보다 덜 나쁘다", () => {
    const s = seasonOutlook(r, "2026-12-10");
    expect(s.map((x) => x.month)).toEqual([1, 2, 3]);
    expect(s[0].tax).toContain("부가세");
    // 2월 합계는 13개월 중 가장 낮지만 하루 평균은 11월이 더 낮다
    const nov = seasonOutlook(r, "2026-10-19")[0];
    const feb = s[1];
    expect(nov.month).toBe(11);
    expect(nov.vsAvg).toBeLessThan(feb.vsAvg);
  });

  it("이번 달 흐름과 동네의 같은 때", () => {
    const p = monthPace(r, days, "2026-10-19")!;
    expect(p.days).toBe(18);
    expect(p.area).not.toBeNull();
  });

  it("덜 들어온 날(배달만 들어간 첫 며칠)과 오늘은 뺀다", () => {
    const d = [{ date: "2026-08-30", total: 60_000 }, ...days.slice(0, 10), { date: "2026-10-19", total: 500_000 }];
    expect(openDays(d, "2026-10-19").map((x) => x.date)).toEqual(days.slice(0, 10).map((x) => x.date));
  });

  it("일 시작 시각 — 한두 번 일찍 온 날은 뺀다", () => {
    const sh = (start: string) => ({ date: "2026-09-01", staffId: "a", hours: 6, start });
    expect(usualStartHour([sh("12:00"), sh("16:00"), sh("16:00"), sh("16:00"), sh("18:00"), sh("18:00"), sh("18:00")])).toBe(16);
  });

  it("문장을 만든다", () => {
    const shifts = Array.from({ length: 5 }, () => ({ date: "2026-09-01", staffId: "a", hours: 6, start: "16:00" }));
    const ids = buildInsights(r, days, [], shifts, "2026-10-19").map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining(["pace", "size", "weekday", "lunch", "customers", "season"]));
    // 보고서가 없으면 우리 가게 흐름만
    expect(buildInsights(null, days, [], shifts, "2026-10-19").map((x) => x.id)).toEqual(["pace"]);
  });
});
