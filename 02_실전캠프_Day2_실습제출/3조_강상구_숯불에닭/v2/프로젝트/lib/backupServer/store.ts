import { createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { inspectBackup } from "../storage/backup";
import { inspectPhotoBackup } from "../photoBackup";

// 백업 폴더에 파일을 "안전하게" 쓴다.
//  1) 업로드는 먼저 <kind>-<id>.part 임시 파일로 받는다 (스트림 → 디스크, 메모리에 통째로 올리지 않음). 받으면서 SHA-256 을 센다.
//  2) 마무리(finalize) 때 임시 파일을 디스크에서 다시 읽어 해시를 또 재고, 장부 JSON·사진 ZIP 의 구조를 검사한다.
//  3) 전부 통과하면 최종 이름으로 복사한다 (COPYFILE_EXCL: 같은 이름이 있으면 실패 — 덮어쓰기 금지). 마지막에 manifest 를 쓴다.
//  4) 하나라도 실패하면 최종 파일은 만들지 않고, "불완전" manifest(.incomplete.json)를 남긴 뒤 임시 파일을 지운다.
//  5) 이 코드는 기존 백업 파일을 절대 지우지 않는다. 지우는 건 자기가 만든 .part 뿐이다.

export const BACKUP_FORMAT = 1;
const ID_RULE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export type Kind = "ledger" | "photos";
const KINDS: Kind[] = ["ledger", "photos"];

export interface StoreFs {
  mkdir(dir: string): Promise<void>;
  createWriteStream(file: string): NodeJS.WritableStream;
  readFile(file: string): Promise<Buffer>;
  stat(file: string): Promise<{ size: number; mtimeMs: number }>;
  exists(file: string): Promise<boolean>;
  copyExcl(from: string, to: string): Promise<void>; // 대상이 있으면 실패해야 한다
  unlink(file: string): Promise<void>;
  readdir(dir: string): Promise<string[]>;
  writeFile(file: string, text: string): Promise<void>;
}

export const realFs: StoreFs = {
  mkdir: (d) => fsp.mkdir(d, { recursive: true }).then(() => {}),
  createWriteStream: (f) => fs.createWriteStream(f, { flags: "wx" }),
  readFile: (f) => fsp.readFile(f),
  stat: (f) => fsp.stat(f).then((s) => ({ size: s.size, mtimeMs: s.mtimeMs })),
  exists: (f) =>
    fsp
      .access(f)
      .then(() => true)
      .catch(() => false),
  copyExcl: (a, b) => fsp.copyFile(a, b, fs.constants.COPYFILE_EXCL),
  unlink: (f) => fsp.unlink(f),
  readdir: (d) => fsp.readdir(d),
  writeFile: (f, t) => fsp.writeFile(f, t, { encoding: "utf8", flag: "wx" }),
};

export interface StoreCtx {
  dir: string;
  maxBytes: number;
  fs?: StoreFs;
  now?: () => Date;
}

export class BackupError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = "BackupError";
  }
}

const sha256 = (buf: Buffer) => createHash("sha256").update(buf).digest("hex");
export const isValidId = (id: unknown): id is string => typeof id === "string" && ID_RULE.test(id);
const tempName = (kind: Kind, id: string) => `${kind}-${id}.part`;
const stamp = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};
// 폴더 밖으로 나가는 경로를 만들지 않는다 — 이름은 우리가 정한 규칙으로만 만들고, 결과가 dir 안인지 다시 확인한다
function inside(dir: string, name: string): string {
  const full = path.join(dir, name);
  const rel = path.relative(dir, full);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel) || rel.includes(path.sep)) throw new BackupError("허용되지 않는 파일 경로예요.", 400);
  return full;
}

// ── 1) 업로드 받기 ─────────────────────────────────────────────────
export interface UploadResult {
  kind: Kind;
  id: string;
  size: number;
  sha256: string;
}

