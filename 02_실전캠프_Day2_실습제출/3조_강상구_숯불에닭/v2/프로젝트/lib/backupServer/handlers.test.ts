import { createHash } from "node:crypto";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emptyData } from "../storage/local";
import { readBackupConfig } from "./config";
import { SessionStore } from "./guard";
import { handleFinalize, handleSession, handleStatus, handleUpload, type ServerCtx } from "./handlers";

// API 처리기를 표준 Request 로 직접 부른다 (Next 없이). 폴더는 임시 폴더, 데이터는 가상.
let dir: string;
let ctx: ServerCtx;
beforeEach(async () => {
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), "sootdak-handlers-test-"));
  ctx = { config: readBackupConfig({ BACKUP_DIR: dir }), sessions: new SessionStore(), now: () => new Date(2026, 9, 9, 15, 0, 0) };
});
afterEach(async () => {
  await fsp.rm(dir, { recursive: true, force: true });
});

const ID = "11111111-2222-4333-8444-555555555555";
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const ledger = new TextEncoder().encode(JSON.stringify({ app: "sootdak-ledger", version: 1, savedAt: "2026-10-09T05:00:00.000Z", data: { ...emptyData(), transactions: [] } }));
const BASE = { host: "localhost:3201", origin: "http://localhost:3201", "sec-fetch-site": "same-origin", "x-backup-client": "1" };
const req = (url: string, init: RequestInit & { headers?: Record<string, string> } = {}) => new Request(`http://localhost:3201${url}`, { ...init, headers: { ...BASE, ...(init.headers ?? {}) } });

async function getToken(): Promise<string> {
  const res = await handleSession(req("/api/backup/session", { method: "POST" }), ctx);
  const j = await res.json();
  expect(res.status).toBe(200);
  return j.token;
}

describe("15. Vercel·시연 모드·폴더 없음에서는 꺼진다", () => {
  it("설정이 꺼짐을 말하고 모든 처리기가 503/꺼짐으로 답한다", async () => {
    for (const env of [{ VERCEL: "1", BACKUP_DIR: dir }, { VERCEL_ENV: "production", BACKUP_DIR: dir }, { NEXT_PUBLIC_STORAGE: "supabase", BACKUP_DIR: dir }, {}, { BACKUP_DIR: "상대경로" }]) {
      const c = readBackupConfig(env);
      expect(c.enabled).toBe(false);
      expect(c.reason).toBeTruthy();
      const off: ServerCtx = { ...ctx, config: c };
      expect((await handleSession(req("/api/backup/session", { method: "POST" }), off)).status).toBe(503);
      expect((await handleUpload(req("/api/backup/upload", { method: "POST", body: ledger }), off)).status).toBe(503);
      const st = await handleStatus(req("/api/backup/status"), off);
      expect((await st.json()).enabled).toBe(false);
    }
    expect(readBackupConfig({ BACKUP_DIR: dir }).enabled).toBe(true);
  });
});

describe("13·14. 인증되지 않은 요청 · 외부 출처 요청", () => {
  it("세션 없이 올리면 401", async () => {
    const res = await handleUpload(req("/api/backup/upload", { method: "POST", body: ledger, headers: { "x-backup-id": ID, "x-backup-kind": "ledger" } }), ctx);
    expect(res.status).toBe(401);
    expect((await fsp.readdir(dir)).length).toBe(0);
  });
  it("엉뚱한 세션 값은 401", async () => {
    const res = await handleStatus(req("/api/backup/status", { headers: { "x-backup-session": "a".repeat(64) } }), ctx);
    expect(res.status).toBe(401);
  });
  it("host 가 localhost 가 아니면 403 (같은 와이파이의 다른 기기)", async () => {
    const res = await handleSession(req("/api/backup/session", { method: "POST", headers: { host: "192.168.0.5:3201", origin: "http://192.168.0.5:3201" } }), ctx);
    expect(res.status).toBe(403);
  });
  it("origin 이 다르거나 sec-fetch-site 가 cross-site 면 403 (CSRF)", async () => {
    expect((await handleSession(req("/api/backup/session", { method: "POST", headers: { origin: "http://evil.example" } }), ctx)).status).toBe(403);
    expect((await handleSession(req("/api/backup/session", { method: "POST", headers: { "sec-fetch-site": "cross-site" } }), ctx)).status).toBe(403);
  });
  it("직접 만든 헤더(x-backup-client)가 없으면 403", async () => {
    const r = new Request("http://localhost:3201/api/backup/session", { method: "POST", headers: { host: "localhost:3201", origin: "http://localhost:3201" } });
    expect((await handleSession(r, ctx)).status).toBe(403);
  });
  it("GET/POST 가 바뀌면 405", async () => {
    expect((await handleSession(req("/api/backup/session"), ctx)).status).toBe(405);
    expect((await handleStatus(req("/api/backup/status", { method: "POST" }), ctx)).status).toBe(405);
  });
});

