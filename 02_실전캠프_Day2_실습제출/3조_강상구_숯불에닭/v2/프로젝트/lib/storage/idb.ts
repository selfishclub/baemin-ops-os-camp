// 장부 덩어리를 크롬의 큰 창고(IndexedDB)에 둔다 — 2026-10-22.
//  작은 서랍(localStorage)은 출처당 5MB 안팎이라 수집 자료가 늘며 90% 가까이 찼다. 큰 창고는 디스크 여유만큼 쓸 수 있다.
//  모양은 그대로다: 키 하나("ledger-v1")에 장부 전체 JSON 글 한 덩어리. 백업 파일 형식도 바뀌지 않는다.
//  사진은 이미 따로 IndexedDB(lib/photos.ts)에 있다. 이 창고는 그것과 다른 이름이다.

export interface LedgerIdb {
  get(): Promise<string | null>;
  /** 그대로 바꿔 넣기 (복원·옮기기) */
  put(text: string): Promise<void>;
  /** 읽고 → 바꾸고 → 쓰기를 한 거래(transaction)로. 다른 탭이 사이에 끼어들 수 없다. fn 이 던지면 아무것도 안 바뀐다 */
  update(fn: (old: string | null) => string): Promise<string>;
}

const DB_NAME = "sootdak-ledger-db";
const STORE = "kv";
const KEY = "ledger-v1";

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((ok, fail) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
}

/** 브라우저의 IndexedDB 를 연다. 없거나 막혀 있으면(사생활 모드 등) null */
export async function openLedgerIdb(): Promise<LedgerIdb | null> {
  if (typeof indexedDB === "undefined") return null;
  let db: IDBDatabase;
  try {
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(STORE)) open.result.createObjectStore(STORE);
    };
    db = await req(open);
  } catch {
    return null;
  }
  const done = (tx: IDBTransaction) =>
    new Promise<void>((ok, fail) => {
      tx.oncomplete = () => ok();
      tx.onerror = () => fail(tx.error);
      tx.onabort = () => fail(tx.error ?? new DOMException("저장이 취소됐어요", "AbortError"));
    });
  return {
    async get() {
      const v = await req(db.transaction(STORE, "readonly").objectStore(STORE).get(KEY));
      return typeof v === "string" ? v : null;
    },
    async put(text) {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(text, KEY);
      await done(tx);
    },
    async update(fn) {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const finished = done(tx);
      let next = "";
      let thrown: unknown = null;
      const r = store.get(KEY);
      r.onsuccess = () => {
        try {
          next = fn(typeof r.result === "string" ? r.result : null);
          store.put(next, KEY);
        } catch (e) {
          thrown = e;
          tx.abort();
        }
      };
      try {
        await finished;
      } catch (e) {
        throw thrown ?? e;
      }
      return next;
    },
  };
}

/** 시험용 — 메모리에만 두는 창고 */
export function memoryLedgerIdb(initial: string | null = null): LedgerIdb & { text: string | null; puts: number } {
  const m = {
    text: initial,
    puts: 0,
    async get() {
      return m.text;
    },
    async put(t: string) {
      m.text = t;
      m.puts++;
    },
    async update(fn: (old: string | null) => string) {
      const next = fn(m.text);
      m.text = next;
      m.puts++;
      return next;
    },
  };
  return m;
}
