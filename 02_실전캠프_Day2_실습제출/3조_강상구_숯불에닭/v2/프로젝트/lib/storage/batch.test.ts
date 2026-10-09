import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findOverlap, newBankRowsOnly } from "../month";
import { computePnl } from "../pnl";
import type { Transaction } from "../types";
import { applyOps, type BatchOp } from "./batch";
import { StorageFullError } from "./errors";
import { onLedgerChanged } from "./events";
import { emptyData, inspectLocal, LocalStore } from "./local";

// F-보완 — "한 번에 저장"(batch)이 정말 전부 되거나 전부 안 되는지. 전부 가상 데이터.
class FakeStorage {
  map = new Map<string, string>();
  failOnWriteNumber: number | null = null;
  writes = 0;
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
    this.writes += 1;
    if (this.failOnWriteNumber === this.writes) throw Object.assign(new Error("quota"), { name: "QuotaExceededError" });
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
const data = () => {
  const r = inspectLocal();
  if (!r.ok) throw new Error("손상");
  return r.data;
};
const tx = (id: string, over: Partial<Transaction> = {}): Transaction => ({ id, month: "2026-09", date: "2026-09-05", payee: "가짜마트", out: 30000, in: 0, source: "bank", major: null, minor: null, channel: null, review: "처음 보는 거래처", ...over });

const todayOps: BatchOp[] = [
  { kind: "dailySales", date: "2026-09-05", sales: [{ date: "2026-09-05", channel: "hall_card", amount: 50000 }] },
  { kind: "shifts", date: "2026-09-05", shifts: [{ date: "2026-09-05", staffId: "s1", hours: 4 }] },
];
const uploadOps: BatchOp[] = [
  { kind: "transactions", txs: [tx("t1"), tx("t2", { date: "2026-09-06" })] },
  { kind: "upload", record: { id: "u1", month: "2026-09", from: "2026-09-01", to: "2026-09-30", rowCount: 2, uploadedAt: "2026-10-09T00:00:00.000Z" } },
];
const receiptOps: BatchOp[] = [
  { kind: "setting", key: "purchases_2026-09", value: [{ id: "p1", date: "2026-09-05", vendor: "가짜마트" }] },
  { kind: "setting", key: "costing_items", value: [{ id: "it1", name: "닭", standardCost: 5000 }] },
  { kind: "transactions", txs: [tx("t1", { major: "매출원가", minor: "원재료비", review: null })] },
];

describe("1. 오늘 마감 — 매출+근무", () => {
  it("저장이 실패하면 둘 다 안 남는다 (두 번째 항목 실패에 해당)", async () => {
    const store = new LocalStore();
    fake.failOnWriteNumber = 1;
    await expect(store.batch(todayOps)).rejects.toBeInstanceOf(StorageFullError);
    expect(data().dailySales).toEqual([]);
    expect(data().shifts).toEqual([]);
  });
  it("성공하면 둘 다 들어가고 setItem 은 한 번", async () => {
    const store = new LocalStore();
    await store.batch(todayOps);
    expect(fake.writes).toBe(1);
    expect(data().dailySales.length).toBe(1);
    expect(data().shifts.length).toBe(1);
  });
  it("실패 뒤 다시 시도하면 들어간다 (기존 장부는 그대로였다)", async () => {
    const store = new LocalStore();
    await store.saveStaff({ id: "s1", alias: "홀A", wage: 10000, active: true });
    const before = fake.map.get("sootdak-ledger-v1");
    fake.failOnWriteNumber = 2;
    await expect(store.batch(todayOps)).rejects.toBeInstanceOf(StorageFullError);
    expect(fake.map.get("sootdak-ledger-v1")).toBe(before); // 한 글자도 안 바뀜
    await store.batch(todayOps);
    expect(data().shifts.length).toBe(1);
    expect(data().staff.length).toBe(1);
  });
});

describe("2. 올리기 — 거래+올린 기록", () => {
  it("실패하면 거래도 기록도 없다 → 같은 파일을 다시 올려도 중복이 생기지 않는다", async () => {
    const store = new LocalStore();
    fake.failOnWriteNumber = 1;
    await expect(store.batch(uploadOps)).rejects.toBeInstanceOf(StorageFullError);
    expect(data().transactions).toEqual([]);
    expect(data().uploads).toEqual([]);
    // 재시도 = 처음 올리는 것과 같다
    await store.batch(uploadOps);
    expect(data().transactions.length).toBe(2);
    expect(data().uploads.length).toBe(1);
  });
  it("성공한 뒤 같은 파일을 또 올리면 겹침이 잡히고 새 줄만 걸러진다 (중복 거래 방지)", async () => {
    const store = new LocalStore();
    await store.batch(uploadOps);
    const overlap = findOverlap(await store.listUploads(), "2026-09-01", "2026-09-30");
    expect(overlap).toBeTruthy();
    const existing = await store.listTransactions("2026-09");
    const again = newBankRowsOnly(
      [
        { date: "2026-09-05", payee: "가짜마트", out: 30000, in: 0 },
        { date: "2026-09-06", payee: "가짜마트", out: 30000, in: 0 },
        { date: "2026-09-07", payee: "새거래처", out: 1000, in: 0 },
      ],
      existing,
    );
    expect(again.duplicates).toBe(2);
    expect(again.fresh.length).toBe(1);
  });
});

describe("3. 영수증 — 목록+단가+통장 분류 (세 항목)", () => {
  it("실패하면 세 항목 전부 예전 그대로 (세 번째 항목 실패에 해당)", async () => {
    const store = new LocalStore();
    await store.saveTransactions([tx("t1")]);
    const before = fake.map.get("sootdak-ledger-v1");
    fake.failOnWriteNumber = 2;
    await expect(store.batch(receiptOps)).rejects.toBeInstanceOf(StorageFullError);
    expect(fake.map.get("sootdak-ledger-v1")).toBe(before);
    expect(data().settings.find((s) => s.key === "purchases_2026-09")).toBeUndefined();
    expect(data().transactions[0].review).toBe("처음 보는 거래처");
  });
  it("성공하면 세 항목이 함께 바뀐다", async () => {
    const store = new LocalStore();
    await store.saveTransactions([tx("t1")]);
    await store.batch(receiptOps);
    const d = data();
    expect(d.settings.map((s) => s.key).sort()).toEqual(["costing_items", "purchases_2026-09"]);
    expect(d.transactions[0]).toMatchObject({ major: "매출원가", minor: "원재료비", review: null });
  });
});

describe("한 번에 저장과 낱개 저장의 결과는 같다", () => {
  it("같은 작업을 batch 로 한 번, 낱개로 한 번 하면 장부가 같다", async () => {
    const a = new LocalStore();
    await a.batch([...uploadOps, ...receiptOps, ...todayOps]);
    const viaBatch = fake.map.get("sootdak-ledger-v1");
    fake.map.clear();
    const b = new LocalStore();
    await b.saveTransactions([tx("t1"), tx("t2", { date: "2026-09-06" })]);
    await b.saveUpload({ id: "u1", month: "2026-09", from: "2026-09-01", to: "2026-09-30", rowCount: 2, uploadedAt: "2026-10-09T00:00:00.000Z" });
    await b.saveSetting("purchases_2026-09", [{ id: "p1", date: "2026-09-05", vendor: "가짜마트" }]);
    await b.saveSetting("costing_items", [{ id: "it1", name: "닭", standardCost: 5000 }]);
    await b.saveTransactions([tx("t1", { major: "매출원가", minor: "원재료비", review: null })]);
    await b.saveDailySales("2026-09-05", [{ date: "2026-09-05", channel: "hall_card", amount: 50000 }]);
    await b.saveShifts("2026-09-05", [{ date: "2026-09-05", staffId: "s1", hours: 4 }]);
    expect(fake.map.get("sootdak-ledger-v1")).toBe(viaBatch);
  });
  it("applyOps 는 순수 함수다 (입력을 바꾸지 않는다)", () => {
    const d = emptyData();
    const out = applyOps(d, todayOps);
    expect(d.dailySales).toEqual([]);
    expect(out.dailySales.length).toBe(1);
  });
  it("빈 목록은 아무것도 쓰지 않는다", async () => {
    await new LocalStore().batch([]);
    expect(fake.writes).toBe(0);
  });
});

describe("자동 백업과의 관계", () => {
  it("batch 한 번은 '장부가 바뀌었다' 신호를 한 번만 낸다 (낱개 저장은 항목 수만큼)", async () => {
    let n = 0;
    const off = onLedgerChanged(() => n++);
    const store = new LocalStore();
    await store.batch(receiptOps);
    expect(n).toBe(1);
    await store.saveSetting("a", 1);
    await store.saveSetting("b", 2);
    expect(n).toBe(3);
    off();
  });
  it("실패한 batch 는 신호를 내지 않는다", async () => {
    let n = 0;
    const off = onLedgerChanged(() => n++);
    fake.failOnWriteNumber = 1;
    await expect(new LocalStore().batch(todayOps)).rejects.toBeInstanceOf(StorageFullError);
    off();
    expect(n).toBe(0);
  });
});

describe("정상 저장 뒤 기존 손익 계산 유지", () => {
  it("batch 로 넣은 거래가 손익에 똑같이 잡힌다", async () => {
    const store = new LocalStore();
    await store.batch([{ kind: "transactions", txs: [tx("t1", { major: "매출원가", minor: "원재료비", review: null, out: 30000 }), tx("t2", { major: "수입", minor: "매출액", review: null, out: 0, in: 100000, channel: "hall_card" })] }]);
    const txs = await store.listTransactions("2026-09");
    const pnl = computePnl(txs, []);
    expect(pnl.revenue).toBe(100000);
    expect(pnl.operatingProfit).toBe(70000);
  });
});
