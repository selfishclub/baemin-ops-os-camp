import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { PhotoMeta } from "./photos";

// 영수증 사진 백업·복원 — IndexedDB 의 사진을 ZIP 한 개로 내려받고, 그 ZIP 을 검사해서 다시 넣는다.
//  - ZIP 안: manifest.json + photos/0001_<id>.jpg … (경로는 고정 규칙, 사용자 파일명은 manifest 에만)
//  - 사진은 이미 JPEG 로 압축돼 있어 "저장만"(level 0) 한다. 바이트가 그대로 보존된다.
//  - 사진마다 SHA-256 을 manifest 에 적어 복원 때 하나하나 맞춰 본다.
//  - 여기에는 브라우저 저장소를 건드리는 코드가 없다. 읽기(ZIP 만들기)·검사·계획까지만. 실제 쓰기는 PhotoWriter 로 넘긴다.

export const PHOTO_BACKUP_APP = "sootdak-ledger-photos";
export const PHOTO_BACKUP_FORMAT = 1;
const SUPPORTED_FORMATS = [1];
export const APP_VERSION = "v2";
const MANIFEST_PATH = "manifest.json";
const PATH_RULE = /^photos\/\d{4}_[A-Za-z0-9_-]{1,64}\.(jpg|png|webp|gif|bin)$/;

export interface PhotoManifestEntry {
  id: string;
  ownerId: string; // 영수증(매입) id 또는 고정비 id — 장부 설정 안에 있다
  name: string; // 원래 파일명 (표시용)
  type: string; // MIME
  size: number;
  addedAt: string;
  path: string; // ZIP 안 경로
  sha256: string; // 16진수 64자
}

export interface PhotoManifest {
  app: typeof PHOTO_BACKUP_APP;
  format: number;
  appVersion: string;
  createdAt: string;
  ledgerSavedAt: string | null; // 같은 시점에 받은 장부 백업(JSON)의 savedAt. 따로 받았으면 null
  ledgerOwnerIds: number; // 백업 당시 장부가 알던 영수증·고정비 id 수 (참고용)
  photos: PhotoManifestEntry[];
}

export interface PhotoBytes {
  meta: PhotoMeta;
  bytes: Uint8Array;
}

// ── 공통 ─────────────────────────────────────────────────────────
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function extOf(type: string): string {
  if (type === "image/jpeg" || type === "image/jpg") return "jpg";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  return "bin";
}

export function zipPathFor(index: number, id: string, type: string): string {
  const safe = id.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64) || "photo";
  return `photos/${String(index + 1).padStart(4, "0")}_${safe}.${extOf(type)}`;
}

