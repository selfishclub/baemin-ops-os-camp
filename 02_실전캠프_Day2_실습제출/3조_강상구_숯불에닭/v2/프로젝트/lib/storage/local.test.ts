import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StorageDamagedError, StorageFullError, StorageWriteError } from "./errors";
import { onStorageFailure, type StorageFailedDetail } from "./events";
import { exportBackup, importBackup } from "./backup";
import { bytesOf, emptyData, inspectLocal, LOCAL_KEY, LocalStore, markBackupStarted, readLastBackupAt, readLocal, storageUsage, writeLocal } from "./local";
import { backupStatus } from "@/components/StorageUsageCard";

// 가짜 localStorage — 브라우저 없이 vitest(node)에서 돌린다. 전부 가상 데이터다.
class FakeStorage {
  map = new Map<string, string>();
  failNextSet: unknown = null; // 다음 setItem 에서 던질 예외
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

const quotaError = () => Object.assign(new Error("exceeded"), { name: "QuotaExceededError", code: 22 });
const sampleRule = { id: "r1", keyword: "가짜거래처", direction: "out" as const, major: "매출원가" as const, minor: "원재료비", channel: null };

describe("정상 읽기·쓰기", () => {
  it("아무것도 없으면 '빈 장부'로 읽힌다 (손상 아님)", () => {
    const r = inspectLocal();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.empty).toBe(true);
      expect(r.data.transactions).toEqual([]);
      expect(r.data.rules.length).toBeGreaterThan(0); // 기본 분류 규칙
    }
  });
  it("쓰고 읽으면 같은 값이고, empty 가 false 로 바뀐다", async () => {
    const store = new LocalStore();
    await store.saveRule(sampleRule);
    const r = inspectLocal();
    expect(r.ok && !r.empty).toBe(true);
    expect((await store.listRules()).some((x) => x.id === "r1")).toBe(true);
  });
  it("빈 문자열도 빈 장부로 본다", () => {
    fake.map.set(LOCAL_KEY, "");
    expect(inspectLocal().ok).toBe(true);
  });
});

describe("손상된 장부", () => {
  const damagedRaw = '{"transactions":[{"id":"t1"';

  it("잘린 JSON 은 ok:false 이고 원본(raw)을 그대로 들고 있다", () => {
    fake.map.set(LOCAL_KEY, damagedRaw);
    const r = inspectLocal();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind).toBe("damaged");
      expect(r.raw).toBe(damagedRaw);
      expect(r.reason).toContain("JSON");
    }
  });
  it("readLocal 은 빈 장부를 주지 않고 StorageDamagedError 를 던진다", () => {
    fake.map.set(LOCAL_KEY, damagedRaw);
    expect(() => readLocal()).toThrow(StorageDamagedError);
  });
  it("모양이 틀린 장부(목록이어야 할 항목이 목록이 아님)도 손상으로 본다", () => {
    fake.map.set(LOCAL_KEY, JSON.stringify({ transactions: "oops" }));
    const r = inspectLocal();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("transactions");
    fake.map.set(LOCAL_KEY, "[1,2,3]");
    expect(inspectLocal().ok).toBe(false);
    fake.map.set(LOCAL_KEY, "42");
    expect(inspectLocal().ok).toBe(false);
  });
  it("손상 상태에서는 모든 쓰기가 막히고 원본은 한 글자도 바뀌지 않으며 실패 알림이 간다", async () => {
    fake.map.set(LOCAL_KEY, damagedRaw);
    const got: StorageFailedDetail[] = [];
    const off = onStorageFailure((d) => got.push(d));
    const store = new LocalStore();
    await expect(store.saveRule(sampleRule)).rejects.toBeInstanceOf(StorageDamagedError);
    await expect(store.saveDailySales("2026-09-01", [])).rejects.toBeInstanceOf(StorageDamagedError);
    await expect(store.saveSetting("x", 1)).rejects.toBeInstanceOf(StorageDamagedError);
    await expect(store.deleteMonth("2026-09")).rejects.toBeInstanceOf(StorageDamagedError);
    off();
    expect(fake.map.get(LOCAL_KEY)).toBe(damagedRaw);
    expect(got.length).toBe(4);
    expect(got[0].kind).toBe("damaged");
    expect(got[0].message).not.toContain("t1"); // 알림에 장부 내용이 섞이지 않는다
  });
  it("손상 상태에서는 읽기도 조용히 빈 값을 주지 않는다", async () => {
    fake.map.set(LOCAL_KEY, damagedRaw);
    const store = new LocalStore();
    await expect(store.listTransactions("2026-09")).rejects.toBeInstanceOf(StorageDamagedError);
    await expect(store.getSetting("channels")).rejects.toBeInstanceOf(StorageDamagedError);
    expect(() => exportBackup()).toThrow(StorageDamagedError);
  });
  it("저장소에 접근 자체가 안 되면 unavailable 로 구분한다", () => {
    (globalThis as unknown as { window: unknown }).window = {
      get localStorage() {
        throw Object.assign(new Error("denied"), { name: "SecurityError" });
      },
    };
    const r = inspectLocal();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe("unavailable");
  });
  it("백업 파일로 복원하는 길은 열려 있다 (복구 경로)", () => {
    fake.map.set(LOCAL_KEY, damagedRaw);
    const backup = JSON.stringify({ app: "sootdak-ledger", version: 1, savedAt: "2026-10-01T00:00:00Z", data: { ...emptyData(), rules: [sampleRule], transactions: [] } });
    importBackup(backup);
    const r = inspectLocal();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.rules).toEqual([sampleRule]);
  });
});

