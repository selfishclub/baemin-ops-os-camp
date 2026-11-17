import { describe, expect, it } from "vitest";
import { inflowFromDays, inflowSummary, rankMap, inflowMonths } from "./inflow";

const inflow = {
  collectedAt: "2026-10-20T00:00:00Z",
  ranges: { d30: { start: "2026-09-20", end: "2026-10-19", items: [
    { keyword: "숯불에닭", pv: 50 }, { keyword: "율량동숯불에닭", pv: 20 }, { keyword: "(검색어 없음)", pv: 5 },
    { keyword: "율량동맛집", pv: 15 }, { keyword: "청주문화제조창식당", pv: 10 },
  ] } },
};

describe("유입 키워드", () => {
  const ranks = rankMap([{ keyword: "율량동 맛집", rank: 36 }]);
  const s = inflowSummary(inflow, "d30", ranks)!;
  it("가게 이름 검색과 검색어 없음은 따로 묶는다", () => {
    expect(s.total).toBe(100);
    expect(s.brand).toEqual({ pv: 70, keywords: 2 });
    expect(s.noKeyword).toBe(5);
    expect(s.rows.map((r) => r.keyword)).toEqual(["율량동맛집", "청주문화제조창식당"]);
  });
  it("추적 중이면 순위를 띄어쓰기 무시하고 붙인다", () => {
    expect(s.rows[0]).toMatchObject({ tracked: true, rank: 36, share: 15 });
    expect(s.rows[1]).toMatchObject({ tracked: false, rank: null });
  });
  it("그 기간 자료가 없으면 null", () => {
    expect(inflowSummary(inflow, "d7", ranks)).toBeNull();
  });
});

it("월별 자료를 선택하고 다른 월이나 90일 자료를 섞지 않는다", () => {
  const monthly = { ...inflow, months: { "2024-09": { start: "2024-09-01", end: "2024-09-30", items: [{ keyword: "율량동맛집", pv: 7 }] } } };
  expect(inflowSummary(monthly, "2024-09", new Map())?.total).toBe(7);
  expect(inflowSummary(monthly, "2024-10", new Map())).toBeNull();
});
it("한국 시간 이번 달부터 2024년 9월까지 월을 제공한다", () => {
  const months = inflowMonths(new Date("2026-09-30T15:00:00Z"));
  expect(months[0]).toBe("2026-10");
  expect(months.at(-1)).toBe("2024-09");
  expect(months).toHaveLength(26);
});

it("월별 내보내기 파일을 읽고 키워드 자료를 유지한다", async () => {
  const { parseLedgerExport } = await import("../export/parse");
  const months = { "2024-09": { start: "2024-09-01", end: "2024-09-30", items: [{ keyword: "율량동맛집", pv: 7 }] } };
  const parsed = parseLedgerExport(JSON.stringify({ kind: "sootdak-ledger-export", version: 1, reviews: [], market: { inflow: { collectedAt: inflow.collectedAt, months } } }));
  expect(parsed.market?.inflow?.months).toEqual(months);
});

it("일간·주간 자료를 월간 자료와 섞지 않는다", () => {
  const daily = { start: "2026-09-01", end: "2026-09-01", items: [{ keyword: "청주맛집", pv: 4 }] };
  const input = { ...inflow, periods: { "2026-09-01/2026-09-01": daily } };
  expect(inflowSummary(input, "2026-09-01/2026-09-01", new Map())?.total).toBe(4);
  expect(inflowSummary(input, "2026-09-01/2026-09-07", new Map())).toBeNull();
});

// 수집기는 밤마다 하루치만 받아 둔다. 월별 자료는 진행 중인 달이면 옛 끝날짜로 멈춰 있어서,
// 하루치를 더해 그 기간을 만든다. (2026-10 실자료로 월별과 차이 0을 확인했다)
const day = (d: string, items: [string, number][]) => [`${d}/${d}`, { start: d, end: d, items: items.map(([keyword, pv]) => ({ keyword, pv })) }] as const;
const days = {
  collectedAt: "2026-11-17T00:00:00Z",
  months: { "2026-11": { start: "2026-11-01", end: "2026-11-02", items: [{ keyword: "율량동맛집", pv: 3 }] } },
  periods: Object.fromEntries([
    day("2026-11-01", [["율량동맛집", 3], ["숯불에닭", 10]]),
    day("2026-11-02", [["율량동맛집", 2], ["청주닭갈비", 1]]),
    day("2026-11-03", [["율량동맛집", 4]]),
  ]),
};

describe("하루치를 더해 기간 만들기", () => {
  it("빠진 날이 없으면 유입 수를 말별로 더한다", () => {
    const r = inflowFromDays(days, "2026-11-01", "2026-11-03")!;
    expect(r.days).toBe(3);
    expect(r.missing).toEqual([]);
    expect(r.items).toEqual([
      { keyword: "숯불에닭", pv: 10 },
      { keyword: "율량동맛집", pv: 9 },
      { keyword: "청주닭갈비", pv: 1 },
    ]);
  });

  it("빠진 날을 알려 준다 — 적게 나온 숫자를 맞는 것처럼 쓰지 않게", () => {
    const r = inflowFromDays(days, "2026-11-01", "2026-11-05")!;
    expect(r.missing).toEqual(["2026-11-04", "2026-11-05"]);
    expect(r.days).toBe(3);
  });

  it("하루도 없으면 만들지 않는다", () => {
    expect(inflowFromDays(days, "2026-12-01", "2026-12-03")).toBeNull();
    expect(inflowFromDays(null, "2026-11-01", "2026-11-03")).toBeNull();
    expect(inflowFromDays(days, "2026-11-03", "2026-11-01")).toBeNull();
  });

  it("만든 기간을 넣으면 요약이 나온다 — 월별 자료가 11/02에서 멈춰 있어도", () => {
    const built = inflowFromDays(days, "2026-11-01", "2026-11-03")!;
    const s = inflowSummary({ ...days, periods: { ...days.periods, "2026-11-01/2026-11-03": built } }, "2026-11-01/2026-11-03", new Map())!;
    expect(s.total).toBe(20);
    expect(s.brand.pv).toBe(10);
    expect(s.rows.map((r) => r.keyword)).toEqual(["율량동맛집", "청주닭갈비"]);
  });
});
