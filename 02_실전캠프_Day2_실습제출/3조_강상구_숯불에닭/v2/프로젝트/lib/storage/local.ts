import { seedRules } from "../seed";
import type { ChannelSale, DailySale, DailyWeather, Month, MonthClosing, Rule, Setting, Shift, Staff, Transaction, UploadRecord } from "../types";
import { looksLikeQuotaError, StorageDamagedError, StorageFullError, StorageWriteError } from "./errors";
import { applyOp, applyOps, type BatchOp } from "./batch";
import { notifyLedgerChanged, notifyStorageFailure } from "./events";
import { openLedgerIdb, type LedgerIdb } from "./idb";
import type { Store } from "./index";

export const LOCAL_KEY = "sootdak-ledger-v1";
// 마지막으로 백업 파일 내려받기를 시작한 시각. 장부 덩어리 밖에 따로 둔다 (백업 파일 형식을 바꾸지 않으려고)
export const LAST_BACKUP_KEY = "sootdak-ledger-last-backup";

export interface LocalData {
  transactions: Transaction[];
  rules: Rule[];
  channelSales: ChannelSale[];
  closings: MonthClosing[];
  uploads: UploadRecord[];
  dailySales: DailySale[];
  shifts: Shift[];
  staff: Staff[];
  settings: Setting[];
  weather: DailyWeather[];
}

const LIST_KEYS: (keyof LocalData)[] = ["transactions", "rules", "channelSales", "closings", "uploads", "dailySales", "shifts", "staff", "settings", "weather"];

export const emptyData = (): LocalData => ({
  transactions: [],
  rules: seedRules(),
  channelSales: [],
  closings: [],
  uploads: [],
  dailySales: [],
  shifts: [],
  staff: [],
  settings: [],
  weather: [],
});

// ── 읽기 ─────────────────────────────────────────────────────────
// "빈 장부"와 "읽을 수 없는 장부"는 다르다.
//  - 아무것도 저장된 적이 없으면 ok + empty.
//  - 저장된 글이 있는데 JSON 이 아니거나 모양이 틀리면 ok:false. 원본(raw)을 그대로 들고 있는다.
//  - 브라우저 저장소 자체에 손을 못 대면(사생활 모드 등) ok:false + unavailable.
export type LocalRead =
  | { ok: true; data: LocalData; empty: boolean; chars: number }
  | { ok: false; kind: "damaged" | "unavailable"; raw: string; reason: string };

function describeShape(parsed: unknown): string | null {
  if (parsed === null || typeof parsed !== "object") return "장부가 아닌 값이 저장돼 있어요";
  if (Array.isArray(parsed)) return "장부가 목록 모양으로 저장돼 있어요";
  for (const k of LIST_KEYS) {
    const v = (parsed as Record<string, unknown>)[k];
    if (v !== undefined && !Array.isArray(v)) return `'${k}' 항목이 목록이 아니에요`;
  }
  return null;
}

// ── 어디에 두나: 작은 서랍(localStorage) → 큰 창고(IndexedDB) ─────────────────────
// 2026-10-22 장부가 5MB 서랍을 90% 가까이 채워서 큰 창고로 옮긴다 (lib/storage/idb.ts).
//  - 앱을 열 때 initLocalStorage() 가 한 번 돈다. 창고에 장부가 있으면 그걸 쓰고,
//    없으면 서랍의 장부를 창고에 넣고 → 다시 읽어 글자 하나까지 같은지 본 뒤에만 창고로 바꾼다.
//  - 서랍의 옛 장부는 지우지 않는다 (옮기기 전 사본). 표시(MIGRATED_FLAG)만 남겨 다시는 서랍을 장부로 읽지 않는다.
//  - 읽기는 메모리 사본(cache)으로 바로, 쓰기는 창고에서 읽고-바꾸고-쓰기를 한 거래로 (다른 탭과 겹쳐도 안 잃는다).
//  - 창고를 못 여는 브라우저(사생활 모드 등)는 예전처럼 서랍을 쓴다. 단, 이미 옮긴 뒤라면 서랍 사본으로 돌아가지 않는다(옛 자료라서).
export const MIGRATED_FLAG = "sootdak-ledger-storage"; // 값 "idb:옮긴 시각"

