import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyBackup, canRestore, diffBackup, exportBackup, inspectBackup, photoLinkRisk, photoOwnerIds, summarize } from "./backup";
import { StorageFullError } from "./errors";
import { emptyData, inspectLocal, LOCAL_KEY, LocalStore, type LocalData } from "./local";

// 전부 가상 데이터. 가짜 localStorage 로 돌린다.
class FakeStorage {
  map = new Map<string, string>();
  failNextSet: unknown = null;
  get length() {
    return this.map.size;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.failNextSet) {
      const e = this.failNextSet;
      this.failNextSet = null;
      throw e;
    }
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
}
let fake: FakeStorage;
beforeEach(() => {
  fake = new FakeStorage();
  (globalThis as unknown as { window: unknown }).window = { localStorage: fake };
});
afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

const tx = (id: string, month = "2026-09", date = `${month}-05`, out = 10000) => ({ id, month, date, payee: "가짜거래처", out, in: 0, source: "bank" as const, major: null, minor: null, channel: null, review: null });
const sale = (date: string, channel = "hall_card", amount = 50000) => ({ date, channel, amount });
const fakeData = (): LocalData => ({
  ...emptyData(),
  transactions: [tx("t1"), tx("t2", "2026-09", "2026-09-06"), tx("t3", "2026-10", "2026-10-02")],
  dailySales: [sale("2026-09-05"), sale("2026-09-06"), sale("2026-10-01")],
  staff: [{ id: "s1", alias: "홀A", wage: 10000, active: true }],
  shifts: [{ date: "2026-09-05", staffId: "s1", hours: 4 }],
  settings: [
    { key: "channels", value: [] },
    { key: "purchases_2026-09", value: [{ id: "p1" }, { id: "p2" }] },
    { key: "fixed_costs", value: [{ id: "f1" }] },
  ],
});
const wrap = (data: unknown, extra: Record<string, unknown> = {}) => JSON.stringify({ app: "sootdak-ledger", version: 1, savedAt: "2026-10-01T09:00:00.000Z", data, ...extra });

describe("1. 정상 백업 검사", () => {
  it("요약이 맞고 경고·채움이 없다", () => {
    const ins = inspectBackup(wrap(fakeData()));
    expect(ins.ok).toBe(true);
    if (!ins.ok) return;
    expect(ins.version).toBe(1);
    expect(ins.savedAt).toBe("2026-10-01T09:00:00.000Z");
    expect(ins.summary).toMatchObject({ transactions: 3, dailySales: 3, staff: 1, shifts: 1, settings: 3, txMonths: ["2026-09", "2026-10"], latestDate: "2026-10-02" });
    expect(ins.summary.saleDates).toEqual({ from: "2026-09-05", to: "2026-10-01" });
    expect(ins.warnings).toEqual([]);
    expect(ins.filled).toEqual([]);
  });
  it("실제 exportBackup 결과를 그대로 다시 읽을 수 있다 (호환성)", async () => {
    const store = new LocalStore();
    await store.saveTransactions([tx("t1")]);
    await store.saveDailySales("2026-09-05", [sale("2026-09-05")]);
    const ins = inspectBackup(exportBackup());
    expect(ins.ok).toBe(true);
    if (ins.ok) expect(ins.summary.transactions).toBe(1);
  });
  it("검사는 저장소에 아무것도 쓰지 않는다", () => {
    inspectBackup(wrap(fakeData()));
    expect(fake.map.size).toBe(0);
  });
});

describe("2. 잘못된 JSON 거절", () => {
  it("잘린 파일·다른 앱·장부 아님", () => {
    expect(inspectBackup('{"app":"sootdak-ledger","ver').ok).toBe(false);
    expect(inspectBackup(JSON.stringify({ app: "other-app", version: 1, data: {} })).ok).toBe(false);
    expect(inspectBackup("[1,2]").ok).toBe(false);
    expect(inspectBackup(JSON.stringify({ app: "sootdak-ledger", version: 1 })).ok).toBe(false); // data 없음
    expect(inspectBackup(JSON.stringify({ app: "sootdak-ledger", version: 1, data: { transactions: "x" } })).ok).toBe(false); // 목록 아님
  });
});

