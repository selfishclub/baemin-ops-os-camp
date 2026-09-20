// 영수증·명세표 사진 보관 — 이 브라우저 안에만 (IndexedDB).
//  - 장부 숫자는 localStorage(내 PC 모드)에 있지만 사진은 커서 같이 두면 장부가 터진다. 그래서 사진만 따로 IndexedDB에 넣는다.
//  - 백업 JSON에는 사진이 들어가지 않고, 다른 기기·시연 모드에서는 보이지 않는다.
//    여러 기기에서 같은 사진을 보는 건 캠프 뒤 개인용 버전(로그인 + Supabase Storage)에서 붙인다.
const DB_NAME = "sootdak-ledger-photos";
const STORE = "photos";
const VERSION = 1;
const MAX_SIDE = 1600; // 긴 쪽 기준. 글자 읽기엔 충분하고 한 장 200~400KB 정도
const QUALITY = 0.72;

export interface PhotoMeta {
  id: string;
  ownerId: string; // 매입 영수증 id
  name: string;
  type: string;
  size: number;
  addedAt: string;
}

interface PhotoRecord extends PhotoMeta {
  blob: Blob;
}

export function photosAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: "id" });
        os.createIndex("ownerId", "ownerId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
      }),
  );
}

/** 폰 사진은 3~5MB라 그대로 두면 금방 찬다. 긴 쪽 1600px JPEG으로 줄인다 */
async function shrink(file: File): Promise<Blob> {
  if (typeof createImageBitmap !== "function" || !file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 900_000) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    if (!blob || blob.size >= file.size) return file;
    return blob;
  } catch {
    return file;
  }
}

export async function addPhoto(ownerId: string, file: File): Promise<PhotoMeta> {
  const blob = await shrink(file);
  const meta: PhotoMeta = {
    id: `ph_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    ownerId,
    name: file.name || "사진",
    type: blob.type || file.type || "image/jpeg",
    size: blob.size,
    addedAt: new Date().toISOString(),
  };
  const record: PhotoRecord = { ...meta, blob };
  await run("readwrite", (s) => s.put(record) as IDBRequest<IDBValidKey>);
  return meta;
}

export async function listPhotos(ownerId: string): Promise<PhotoMeta[]> {
  if (!photosAvailable()) return [];
  const rows = await run<PhotoRecord[]>("readonly", (s) => s.index("ownerId").getAll(ownerId) as IDBRequest<PhotoRecord[]>);
  return rows
    .map(({ blob, ...meta }) => meta) // eslint-disable-line @typescript-eslint/no-unused-vars
    .sort((a, b) => (a.addedAt < b.addedAt ? -1 : 1));
}

export async function getPhotoBlob(id: string): Promise<Blob | null> {
  if (!photosAvailable()) return null;
  const row = await run<PhotoRecord | undefined>("readonly", (s) => s.get(id) as IDBRequest<PhotoRecord | undefined>);
  return row?.blob ?? null;
}

export async function deletePhoto(id: string): Promise<void> {
  if (!photosAvailable()) return;
  await run("readwrite", (s) => s.delete(id) as IDBRequest<undefined>);
}

export async function deletePhotosOf(ownerId: string): Promise<void> {
  const list = await listPhotos(ownerId);
  for (const p of list) await deletePhoto(p.id);
}

/** 영수증 목록에 사진 개수를 보여 주려고 한 번에 센다 */
export async function countPhotosByOwner(): Promise<Record<string, number>> {
  if (!photosAvailable()) return {};
  const rows = await run<PhotoRecord[]>("readonly", (s) => s.getAll() as IDBRequest<PhotoRecord[]>);
  const out: Record<string, number> = {};
  for (const r of rows) out[r.ownerId] = (out[r.ownerId] ?? 0) + 1;
  return out;
}

/** 사진이 이 브라우저에서 차지하는 용량 (안내용) */
export async function photosTotalSize(): Promise<{ count: number; bytes: number }> {
  if (!photosAvailable()) return { count: 0, bytes: 0 };
  const rows = await run<PhotoRecord[]>("readonly", (s) => s.getAll() as IDBRequest<PhotoRecord[]>);
  return { count: rows.length, bytes: rows.reduce((a, r) => a + (r.size ?? 0), 0) };
}
