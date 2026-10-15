import type { BackupServerConfig } from "./config";
import { checkOrigin, checkSession, SessionStore } from "./guard";
import { BackupError, finalizeBackup, isValidId, readBackupStatus, receiveUpload, type FinalizeClaim, type Kind, type StoreFs } from "./store";

// 백업 API 처리기. Next 의 route.ts 는 이 함수들을 그대로 부른다.
// 표준 Request/Response 만 쓰므로 테스트에서 new Request(...) 로 바로 부를 수 있다.
// 로그에는 장부 내용·파일 내용을 절대 찍지 않는다 (여기서는 아무것도 찍지 않는다).

export interface ServerCtx {
  config: BackupServerConfig;
  sessions: SessionStore;
  fs?: StoreFs;
  now?: () => Date;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const err = (message: string, status: number) => json({ ok: false, error: message }, status);

function gate(req: Request, ctx: ServerCtx, needSession: boolean): Response | null {
  if (!ctx.config.enabled) return json({ ok: false, enabled: false, error: ctx.config.reason }, 503);
  const o = checkOrigin(req.headers);
  if (o) return err(o, 403);
  if (needSession) {
    const s = checkSession(req.headers, ctx.sessions);
    if (s) return err(s, 401);
  }
  return null;
}

// POST /api/backup/session → 세션 토큰 발급 (앱 화면이 열릴 때 한 번)
export async function handleSession(req: Request, ctx: ServerCtx): Promise<Response> {
  if (req.method !== "POST") return err("POST 만 받아요.", 405);
  const g = gate(req, ctx, false);
  if (g) return g;
  return json({ ok: true, token: ctx.sessions.issue() });
}

// POST /api/backup/upload  (헤더: x-backup-id, x-backup-kind, x-backup-sha256 / 본문: 파일 바이트 그대로)
export async function handleUpload(req: Request, ctx: ServerCtx): Promise<Response> {
  if (req.method !== "POST") return err("POST 만 받아요.", 405);
  const g = gate(req, ctx, true);
  if (g) return g;
  const id = req.headers.get("x-backup-id") ?? "";
  const kind = (req.headers.get("x-backup-kind") ?? "") as Kind;
  const sha = req.headers.get("x-backup-sha256");
  if (!isValidId(id)) return err("백업 식별자 형식이 틀려요.", 400);
  if (kind !== "ledger" && kind !== "photos") return err("알 수 없는 종류예요.", 400);
  if (sha && !/^[0-9a-f]{64}$/.test(sha)) return err("해시 형식이 틀려요.", 400);
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > ctx.config.maxBytes) return err(`파일이 너무 커요 (한도 ${Math.round(ctx.config.maxBytes / 1024 / 1024)}MB).`, 413);
  try {
    const r = await receiveUpload({ dir: ctx.config.dir, maxBytes: ctx.config.maxBytes, fs: ctx.fs, now: ctx.now }, kind, id, req.body, sha);
    return json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof BackupError) return err(e.message, e.status);
    return err(`파일을 받지 못했어요 (${e instanceof Error ? `${e.name}: ${e.message}` : "알 수 없는 오류"}).`, 500); // 오류 종류만, 파일 내용은 없음
  }
}

// POST /api/backup/finalize (JSON: FinalizeClaim) → 검증 뒤 최종 파일·manifest
export async function handleFinalize(req: Request, ctx: ServerCtx): Promise<Response> {
  if (req.method !== "POST") return err("POST 만 받아요.", 405);
  const g = gate(req, ctx, true);
  if (g) return g;
  let claim: FinalizeClaim;
  try {
    claim = (await req.json()) as FinalizeClaim;
  } catch {
    return err("마무리 요청을 읽지 못했어요.", 400);
  }
  if (!claim || typeof claim !== "object" || !claim.ledger || typeof claim.ledger.sha256 !== "string" || typeof claim.ledger.size !== "number") return err("마무리 요청의 모양이 틀려요.", 400);
  try {
    const manifest = await finalizeBackup({ dir: ctx.config.dir, maxBytes: ctx.config.maxBytes, fs: ctx.fs, now: ctx.now }, claim);
    return json({ ok: true, manifest });
  } catch (e) {
    if (e instanceof BackupError) return err(e.message, e.status);
    return err(`백업을 마무리하지 못했어요 (${e instanceof Error ? `${e.name}: ${e.message}` : "알 수 없는 오류"}).`, 500);
  }
}

// GET /api/backup/status → 켜짐 여부·폴더·마지막 성공·파일 수
export async function handleStatus(req: Request, ctx: ServerCtx): Promise<Response> {
  if (req.method !== "GET") return err("GET 만 받아요.", 405);
  if (!ctx.config.enabled) return json({ ok: true, enabled: false, reason: ctx.config.reason });
  const o = checkOrigin(req.headers);
  if (o) return err(o, 403);
  const s = checkSession(req.headers, ctx.sessions);
  if (s) return err(s, 401);
  const status = await readBackupStatus({ dir: ctx.config.dir, maxBytes: ctx.config.maxBytes, fs: ctx.fs, now: ctx.now });
  return json({ ok: true, enabled: true, reason: null, maxBytes: ctx.config.maxBytes, status });
}
