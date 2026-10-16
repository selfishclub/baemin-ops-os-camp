import { describe, expect, it } from "vitest";
import { importToStore, planImport } from "./cloudImport";
import { emptyData, type LocalData } from "./local";
import type { Store } from "./index";

// 저장소 흉내 — 무엇이 어떤 순서로 불렸는지만 기록한다
function fakeStore() {
  const calls: string[] = [];
  const rec = (name: string) => async (...args: unknown[]) => {
    calls.push(`${name}:${typeof args[0] === "string" ? args[0] : Array.isArray(args[0]) ? args[0].length : (args[0] as { id?: string; key?: string; month?: string })?.id ?? (args[0] as { key?: string })?.key ?? (args[0] as { month?: string })?.month}`);
  };
  const store = {
    mode: "supabase",
    batchAtomic: false,
    saveRule: rec("rule"),
    saveStaff: rec("staff"),
    saveSetting: rec("setting"),
    saveTransactions: rec("tx"),
    saveChannelSales: rec("channelSales"),
    saveClosing: rec("closing"),
    saveUpload: rec("upload"),
    saveDailySales: rec("dailySales"),
    saveShifts: rec("shifts"),
    saveWeather: rec("weather"),
  } as unknown as Store;
  return { store, calls };
}

function sample(): LocalData {
  const d = emptyData();
  d.rules = [{ id: "r1", keyword: "마트", direction: "out", major: "매출원가", minor: "식자재", channel: null }];
  d.staff = [{ id: "s1", alias: "홀A", wage: 10000, active: true }];
  d.settings = [
    { key: "store_profile", value: { name: "가게" } },
    { key: "export_reviews_v1", value: [] },
    { key: "ad_plan_v1", value: {} },
    { key: "channels", value: [] },
  ];
  d.transactions = Array.from({ length: 450 }, (_, i) => ({ id: `t${i}`, month: "2026-09", date: "2026-09-01", payee: "x", out: 1, in: 0, source: "bank", major: null, minor: null, channel: null, review: null }));
  d.channelSales = [{ month: "2026-09", channel: "hall", name: "홀", orders: 1, deposit: 1, count: 1 }];
  d.closings = [{ month: "2026-09", closedAt: null, edits: [] }];
  d.uploads = [{ id: "u1", month: "2026-09", from: "2026-09-01", to: "2026-09-30", rowCount: 3, uploadedAt: "2026-10-01T00:00:00Z" }];
  d.dailySales = [
    { date: "2026-09-01", channel: "hall", amount: 10 },
    { date: "2026-09-01", channel: "baemin", amount: 20 },
    { date: "2026-09-02", channel: "hall", amount: 30 },
  ];
  d.shifts = [
    { date: "2026-09-01", staffId: "s1", hours: 4 },
    { date: "2026-09-02", staffId: "s1", hours: 4 },
    { date: "2026-09-03", staffId: "s1", hours: 4 },
  ];
  return d;
}

describe("내 PC 백업 → 인터넷 저장소", () => {
  it("계획: 거래는 200개씩, 매출·근무는 날짜별, 업그레이드 설정은 뺀다", () => {
    const p = planImport(sample(), true);
    expect(p.transactions).toBe(450);
    expect(p.saleDates).toBe(2);
    expect(p.shiftDates).toBe(3);
    expect(p.settings).toBe(2);
    expect(p.skippedSettings).toEqual(["export_reviews_v1", "ad_plan_v1"]);
    // 거래 3덩이 + 규칙 1 + 채널 1 + 마감 1 + 올린 기록 1 + 매출 2일 + 근무 3일 + 직원 1 + 설정 2 = 15
    expect(p.steps).toBe(15);
  });
  it("전체판으로 옮기면 설정을 다 넣는다", () => {
    const p = planImport(sample(), false);
    expect(p.settings).toBe(4);
    expect(p.skippedSettings).toEqual([]);
  });
  it("실행: 규칙·직원·설정 먼저, 그날 매출은 그날 것만 묶어서, 진행률은 끝까지", async () => {
    const { store, calls } = fakeStore();
    const seen: number[] = [];
    const p = await importToStore(store, sample(), true, (done, total) => seen.push(done * 100 + total));
    expect(calls.slice(0, 4)).toEqual(["rule:r1", "staff:s1", "setting:store_profile", "setting:channels"]);
    expect(calls.filter((c) => c.startsWith("tx:"))).toEqual(["tx:200", "tx:200", "tx:50"]);
    expect(calls.filter((c) => c.startsWith("dailySales:"))).toEqual(["dailySales:2026-09-01", "dailySales:2026-09-02"]);
    expect(calls.filter((c) => c.startsWith("shifts:")).length).toBe(3);
    expect(calls).not.toContain("setting:export_reviews_v1");
    expect(seen.length).toBe(p.steps);
    expect(seen[seen.length - 1]).toBe(p.steps * 100 + p.steps);
  });
  it("빈 백업은 아무것도 부르지 않는다", async () => {
    const { store, calls } = fakeStore();
    const d = emptyData();
    d.rules = []; // 기본 규칙도 빼면
    const p = await importToStore(store, d, true);
    expect(calls).toEqual([]);
    expect(p.steps).toBe(0);
  });
});
