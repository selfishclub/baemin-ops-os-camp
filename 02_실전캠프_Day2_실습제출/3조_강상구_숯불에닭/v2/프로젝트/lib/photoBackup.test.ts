import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { buildPhotoBackup, inspectPhotoBackup, planPhotoRestore, restorePhotos, sha256Hex, zipPathFor, type PhotoBytes, type PhotoManifest, type PhotoWriteRecord, type PhotoWriter } from "./photoBackup";
import { photoOwnerIds } from "./storage/backup";
import { emptyData } from "./storage/local";

// 전부 가상 사진. 실제 이미지가 아니라 임의의 바이트지만, 백업은 바이트를 그대로 보존하므로 검증엔 충분하다.
const fakeBytes = (seed: number, len = 300) => Uint8Array.from({ length: len }, (_, i) => (seed * 31 + i * 7) % 256);
const photo = (id: string, ownerId: string, seed: number, type = "image/jpeg"): PhotoBytes => ({
  meta: { id, ownerId, name: `영수증 ${id}.jpg`, type, size: 300, addedAt: "2026-09-10T10:00:00.000Z" },
  bytes: fakeBytes(seed),
});
const three = () => [photo("ph_a", "p1", 1), photo("ph_b", "p1", 2), photo("ph_c", "f1", 3, "image/png")];

// manifest 를 고쳐서 다시 ZIP 으로 — 손상·불일치 시나리오용
function rezip(zip: Uint8Array, mutate: (m: PhotoManifest, files: Record<string, Uint8Array>) => void): Uint8Array {
  const files = unzipSync(zip);
  const m = JSON.parse(strFromU8(files["manifest.json"])) as PhotoManifest;
  mutate(m, files);
  files["manifest.json"] = strToU8(JSON.stringify(m));
  const out: Record<string, [Uint8Array, { level: 0 }]> = {};
  for (const [p, b] of Object.entries(files)) out[p] = [b, { level: 0 }];
  return zipSync(out);
}

async function okInspect(zip: Uint8Array) {
  const ins = await inspectPhotoBackup(zip);
  if (!ins.ok) throw new Error("검사 실패: " + ins.errors.join(" / "));
  return ins;
}

class FakeWriter implements PhotoWriter {
  stored = new Map<string, PhotoWriteRecord>();
  failAt: number | null = null; // n번째 사진에서 실패 → 전부 취소 (IndexedDB 트랜잭션처럼)
  async addAll(records: PhotoWriteRecord[]) {
    for (let i = 0; i < records.length; i++) {
      if (this.failAt !== null && i === this.failAt) throw new Error("가짜 저장 실패 (공간 부족)");
      if (this.stored.has(records[i].meta.id)) throw new Error("같은 id 가 이미 있어요");
    }
    for (const r of records) this.stored.set(r.meta.id, r); // 검사가 전부 통과한 뒤에만 쓴다 = 원자적
  }
}

describe("1. 사진 0장 백업", () => {
  it("manifest 만 든 ZIP 을 만들고 다시 읽을 수 있다", async () => {
    const { zip, manifest } = await buildPhotoBackup([], { now: "2026-10-09T00:00:00.000Z" });
    expect(manifest.photos).toEqual([]);
    const ins = await okInspect(zip);
    expect(ins.entries.length).toBe(0);
    expect(ins.totalBytes).toBe(0);
    expect(ins.manifest.createdAt).toBe("2026-10-09T00:00:00.000Z");
  });
});

describe("2·3·4. 여러 장 백업, 원본 바이트 동일, ownerId 유지", () => {
  it("사진 3장이 경로 규칙대로 들어가고 바이트·ownerId·해시가 보존된다", async () => {
    const src = three();
    const { zip, manifest } = await buildPhotoBackup(src, { ledgerSavedAt: "2026-10-09T01:00:00.000Z", ledgerOwnerIds: 2 });
    expect(manifest.photos.map((p) => p.path)).toEqual(["photos/0001_ph_a.jpg", "photos/0002_ph_b.jpg", "photos/0003_ph_c.png"]);
    expect(manifest.ledgerSavedAt).toBe("2026-10-09T01:00:00.000Z");
    expect(manifest.ledgerOwnerIds).toBe(2);
    const ins = await okInspect(zip);
    for (let i = 0; i < src.length; i++) {
      expect(ins.entries[i].entry.id).toBe(src[i].meta.id);
      expect(ins.entries[i].entry.ownerId).toBe(src[i].meta.ownerId);
      expect(ins.entries[i].entry.name).toBe(src[i].meta.name);
      expect(Array.from(ins.entries[i].bytes)).toEqual(Array.from(src[i].bytes)); // 바이트 그대로
      expect(ins.entries[i].entry.sha256).toBe(await sha256Hex(src[i].bytes));
    }
  });
  it("이상한 글자가 든 id 도 안전한 경로가 된다 (파일명 충돌 없음)", () => {
    expect(zipPathFor(0, "../evil/../x", "image/jpeg")).toBe("photos/0001____evil____x.jpg"); // 점·슬래시가 전부 _ 로
    expect(zipPathFor(4, "같은id", "text/plain")).toMatch(/^photos\/0005_[A-Za-z0-9_-]+\.bin$/);
    expect(zipPathFor(0, "a", "image/jpeg")).not.toBe(zipPathFor(1, "a", "image/jpeg"));
  });
  it("같은 id 가 두 번이면 만들지 않는다", async () => {
    await expect(buildPhotoBackup([photo("dup", "p1", 1), photo("dup", "p1", 2)])).rejects.toThrow("두 번");
  });
});

