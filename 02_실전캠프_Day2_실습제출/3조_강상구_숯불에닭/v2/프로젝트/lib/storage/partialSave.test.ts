import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StorageFullError } from "./errors";
import { inspectLocal, LocalStore } from "./local";

// F단계 — "여러 번 저장하는 흐름"의 부분 저장 위험을 재현해 둔다 (B단계부터 미해결).
// 화면 코드(오늘 마감·올리기·영수증)는 저장소 함수를 연달아 부른다. 두 번째에서 실패하면 첫 번째는 이미 저장돼 있다.
// 이 테스트는 그 사실을 "기록"한다. 고치려면 저장 인터페이스에 한 번의 쓰기로 묶는 함수가 필요하다 (보고서 참고).

class FakeStorage {
  map = new Map<string, string>();
  failOnWriteNumber: number | null = null; // n번째 setItem 에서 실패
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

describe("오늘 마감: 일별 매출 → 근무 (두 번 저장)", () => {
  it("두 번째(근무) 저장이 실패하면 일별 매출만 남는다 — 부분 저장", async () => {
    const store = new LocalStore();
    fake.failOnWriteNumber = 2;
    await store.saveDailySales("2026-09-05", [{ date: "2026-09-05", channel: "hall_card", amount: 50000 }]);
    await expect(store.saveShifts("2026-09-05", [{ date: "2026-09-05", staffId: "s1", hours: 4 }])).rejects.toBeInstanceOf(StorageFullError);
    expect(data().dailySales.length).toBe(1); // 이미 저장됨
    expect(data().shifts.length).toBe(0); // 저장 안 됨
  });
});

describe("올리기: 거래 → 올린 기록 (두 번 저장)", () => {
  it("올린 기록 저장이 실패하면 거래는 있는데 '올린 파일 기록'이 없다 → 같은 파일을 또 올리면 중복 경고가 안 뜬다", async () => {
    const store = new LocalStore();
    fake.failOnWriteNumber = 2;
    await store.saveTransactions([{ id: "t1", month: "2026-09", date: "2026-09-05", payee: "가짜", out: 1000, in: 0, source: "bank", major: null, minor: null, channel: null, review: null }]);
    await expect(store.saveUpload({ id: "u1", month: "2026-09", from: "2026-09-01", to: "2026-09-30", rowCount: 1, uploadedAt: "2026-10-09T00:00:00.000Z" })).rejects.toBeInstanceOf(StorageFullError);
    expect(data().transactions.length).toBe(1);
    expect(data().uploads.length).toBe(0);
  });
});

describe("영수증: 영수증 목록 → 품목 단가 → 통장 줄 분류 (세 번 저장)", () => {
  it("세 번째 저장이 실패하면 영수증·단가는 바뀌고 통장 줄만 예전 그대로다", async () => {
    const store = new LocalStore();
    await store.saveTransactions([{ id: "t1", month: "2026-09", date: "2026-09-05", payee: "가짜마트", out: 30000, in: 0, source: "bank", major: null, minor: null, channel: null, review: "처음 보는 거래처" }]);
    fake.failOnWriteNumber = 4; // 위 1번 + 아래 3번 중 세 번째
    await store.saveSetting("purchases_2026-09", [{ id: "p1", date: "2026-09-05", vendor: "가짜마트" }]);
    await store.saveSetting("costing_items", [{ id: "it1", name: "닭", standardCost: 5000 }]);
    await expect(store.saveTransactions([{ id: "t1", month: "2026-09", date: "2026-09-05", payee: "가짜마트", out: 30000, in: 0, source: "bank", major: "매출원가", minor: "원재료비", channel: null, review: null }])).rejects.toBeInstanceOf(StorageFullError);
    const d = data();
    expect(d.settings.find((s) => s.key === "purchases_2026-09")).toBeTruthy();
    expect(d.settings.find((s) => s.key === "costing_items")).toBeTruthy();
    expect(d.transactions[0].review).toBe("처음 보는 거래처"); // 분류가 안 채워짐 → 올리기 탭에 "확인 필요"로 계속 남는다 (돈이 두 번 세이지는 않음)
  });
});

describe("같은 저장소에서 한 번에 쓰면 부분 저장이 없다 (권장 수정안의 근거)", () => {
  it("LocalStore 의 한 번의 update 는 전부 되거나 전부 안 된다", async () => {
    const store = new LocalStore();
    // 지금 인터페이스에는 '여러 항목을 한 번에' 쓰는 함수가 없다. 아래는 그런 함수가 있다면 어떻게 되는지를 private update 로 보인 것.
    const combined = (s: LocalStore) => (s as unknown as { update: (fn: (d: ReturnType<typeof data>) => ReturnType<typeof data>) => void }).update;
    fake.failOnWriteNumber = 1;
    expect(() => combined(store).call(store, (d) => ({ ...d, dailySales: [{ date: "2026-09-05", channel: "hall_card", amount: 1 }], shifts: [{ date: "2026-09-05", staffId: "s1", hours: 1 }] }))).toThrow(StorageFullError);
    expect(data().dailySales.length).toBe(0);
    expect(data().shifts.length).toBe(0);
    fake.failOnWriteNumber = null;
    combined(store).call(store, (d) => ({ ...d, dailySales: [{ date: "2026-09-05", channel: "hall_card", amount: 1 }], shifts: [{ date: "2026-09-05", staffId: "s1", hours: 1 }] }));
    expect(data().dailySales.length).toBe(1);
    expect(data().shifts.length).toBe(1);
  });
});