type Backend = { kind: "local" } | { kind: "idb"; db: LedgerIdb } | { kind: "lost"; reason: string };
let backend: Backend = { kind: "local" };
let cache: string | null = null;
let quotaBytes: number | null = null;
let initPromise: Promise<void> | null = null;
let channel: BroadcastChannel | null = null;

export const storageBackend = () => backend.kind;

function readFlag(): string | null {
  try {
    return window.localStorage.getItem(MIGRATED_FLAG);
  } catch {
    return null;
  }
}

/** 앱을 열 때 한 번. 시험에서는 db 를 넣어 부른다 (넣지 않으면 브라우저 IndexedDB) */
export function initLocalStorage(db?: LedgerIdb | null): Promise<void> {
  if (db !== undefined) initPromise = null; // 시험: 매번 새로
  if (!initPromise) initPromise = doInit(db);
  return initPromise;
}

/** 시험용 — 처음 상태(서랍)로 */
export function resetLocalBackend() {
  backend = { kind: "local" };
  cache = null;
  initPromise = null;
}

async function doInit(given?: LedgerIdb | null) {
  if (typeof window === "undefined") return;
  const db = given === undefined ? await openLedgerIdb() : given;
  const migrated = (readFlag() ?? "").startsWith("idb");
  if (!db) {
    backend = migrated ? { kind: "lost", reason: "장부가 크롬의 큰 창고(IndexedDB)에 있는데 지금 브라우저가 창고를 열지 못해요 (사생활 모드·저장소 차단 등)." } : { kind: "local" };
    return;
  }
  const inIdb = await db.get();
  if (inIdb !== null) {
    backend = { kind: "idb", db };
    cache = inIdb;
  } else if (migrated) {
    // 옮긴 뒤 창고가 비었다 = 사이트 데이터가 일부 지워졌다. 서랍의 옛 사본을 장부로 쓰면 그 뒤 입력이 사라진 장부가 된다
    backend = { kind: "lost", reason: "크롬의 큰 창고에 있던 장부가 비어 있어요 (사이트 데이터가 지워졌을 수 있어요). 백업 파일로 복원해 주세요." };
    return;
  } else {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(LOCAL_KEY);
    } catch {
      raw = null;
    }
    if (raw && !parseLedger(raw).ok) return; // 손상된 서랍은 옮기지 않는다 — 서랍 그대로 두고 복구 화면으로
    if (raw) {
      await db.put(raw);
      if ((await db.get()) !== raw) return; // 똑같이 들어가지 않았으면 서랍을 계속 쓴다
    }
    try {
      window.localStorage.setItem(MIGRATED_FLAG, `idb:${new Date().toISOString()}`);
    } catch {
      return; // 표시를 못 남기면 다음에 또 옮기려 들 수 있어 서랍을 계속 쓴다
    }
    backend = { kind: "idb", db };
    cache = raw;
  }
  try {
    const est = await navigator.storage?.estimate?.();
    quotaBytes = est?.quota ?? null;
  } catch {}
  // 다른 탭이 저장하면 메모리 사본을 새로 읽는다
  try {
    channel = new BroadcastChannel("sootdak-ledger");
    channel.onmessage = () => {
      if (backend.kind === "idb") void backend.db.get().then((t) => (cache = t));
    };
  } catch {}
}

/** 저장된 글 → 장부. 손상이면 ok:false */
function parseLedger(raw: string): LocalRead {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, kind: "damaged", raw, reason: "저장된 글이 JSON 형식이 아니에요 (중간에 잘렸거나 깨졌어요)" };
  }
  const bad = describeShape(parsed);
  if (bad) return { ok: false, kind: "damaged", raw, reason: bad };
  return { ok: true, data: { ...emptyData(), ...(parsed as Partial<LocalData>) }, empty: false, chars: raw.length };
}

