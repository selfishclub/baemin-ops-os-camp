import { describe, expect, it } from "vitest";
import { compareHours, mergePosHourly, parsePosHourly } from "./posHourly";

// 오케이포스 「상품시간대별」 엑셀 첫 시트 모양 (2026-10-21 실제 파일과 같은 머리줄, 숫자는 가짜)
const sheet = (time = "최초주문시각", range = "2026-10-21 ~ 2026-10-21", withTotal = true): unknown[][] => [
  ["일기간 (상품시간대별)", ""],
  [""],
  [`조회일자 : ${range}      시간구분 : ${time}`],
  [""],
  [" "],
  ["상품코드", "상품명", "17시", "17시", "18시", "18시", "0시", "0시"],
  ["상품코드", "상품명", "수량", "매출액", "수량", "매출액", "수량", "매출액"],
  ["002001", "양념닭갈비", "1", "15,000", "5", "75,000", null, null],
  ["002022", "공기밥", "2", "2,000", null, null, "1", "1,000"],
  ...(withTotal ? [["합계", "", "3", "17,000", "5", "75,000", "1", "1,000"]] : []),
];

describe("포스 상품시간대별", () => {
  it("합계 줄에서 시간마다 수량·매출, 자정 넘은 시간은 뒤로", () => {
    expect(parsePosHourly(sheet())).toEqual({ date: "2026-10-21", hours: [[17, 3, 17000], [18, 5, 75000], [0, 1, 1000]], error: null });
  });
  it("합계 줄이 없으면 상품 줄을 더한다", () => {
    expect(parsePosHourly(sheet(undefined, undefined, false)).hours).toEqual([[17, 3, 17000], [18, 5, 75000], [0, 1, 1000]]);
  });
  it("결제시각 파일·여러 날 파일은 받지 않는다", () => {
    expect(parsePosHourly(sheet("결제시각")).error).toMatch(/최초주문시각/);
    expect(parsePosHourly(sheet(undefined, "2026-10-15 ~ 2026-10-21")).error).toMatch(/하루치/);
  });
  it("같은 요일 지난 날들과 견준다 — 기록이 2번 미만이면 견주지 않는다", () => {
    let s = mergePosHourly(null, "2026-10-21", [[19, 10, 200_000]]); // 수
    expect(compareHours(s, "2026-10-21")[0].pct).toBeNull();
    s = mergePosHourly(s, "2026-10-07", [[19, 5, 100_000]]); // 수
    s = mergePosHourly(s, "2026-10-14", [[19, 5, 100_000]]); // 수
    s = mergePosHourly(s, "2026-10-15", [[19, 50, 900_000]]); // 목 — 안 쓴다
    expect(compareHours(s, "2026-10-21")[0]).toMatchObject({ usual: 100_000, basis: 2, pct: 200 });
  });
  it("같은 날을 다시 넣으면 바꾼다", () => {
    const s = mergePosHourly(mergePosHourly(null, "2026-10-21", [[19, 1, 1]]), "2026-10-21", [[19, 2, 2]]);
    expect(s.days["2026-10-21"]).toEqual([[19, 2, 2]]);
  });
});