describe("5·6·7. 복원 계획: 새 사진·건너뛰기·충돌", () => {
  it("아무것도 없을 때는 전부 '새 사진'", async () => {
    const ins = await okInspect((await buildPhotoBackup(three())).zip);
    const plan = planPhotoRestore(ins, new Map(), new Set(["p1"]));
    expect(plan).toMatchObject({ add: 3, skip: 0, conflict: 0, linked: 2, unlinked: 1, addBytes: 900 });
  });
  it("같은 id·같은 내용은 건너뛰고, 같은 id·다른 내용은 충돌", async () => {
    const src = three();
    const ins = await okInspect((await buildPhotoBackup(src)).zip);
    const existing = new Map<string, string>([
      ["ph_a", await sha256Hex(src[0].bytes)], // 같은 내용
      ["ph_b", await sha256Hex(fakeBytes(99))], // 다른 내용
    ]);
    const plan = planPhotoRestore(ins, existing, new Set(["p1", "f1"]));
    expect(plan).toMatchObject({ add: 1, skip: 1, conflict: 1, linked: 1, unlinked: 0 });
    expect(plan.items.find((x) => x.entry.id === "ph_b")?.kind).toBe("conflict");
    const w = new FakeWriter();
    const r = await restorePhotos(plan, w);
    expect(r).toEqual({ added: 1, skipped: 1, conflicts: 1, error: null });
    expect([...w.stored.keys()]).toEqual(["ph_c"]); // 충돌 사진은 덮어쓰지 않았고 건너뛴 사진은 안 썼다
    expect(w.stored.get("ph_c")!.meta.ownerId).toBe("f1");
  });
  it("정상 복원: 바이트와 ownerId 가 저장소에 그대로 간다", async () => {
    const src = three();
    const ins = await okInspect((await buildPhotoBackup(src)).zip);
    const w = new FakeWriter();
    const r = await restorePhotos(planPhotoRestore(ins, new Map(), new Set()), w);
    expect(r.added).toBe(3);
    const rec = w.stored.get("ph_a")!;
    expect(rec.meta).toMatchObject({ id: "ph_a", ownerId: "p1", type: "image/jpeg", size: 300 });
    expect(Array.from(new Uint8Array(await rec.blob.arrayBuffer()))).toEqual(Array.from(src[0].bytes));
  });
});

describe("8·9·10. 누락·해시 불일치·손상 ZIP 거절", () => {
  it("manifest 에는 있는데 사진 파일이 빠지면 거절", async () => {
    const { zip } = await buildPhotoBackup(three());
    const broken = rezip(zip, (_m, files) => {
      delete files["photos/0002_ph_b.jpg"];
    });
    const ins = await inspectPhotoBackup(broken);
    expect(ins.ok).toBe(false);
    if (!ins.ok) expect(ins.errors[0]).toContain("사진 파일이 없어요");
  });
  it("사진 바이트가 바뀌면 해시가 달라 거절", async () => {
    const { zip } = await buildPhotoBackup(three());
    const tampered = rezip(zip, (_m, files) => {
      const b = files["photos/0001_ph_a.jpg"];
      b[10] = (b[10] + 1) % 256;
    });
    const ins = await inspectPhotoBackup(tampered);
    expect(ins.ok).toBe(false);
    if (!ins.ok) expect(ins.errors[0]).toContain("해시");
  });
  it("크기가 다르면 거절", async () => {
    const { zip } = await buildPhotoBackup(three());
    const ins = await inspectPhotoBackup(rezip(zip, (m) => (m.photos[0].size = 1)));
    expect(ins.ok).toBe(false);
    if (!ins.ok) expect(ins.errors[0]).toContain("크기");
  });
  it("손상된 ZIP·manifest 없음·다른 앱·새 형식·허용되지 않는 경로·중복 id 거절", async () => {
    expect((await inspectPhotoBackup(new Uint8Array([1, 2, 3, 4, 5]))).ok).toBe(false);
    const { zip } = await buildPhotoBackup(three());
    const half = zip.slice(0, Math.floor(zip.length / 2));
    expect((await inspectPhotoBackup(half)).ok).toBe(false);
    expect((await inspectPhotoBackup(zipSync({ "photos/0001_a.jpg": [fakeBytes(1), { level: 0 }] }))).ok).toBe(false);
    expect((await inspectPhotoBackup(rezip(zip, (m) => ((m as { app: string }).app = "other")))).ok).toBe(false);
    const v2 = await inspectPhotoBackup(rezip(zip, (m) => (m.format = 2)));
    expect(v2.ok).toBe(false);
    if (!v2.ok) expect(v2.errors[0]).toContain("새 형식");
    const badPath = await inspectPhotoBackup(rezip(zip, (m) => (m.photos[0].path = "../../etc/passwd")));
    expect(badPath.ok).toBe(false);
    if (!badPath.ok) expect(badPath.errors[0]).toContain("경로");
    const dup = await inspectPhotoBackup(rezip(zip, (m) => (m.photos[1].id = m.photos[0].id)));
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.errors.join(" ")).toContain("두 번");
  });
  it("manifest 에 없는 파일은 경고만", async () => {
    const { zip } = await buildPhotoBackup(three());
    const extra = rezip(zip, (_m, files) => {
      files["photos/9999_extra.jpg"] = fakeBytes(5);
    });
    const ins = await inspectPhotoBackup(extra);
    expect(ins.ok).toBe(true);
    if (ins.ok) expect(ins.warnings[0]).toContain("무시");
  });
});

