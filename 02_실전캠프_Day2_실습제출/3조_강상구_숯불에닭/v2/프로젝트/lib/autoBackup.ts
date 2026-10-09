import { sha256Hex } from "./photoBackup";

// 브라우저 쪽 자동 백업 — 언제·무엇을 백업할지 정하고, 서버에 보내고, 결과를 기록한다.
// 서버는 브라우저 저장소를 못 읽으므로, 앱이 열려 있을 때 브라우저가 장부 JSON·사진 ZIP 을 만들어 보낸다.
// 브라우저가 닫혀 있으면 아무 일도 일어나지 않는다 — 화면에 그렇게 적는다.
//
// 정책
//  - 장부가 바뀌면 30초 뒤 장부 백업 (연속으로 바뀌면 마지막 변경 기준으로 한 번만 = debounce)
//  - 전체(장부+사진) 백업은 하루 1회. 사진이 바뀌었는데 아직 사진 백업이 없으면 전체로
//  - 실패하면 2분 → 4분 → 8분 … 최대 30분 간격으로 다시. 3번 연속 실패하면 경고
//  - "서버가 검증까지 끝냈다"는 응답을 받았을 때만 성공으로 적는다
//  - 오래된 백업은 지우지 않는다 (서버도 브라우저도)

export const AUTO_BACKUP_KEY = "sootdak-ledger-auto-backup";
export const DEBOUNCE_MS = 30_000;
export const FULL_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const RETRY_BASE_MS = 2 * 60 * 1000;
export const RETRY_MAX_MS = 30 * 60 * 1000;
export const WARN_FAILURES = 3;
export const GIVE_UP_FAILURES = 6; // 그 뒤로는 사장님이 "지금 백업"을 눌러야 다시 시도

export type BackupMode = "ledger" | "full";

export interface AutoBackupState {
  lastLedgerOkAt: string | null; // 서버가 검증한 마지막 장부 백업
  lastPhotosOkAt: string | null;
  lastFullOkAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  failures: number; // 연속 실패 수
  ledgerChangedAt: string | null; // 마지막으로 장부가 바뀐 시각
  photosChangedAt: string | null;
}

export const emptyAutoState = (): AutoBackupState => ({
  lastLedgerOkAt: null,
  lastPhotosOkAt: null,
  lastFullOkAt: null,
  lastAttemptAt: null,
  lastError: null,
  failures: 0,
  ledgerChangedAt: null,
  photosChangedAt: null,
});

export function readAutoState(): AutoBackupState {
  try {
    const raw = window.localStorage.getItem(AUTO_BACKUP_KEY);
    if (!raw) return emptyAutoState();
    return { ...emptyAutoState(), ...(JSON.parse(raw) as Partial<AutoBackupState>) };
  } catch {
    return emptyAutoState();
  }
}
export function writeAutoState(s: AutoBackupState) {
  try {
    window.localStorage.setItem(AUTO_BACKUP_KEY, JSON.stringify(s));
  } catch {}
}

// ── 판단 (순수 함수) ─────────────────────────────────────────────
const after = (a: string | null, b: string | null) => !!a && (!b || a > b);

export function photosDirty(s: AutoBackupState): boolean {
  return after(s.photosChangedAt, s.lastPhotosOkAt);
}
export function ledgerDirty(s: AutoBackupState): boolean {
  return after(s.ledgerChangedAt, s.lastLedgerOkAt);
}
export function fullDue(s: AutoBackupState, now: Date): boolean {
  if (!s.lastFullOkAt) return true;
  return now.getTime() - new Date(s.lastFullOkAt).getTime() >= FULL_INTERVAL_MS;
}
// 지금 무엇을 백업해야 하나. null 이면 할 일 없음.
export function planAutoBackup(s: AutoBackupState, now: Date): BackupMode | null {
  if (fullDue(s, now) || photosDirty(s)) return "full";
  if (ledgerDirty(s)) return "ledger";
  return null;
}
// "전부 백업돼 있다"고 말해도 되나 — 장부 성공만으로는 안 된다
export function isFullyBackedUp(s: AutoBackupState): boolean {
  return !!s.lastFullOkAt && !ledgerDirty(s) && !photosDirty(s);
}
export function retryDelayMs(failures: number): number {
  return Math.min(RETRY_BASE_MS * 2 ** Math.max(0, failures - 1), RETRY_MAX_MS);
}
export function shouldWarn(s: AutoBackupState): boolean {
  return s.failures >= WARN_FAILURES;
}

// ── debounce ─────────────────────────────────────────────────────
export interface Timers {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (h: unknown) => void;
}
export class Debouncer {
  private handle: unknown = null;
  constructor(
    private ms: number,
    private timers: Timers = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) },
  ) {}
  get pending() {
    return this.handle !== null;
  }
  schedule(fn: () => void) {
    if (this.handle !== null) this.timers.clearTimeout(this.handle);
    this.handle = this.timers.setTimeout(() => {
      this.handle = null;
      fn();
    }, this.ms);
  }
  cancel() {
    if (this.handle !== null) this.timers.clearTimeout(this.handle);
    this.handle = null;
  }
}

// ── 서버와 주고받기 ────────────────────────────────────────────────
export interface ServerManifest {
  id: string;
  mode: BackupMode;
  storedAt: string;
  verified: true;
  ledger: { file: string; sha256: string; size: number };
  photos: { file: string; sha256: string; size: number; count: number } | null;
}
export interface ServerStatus {
  enabled: boolean;
  reason: string | null;
  maxBytes?: number;
  status?: {
    dir: string;
    lastLedgerOkAt: string | null;
    lastPhotosOkAt: string | null;
    lastFullOkAt: string | null;
    verifiedCount: number;
    incompleteCount: number;
    leftoverTempCount: number;
    totalBytes: number;
    recent: { id: string; mode: BackupMode; storedAt: string; verified: boolean; size: number }[];
  };
}

