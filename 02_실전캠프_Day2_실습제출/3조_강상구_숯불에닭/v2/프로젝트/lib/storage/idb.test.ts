import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyBackup, exportBackup, inspectBackup } from "./backup";
import { memoryLedgerIdb } from "./idb";
import { emptyData, initLocalStorage, inspectLocal, LOCAL_KEY, LocalStore, MIGRATED_FLAG, resetLocalBackend, storageBackend } from "./local";

// 작은 서랍(localStorage) → 큰 창고(IndexedDB) 옮기기. 전부 가상 데이터, 창고는 메모리.
class FakeStorage {
  map = new Map<string, string>();
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
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}
let fake: FakeStorage;
beforeEach(() => {
  fake = new FakeStorage();
  (globalThis as unknown as { window: unknown }).window = { localStorage: fake };
  resetLocalBackend();
});
afterEach(() => {
  resetLocalBackend();
  delete (globalThis as unknown as { window?: unknown }).window;
});

const ledger = () => JSON.stringify({ ...emptyData(), dailySales: [{ date: "2026-10-01", channel: "hall_card", amount: 50000 }], settings: [{ key: "x", value: 1 }] });

describe("처음 열 때 옮기기", () => {
  it("서랍의 장부를 창고에 똑같이 넣고, 그 뒤 저장은 창고로만 간다 (서랍 사본은 그대로)", async () => {
    const raw = ledger();
    fake.map.set(LOCAL_KEY, raw);
    const db = memoryLedgerIdb();
    await initLocalStorage(db);
    expect(storageBackend()).toBe("idb");
    expect(db.text).toBe(raw);
    expect(fake.map.get(MIGRATED_FLAG)).toMatch(/^idb:/);

    const s = new LocalStore();
    expect((await s.listAllDailySales()).length).toBe(1);
    await s.saveSetting("y", 2);
    expect(JSON.parse(db.text!).settings.map((x: { key: string }) => x.key)).toEqual(["x", "y"]);
    expect(fake.map.get(LOCAL_KEY)).toBe(raw); // 옛 서랍은 손대지 않는다
    expect(await s.getSetting("y")).toBe(2);
  });

  it("손상된 서랍은 옮기지 않고 복구 화면으로 (서랍을 계속 씀)", async () => {
    fake.map.set(LOCAL_KEY, '{"transactions":[');
    const db = memoryLedgerIdb();
    await initLocalStorage(db);
    expect(storageBackend()).toBe("local");
    expect(db.text).toBeNull();
    expect(fake.map.get(MIGRATED_FLAG)).toBeUndefined();
    expect(inspectLocal().ok).toBe(false);
  });

  it("창고에 넣은 글이 다시 읽어 보니 다르면 옮기지 않는다", async () => {
    fake.map.set(LOCAL_KEY, ledger());
    const db = memoryLedgerIdb();
    db.get = async () => (db.text === null ? null : db.text.slice(0, 10)); // 잘려서 들어간 척
    await initLocalStorage(db);
    expect(storageBackend()).toBe("local");
    expect(fake.map.get(MIGRATED_FLAG)).toBeUndefined();
  });

  it("창고에 이미 장부가 있으면 그걸 쓰고 서랍은 보지 않는다", async () => {
    fake.map.set(LOCAL_KEY, ledger());
    fake.map.set(MIGRATED_FLAG, "idb:2026-10-22");
    const db = memoryLedgerIdb(JSON.stringify({ ...emptyData(), staff: [{ id: "s1", alias: "가짜직원", wage: 10030, active: true }] }));
    await initLocalStorage(db);
    const r = inspectLocal();
    expect(r.ok && r.data.staff.length).toBe(1);
    expect(r.ok && r.data.dailySales.length).toBe(0);
  });

  it("옮긴 뒤 창고가 비었거나 열리지 않으면 옛 서랍 사본으로 돌아가지 않는다", async () => {
    fake.map.set(LOCAL_KEY, ledger());
    fake.map.set(MIGRATED_FLAG, "idb:2026-10-22");
    await initLocalStorage(memoryLedgerIdb());
    expect(inspectLocal()).toMatchObject({ ok: false, kind: "unavailable" });
    await expect(new LocalStore().saveSetting("y", 1)).rejects.toThrow();
    await initLocalStorage(null);
    expect(storageBackend()).toBe("lost");
  });

  it("창고를 못 여는 브라우저에서 아직 안 옮겼으면 예전처럼 서랍을 쓴다", async () => {
    fake.map.set(LOCAL_KEY, ledger());
    await initLocalStorage(null);
    expect(storageBackend()).toBe("local");
    await new LocalStore().saveSetting("y", 2);
    expect(JSON.parse(fake.map.get(LOCAL_KEY)!).settings).toHaveLength(2);
  });
});

describe("창고에서 저장", () => {
  it("동시에 여러 번 저장해도 하나도 잃지 않는다", async () => {
    const db = memoryLedgerIdb(JSON.stringify(emptyData()));
    await initLocalStorage(db);
    const s = new LocalStore();
    await Promise.all([s.saveSetting("a", 1), s.saveSetting("b", 2), s.saveDailySales("2026-10-02", [{ date: "2026-10-02", channel: "hall_card", amount: 1 }])]);
    const d = JSON.parse(db.text!);
    expect(d.settings.map((x: { key: string }) => x.key).sort()).toEqual(["a", "b"]);
    expect(d.dailySales).toHaveLength(1);
  });

  it("다른 탭이 창고에 먼저 저장했어도 그 위에 바꾼다", async () => {
    const db = memoryLedgerIdb(JSON.stringify(emptyData()));
    await initLocalStorage(db);
    db.text = JSON.stringify({ ...emptyData(), settings: [{ key: "other-tab", value: true }] }); // 다른 탭이 쓴 것
    await new LocalStore().saveSetting("mine", 1);
    expect(JSON.parse(db.text!).settings.map((x: { key: string }) => x.key)).toEqual(["other-tab", "mine"]);
  });

  it("창고 저장이 실패하면 오류를 던지고 메모리 사본도 바뀌지 않는다", async () => {
    const db = memoryLedgerIdb(JSON.stringify(emptyData()));
    await initLocalStorage(db);
    db.update = async () => {
      throw Object.assign(new Error("full"), { name: "QuotaExceededError" });
    };
    await expect(new LocalStore().saveSetting("a", 1)).rejects.toThrow();
    expect(await new LocalStore().getSetting("a")).toBeNull();
  });

  it("백업 파일 저장·복원도 창고로", async () => {
    const db = memoryLedgerIdb(ledger());
    fake.map.set(MIGRATED_FLAG, "idb:2026-10-22");
    await initLocalStorage(db);
    const text = exportBackup();
    expect(JSON.parse(text).data.dailySales).toHaveLength(1);
    const file = JSON.parse(text);
    file.data.staff = [{ id: "s9", alias: "가짜", wage: 10030, active: true }];
    const ins = inspectBackup(JSON.stringify(file));
    if (!ins.ok) throw new Error("검사 실패: " + ins.errors.join(" / "));
    await applyBackup(ins);
    expect(JSON.parse(db.text!).staff[0].id).toBe("s9");
    expect(fake.map.has(LOCAL_KEY)).toBe(false); // 서랍에는 쓰지 않는다
  });
});