export function inspectLocal(): LocalRead {
  if (backend.kind === "lost") return { ok: false, kind: "unavailable", raw: "", reason: backend.reason };
  let raw: string | null;
  if (backend.kind === "idb") raw = cache;
  else {
    try {
      raw = window.localStorage.getItem(LOCAL_KEY);
    } catch (e) {
      return { ok: false, kind: "unavailable", raw: "", reason: `브라우저 저장소에 접근할 수 없어요 (${e instanceof Error ? e.name : "오류"})` };
    }
  }
  if (raw === null || raw === "") return { ok: true, data: emptyData(), empty: true, chars: 0 };
  return parseLedger(raw);
}

// 읽을 수 없으면 조용히 빈 장부를 주는 대신 오류를 던진다 → 부른 쪽이 빈 장부로 착각해 덮어쓸 수 없다.
export function readLocal(): LocalData {
  const r = inspectLocal();
  if (!r.ok) throw new StorageDamagedError(r.reason);
  return r.data;
}

// ── 쓰기 ─────────────────────────────────────────────────────────
// localStorage 는 글자(UTF-16) 단위로 세므로 바이트는 글자 수 × 2 로 어림한다.
export const bytesOf = (text: string) => text.length * 2;

function wrapWriteError(e: unknown, text: string): Error {
  if (looksLikeQuotaError(e)) return new StorageFullError(storageUsage().totalBytes, bytesOf(text), e);
  return new StorageWriteError(e instanceof Error ? e.name : "알 수 없는 오류", e);
}

function committed(text: string) {
  cache = text;
  try {
    channel?.postMessage("changed");
  } catch {}
  notifyLedgerChanged(); // 저장이 됐을 때만 — 자동 백업이 이걸 듣는다
}

// 같은 탭 안의 쓰기는 한 줄로 세운다 (앞 저장이 끝난 뒤 다음 저장)
let writeQueue: Promise<unknown> = Promise.resolve();
function queued<T>(job: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(job, job);
  writeQueue = run.catch(() => {});
  return run;
}

/** 장부 전체를 바꿔 넣는다 (복원·설정 되살리기). 큰 창고면 저장이 끝날 때까지 기다려야 한다 */
export async function writeLocal(d: LocalData): Promise<void> {
  await initLocalStorage(); // 옮기기가 끝나기 전에 서랍에 쓰면 그 내용이 사라진다
  const text = JSON.stringify(d);
  if (backend.kind === "lost") throw new StorageWriteError("장부 창고를 열 수 없음");
  if (backend.kind === "idb") {
    const db = backend.db;
    await queued(async () => {
      try {
        await db.put(text);
      } catch (e) {
        throw wrapWriteError(e, text);
      }
      committed(text);
    });
    return;
  }
  try {
    window.localStorage.setItem(LOCAL_KEY, text);
  } catch (e) {
    // setItem 이 실패하면 브라우저는 이전 값을 그대로 둔다. 여기서는 종류만 가려서 다시 던진다.
    throw wrapWriteError(e, text);
  }
  notifyLedgerChanged();
}

/** 읽기 → 바꾸기 → 쓰기. 큰 창고면 한 거래로 (다른 탭이 사이에 저장해도 그 내용 위에 바꾼다) */
async function updateLocal(fn: (d: LocalData) => LocalData): Promise<void> {
  await initLocalStorage();
  if (backend.kind !== "idb") return writeLocal(fn(readLocal()));
  const db = backend.db;
  await queued(async () => {
    let text = "";
    try {
      text = await db.update((old) => {
        if (old === null || old === "") return JSON.stringify(fn(emptyData()));
        const r = parseLedger(old);
        if (!r.ok) throw new StorageDamagedError(r.reason);
        return JSON.stringify(fn(r.data));
      });
    } catch (e) {
      if (e instanceof StorageDamagedError) throw e;
      throw wrapWriteError(e, text);
    }
    committed(text);
  });
}

