import { createHash } from "node:crypto";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildPhotoBackup, inspectPhotoBackup } from "../photoBackup";
import { inspectBackup } from "../storage/backup";
import { emptyData } from "../storage/local";
import { BackupError, finalizeBackup, readBackupStatus, realFs, receiveUpload, type FinalizeClaim, type StoreCtx, type StoreFs } from "./store";

// 전부 가상 데이터. 테스트 폴더는 OS 임시 폴더 아래 매번 새로 만든다 (운영 백업 폴더와 무관).
let dir: string;
beforeEach(async () => {
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), "sootdak-backup-test-"));
});
afterEach(async () => {
  await fsp.rm(dir, { recursive: true, force: true });
});

const ID = "11111111-2222-4333-8444-555555555555";
const ID2 = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const fixedNow = () => new Date(2026, 9, 9, 14, 30, 0);
const ctx = (over: Partial<StoreCtx> = {}): StoreCtx => ({ dir, maxBytes: 10 * 1024 * 1024, now: fixedNow, ...over });
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const stream = (b: Uint8Array) => new Blob([b as BlobPart]).stream() as ReadableStream<Uint8Array>;

const ledgerJson = () => JSON.stringify({ app: "sootdak-ledger", version: 1, savedAt: "2026-10-09T05:00:00.000Z", data: { ...emptyData(), transactions: [{ id: "t1", month: "2026-09", date: "2026-09-05", payee: "가짜", out: 1000, in: 0, source: "bank", major: null, minor: null, channel: null, review: null }] } });
const fakePhoto = (id: string, seed: number) => ({ meta: { id, ownerId: "p1", name: `${id}.jpg`, type: "image/jpeg", size: 200, addedAt: "2026-09-10T00:00:00.000Z" }, bytes: Uint8Array.from({ length: 200 }, (_, i) => (seed * 13 + i) % 256) });

async function uploadLedger(id = ID, text = ledgerJson(), c = ctx()) {
  const bytes = new TextEncoder().encode(text);
  const r = await receiveUpload(c, "ledger", id, stream(bytes), sha(bytes));
  return { bytes, r };
}
async function uploadPhotos(id = ID, c = ctx()) {
  const { zip } = await buildPhotoBackup([fakePhoto("ph_a", 1), fakePhoto("ph_b", 2)]);
  const r = await receiveUpload(c, "photos", id, stream(zip), sha(zip));
  return { zip, r };
}
const claimFor = (l: { bytes: Uint8Array }, p: { zip: Uint8Array } | null, id = ID): FinalizeClaim => ({
  id,
  createdAt: "2026-10-09T05:30:00.000Z",
  mode: p ? "full" : "ledger",
  ledger: { sha256: sha(l.bytes), size: l.bytes.length },
  photos: p ? { sha256: sha(p.zip), size: p.zip.length, count: 2 } : null,
});
const failing = (over: Partial<StoreFs>): StoreFs => ({ ...realFs, ...over });

describe("1. 장부 자동 백업", () => {
  it("업로드 → 마무리: 최종 파일·manifest 가 생기고 임시 파일은 사라진다", async () => {
    const l = await uploadLedger();
    expect(l.r.sha256).toBe(sha(l.bytes));
    const m = await finalizeBackup(ctx(), claimFor(l, null));
    expect(m.verified).toBe(true);
    expect(m.mode).toBe("ledger");
    expect(m.ledger.file).toBe(`ledger-20261009-143000-${ID}.json`);
    expect(m.photos).toBeNull();
    const names = (await fsp.readdir(dir)).sort();
    expect(names).toEqual([`backup-manifest-20261009-143000-${ID}.json`, `ledger-20261009-143000-${ID}.json`]);
    const saved = await fsp.readFile(path.join(dir, m.ledger.file), "utf8");
    expect(sha(new TextEncoder().encode(saved))).toBe(m.ledger.sha256);
    expect(m.ledger.transactions).toBe(1);
  });
});