export async function receiveUpload(ctx: StoreCtx, kind: Kind, id: string, body: ReadableStream<Uint8Array> | null, claimedSha: string | null): Promise<UploadResult> {
  const f = ctx.fs ?? realFs;
  if (!KINDS.includes(kind)) throw new BackupError("알 수 없는 종류예요.", 400);
  if (!isValidId(id)) throw new BackupError("백업 식별자 형식이 틀려요.", 400);
  if (!body) throw new BackupError("보낸 내용이 비어 있어요.", 400);
  await f.mkdir(ctx.dir);
  const temp = inside(ctx.dir, tempName(kind, id));
  if (await f.exists(temp)) throw new BackupError("같은 백업을 이미 받는 중이에요 (중복 요청).", 409);

  const hash = createHash("sha256");
  let size = 0;
  const limit = ctx.maxBytes;
  const counter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      size += chunk.length;
      if (size > limit) return cb(new BackupError(`파일이 너무 커요 (한도 ${Math.round(limit / 1024 / 1024)}MB).`, 413));
      hash.update(chunk);
      cb(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(body as import("stream/web").ReadableStream<Uint8Array>), counter, f.createWriteStream(temp));
  } catch (e) {
    await f.unlink(temp).catch(() => {});
    if (e instanceof BackupError) throw e;
    throw new BackupError(`파일을 저장하지 못했어요: ${describeFsError(e)}`, 500);
  }
  const digest = hash.digest("hex");
  if (claimedSha && claimedSha !== digest) {
    await f.unlink(temp).catch(() => {});
    throw new BackupError("보낸 파일의 해시가 브라우저가 말한 값과 달라요. 전송 중에 바뀌었어요.", 422);
  }
  return { kind, id, size, sha256: digest };
}

// ── 2) 마무리: 검증 → 최종 파일 → manifest ─────────────────────────
export interface FinalizeClaim {
  id: string;
  createdAt: string; // 브라우저가 만든 시각 (참고). 파일 이름은 서버 시각으로
  mode: "ledger" | "full";
  ledger: { sha256: string; size: number };
  photos: { sha256: string; size: number; count: number } | null;
}

export interface BackupManifest {
  app: "sootdak-ledger-backup";
  format: number;
  id: string;
  mode: "ledger" | "full";
  createdAt: string; // 브라우저 시각
  storedAt: string; // 서버 시각
  ledger: { file: string; sha256: string; size: number; transactions: number; dailySales: number };
  photos: { file: string; sha256: string; size: number; count: number } | null;
  verified: true;
  verifiedAt: string;
}

export interface IncompleteManifest {
  app: "sootdak-ledger-backup";
  format: number;
  id: string;
  mode: "ledger" | "full";
  createdAt: string;
  storedAt: string;
  verified: false;
  error: string;
}

