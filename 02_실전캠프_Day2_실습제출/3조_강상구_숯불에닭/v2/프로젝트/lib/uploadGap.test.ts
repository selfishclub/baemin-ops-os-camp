import { describe, expect, it } from "vitest";
import { dayLabel, mergeRanges, missingRanges, nextFetch } from "./uploadGap";
import type { UploadRecord } from "./types";

const up = (from: string, to: string): UploadRecord => ({ id: from, month: from.slice(0, 7), from, to, rowCount: 1, uploadedAt: "" });

describe("통장을 어디까지 받았나", () => {
  it("아무것도 안 받았으면 이번 달 1일부터 오늘까지", () => {
    expect(nextFetch([], "2026-10-05")).toMatchObject({ from: "2026-10-01", to: "2026-10-05", lastTo: null });
  });

  it("마지막으로 받은 날 다음부터 오늘까지 알려 준다", () => {
    expect(nextFetch([up("2026-10-01", "2026-10-02")], "2026-10-05")).toMatchObject({ from: "2026-10-03", to: "2026-10-05", days: 3, lastTo: "2026-10-02" });
  });

  it("오늘까지 다 받았으면 받을 게 없다", () => {
    expect(nextFetch([up("2026-10-01", "2026-10-05")], "2026-10-05")).toBeNull();
  });

  it("하루 차이로 이어 받은 것은 한 덩어리로 본다", () => {
    // 10/1~2 받고 10/3~4 받았으면 10/1~4를 쭉 받은 것과 같다
    expect(mergeRanges([up("2026-10-01", "2026-10-02"), up("2026-10-03", "2026-10-04")])).toEqual([{ from: "2026-10-01", to: "2026-10-04" }]);
    expect(nextFetch([up("2026-10-01", "2026-10-02"), up("2026-10-03", "2026-10-04")], "2026-10-05")).toMatchObject({ from: "2026-10-05", days: 1 });
  });

  it("겹쳐 받은 것도 한 덩어리로", () => {
    expect(mergeRanges([up("2026-09-28", "2026-10-03"), up("2026-10-01", "2026-10-04")])).toEqual([{ from: "2026-09-28", to: "2026-10-04" }]);
  });

  it("올린 순서가 뒤죽박죽이어도 맞는다", () => {
    expect(nextFetch([up("2026-10-03", "2026-10-04"), up("2026-10-01", "2026-10-02")], "2026-10-06")).toMatchObject({ from: "2026-10-05" });
  });

  it("가운데가 빠졌으면 그 기간을 집어낸다", () => {
    // 10/1~2 받고 10/5~6 받았으면 10/3~4가 빈다
    expect(missingRanges([up("2026-10-01", "2026-10-02"), up("2026-10-05", "2026-10-06")])).toEqual([{ from: "2026-10-03", to: "2026-10-04" }]);
  });

  it("안 빠졌으면 빈 기간이 없다", () => {
    expect(missingRanges([up("2026-10-01", "2026-10-02"), up("2026-10-03", "2026-10-04")])).toEqual([]);
  });

  it("달을 넘겨도 맞는다", () => {
    expect(nextFetch([up("2026-09-25", "2026-09-30")], "2026-10-02")).toMatchObject({ from: "2026-10-01", to: "2026-10-02", days: 2 });
  });

  it("읽기 좋은 날짜", () => {
    expect(dayLabel("2026-10-05")).toBe("10월 5일");
  });
});