export class BackupClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "BackupClientError";
  }
}

export interface BackupDeps {
  fetchFn: typeof fetch;
  session: () => Promise<string>; // 세션 토큰 (메모리에만)
  getLedgerText: () => string; // exportBackup()
  getPhotosZip: () => Promise<{ zip: Uint8Array; count: number }>;
  newId: () => string;
  now: () => Date;
}

const headersFor = (token: string, extra: Record<string, string> = {}) => ({ "x-backup-client": "1", "x-backup-session": token, ...extra });

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function post(deps: BackupDeps, path: string, token: string, body: BodyInit, extra: Record<string, string>) {
  const res = await deps.fetchFn(path, { method: "POST", headers: headersFor(token, extra), body });
  const j = await readJson(res);
  if (!res.ok || j.ok !== true) throw new BackupClientError(typeof j.error === "string" ? j.error : `서버 응답 ${res.status}`, res.status);
  return j;
}

// 한 번의 백업: 업로드(장부[, 사진]) → 마무리. 서버가 검증한 manifest 를 돌려준다. 어느 단계든 실패하면 던진다.
export async function runBackupUpload(mode: BackupMode, deps: BackupDeps): Promise<ServerManifest> {
  const token = await deps.session();
  const id = deps.newId();
  const createdAt = deps.now().toISOString();
  const ledgerText = deps.getLedgerText();
  const ledgerBytes = new TextEncoder().encode(ledgerText);
  const ledgerSha = await sha256Hex(ledgerBytes);
  await post(deps, "/api/backup/upload", token, ledgerBytes as BodyInit, { "x-backup-id": id, "x-backup-kind": "ledger", "x-backup-sha256": ledgerSha, "content-type": "application/octet-stream" });
  let photos: { sha256: string; size: number; count: number } | null = null;
  if (mode === "full") {
    const { zip, count } = await deps.getPhotosZip();
    const zipSha = await sha256Hex(zip);
    await post(deps, "/api/backup/upload", token, zip as BodyInit, { "x-backup-id": id, "x-backup-kind": "photos", "x-backup-sha256": zipSha, "content-type": "application/octet-stream" });
    photos = { sha256: zipSha, size: zip.length, count };
  }
  const j = await post(deps, "/api/backup/finalize", token, JSON.stringify({ id, createdAt, mode, ledger: { sha256: ledgerSha, size: ledgerBytes.length }, photos }), { "content-type": "application/json" });
  const m = j.manifest as ServerManifest | undefined;
  if (!m || m.verified !== true || m.id !== id) throw new BackupClientError("서버가 검증을 끝내지 못했어요.", 500);
  return m;
}

export async function fetchSession(fetchFn: typeof fetch): Promise<{ token: string } | { disabled: string }> {
  const res = await fetchFn("/api/backup/session", { method: "POST", headers: { "x-backup-client": "1" } });
  const j = await readJson(res);
  if (res.status === 503) return { disabled: typeof j.error === "string" ? j.error : "자동 백업이 꺼져 있어요." };
  if (!res.ok || typeof j.token !== "string") throw new BackupClientError(typeof j.error === "string" ? j.error : `세션을 받지 못했어요 (${res.status})`, res.status);
  return { token: j.token };
}

export async function fetchStatus(fetchFn: typeof fetch, token: string): Promise<ServerStatus> {
  const res = await fetchFn("/api/backup/status", { headers: headersFor(token) });
  const j = await readJson(res);
  if (!res.ok) throw new BackupClientError(typeof j.error === "string" ? j.error : `상태를 받지 못했어요 (${res.status})`, res.status);
  return j as unknown as ServerStatus;
}

// 성공·실패를 상태에 적는다 (순수)
export function applySuccess(s: AutoBackupState, mode: BackupMode, storedAt: string): AutoBackupState {
  return { ...s, lastAttemptAt: storedAt, lastError: null, failures: 0, lastLedgerOkAt: storedAt, lastPhotosOkAt: mode === "full" ? storedAt : s.lastPhotosOkAt, lastFullOkAt: mode === "full" ? storedAt : s.lastFullOkAt };
}
export function applyFailure(s: AutoBackupState, message: string, at: string): AutoBackupState {
  return { ...s, lastAttemptAt: at, lastError: message, failures: s.failures + 1 };
}

// ── 화면과 에이전트가 주고받는 작은 통로 ───────────────────────────
export interface AgentView {
  server: ServerStatus | null; // null = 아직 모름
  state: AutoBackupState;
  running: BackupMode | null;
  nextRetryAt: string | null;
}
type Listener = (v: AgentView) => void;
const listeners = new Set<Listener>();
let view: AgentView = { server: null, state: emptyAutoState(), running: null, nextRetryAt: null };
export function publishView(v: AgentView) {
  view = v;
  for (const fn of listeners) {
    try {
      fn(v);
    } catch {}
  }
}
export function subscribeView(fn: Listener): () => void {
  listeners.add(fn);
  fn(view);
  return () => listeners.delete(fn);
}
type Runner = (mode: BackupMode) => void;
let runner: Runner | null = null;
export function setManualRunner(r: Runner | null) {
  runner = r;
}
export function requestManualBackup(mode: BackupMode) {
  runner?.(mode);
}