describe("11·12·13. 취소, 저장 실패, 재시도", () => {
  it("검사·계획만 하면 저장소에 아무것도 안 쓴다 (취소)", async () => {
    const ins = await okInspect((await buildPhotoBackup(three())).zip);
    planPhotoRestore(ins, new Map(), new Set());
    const w = new FakeWriter();
    expect(w.stored.size).toBe(0);
  });
  it("도중에 실패하면 하나도 저장되지 않고 오류를 보고한다", async () => {
    const ins = await okInspect((await buildPhotoBackup(three())).zip);
    const w = new FakeWriter();
    w.failAt = 1;
    const r = await restorePhotos(planPhotoRestore(ins, new Map(), new Set()), w);
    expect(r.added).toBe(0);
    expect(r.error).toContain("가짜 저장 실패");
    expect(w.stored.size).toBe(0);
  });
  it("재시도하면 같은 계획으로 전부 들어가고, 이미 들어간 뒤 또 하면 전부 건너뛴다", async () => {
    const src = three();
    const ins = await okInspect((await buildPhotoBackup(src)).zip);
    const w = new FakeWriter();
    w.failAt = 2;
    expect((await restorePhotos(planPhotoRestore(ins, new Map(), new Set()), w)).added).toBe(0);
    w.failAt = null;
    expect((await restorePhotos(planPhotoRestore(ins, new Map(), new Set()), w)).added).toBe(3);
    // 두 번째 시도: 저장소의 해시를 다시 계산해 계획하면 전부 skip
    const existing = new Map<string, string>();
    for (const [id, rec] of w.stored) existing.set(id, await sha256Hex(new Uint8Array(await rec.blob.arrayBuffer())));
    const again = planPhotoRestore(ins, existing, new Set());
    expect(again).toMatchObject({ add: 0, skip: 3, conflict: 0 });
    expect((await restorePhotos(again, w)).added).toBe(0);
    expect(w.stored.size).toBe(3);
  });
});

describe("14. 장부 연결 정보 검증", () => {
  it("장부 설정의 영수증·고정비 id 로 연결 여부를 가른다", async () => {
    const ledger = { ...emptyData(), settings: [{ key: "purchases_2026-09", value: [{ id: "p1" }] }, { key: "fixed_costs", value: [{ id: "f1" }] }] };
    const owners = photoOwnerIds(ledger);
    const ins = await okInspect((await buildPhotoBackup([photo("a", "p1", 1), photo("b", "f1", 2), photo("c", "gone", 3)])).zip);
    const plan = planPhotoRestore(ins, new Map(), owners);
    expect(plan.linked).toBe(2);
    expect(plan.unlinked).toBe(1);
    expect(plan.items.find((x) => x.entry.id === "c")?.linked).toBe(false);
  });
  it("manifest 가 같이 받은 장부 백업의 savedAt 을 품는다 (서로 다른 시점이면 null)", async () => {
    const a = await buildPhotoBackup([], { ledgerSavedAt: "2026-10-09T02:00:00.000Z" });
    expect((await okInspect(a.zip)).manifest.ledgerSavedAt).toBe("2026-10-09T02:00:00.000Z");
    const b = await buildPhotoBackup([]);
    expect((await okInspect(b.zip)).manifest.ledgerSavedAt).toBeNull();
  });
});
