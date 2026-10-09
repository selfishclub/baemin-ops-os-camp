import { seedRules } from "../seed";
import type { ChannelSale, DailySale, DailyWeather, Month, MonthClosing, Rule, Setting, Shift, Staff, Transaction, UploadRecord } from "../types";
import { looksLikeQuotaError, StorageDamagedError, StorageFullError, StorageWriteError } from "./errors";
import { applyOp, applyOps, type BatchOp } from "./batch";
import { notifyLedgerChanged, notifyStorageFailure } from "./events";
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

export function inspectLocal(): LocalRead {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(LOCAL_KEY);
  } catch (e) {
    return { ok: false, kind: "unavailable", raw: "", reason: `브라우저 저장소에 접근할 수 없어요 (${e instanceof Error ? e.name : "오류"})` };
  }
  if (raw === null || raw === "") return { ok: true, data: emptyData(), empty: true, chars: 0 };
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

// 읽을 수 없으면 조용히 빈 장부를 주는 대신 오류를 던진다 → 부른 쪽이 빈 장부로 착각해 덮어쓸 수 없다.
export function readLocal(): LocalData {
  const r = inspectLocal();
  if (!r.ok) throw new StorageDamagedError(r.reason);
  return r.data;
}

// ── 쓰기 ─────────────────────────────────────────────────────────
// localStorage 는 글자(UTF-16) 단위로 세므로 바이트는 글자 수 × 2 로 어림한다.
export const bytesOf = (text: string) => text.length * 2;

export function writeLocal(d: LocalData) {
  const text = JSON.stringify(d);
  try {
    window.localStorage.setItem(LOCAL_KEY, text);
  } catch (e) {
    // setItem 이 실패하면 브라우저는 이전 값을 그대로 둔다. 여기서는 종류만 가려서 다시 던진다.
    if (looksLikeQuotaError(e)) throw new StorageFullError(storageUsage().totalBytes, bytesOf(text), e);
    throw new StorageWriteError(e instanceof Error ? e.name : "알 수 없는 오류", e);
  }
  notifyLedgerChanged(); // 저장이 됐을 때만 — 자동 백업이 이걸 듣는다
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
  // 읽기 → 바꾸기 → setItem 한 번. 그래서 fn 안에서 몇 항목을 바꾸든 전부 되거나 전부 안 된다.
  private update(fn: (d: LocalData) => LocalData) {
    try {
      writeLocal(fn(readLocal()));
    } catch (e) {
      notifyStorageFailure(e);
      throw e;
    }
  }

  // 여러 항목을 한 번에 — 원자적 (setItem 한 번)
  async batch(ops: BatchOp[]) {
    if (ops.length === 0) return;
    this.update((d) => applyOps(d, ops));
  }

  async listTransactions(month: Month) {
    return readLocal().transactions.filter((t) => t.month === month);
  }
  async saveTransactions(txs: Transaction[]) {
    this.update((d) => applyOp(d, { kind: "transactions", txs }));
  }
  async deleteTransaction(id: string) {
    this.update((d) => ({ ...d, transactions: d.transactions.filter((t) => t.id !== id) }));
  }
  async listRules() {
    return readLocal().rules;
  }
  async saveRule(rule: Rule) {
    this.update((d) => ({ ...d, rules: upsert(d.rules, rule, (a, b) => a.id === b.id) }));
  }
  async deleteRule(id: string) {
    this.update((d) => ({ ...d, rules: d.rules.filter((r) => r.id !== id) }));
  }
  async listChannelSales(month: Month) {
    return readLocal().channelSales.filter((s) => s.month === month);
  }
  async saveChannelSales(sales: ChannelSale[]) {
    this.update((d) => ({
      ...d,
      channelSales: sales.reduce(
        (acc, s) => upsert(acc, s, (a, b) => a.month === b.month && a.channel === b.channel),
        d.channelSales,
      ),
    }));
  }
  async getClosing(month: Month) {
    return readLocal().closings.find((c) => c.month === month) ?? null;
  }
  async saveClosing(c: MonthClosing) {
    this.update((d) => ({ ...d, closings: upsert(d.closings, c, (a, b) => a.month === b.month) }));
  }
  async listUploads() {
    return readLocal().uploads;
  }
  async saveUpload(u: UploadRecord) {
    this.update((d) => applyOp(d, { kind: "upload", record: u }));
  }
  async deleteMonth(month: Month) {
    this.update((d) => ({
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
    return readLocal().dailySales.filter((s) => s.date.startsWith(month));
  }
  async saveDailySales(date: string, sales: DailySale[]) {
    this.update((d) => applyOp(d, { kind: "dailySales", date, sales }));
  }
  async listShifts(month: Month) {
    return readLocal().shifts.filter((s) => s.date.startsWith(month));
  }
  async saveShifts(date: string, shifts: Shift[]) {
    this.update((d) => applyOp(d, { kind: "shifts", date, shifts }));
  }
  async listStaff() {
    return readLocal().staff;
  }
  async saveStaff(staff: Staff) {
    this.update((d) => ({ ...d, staff: upsert(d.staff, staff, (a, b) => a.id === b.id) }));
  }
  async listAllDailySales() {
    return readLocal().dailySales;
  }
  async listAllShifts() {
    return readLocal().shifts;
  }
  async listWeather(from: string, to: string) {
    return readLocal().weather.filter((w) => w.date >= from && w.date <= to);
  }
  async saveWeather(records: DailyWeather[]) {
    this.update((d) => ({ ...d, weather: records.reduce((acc, w) => upsert(acc, w, (a, b) => a.date === b.date), d.weather) }));
  }
  async getSetting<T>(key: string) {
    return (readLocal().settings.find((s) => s.key === key)?.value as T | undefined) ?? null;
  }
  async saveSetting<T>(key: string, value: T) {
    this.update((d) => applyOp(d, { kind: "setting", key, value }));
  }
}
