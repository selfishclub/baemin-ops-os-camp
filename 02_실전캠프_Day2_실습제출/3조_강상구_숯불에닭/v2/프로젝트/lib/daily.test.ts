import { describe, expect, it } from "vitest";
import { DEFAULT_CHANNELS } from "./categories";
import { checkDay, dayTotals, daysInMonth, hoursBetween, monthChannelTotals, monthSummary, shiftDate, weekHoursByStaff, weekStart } from "./daily";
import type { DailySale, Shift, Staff } from "./types";

const staff: Staff[] = [
  { id: "a", alias: "홀A", wage: 11_000, active: true },
  { id: "b", alias: "화덕A", wage: 12_000, active: true },
];
const sales: DailySale[] = [
  { date: "2026-09-14", channel: "hall_card", amount: 500_000 },
  { date: "2026-09-14", channel: "hall_cash", amount: 100_000 },
  { date: "2026-09-14", channel: "baemin", amount: 400_000 },
  { date: "2026-09-15", channel: "hall_card", amount: 300_000 },
];
const shifts: Shift[] = [
  { date: "2026-09-14", staffId: "a", hours: 5 },
  { date: "2026-09-14", staffId: "b", hours: 8 },
  { date: "2026-09-16", staffId: "a", hours: 9.5 },
];

describe("오늘 마감 입력", () => {
  it("하루 합계·어림 인건비·인건비율", () => {
    const d = dayTotals("2026-09-14", sales, shifts, staff);
    expect(d.sales).toBe(1_000_000);
    expect(d.labor).toBe(5 * 11_000 + 8 * 12_000);
    expect(d.laborRate).toBe(15.1);
    expect(d.entered).toBe(true);
    expect(dayTotals("2026-09-13", sales, shifts, staff).entered).toBe(false);
  });
  it("달 요약: 입력한 날 수·빈 날·하루 평균", () => {
    const m = monthSummary("2026-09", sales, shifts, staff, "2026-09-16");
    expect(m.enteredDays).toBe(2);
    expect(m.missingDays).toHaveLength(14); // 1~16일 중 14·15일 빼고
    expect(m.sales).toBe(1_300_000);
    expect(m.avgDailySales).toBe(650_000);
    expect(daysInMonth("2026-02")).toHaveLength(28);
  });
  it("주간 근무시간이 14시간 이상이면 확인 표시", () => {
    expect(weekStart("2026-09-17")).toBe("2026-09-14"); // 목 → 월
    const w = weekHoursByStaff("2026-09-17", shifts, staff);
    expect(w.find((x) => x.staffId === "a")).toMatchObject({ hours: 14.5, warn: true });
    expect(w.find((x) => x.staffId === "b")).toMatchObject({ hours: 8, warn: false });
    expect(shiftDate("2026-09-30", 1)).toBe("2026-10-01");
  });
  it("채널별 월 합계에 홀(카드+현금)도 넣는다", () => {
    const t = monthChannelTotals("2026-09", sales, DEFAULT_CHANNELS);
    expect(t.hall).toBe(900_000);
    expect(t.baemin).toBe(400_000);
  });
  it("이상한 숫자: 24시간 초과는 막고, 12시간 초과·10배 매출은 묻는다", () => {
    const issues = checkDay([{ channelName: "홀 카드", amount: 7_000_000 }], [{ alias: "홀A", hours: 25 }, { alias: "화덕A", hours: 13 }], 650_000);
    expect(issues.map((i) => i.level)).toEqual(["error", "warn", "warn"]);
  });
});

describe("출퇴근 시각 → 근무시간", () => {
  it("6시~10시는 4시간, 18:00~22:30은 4.5시간, 자정 넘기면 다음날로", () => {
    expect(hoursBetween("06:00", "10:00")).toBe(4);
    expect(hoursBetween("18:00", "22:30")).toBe(4.5);
    expect(hoursBetween("17:00", "01:00")).toBe(8);
    expect(hoursBetween("", "10:00")).toBe(0);
  });
});