// ── 사용량 ───────────────────────────────────────────────────────
// 브라우저가 한도를 알려 주지 않는다. 흔히 출처(origin)당 5MB 안팎이라 그 값을 "추정 한도"로 쓴다.
export const ESTIMATED_LIMIT_BYTES = 5 * 1024 * 1024;

export interface StorageUsage {
  ledgerBytes: number; // 장부 덩어리
  totalBytes: number; // 이 출처의 localStorage 전체
  estimatedLimitBytes: number;
  ratio: number; // totalBytes ÷ 추정 한도
  level: "ok" | "warn" | "critical";
}

export function storageUsage(): StorageUsage {
  if (backend.kind === "idb") {
    // 큰 창고: 장부 크기와 브라우저가 알려 준 한도(디스크 여유에 따라 다름)
    const ledgerBytes = bytesOf(cache ?? "");
    const limit = quotaBytes ?? 1024 * 1024 * 1024;
    const ratio = ledgerBytes / limit;
    return { ledgerBytes, totalBytes: ledgerBytes, estimatedLimitBytes: limit, ratio, level: ratio >= 0.95 ? "critical" : ratio >= 0.8 ? "warn" : "ok" };
  }
  let ledgerBytes = 0;
  let totalBytes = 0;
  try {
    const ls = window.localStorage;
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k === null) continue;
      const v = ls.getItem(k) ?? "";
      const b = bytesOf(k) + bytesOf(v);
      totalBytes += b;
      if (k === LOCAL_KEY) ledgerBytes = bytesOf(v);
    }
  } catch {}
  const ratio = totalBytes / ESTIMATED_LIMIT_BYTES;
  return { ledgerBytes, totalBytes, estimatedLimitBytes: ESTIMATED_LIMIT_BYTES, ratio, level: ratio >= 0.95 ? "critical" : ratio >= 0.8 ? "warn" : "ok" };
}

// ── 마지막 백업 시각 ───────────────────────────────────────────────
// "내려받기를 시작한" 시각이다. 파일이 실제로 저장됐는지는 브라우저가 알려 주지 않는다.
export function readLastBackupAt(): string | null {
  try {
    return window.localStorage.getItem(LAST_BACKUP_KEY);
  } catch {
    return null;
  }
}
export function markBackupStarted(at = new Date().toISOString()) {
  try {
    window.localStorage.setItem(LAST_BACKUP_KEY, at);
  } catch {}
}
// 사장님이 "다운로드 폴더에 파일이 있다"고 직접 확인한 시각. 앱은 파일 저장을 검증할 수 없으므로 사람의 확인을 따로 적는다.
export const LAST_BACKUP_CONFIRMED_KEY = "sootdak-ledger-last-backup-confirmed";
export function readLastBackupConfirmedAt(): string | null {
  try {
    return window.localStorage.getItem(LAST_BACKUP_CONFIRMED_KEY);
  } catch {
    return null;
  }
}
export function markBackupConfirmed(at = new Date().toISOString()) {
  try {
    window.localStorage.setItem(LAST_BACKUP_CONFIRMED_KEY, at);
  } catch {}
}

const upsert = <T>(list: T[], item: T, same: (a: T, b: T) => boolean) =>
  list.some((x) => same(x, item)) ? list.map((x) => (same(x, item) ? item : x)) : [...list, item];

export class LocalStore implements Store {
  mode = "local" as const;
  readonly batchAtomic = true;

  // 모든 쓰기는 여기를 지난다. 읽을 수 없거나(손상) 쓰지 못하면(공간 부족 등) 알리고 그대로 던진다.
  // 읽기 → 바꾸기 → 저장 한 번. 그래서 fn 안에서 몇 항목을 바꾸든 전부 되거나 전부 안 된다.
  private async update(fn: (d: LocalData) => LocalData) {
    try {
      await updateLocal(fn);
    } catch (e) {
      notifyStorageFailure(e);
      throw e;
    }
  }

  // 여러 항목을 한 번에 — 원자적 (setItem 한 번)
  async batch(ops: BatchOp[]) {
    if (ops.length === 0) return;
    await this.update((d) => applyOps(d, ops));
  }