describe("저장 실패 (공간 부족 등)", () => {
  it("공간 부족이면 StorageFullError 로 바뀌고 원래 값은 그대로다", async () => {
    const store = new LocalStore();
    await store.saveRule(sampleRule);
    const before = fake.map.get(LOCAL_KEY);
    fake.failNextSet = quotaError();
    const got: StorageFailedDetail[] = [];
    const off = onStorageFailure((d) => got.push(d));
    await expect(store.saveSetting("channels", [{ id: "x" }])).rejects.toBeInstanceOf(StorageFullError);
    off();
    expect(fake.map.get(LOCAL_KEY)).toBe(before);
    expect(got[0].kind).toBe("full");
    expect(got[0].usedBytes).toBeGreaterThan(0);
    expect(got[0].attemptedBytes).toBeGreaterThan(got[0].usedBytes ?? 0);
    expect(got[0].message).toContain("저장 공간");
  });
  it("다른 이유로 못 쓰면 StorageWriteError 이고 역시 알림이 간다", async () => {
    fake.failNextSet = new TypeError("weird");
    const got: StorageFailedDetail[] = [];
    const off = onStorageFailure((d) => got.push(d));
    await expect(new LocalStore().saveSetting("k", 1)).rejects.toBeInstanceOf(StorageWriteError);
    off();
    expect(got[0].kind).toBe("write");
    expect(fake.map.has(LOCAL_KEY)).toBe(false);
  });
  it("writeLocal 도 같은 규칙으로 던진다 (복원 경로에서도 실패가 숨지 않는다)", () => {
    fake.failNextSet = quotaError();
    expect(() => writeLocal(emptyData())).toThrow(StorageFullError);
  });
});

describe("사용량·백업 시각", () => {
  it("장부 크기와 전체 크기를 글자 수 × 2 로 어림하고, 한도는 추정값이다", async () => {
    await new LocalStore().saveRule(sampleRule);
    fake.map.set("sootdak-ledger-month", "2026-10");
    const u = storageUsage();
    expect(u.ledgerBytes).toBe(bytesOf(fake.map.get(LOCAL_KEY)!));
    expect(u.totalBytes).toBeGreaterThan(u.ledgerBytes);
    expect(u.estimatedLimitBytes).toBe(5 * 1024 * 1024);
    expect(u.level).toBe("ok");
  });
  it("80% 를 넘으면 warn, 95% 를 넘으면 critical", () => {
    fake.map.set(LOCAL_KEY, "x".repeat(Math.ceil((5 * 1024 * 1024 * 0.85) / 2)));
    expect(storageUsage().level).toBe("warn");
    fake.map.set(LOCAL_KEY, "x".repeat(Math.ceil((5 * 1024 * 1024 * 0.96) / 2)));
    expect(storageUsage().level).toBe("critical");
  });
  it("마지막 백업 시각은 장부 덩어리 밖에 따로 둔다 (백업 파일 형식 불변)", async () => {
    await new LocalStore().saveRule(sampleRule);
    expect(readLastBackupAt()).toBeNull();
    markBackupStarted("2026-10-09T10:00:00.000Z");
    expect(readLastBackupAt()).toBe("2026-10-09T10:00:00.000Z");
    const backup = JSON.parse(exportBackup());
    expect(Object.keys(backup).sort()).toEqual(["app", "data", "savedAt", "version"]);
    expect(backup.version).toBe(1);
    expect(JSON.stringify(backup.data)).not.toContain("2026-10-09T10:00");
  });
  it("백업 필요 여부: 없음·7일 이상이면 경고", () => {
    const now = new Date("2026-10-09T12:00:00Z");
    expect(backupStatus(null, now).tone).toBe("warn");
    expect(backupStatus("2026-10-09T01:00:00Z", now)).toMatchObject({ tone: "ok", days: 0 });
    expect(backupStatus("2026-10-03T01:00:00Z", now)).toMatchObject({ tone: "ok", days: 6 });
    expect(backupStatus("2026-10-02T01:00:00Z", now)).toMatchObject({ tone: "warn", days: 7 });
  });
});