export const mbText = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)}KB` : `${(bytes / 1024 / 1024).toFixed(1)}MB`);

// 브라우저 메모리를 생각한 한도. ZIP 을 통째로 메모리에 만들기 때문에 너무 크면 거절한다.
export const PHOTO_BACKUP_WARN_BYTES = 300 * 1024 * 1024;
export const PHOTO_BACKUP_MAX_BYTES = 1024 * 1024 * 1024;

// ── 만들기 ────────────────────────────────────────────────────────
export interface BuildOptions {
  ledgerSavedAt?: string | null;
  ledgerOwnerIds?: number;
  now?: string;
}

export async function buildPhotoBackup(photos: PhotoBytes[], opts: BuildOptions = {}): Promise<{ zip: Uint8Array; manifest: PhotoManifest }> {
  const totalBytes = photos.reduce((a, p) => a + p.bytes.length, 0);
  if (totalBytes > PHOTO_BACKUP_MAX_BYTES) throw new Error(`사진이 ${mbText(totalBytes)}라 한 번에 백업하기엔 너무 커요 (한도 ${mbText(PHOTO_BACKUP_MAX_BYTES)}). 나눠 받는 기능은 아직 없어요.`);
  const entries: PhotoManifestEntry[] = [];
  const files: Record<string, [Uint8Array, { level: 0 }]> = {};
  const seen = new Set<string>();
  for (let i = 0; i < photos.length; i++) {
    const { meta, bytes } = photos[i];
    if (seen.has(meta.id)) throw new Error(`같은 사진 식별자가 두 번 있어요: ${meta.id}`);
    seen.add(meta.id);
    const path = zipPathFor(i, meta.id, meta.type);
    entries.push({ id: meta.id, ownerId: meta.ownerId, name: meta.name, type: meta.type, size: bytes.length, addedAt: meta.addedAt, path, sha256: await sha256Hex(bytes) });
    files[path] = [bytes, { level: 0 }];
  }
  const manifest: PhotoManifest = {
    app: PHOTO_BACKUP_APP,
    format: PHOTO_BACKUP_FORMAT,
    appVersion: APP_VERSION,
    createdAt: opts.now ?? new Date().toISOString(),
    ledgerSavedAt: opts.ledgerSavedAt ?? null,
    ledgerOwnerIds: opts.ledgerOwnerIds ?? 0,
    photos: entries,
  };
  const zip = zipSync({ [MANIFEST_PATH]: [strToU8(JSON.stringify(manifest, null, 2)), { level: 6 }], ...files });
  return { zip, manifest };
}

// ── 검사 ─────────────────────────────────────────────────────────
export interface PhotoBackupEntry {
  entry: PhotoManifestEntry;
  bytes: Uint8Array;
}
export type PhotoBackupInspection =
  | { ok: false; errors: string[] }
  | { ok: true; manifest: PhotoManifest; entries: PhotoBackupEntry[]; totalBytes: number; warnings: string[] };

const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const MAX_ERRORS = 12;

export async function inspectPhotoBackup(zipBytes: Uint8Array): Promise<PhotoBackupInspection> {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(zipBytes);
  } catch {
    return { ok: false, errors: ["ZIP 파일을 열지 못했어요. 손상됐거나 ZIP 이 아니에요."] };
  }
  const manifestBytes = files[MANIFEST_PATH];
  if (!manifestBytes) return { ok: false, errors: ["ZIP 안에 manifest.json 이 없어요. 이 도구의 사진 백업이 아니에요."] };
  let m: unknown;
  try {
    m = JSON.parse(strFromU8(manifestBytes));
  } catch {
    return { ok: false, errors: ["manifest.json 을 읽지 못했어요 (JSON 아님)."] };
  }
  if (!m || typeof m !== "object" || Array.isArray(m)) return { ok: false, errors: ["manifest.json 의 모양이 틀려요."] };
  const man = m as Record<string, unknown>;
  if (man.app !== PHOTO_BACKUP_APP) return { ok: false, errors: ["이 도구의 사진 백업 파일이 아니에요 (앱 표시가 달라요)."] };
  if (!isNum(man.format)) return { ok: false, errors: ["백업 형식 버전이 없어요."] };
  if (!SUPPORTED_FORMATS.includes(man.format)) return { ok: false, errors: [man.format > PHOTO_BACKUP_FORMAT ? `새 형식(${man.format})의 사진 백업이라 이 앱(형식 ${PHOTO_BACKUP_FORMAT})에서는 불러올 수 없어요.` : `지원하지 않는 사진 백업 형식(${man.format})이에요.`] };
  if (!Array.isArray(man.photos)) return { ok: false, errors: ["manifest.json 에 사진 목록(photos)이 없어요."] };

  const errors: string[] = [];
  const warnings: string[] = [];
  const err = (s: string) => {
    if (errors.length < MAX_ERRORS) errors.push(s);
  };
  const ids = new Set<string>();
  const paths = new Set<string>();
  const entries: PhotoBackupEntry[] = [];
  const list = man.photos as unknown[];
  for (let i = 0; i < list.length; i++) {
    const e = list[i] as Record<string, unknown>;
    const at = `사진 ${i + 1}번째`;
    if (!e || typeof e !== "object") {
      err(`${at}: 항목이 비어 있어요.`);
      continue;
    }
    if (!isStr(e.id) || !e.id) {
      err(`${at}: 식별자(id)가 없어요.`);
      continue;
    }
    if (ids.has(e.id)) err(`${at}: 같은 식별자가 두 번 있어요 (${e.id}).`);
    ids.add(e.id);
    if (!isStr(e.ownerId) || !e.ownerId) err(`${at}: 어느 영수증의 사진인지(ownerId)가 없어요.`);
    if (!isStr(e.path) || !PATH_RULE.test(e.path) || e.path.includes("..")) {
      err(`${at}: 허용되지 않는 경로예요 (${String(e.path)}).`);
      continue;
    }
    if (paths.has(e.path)) err(`${at}: 같은 경로가 두 번 있어요 (${e.path}).`);
    paths.add(e.path);
    if (!isNum(e.size) || e.size < 0) err(`${at}: 크기가 숫자가 아니에요.`);
    if (!isStr(e.sha256) || !/^[0-9a-f]{64}$/.test(e.sha256)) err(`${at}: 해시(sha256)가 없거나 모양이 틀려요.`);
    const bytes = files[e.path];
    if (!bytes) {
      err(`${at}: ZIP 안에 사진 파일이 없어요 (${e.path}). 불완전한 백업이에요.`);
      continue;
    }
    if (isNum(e.size) && bytes.length !== e.size) err(`${at}: 크기가 달라요 (manifest ${e.size}B, 실제 ${bytes.length}B).`);
    if (isStr(e.sha256) && errors.length < MAX_ERRORS) {
      const h = await sha256Hex(bytes);
      if (h !== e.sha256) err(`${at}: 해시가 달라요. 사진이 바뀌었거나 손상됐어요 (${e.path}).`);
    }
    entries.push({
      entry: { id: e.id, ownerId: String(e.ownerId ?? ""), name: isStr(e.name) ? e.name : "사진", type: isStr(e.type) ? e.type : "image/jpeg", size: bytes.length, addedAt: isStr(e.addedAt) ? e.addedAt : "", path: e.path, sha256: String(e.sha256) },
      bytes,
    });
  }
  if (errors.length) return { ok: false, errors };

  const extra = Object.keys(files).filter((p) => p !== MANIFEST_PATH && !paths.has(p));
  if (extra.length) warnings.push(`manifest 에 없는 파일 ${extra.length}개는 무시해요 (${extra.slice(0, 3).join(", ")}${extra.length > 3 ? " …" : ""}).`);
  const manifest: PhotoManifest = {
    app: PHOTO_BACKUP_APP,
    format: man.format,
    appVersion: isStr(man.appVersion) ? man.appVersion : "?",
    createdAt: isStr(man.createdAt) ? man.createdAt : "",
    ledgerSavedAt: isStr(man.ledgerSavedAt) ? man.ledgerSavedAt : null,
    ledgerOwnerIds: isNum(man.ledgerOwnerIds) ? man.ledgerOwnerIds : 0,
    photos: entries.map((x) => x.entry),
  };
  if (!manifest.createdAt) warnings.push("백업 만든 시각이 파일에 없어요.");
  return { ok: true, manifest, entries, totalBytes: entries.reduce((a, x) => a + x.bytes.length, 0), warnings };
}

// ── 복원 계획 ─────────────────────────────────────────────────────
// 기본 정책: 기존 사진은 지우지 않는다. 같은 id·같은 내용은 건너뛴다. 같은 id·다른 내용은 충돌로 표시하고 덮어쓰지 않는다.
// 새 사진만 더한다. ownerId 는 바꾸지 않는다.
export type PlanKind = "add" | "skip" | "conflict";
export interface PlanItem {
  entry: PhotoManifestEntry;
  bytes: Uint8Array;
  kind: PlanKind;
  linked: boolean; // ownerId 가 지금 장부의 영수증·고정비에 있는가
}
export interface PhotoRestorePlan {
  items: PlanItem[];
  add: number;
  skip: number;
  conflict: number;
  linked: number; // 더할 사진 중 연결되는 것
  unlinked: number; // 더할 사진 중 연결 안 되는 것 (장부에 그 영수증이 없음)
  addBytes: number;
}

export function planPhotoRestore(ins: Extract<PhotoBackupInspection, { ok: true }>, existingSha: Map<string, string>, ownerIds: Set<string>): PhotoRestorePlan {
  const items: PlanItem[] = ins.entries.map(({ entry, bytes }) => {
    const existing = existingSha.get(entry.id);
    const kind: PlanKind = existing === undefined ? "add" : existing === entry.sha256 ? "skip" : "conflict";
    return { entry, bytes, kind, linked: ownerIds.has(entry.ownerId) };
  });
  const adds = items.filter((x) => x.kind === "add");
  return {
    items,
    add: adds.length,
    skip: items.filter((x) => x.kind === "skip").length,
    conflict: items.filter((x) => x.kind === "conflict").length,
    linked: adds.filter((x) => x.linked).length,
    unlinked: adds.filter((x) => !x.linked).length,
    addBytes: adds.reduce((a, x) => a + x.bytes.length, 0),
  };
}

// ── 쓰기 (저장소는 바깥에서 넘겨받는다) ─────────────────────────────
export interface PhotoWriteRecord {
  meta: PhotoMeta;
  blob: Blob;
}
export interface PhotoWriter {
  // 전부 저장되거나 하나도 저장되지 않아야 한다 (IndexedDB 는 한 트랜잭션으로 그렇게 된다)
  addAll(records: PhotoWriteRecord[]): Promise<void>;
}
export interface PhotoRestoreResult {
  added: number;
  skipped: number;
  conflicts: number;
  error: string | null; // 있으면 added 는 0 — 하나도 저장되지 않았다
}

export async function restorePhotos(plan: PhotoRestorePlan, writer: PhotoWriter): Promise<PhotoRestoreResult> {
  const records: PhotoWriteRecord[] = plan.items
    .filter((x) => x.kind === "add")
    .map(({ entry, bytes }) => ({
      meta: { id: entry.id, ownerId: entry.ownerId, name: entry.name, type: entry.type, size: bytes.length, addedAt: entry.addedAt || new Date().toISOString() },
      blob: new Blob([bytes as BlobPart], { type: entry.type }),
    }));
  if (records.length === 0) return { added: 0, skipped: plan.skip, conflicts: plan.conflict, error: null };
  try {
    await writer.addAll(records);
    return { added: records.length, skipped: plan.skip, conflicts: plan.conflict, error: null };
  } catch (e) {
    return { added: 0, skipped: plan.skip, conflicts: plan.conflict, error: e instanceof Error ? e.message : String(e) };
  }
}

// 마지막 사진 백업 시각 (내려받기 시작 시각). 장부 저장 키와 별개.
export const LAST_PHOTO_BACKUP_KEY = "sootdak-ledger-last-photo-backup";
export function readLastPhotoBackupAt(): string | null {
  try {
    return window.localStorage.getItem(LAST_PHOTO_BACKUP_KEY);
  } catch {
    return null;
  }
}
export function markPhotoBackupStarted(at = new Date().toISOString()) {
  try {
    window.localStorage.setItem(LAST_PHOTO_BACKUP_KEY, at);
  } catch {}
}