describe("3. 지원하지 않는 버전 거절", () => {
  it("버전 2, 버전 없음, 버전 0", () => {
    const v2 = inspectBackup(wrap(fakeData(), { version: 2 }));
    expect(v2.ok).toBe(false);
    if (!v2.ok) expect(v2.errors[0]).toContain("새 버전");
    const none = inspectBackup(JSON.stringify({ app: "sootdak-ledger", savedAt: "x", data: fakeData() }));
    expect(none.ok).toBe(false);
    expect(inspectBackup(wrap(fakeData(), { version: 0 })).ok).toBe(false);
  });
});

describe("4. 필수 데이터 누락", () => {
  it("거래 목록이 없으면 거절한다", () => {
    const { transactions, ...rest } = fakeData(); // eslint-disable-line @typescript-eslint/no-unused-vars
    const ins = inspectBackup(wrap(rest));
    expect(ins.ok).toBe(false);
    if (!ins.ok) expect(ins.errors[0]).toContain("필수 항목");
  });
  it("날씨·규칙이 없으면 기본값으로 채우되 그 사실을 알린다 (조용히 채우지 않음)", () => {
    const { weather, rules, ...rest } = fakeData(); // eslint-disable-line @typescript-eslint/no-unused-vars
    const ins = inspectBackup(wrap(rest));
    expect(ins.ok).toBe(true);
    if (!ins.ok) return;
    expect(ins.filled.length).toBe(2);
    expect(ins.filled.join(" ")).toContain("기본 규칙");
    expect(ins.data.weather).toEqual([]);
    expect(ins.data.rules.length).toBeGreaterThan(0);
  });
  it("날짜·금액·필수 칸이 틀리면 거절한다", () => {
    const bad = fakeData();
    bad.transactions.push({ ...tx("t9"), date: "2026/09/05" });
    const d1 = inspectBackup(wrap(bad));
    expect(d1.ok).toBe(false);
    if (!d1.ok) expect(d1.errors[0]).toContain("날짜");
    const bad2 = fakeData();
    bad2.dailySales.push({ date: "2026-09-07", channel: "hall_card", amount: Number.NaN });
    expect(inspectBackup(wrap(bad2)).ok).toBe(false);
    const bad3 = fakeData();
    (bad3.transactions[0] as { id?: string }).id = undefined;
    expect(inspectBackup(wrap(bad3)).ok).toBe(false);
  });
});

describe("5. 중복·잘못된 참조", () => {
  it("같은 거래 id 두 번 → 거절", () => {
    const bad = fakeData();
    bad.transactions.push(tx("t1"));
    const ins = inspectBackup(wrap(bad));
    expect(ins.ok).toBe(false);
    if (!ins.ok) expect(ins.errors[0]).toContain("두 번");
  });
  it("같은 날·같은 채널 일별 매출 두 번 → 거절", () => {
    const bad = fakeData();
    bad.dailySales.push(sale("2026-09-05"));
    expect(inspectBackup(wrap(bad)).ok).toBe(false);
  });
  it("없는 직원을 가리키는 근무 → 경고만 (복원은 됨)", () => {
    const d = fakeData();
    d.shifts.push({ date: "2026-09-06", staffId: "ghost", hours: 3 });
    const ins = inspectBackup(wrap(d));
    expect(ins.ok).toBe(true);
    if (ins.ok) expect(ins.warnings[0]).toContain("파일에 없는 직원");
  });
});

describe("6. 복원 미리보기 (차이)", () => {
  it("사라질 달·줄어드는 항목·오래된 백업을 알려 준다", () => {
    const current = summarize(fakeData());
    const old = fakeData();
    old.transactions = old.transactions.filter((t) => t.month === "2026-09");
    old.dailySales = old.dailySales.filter((s) => s.date.startsWith("2026-09"));
    old.settings = old.settings.filter((s) => s.key !== "fixed_costs");
    const diff = diffBackup(current, summarize(old));
    expect(diff.olderThanCurrent).toBe(true);
    expect(diff.losses.join("\n")).toContain("2026-10");
    expect(diff.losses.join("\n")).toContain("설정");
    expect(diff.rows.find((r) => r.label === "거래(통장)")).toEqual({ label: "거래(통장)", current: 3, backup: 2 });
  });
  it("같은 내용이면 사라질 것이 없다", () => {
    const s = summarize(fakeData());
    const diff = diffBackup(s, s);
    expect(diff.losses).toEqual([]);
    expect(diff.olderThanCurrent).toBe(false);
  });
});