export async function finalizeBackup(ctx: StoreCtx, claim: FinalizeClaim): Promise<BackupManifest> {
  const f = ctx.fs ?? realFs;
  const now = (ctx.now ?? (() => new Date()))();
  if (!isValidId(claim.id)) throw new BackupError("백업 식별자 형식이 틀려요.", 400);
  if (claim.mode !== "ledger" && claim.mode !== "full") throw new BackupError("백업 종류가 틀려요.", 400);
  if (claim.mode === "full" && !claim.photos) throw new BackupError("전체 백업인데 사진 정보가 없어요.", 400);
  if (claim.mode === "ledger" && claim.photos) throw new BackupError("장부만 백업인데 사진 정보가 있어요.", 400);
  const createdAt = typeof claim.createdAt === "string" && !Number.isNaN(Date.parse(claim.createdAt)) ? claim.createdAt : now.toISOString();
  const s = stamp(now);
  const ledgerTemp = inside(ctx.dir, tempName("ledger", claim.id));
  const photosTemp = inside(ctx.dir, tempName("photos", claim.id));
  const made: string[] = [];

  const fail = async (message: string, status = 422): Promise<never> => {
    // 불완전 표시를 남기고, 내가 만든 것만 지운다
    const inc: IncompleteManifest = { app: "sootdak-ledger-backup", format: BACKUP_FORMAT, id: claim.id, mode: claim.mode, createdAt, storedAt: now.toISOString(), verified: false, error: message };
    await f.writeFile(inside(ctx.dir, `backup-manifest-${s}-${claim.id}.incomplete.json`), JSON.stringify(inc, null, 2)).catch(() => {});
    for (const p of made) await f.unlink(p).catch(() => {});
    await f.unlink(ledgerTemp).catch(() => {});
    await f.unlink(photosTemp).catch(() => {});
    throw new BackupError(message, status);
  };

  // 아무것도 받은 게 없으면 불완전 기록도 남기지 않는다 (세션만 있으면 누구나 폴더에 파일을 쌓을 수 있게 되므로)
  if (!(await f.exists(ledgerTemp))) throw new BackupError("장부 파일이 아직 안 올라왔어요.", 422);

  try {
    // 장부: 임시 파일 존재 → 다시 읽어 해시·크기 → 구조 검사
    const ledgerBuf = await f.readFile(ledgerTemp);
    if (ledgerBuf.length !== claim.ledger.size) return fail(`장부 파일 크기가 달라요 (받은 ${ledgerBuf.length}B, 말한 ${claim.ledger.size}B).`);
    const ledgerSha = sha256(ledgerBuf);
    if (ledgerSha !== claim.ledger.sha256) return fail("장부 파일의 해시가 달라요. 디스크에 쓰인 내용이 브라우저가 보낸 것과 다르거나 전송 중 깨졌어요.");
    const ins = inspectBackup(ledgerBuf.toString("utf8"));
    if (!ins.ok) return fail(`장부 파일이 복원 가능한 백업이 아니에요: ${ins.errors[0]}`);

    // 사진
    let photosInfo: BackupManifest["photos"] = null;
    let photosOut: string | null = null;
    if (claim.mode === "full" && claim.photos) {
      if (!(await f.exists(photosTemp))) return fail("사진 파일이 아직 안 올라왔어요.");
      const zipBuf = await f.readFile(photosTemp);
      if (zipBuf.length !== claim.photos.size) return fail(`사진 파일 크기가 달라요 (받은 ${zipBuf.length}B, 말한 ${claim.photos.size}B).`);
      const zipSha = sha256(zipBuf);
      if (zipSha !== claim.photos.sha256) return fail("사진 파일의 해시가 달라요.");
      const pins = await inspectPhotoBackup(new Uint8Array(zipBuf));
      if (!pins.ok) return fail(`사진 파일이 복원 가능한 백업이 아니에요: ${pins.errors[0]}`);
      if (pins.entries.length !== claim.photos.count) return fail(`사진 수가 달라요 (ZIP 안 ${pins.entries.length}장, 말한 ${claim.photos.count}장).`);
      photosOut = `photos-${s}-${claim.id}.zip`;
      photosInfo = { file: photosOut, sha256: zipSha, size: zipBuf.length, count: pins.entries.length };
    } else if (await f.exists(photosTemp)) {
      await f.unlink(photosTemp).catch(() => {}); // 장부만 백업인데 사진 임시 파일이 남아 있으면 치운다
    }

    // 최종 파일 (덮어쓰기 금지)
    const ledgerOut = `ledger-${s}-${claim.id}.json`;
    try {
      await f.copyExcl(ledgerTemp, inside(ctx.dir, ledgerOut));
      made.push(inside(ctx.dir, ledgerOut));
      if (photosOut) {
        await f.copyExcl(photosTemp, inside(ctx.dir, photosOut));
        made.push(inside(ctx.dir, photosOut));
      }
    } catch (e) {
      return fail(`최종 파일을 만들지 못했어요: ${describeFsError(e)}`, 500);
    }
    // 복사본을 다시 읽어 해시 확인 — "존재한다"가 아니라 "내용이 같다"를 본다
    const outLedger = await f.readFile(inside(ctx.dir, ledgerOut));
    if (sha256(outLedger) !== ledgerSha) return fail("최종 장부 파일을 다시 읽었더니 해시가 달라요 (디스크 오류 가능).", 500);
    if (photosOut && photosInfo) {
      const outZip = await f.readFile(inside(ctx.dir, photosOut));
      if (sha256(outZip) !== photosInfo.sha256) return fail("최종 사진 파일을 다시 읽었더니 해시가 달라요 (디스크 오류 가능).", 500);
    }

    const manifest: BackupManifest = {
      app: "sootdak-ledger-backup",
      format: BACKUP_FORMAT,
      id: claim.id,
      mode: claim.mode,
      createdAt,
      storedAt: now.toISOString(),
      ledger: { file: ledgerOut, sha256: ledgerSha, size: ledgerBuf.length, transactions: ins.summary.transactions, dailySales: ins.summary.dailySales },
      photos: photosInfo,
      verified: true,
      verifiedAt: new Date().toISOString(),
    };
    const manifestName = `backup-manifest-${s}-${claim.id}.json`;
    try {
      await f.writeFile(inside(ctx.dir, manifestName), JSON.stringify(manifest, null, 2));
    } catch (e) {
      return fail(`백업 기록(manifest)을 쓰지 못했어요: ${describeFsError(e)}`, 500);
    }
    await f.unlink(ledgerTemp).catch(() => {});
    await f.unlink(photosTemp).catch(() => {});
    return manifest;
  } catch (e) {
    if (e instanceof BackupError) throw e;
    return fail(`백업을 마무리하지 못했어요: ${describeFsError(e)}`, 500);
  }
}

