import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  busDay,
  dayTimeline,
  isValidDate,
  kstNow,
  mergeBus,
  mergeVisitors,
  missingMonths,
  nearestParking,
  parkingUse,
  parseBusCsvTexts,
  parseVisitorCsv,
  tablesOn,
  unzipCsvTexts,
  upsertById,
  validateJournal,
  validateParking,
  visitorDay,
  type JournalEntry,
  type ParkingRecord,
} from "./neighborhood";

const P = (id: string, time: string, available: number, date = "2026-10-22"): ParkingRecord => ({ id, lot: "율량동 주차타워", date, time, sourceTime: null, total: 107, available, method: "직접 입력", note: "", savedAt: "" });
const J = (id: string, time: string, seated: number | null, date = "2026-10-22"): JournalEntry => ({ id, date, time, seated, totalTables: 12, street: "보통", nearby: null, tags: [], memo: "", teamsIn: null, savedAt: "" });

describe("시각", () => {
  it("한국 시각으로 날짜·시각을 만든다", () => {
    expect(kstNow(new Date("2026-10-21T15:30:00Z"))).toEqual({ date: "2026-10-22", time: "00:30" });
  });
  it("달력에 없는 날은 거른다", () => {
    expect(isValidDate("2024-09-31")).toBe(false);
    expect(isValidDate("2024-02-29")).toBe(true);
  });
});

describe("주차", () => {
  it("가능 대수가 전체보다 많거나 음수면 오류", () => {
    expect(validateParking(107, 108)).toMatch(/많아요/);
    expect(validateParking(107, -1)).toMatch(/음수/);
    expect(validateParking(null, 3)).toMatch(/둘 다/);
    expect(validateParking(107, 102)).toBeNull();
  });
  it("전체 면수 0 이면 점유율을 계산하지 않는다", () => {
    expect(parkingUse({ total: 107, available: 102 })).toEqual({ used: 5, rate: 4.7 });
    expect(parkingUse({ total: 0, available: 0 })).toEqual({ used: 0, rate: null });
  });
  it("30분 안 가장 가까운 기록만 붙인다", () => {
    const recs = [P("a", "19:40", 60), P("b", "20:10", 50), P("c", "20:00", 40, "2026-10-21")];
    expect(nearestParking(recs, "2026-10-22", "20:00")).toMatchObject({ rec: { id: "b" }, gap: 10 });
    expect(nearestParking(recs, "2026-10-22", "21:00")).toBeNull();
  });
});

describe("장사 일지", () => {
  it("미입력(null)과 0 을 구분하고, 착석이 전체보다 많으면 오류", () => {
    expect(validateJournal({ date: "2026-10-22", time: "20:00", seated: 0, totalTables: 12, teamsIn: null })).toBeNull();
    expect(validateJournal({ date: "2026-10-22", time: "20:00", seated: null, totalTables: null, teamsIn: null })).toBeNull();
    expect(validateJournal({ date: "2026-10-22", time: "20:00", seated: 13, totalTables: 12, teamsIn: null })).toMatch(/많아요/);
    expect(validateJournal({ date: "2026-02-30", time: "20:00", seated: 1, totalTables: 12, teamsIn: null })).toMatch(/달력/);
    expect(validateJournal({ date: "2026-10-22", time: "24:10", seated: 1, totalTables: 12, teamsIn: null })).toMatch(/시각/);
  });
  it("같은 id 는 고치고 시간 차례로 둔다", () => {
    let list = upsertById([], J("x", "22:00", 3));
    list = upsertById(list, J("y", "18:00", 1));
    list = upsertById(list, J("x", "22:00", 5));
    expect(list.map((e) => [e.id, e.seated])).toEqual([["y", 1], ["x", 5]]);
  });
  it("테이블 수는 그날 기준 가장 최근 설정", () => {
    const s = { history: [{ from: "2026-10-01", total: 12 }, { from: "2026-11-01", total: 14 }] };
    expect(tablesOn(s, "2026-09-30")).toBeNull();
    expect(tablesOn(s, "2026-10-22")).toBe(12);
    expect(tablesOn(s, "2026-11-02")).toBe(14);
  });
  it("시간 흐름 — 일지에 가까운 주차를 붙이고 남은 주차 기록은 따로", () => {
    const rows = dayTimeline([J("j1", "20:00", 4)], [P("p1", "19:52", 70), P("p2", "22:05", 90)], "2026-10-22");
    expect(rows.map((r) => [r.time, r.journal?.id ?? null, r.parking?.id ?? null, r.gap])).toEqual([
      ["20:00", "j1", "p1", 8],
      ["22:05", null, "p2", 0],
    ]);
  });
});