describe("전체 흐름: 세션 → 올리기 → 마무리 → 상태", () => {
  it("장부만 백업이 검증되고 상태에 잡힌다", async () => {
    const token = await getToken();
    const up = await handleUpload(req("/api/backup/upload", { method: "POST", body: ledger, headers: { "x-backup-session": token, "x-backup-id": ID, "x-backup-kind": "ledger", "x-backup-sha256": sha(ledger) } }), ctx);
    expect(up.status).toBe(200);
    const fin = await handleFinalize(
      req("/api/backup/finalize", { method: "POST", headers: { "x-backup-session": token, "content-type": "application/json" }, body: JSON.stringify({ id: ID, createdAt: "2026-10-09T06:00:00.000Z", mode: "ledger", ledger: { sha256: sha(ledger), size: ledger.length }, photos: null }) }),
      ctx,
    );
    const fj = await fin.json();
    expect(fin.status).toBe(200);
    expect(fj.manifest.verified).toBe(true);
    const st = await handleStatus(req("/api/backup/status", { headers: { "x-backup-session": token } }), ctx);
    const sj = await st.json();
    expect(sj.enabled).toBe(true);
    expect(sj.status.verifiedCount).toBe(1);
    expect(sj.status.dir).toBe(dir);
  });
  it("해시가 틀린 업로드는 422 이고 아무것도 남지 않는다", async () => {
    const token = await getToken();
    const up = await handleUpload(req("/api/backup/upload", { method: "POST", body: ledger, headers: { "x-backup-session": token, "x-backup-id": ID, "x-backup-kind": "ledger", "x-backup-sha256": "0".repeat(64) } }), ctx);
    expect(up.status).toBe(422);
    expect((await fsp.readdir(dir)).length).toBe(0);
  });
  it("content-length 가 한도를 넘으면 413", async () => {
    const token = await getToken();
    const up = await handleUpload(req("/api/backup/upload", { method: "POST", body: ledger, headers: { "x-backup-session": token, "x-backup-id": ID, "x-backup-kind": "ledger", "content-length": String(ctx.config.maxBytes + 1) } }), ctx);
    expect(up.status).toBe(413);
  });
  it("마무리 요청의 모양이 틀리면 400", async () => {
    const token = await getToken();
    const fin = await handleFinalize(req("/api/backup/finalize", { method: "POST", headers: { "x-backup-session": token, "content-type": "application/json" }, body: "{}" }), ctx);
    expect(fin.status).toBe(400);
  });
});

describe("세션", () => {
  it("발급 토큰은 64자이고 만료되면 거절된다", () => {
    let t = 0;
    const s = new SessionStore(() => t);
    const tok = s.issue();
    expect(tok).toHaveLength(64);
    expect(s.verify(tok)).toBe(true);
    expect(s.verify(tok.slice(0, 63) + "x")).toBe(false);
    t = 13 * 60 * 60 * 1000;
    expect(s.verify(tok)).toBe(false);
  });
});