// ── 3) 상태 ──────────────────────────────────────────────────────
export interface BackupStatus {
  dir: string;
  lastLedgerOkAt: string | null; // 장부가 검증된 가장 최근 (장부만·전체 모두 포함)
  lastPhotosOkAt: string | null;
  lastFullOkAt: string | null;
  verifiedCount: number;
  incompleteCount: number;
  leftoverTempCount: number;
  totalBytes: number; // 최종 파일 합계 (manifest 기준)
  recent: { id: string; mode: "ledger" | "full"; storedAt: string; verified: boolean; size: number }[];
}

export async function readBackupStatus(ctx: StoreCtx): Promise<BackupStatus> {
  const f = ctx.fs ?? realFs;
  const out: BackupStatus = { dir: ctx.dir, lastLedgerOkAt: null, lastPhotosOkAt: null, lastFullOkAt: null, verifiedCount: 0, incompleteCount: 0, leftoverTempCount: 0, totalBytes: 0, recent: [] };
  let names: string[];
  try {
    names = await f.readdir(ctx.dir);
  } catch {
    return out; // 폴더가 아직 없음 = 백업 0개
  }
  out.leftoverTempCount = names.filter((n) => n.endsWith(".part")).length;
  const rows: BackupStatus["recent"] = [];
  for (const n of names) {
    if (!n.startsWith("backup-manifest-") || !n.endsWith(".json")) continue;
    // 검증된 것과 불완전한 것이 섞여 있으므로 느슨한 모양으로 읽는다
    let m: { app?: unknown; id?: unknown; storedAt?: unknown; verified?: unknown; mode?: "ledger" | "full"; ledger?: { size?: number }; photos?: { size?: number } | null };
    try {
      m = JSON.parse((await f.readFile(inside(ctx.dir, n))).toString("utf8"));
    } catch {
      continue;
    }
    if (m.app !== "sootdak-ledger-backup" || !isValidId(m.id) || typeof m.storedAt !== "string") continue;
    if (m.verified === true && m.ledger) {
      out.verifiedCount += 1;
      const size = (m.ledger.size ?? 0) + (m.photos?.size ?? 0);
      out.totalBytes += size;
      if (!out.lastLedgerOkAt || m.storedAt > out.lastLedgerOkAt) out.lastLedgerOkAt = m.storedAt;
      if (m.photos && (!out.lastPhotosOkAt || m.storedAt > out.lastPhotosOkAt)) out.lastPhotosOkAt = m.storedAt;
      if (m.mode === "full" && (!out.lastFullOkAt || m.storedAt > out.lastFullOkAt)) out.lastFullOkAt = m.storedAt;
      rows.push({ id: m.id, mode: m.mode ?? "ledger", storedAt: m.storedAt, verified: true, size });
    } else {
      out.incompleteCount += 1;
      rows.push({ id: m.id, mode: m.mode ?? "ledger", storedAt: m.storedAt, verified: false, size: 0 });
    }
  }
  out.recent = rows.sort((a, b) => (a.storedAt < b.storedAt ? 1 : -1)).slice(0, 10);
  return out;
}

function describeFsError(e: unknown): string {
  const code = (e as { code?: string })?.code;
  if (code === "ENOSPC") return "디스크 공간이 부족해요";
  if (code === "EACCES" || code === "EPERM") return "폴더에 쓸 권한이 없어요";
  if (code === "EEXIST") return "같은 이름의 파일이 이미 있어요 (덮어쓰지 않아요)";
  if (code === "ENOENT") return "폴더가 없어요";
  return e instanceof Error ? e.message : String(e);
}