describe("2·3. 사진·통합 백업", () => {
  it("장부+사진이 같은 식별자로 묶이고 manifest 에 둘 다 적힌다", async () => {
    const l = await uploadLedger();
    const p = await uploadPhotos();
    const m = await finalizeBackup(ctx(), claimFor(l, p));
    expect(m.mode).toBe("full");
    expect(m.photos).toMatchObject({ file: `photos-20261009-143000-${ID}.zip`, count: 2, size: p.zip.length });
    expect(m.ledger.file).toContain(ID);
    expect(m.photos!.file).toContain(ID);
    const names = await fsp.readdir(dir);
    expect(names.filter((n) => n.endsWith(".part"))).toEqual([]);
    expect(names.length).toBe(3);
  });
  it("장부만 백업인데 사진 임시 파일이 남아 있으면 치우고 장부만 올린다", async () => {
    const l = await uploadLedger();
    await uploadPhotos();
    const m = await finalizeBackup(ctx(), claimFor(l, null));
    expect(m.photos).toBeNull();
    expect((await fsp.readdir(dir)).some((n) => n.endsWith(".part"))).toBe(false);
  });
});

describe("7·8. 서버 저장 실패 · 디스크 공간 부족", () => {
  it("임시 파일 쓰기 중 ENOSPC → 거절, 임시 파일 없음", async () => {
    const f = failing({
      createWriteStream: () =>
        new Writable({
          write(_c, _e, cb) {
            cb(Object.assign(new Error("no space"), { code: "ENOSPC" }));
          },
        }),
    });
    const bytes = new TextEncoder().encode(ledgerJson());
    await expect(receiveUpload(ctx({ fs: f }), "ledger", ID, stream(bytes), null)).rejects.toThrow("디스크 공간");
    expect((await fsp.readdir(dir)).length).toBe(0);
  });
  it("최종 복사 실패 → 불완전 manifest 만 남고 최종 파일은 없다", async () => {
    const l = await uploadLedger();
    const f = failing({
      copyExcl: async () => {
        throw Object.assign(new Error("denied"), { code: "EACCES" });
      },
    });
    await expect(finalizeBackup(ctx({ fs: f }), claimFor(l, null))).rejects.toThrow("권한");
    const names = await fsp.readdir(dir);
    expect(names.some((n) => n.startsWith("ledger-"))).toBe(false);
    expect(names.some((n) => n.endsWith(".incomplete.json"))).toBe(true);
    expect(names.some((n) => n.endsWith(".part"))).toBe(false);
    const inc = JSON.parse(await fsp.readFile(path.join(dir, names.find((n) => n.endsWith(".incomplete.json"))!), "utf8"));
    expect(inc.verified).toBe(false);
    expect(inc.error).toContain("권한");
  });
  it("manifest 쓰기 실패도 불완전으로 끝나고 만들던 최종 파일을 거둬들인다", async () => {
    const l = await uploadLedger();
    const f = failing({
      writeFile: async (file, text) => {
        if (!file.includes(".incomplete")) throw Object.assign(new Error("full"), { code: "ENOSPC" });
        return realFs.writeFile(file, text);
      },
    });
    await expect(finalizeBackup(ctx({ fs: f }), claimFor(l, null))).rejects.toThrow("manifest");
    const names = await fsp.readdir(dir);
    expect(names.filter((n) => n.startsWith("ledger-"))).toEqual([]);
    expect(names.some((n) => n.endsWith(".incomplete.json"))).toBe(true);
  });
  it("크기 한도를 넘으면 받지 않는다", async () => {
    const big = new Uint8Array(2048);
    await expect(receiveUpload(ctx({ maxBytes: 1024 }), "ledger", ID, stream(big), null)).rejects.toThrow("너무 커요");
    expect((await fsp.readdir(dir)).length).toBe(0);
  });
});