describe("7·8. 취소와 확인 없는 복원 차단", () => {
  it("검사만 하고 적용하지 않으면 저장소가 그대로다 (취소)", async () => {
    await new LocalStore().saveTransactions([tx("keep")]);
    const before = fake.map.get(LOCAL_KEY);
    const ins = inspectBackup(wrap(fakeData()));
    expect(ins.ok).toBe(true);
    expect(fake.map.get(LOCAL_KEY)).toBe(before);
  });
  it("현재 장부가 있으면 '복원' 글자와 사전 백업 확인이 둘 다 있어야 한다", () => {
    expect(canRestore({ hasCurrent: true, typed: "", preBackupConfirmed: false })).toBe(false);
    expect(canRestore({ hasCurrent: true, typed: "복원", preBackupConfirmed: false })).toBe(false);
    expect(canRestore({ hasCurrent: true, typed: "", preBackupConfirmed: true })).toBe(false);
    expect(canRestore({ hasCurrent: true, typed: "복 원", preBackupConfirmed: true })).toBe(false);
    expect(canRestore({ hasCurrent: true, typed: " 복원 ", preBackupConfirmed: true })).toBe(true);
    expect(canRestore({ hasCurrent: false, typed: "", preBackupConfirmed: false })).toBe(true); // 빈 장부는 잃을 것이 없다
  });
});

describe("9·10. 저장 공간 부족으로 복원 실패 → 기존 데이터 유지", () => {
  it("applyBackup 이 StorageFullError 를 던지고 원래 값은 그대로다", async () => {
    await new LocalStore().saveTransactions([tx("keep")]);
    const before = fake.map.get(LOCAL_KEY);
    const ins = inspectBackup(wrap(fakeData()));
    expect(ins.ok).toBe(true);
    if (!ins.ok) return;
    fake.failNextSet = Object.assign(new Error("full"), { name: "QuotaExceededError" });
    expect(() => applyBackup(ins)).toThrow(StorageFullError);
    expect(fake.map.get(LOCAL_KEY)).toBe(before);
    expect(JSON.parse(before!).transactions[0].id).toBe("keep");
  });
  it("성공하면 한 번의 쓰기로 바뀐다 (지우고 다시 쓰지 않음)", () => {
    fake.map.set(LOCAL_KEY, JSON.stringify({ ...emptyData(), transactions: [tx("old")] }));
    const ins = inspectBackup(wrap(fakeData()));
    if (!ins.ok) throw new Error("검사 실패");
    let removed = false;
    fake.removeItem = () => {
      removed = true;
    };
    applyBackup(ins);
    expect(removed).toBe(false);
    const r = inspectLocal();
    expect(r.ok && r.data.transactions.length).toBe(3);
  });
});

describe("11. 손상된 장부에서 복원", () => {
  it("손상 상태에서도 검사·적용이 되고, 적용 전에는 손상 원본이 그대로다", () => {
    const damaged = '{"transactions":[{"id":"t1"';
    fake.map.set(LOCAL_KEY, damaged);
    const ins = inspectBackup(wrap(fakeData()));
    expect(ins.ok).toBe(true);
    expect(fake.map.get(LOCAL_KEY)).toBe(damaged);
    if (ins.ok) applyBackup(ins);
    expect(inspectLocal().ok).toBe(true);
  });
});

describe("12. JSON 복원 후 사진 연결 위험", () => {
  it("영수증·고정비 id 를 사진 주인으로 본다", () => {
    expect([...photoOwnerIds(fakeData())].sort()).toEqual(["f1", "p1", "p2"]);
  });
  it("백업에 없는 영수증의 사진은 '연결 끊김'으로 센다 (사진은 지우지 않음)", () => {
    const current = fakeData();
    const backup = fakeData();
    backup.settings = backup.settings.map((s) => (s.key === "purchases_2026-09" ? { ...s, value: [{ id: "p1" }] } : s));
    const risk = photoLinkRisk(current, backup, { p1: 2, p2: 3, f1: 1, zzz: 1 });
    expect(risk).toMatchObject({ photos: 7, linkedNow: 6, linkedAfter: 3, orphanedAfter: 3 });
    expect(risk.message).toContain("3장");
    expect(risk.message).toContain("지워지지 않");
  });
  it("사진이 없으면 경고가 없고, 손상(현재 없음) 상태도 계산된다", () => {
    expect(photoLinkRisk(fakeData(), fakeData(), {}).message).toBeNull();
    const r = photoLinkRisk(null, fakeData(), { p1: 1, old: 2 });
    expect(r).toMatchObject({ photos: 3, linkedNow: 0, linkedAfter: 1, orphanedAfter: 0 });
    expect(r.message).toContain("무관");
  });
});