describe("관광 데이터랩 방문자", () => {
  const raw = "﻿기준년월,행정동명,방문자 구분,방문자 수\n20260901,율량.사천동,외지인방문자(b),15624.0\n20260901,율량.사천동,전체방문자(a+b),46942.0\n20260901,율량.사천동,현지인방문자(a),31318.0\n20260931,율량.사천동,전체방문자(a+b),1.0\n";
  it("원본 모양 — 날짜마다 세 줄을 한 날로, 없는 날짜는 뺀다", () => {
    const p = parseVisitorCsv(raw, "x.csv");
    expect(p.error).toBeNull();
    expect(p.days["2026-09-01"]).toEqual({ total: 46942, outsider: 15624, local: 31318 });
    expect(p.badRows).toHaveLength(1);
  });
  it("다른 지역 파일은 받지 않는다", () => {
    expect(parseVisitorCsv(raw.replace(/율량\.사천동/g, "오창읍"), "x.csv").error).toMatch(/율량/);
  });
  it("합친 모양은 파일 이름으로 지역을 확인한다", () => {
    const t = "날짜,전체방문자,외지인방문자,현지인방문자\n20240901,47932.0,20976.0,26957.0\n";
    expect(parseVisitorCsv(t, "방문자.csv").error).toMatch(/파일 이름/);
    expect(parseVisitorCsv(t, "율량사천동_방문자수.csv").days["2024-09-01"]).toEqual({ total: 47932, outsider: 20976, local: 26957 });
  });
  it("같은 파일을 두 번 넣어도 날짜가 늘지 않는다", () => {
    const p = parseVisitorCsv(raw, "a.csv");
    const a = mergeVisitors(null, p, "a.csv", "t1");
    const b = mergeVisitors(a.store, p, "a.csv", "t2");
    expect([a.added, b.added, b.changed]).toEqual([1, 0, 0]);
    expect(Object.keys(b.store.days)).toHaveLength(1);
    expect(b.store.files).toHaveLength(1);
    expect(visitorDay(b.store, "2026-09-01")).toEqual({ total: 46942, outsider: 15624, local: 31318 });
  });
});

describe("청주 버스 승하차", () => {
  const head = "BRDG_DD,STN_ID,STN_KORN_NM,ADMDST_CD,ADMDST_NM,STN_LOT,STN_LAT,TKCAR_TOT,GOCAR_TOT,YYYYMM";
  const csv = [
    head,
    "01,A,엔포드호텔,4311454000,율량동,127.49345,36.66526,100,50,202409", // 약 370m
    "01,B,사천초,4311454000,율량동,127.48052,36.67021,10,5,202409", // 약 1.6km
    "01,C,좌표없음,4311454000,율량동,0,0,7,3,202409",
    "01,A,엔포드호텔,4311454000,율량동,127.49345,36.66526,100,50,202409", // 같은 날·같은 정류장 두 번
    "31,A,엔포드호텔,4311454000,율량동,127.49345,36.66526,9,9,202409", // 9월 31일은 없다
    "01,Z,다른동,4311255000,산남동,127.47,36.61,999,999,202409",
  ].join("\n");
  const center = { lat: 36.6649806, lng: 127.4976337 };

  it("율량·사천동만 읽고, 없는 날짜·좌표 없는 행·중복을 센다", () => {
    const p = parseBusCsvTexts([csv]);
    expect(p.month).toBe("2024-09");
    expect(p.rows).toHaveLength(3);
    expect(p.invalidDates).toEqual({ "20240931": 1 });
    expect(p.missingCoord).toBe(1);
    expect(p.duplicates).toBe(1);
  });
  it("동 합계와 반경 안 합계를 나누고, 같은 달을 다시 넣어도 두 번 더하지 않는다", () => {
    const p = parseBusCsvTexts([csv]);
    const s1 = mergeBus(null, p, "bus_daily_202409.zip", "t1", center);
    expect(busDay(s1, "2024-09-01")).toMatchObject({ dongUp: 117, dongDown: 58, near500Up: 100, near1000Up: 100, stations: 3 });
    const s2 = mergeBus(s1, p, "bus_daily_202409.zip", "t2", center);
    expect(busDay(s2, "2024-09-01")?.dongUp).toBe(117);
    expect(busDay(s2, "2024-09-02")).toBeNull();
    expect(s2.months).toHaveLength(1);
  });
  it("확장자가 달라도 안이 ZIP 이면 CSV 를 꺼낸다", () => {
    const zip = zipSync({ "part-0.csv": strToU8(csv), "readme.txt": strToU8("x") });
    expect(unzipCsvTexts(zip)).toHaveLength(1);
    expect(() => unzipCsvTexts(strToU8("not zip"))).toThrow(/ZIP/);
  });
  it("빠진 달을 알려 준다", () => {
    expect(missingMonths(["2026-04", "2026-06", "2026-07"])).toEqual(["2026-05"]);
  });
});