describe("9·10. 손상된 업로드 · 해시 불일치", () => {
  it("장부가 JSON 이 아니면 마무리에서 거절 (복원 가능한 백업만 받는다)", async () => {
    const l = await uploadLedger(ID, '{"app":"sootdak-ledger","vers');
    await expect(finalizeBackup(ctx(), claimFor(l, null))).rejects.toThrow("복원 가능한 백업이 아니");
    expect((await fsp.readdir(dir)).some((n) => n.startsWith("ledger-"))).toBe(false);
  });
  it("사진 ZIP 이 깨졌으면 거절", async () => {
    const l = await uploadLedger();
    const junk = new Uint8Array([1, 2, 3, 4, 5, 6]);
    await receiveUpload(ctx(), "photos", ID, stream(junk), sha(junk));
    await expect(finalizeBackup(ctx(), { ...claimFor(l, null), mode: "full", photos: { sha256: sha(junk), size: 6, count: 0 } })).rejects.toThrow("사진 파일이 복원 가능한");
  });
  it("브라우저가 말한 해시와 받은 바이트가 다르면 업로드 단계에서 거절", async () => {
    const bytes = new TextEncoder().encode(ledgerJson());
    await expect(receiveUpload(ctx(), "ledger", ID, stream(bytes), "0".repeat(64))).rejects.toThrow("해시");
    expect((await fsp.readdir(dir)).length).toBe(0);
  });
  it("마무리 때 말한 해시가 디스크 내용과 다르면 거절 (불완전 기록)", async () => {
    const l = await uploadLedger();
    const bad = claimFor(l, null);
    bad.ledger.sha256 = "f".repeat(64);
    await expect(finalizeBackup(ctx(), bad)).rejects.toThrow("해시가 달라요");
    const names = await fsp.readdir(dir);
    expect(names.some((n) => n.endsWith(".incomplete.json"))).toBe(true);
    expect(names.some((n) => n.startsWith("ledger-"))).toBe(false);
  });
  it("사진 수가 다르면 거절", async () => {
    const l = await uploadLedger();
    const p = await uploadPhotos();
    const c = claimFor(l, p);
    c.photos!.count = 5;
    await expect(finalizeBackup(ctx(), c)).rejects.toThrow("사진 수");
  });
});

describe("11·12. 중복 요청 · 파일명 충돌", () => {
  it("같은 식별자·종류를 두 번 올리면 두 번째는 409", async () => {
    await uploadLedger();
    const bytes = new TextEncoder().encode(ledgerJson());
    await expect(receiveUpload(ctx(), "ledger", ID, stream(bytes), null)).rejects.toMatchObject({ status: 409 });
  });
  it("최종 파일 이름이 이미 있으면 덮어쓰지 않고 불완전으로 끝난다", async () => {
    const l = await uploadLedger();
    await fsp.writeFile(path.join(dir, `ledger-20261009-143000-${ID}.json`), "이미 있는 파일");
    await expect(finalizeBackup(ctx(), claimFor(l, null))).rejects.toThrow("이미 있어요");
    expect(await fsp.readFile(path.join(dir, `ledger-20261009-143000-${ID}.json`), "utf8")).toBe("이미 있는 파일");
  });
  it("식별자가 규칙에 안 맞으면(경로 조작 포함) 받지 않는다", async () => {
    const bytes = new TextEncoder().encode("{}");
    await expect(receiveUpload(ctx(), "ledger", "../../x", stream(bytes), null)).rejects.toBeInstanceOf(BackupError);
    await expect(receiveUpload(ctx(), "ledger", "C:\\evil", stream(bytes), null)).rejects.toBeInstanceOf(BackupError);
    expect((await fsp.readdir(dir)).length).toBe(0);
  });
});