  async listTransactions(month: Month) {
    await initLocalStorage();
    return readLocal().transactions.filter((t) => t.month === month);
  }
  async saveTransactions(txs: Transaction[]) {
    await this.update((d) => applyOp(d, { kind: "transactions", txs }));
  }
  async deleteTransaction(id: string) {
    await this.update((d) => ({ ...d, transactions: d.transactions.filter((t) => t.id !== id) }));
  }
  async listRules() {
    await initLocalStorage();
    return readLocal().rules;
  }
  async saveRule(rule: Rule) {
    await this.update((d) => ({ ...d, rules: upsert(d.rules, rule, (a, b) => a.id === b.id) }));
  }
  async deleteRule(id: string) {
    await this.update((d) => ({ ...d, rules: d.rules.filter((r) => r.id !== id) }));
  }
  async listChannelSales(month: Month) {
    await initLocalStorage();
    return readLocal().channelSales.filter((s) => s.month === month);
  }
  async saveChannelSales(sales: ChannelSale[]) {
    await this.update((d) => ({
      ...d,
      channelSales: sales.reduce(
        (acc, s) => upsert(acc, s, (a, b) => a.month === b.month && a.channel === b.channel),
        d.channelSales,
      ),
    }));
  }
  async getClosing(month: Month) {
    await initLocalStorage();
    return readLocal().closings.find((c) => c.month === month) ?? null;
  }
  async saveClosing(c: MonthClosing) {
    await this.update((d) => ({ ...d, closings: upsert(d.closings, c, (a, b) => a.month === b.month) }));
  }
  async listUploads() {
    await initLocalStorage();
    return readLocal().uploads;
  }
  async saveUpload(u: UploadRecord) {
    await this.update((d) => applyOp(d, { kind: "upload", record: u }));
  }
  async deleteMonth(month: Month) {
    await this.update((d) => ({
      ...d,
      transactions: d.transactions.filter((t) => t.month !== month),
      channelSales: d.channelSales.filter((s) => s.month !== month),
      closings: d.closings.filter((c) => c.month !== month),
      uploads: d.uploads.filter((u) => u.month !== month),
      dailySales: d.dailySales.filter((s) => !s.date.startsWith(month)),
      shifts: d.shifts.filter((s) => !s.date.startsWith(month)),
    }));
  }
  async listDailySales(month: Month) {
    await initLocalStorage();
    return readLocal().dailySales.filter((s) => s.date.startsWith(month));
  }
  async saveDailySales(date: string, sales: DailySale[]) {
    await this.update((d) => applyOp(d, { kind: "dailySales", date, sales }));
  }
  async listShifts(month: Month) {
    await initLocalStorage();
    return readLocal().shifts.filter((s) => s.date.startsWith(month));
  }
  async saveShifts(date: string, shifts: Shift[]) {
    await this.update((d) => applyOp(d, { kind: "shifts", date, shifts }));
  }
  async listStaff() {
    await initLocalStorage();
    return readLocal().staff;
  }
  async saveStaff(staff: Staff) {
    await this.update((d) => ({ ...d, staff: upsert(d.staff, staff, (a, b) => a.id === b.id) }));
  }
  async listAllDailySales() {
    await initLocalStorage();
    return readLocal().dailySales;
  }
  async listAllShifts() {
    await initLocalStorage();
    return readLocal().shifts;
  }
  async listWeather(from: string, to: string) {
    await initLocalStorage();
    return readLocal().weather.filter((w) => w.date >= from && w.date <= to);
  }
  async saveWeather(records: DailyWeather[]) {
    await this.update((d) => ({ ...d, weather: records.reduce((acc, w) => upsert(acc, w, (a, b) => a.date === b.date), d.weather) }));
  }
  async getSetting<T>(key: string) {
    return (readLocal().settings.find((s) => s.key === key)?.value as T | undefined) ?? null;
  }
  async saveSetting<T>(key: string, value: T) {
    await this.update((d) => applyOp(d, { kind: "setting", key, value }));
  }
}