describe("사진 내용이 같으면 새 파일을 만들지 않는다 (용량 절약)", () => {
  it("두 번째 전체 백업의 manifest 가 첫 번째 ZIP 을 가리키고, 폴더에 ZIP 은 하나뿐이다", async () => {
    const l = await uploadLedger();
    const p = await uploadPhotos();
    const m1 = await finalizeBackup(ctx(), claimFor(l, p));
    const later = () => new Date(2026, 9, 10, 9, 0, 0);
    const l2 = await uploadLedger(ID2, ledgerJson(), ctx({ now: later }));
    const p2 = await uploadPhotos(ID2, ctx({ now: later })); // 같은 사진, ZIP 바이트는 만든 시각 때문에 다를 수 있음
    const m2 = await finalizeBackup(ctx({ now: later }), claimFor(l2, p2, ID2));
    expect(m2.photos!.reusedFrom).toBe(ID);
    expect(m2.photos!.file).toBe(m1.photos!.file);
    expect(m2.photos!.contentHash).toBe(m1.photos!.contentHash);
    const names = await fsp.readdir(dir);
    expect(names.filter((n) => n.startsWith("photos-")).length).toBe(1);
    expect(names.filter((n) => n.endsWith(".part"))).toEqual([]);
    const s = await readBackupStatus(ctx());
    expect(s.verifiedCount).toBe(2);
    expect(s.lastPhotosOkAt).toBe(later().toISOString()); // 사진 백업 성공 시각은 갱신된다
    expect(s.totalBytes).toBe(m1.ledger.size + m1.photos!.size + m2.ledger.size); // 사진은 한 번만 센다
  });
  it("사진이 한 장이라도 바뀌면 새 ZIP 을 만든다", async () => {
    const l = await uploadLedger();
    const p = await uploadPhotos();
    await finalizeBackup(ctx(), claimFor(l, p));
    const later = () => new Date(2026, 9, 10, 9, 0, 0);
    const l2 = await uploadLedger(ID2, ledgerJson(), ctx({ now: later }));
    const { zip } = await buildPhotoBackup([fakePhoto("ph_a", 1), fakePhoto("ph_b", 2), fakePhoto("ph_c", 3)]);
    await receiveUpload(ctx({ now: later }), "photos", ID2, stream(zip), sha(zip));
    const m2 = await finalizeBackup(ctx({ now: later }), { ...claimFor(l2, null, ID2), mode: "full", photos: { sha256: sha(zip), size: zip.length, count: 3 } });
    expect(m2.photos!.reusedFrom).toBeUndefined();
    expect((await fsp.readdir(dir)).filter((n) => n.startsWith("photos-")).length).toBe(2);
  });
  it("직전 ZIP 을 사장님이 지웠으면 다시 저장한다", async () => {
    const l = await uploadLedger();
    const p = await uploadPhotos();
    const m1 = await finalizeBackup(ctx(), claimFor(l, p));
    await fsp.unlink(path.join(dir, m1.photos!.file));
    const later = () => new Date(2026, 9, 10, 9, 0, 0);
    const l2 = await uploadLedger(ID2, ledgerJson(), ctx({ now: later }));
    const p2 = await uploadPhotos(ID2, ctx({ now: later }));
    const m2 = await finalizeBackup(ctx({ now: later }), claimFor(l2, p2, ID2));
    expect(m2.photos!.reusedFrom).toBeUndefined();
    expect(await fsp.readFile(path.join(dir, m2.photos!.file))).toBeTruthy();
  });
});

describe("6. 브라우저 종료 (임시 파일만 남은 경우)", () => {
  it("상태에서 임시 파일 수로 보이고, 성공으로 세지 않는다", async () => {
    await uploadLedger();
    const s = await readBackupStatus(ctx());
    expect(s.leftoverTempCount).toBe(1);
    expect(s.verifiedCount).toBe(0);
    expect(s.lastLedgerOkAt).toBeNull();
  });
});

describe("상태 · 17. 복원 가능성", () => {
  it("마지막 성공 시각·개수·용량을 manifest 로 센다 (불완전은 따로)", async () => {
    const l = await uploadLedger();
    await finalizeBackup(ctx(), claimFor(l, null));
    const later = () => new Date(2026, 9, 10, 9, 0, 0);
    const l2 = await uploadLedger(ID2, ledgerJson(), ctx({ now: later }));
    const p2 = await uploadPhotos(ID2, ctx({ now: later }));
    await finalizeBackup(ctx({ now: later }), claimFor(l2, p2, ID2));
    const s = await readBackupStatus(ctx());
    expect(s.verifiedCount).toBe(2);
    expect(s.incompleteCount).toBe(0);
    expect(s.lastFullOkAt).toBe(later().toISOString());
    expect(s.lastPhotosOkAt).toBe(s.lastFullOkAt);
    expect(s.lastLedgerOkAt).toBe(s.lastFullOkAt);
    expect(s.totalBytes).toBeGreaterThan(0);
    expect(s.recent[0].id).toBe(ID2);
  });
  it("저장된 파일을 다시 읽어 장부·사진 복원 검사를 통과한다", async () => {
    const l = await uploadLedger();
    const p = await uploadPhotos();
    const m = await finalizeBackup(ctx(), claimFor(l, p));
    const ledgerText = await fsp.readFile(path.join(dir, m.ledger.file), "utf8");
    const ins = inspectBackup(ledgerText);
    expect(ins.ok).toBe(true);
    if (ins.ok) expect(ins.summary.transactions).toBe(1);
    const zip = new Uint8Array(await fsp.readFile(path.join(dir, m.photos!.file)));
    const pins = await inspectPhotoBackup(zip);
    expect(pins.ok).toBe(true);
    if (pins.ok) expect(pins.entries.map((e) => e.entry.id)).toEqual(["ph_a", "ph_b"]);
  });
  it("폴더가 없으면 백업 0개로 본다", async () => {
    const s = await readBackupStatus(ctx({ dir: path.join(dir, "없는폴더") }));
    expect(s.verifiedCount).toBe(0);
  });
});
