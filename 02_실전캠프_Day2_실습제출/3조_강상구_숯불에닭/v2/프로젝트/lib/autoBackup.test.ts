import { describe, expect, it } from "vitest";
import { applyFailure, applySuccess, BackupClientError, Debouncer, emptyAutoState, fetchSession, FULL_INTERVAL_MS, isFullyBackedUp, planAutoBackup, retryDelayMs, runBackupUpload, shouldWarn, type AutoBackupState, type BackupDeps } from "./autoBackup";

// 브라우저 쪽 자동 백업의 "판단"과 "주고받기"를 가짜 시계·가짜 fetch 로 검사한다. 전부 가상 데이터.
const T0 = new Date("2026-10-09T09:00:00.000Z");
const iso = (ms: number) => new Date(T0.getTime() + ms).toISOString();
const st = (over: Partial<AutoBackupState> = {}): AutoBackupState => ({ ...emptyAutoState(), ...over });

describe("4. 변경 후 백업 예약 (판단)", () => {
  it("아무 백업도 없으면 전체부터", () => {
    expect(planAutoBackup(st(), T0)).toBe("full");
  });
  it("오늘 전체 백업이 끝난 뒤 장부만 바뀌면 장부만", () => {
    const s = st({ lastFullOkAt: iso(-3600_000), lastLedgerOkAt: iso(-3600_000), lastPhotosOkAt: iso(-3600_000), ledgerChangedAt: iso(-60_000) });
    expect(planAutoBackup(s, T0)).toBe("ledger");
  });
  it("바뀐 게 없으면 아무것도 안 한다", () => {
    const s = st({ lastFullOkAt: iso(-3600_000), lastLedgerOkAt: iso(-3600_000), lastPhotosOkAt: iso(-3600_000), ledgerChangedAt: iso(-7200_000) });
    expect(planAutoBackup(s, T0)).toBeNull();
    expect(isFullyBackedUp(s)).toBe(true);
  });
  it("사진이 바뀌면 전체로, 장부 성공만으로는 '전체 완료'가 아니다", () => {
    const s = st({ lastFullOkAt: iso(-3600_000), lastLedgerOkAt: iso(-60_000), lastPhotosOkAt: iso(-3600_000), photosChangedAt: iso(-120_000) });
    expect(planAutoBackup(s, T0)).toBe("full");
    expect(isFullyBackedUp(s)).toBe(false);
    const after = applySuccess(s, "full", iso(0));
    expect(isFullyBackedUp(after)).toBe(true);
  });
  it("사진이 안 바뀌면 전체 백업은 7일에 한 번만 (보험), 그 전엔 장부만", () => {
    const sixDays = st({ lastFullOkAt: iso(-6 * 86_400_000), lastLedgerOkAt: iso(-60_000), lastPhotosOkAt: iso(-6 * 86_400_000), ledgerChangedAt: iso(-30_000) });
    expect(planAutoBackup(sixDays, T0)).toBe("ledger");
    expect(FULL_INTERVAL_MS).toBe(7 * 86_400_000);
  });
  it("간격이 지나면 전체 백업이 다시 돈다", () => {
    const fresh = st({ lastFullOkAt: iso(-FULL_INTERVAL_MS + 60_000), lastLedgerOkAt: iso(-60_000), lastPhotosOkAt: iso(-FULL_INTERVAL_MS + 60_000) });
    expect(planAutoBackup(fresh, T0)).toBeNull();
    const stale = st({ lastFullOkAt: iso(-FULL_INTERVAL_MS), lastLedgerOkAt: iso(-60_000), lastPhotosOkAt: iso(-FULL_INTERVAL_MS) });
    expect(planAutoBackup(stale, T0)).toBe("full");
  });
});

describe("5. 연속 변경 debounce", () => {
  it("짧은 시간에 여러 번 바뀌어도 마지막 뒤 한 번만 돈다", () => {
    const timers: { fn: () => void; ms: number; id: number }[] = [];
    let seq = 0;
    const d = new Debouncer(30_000, {
      setTimeout: (fn, ms) => {
        const id = ++seq;
        timers.push({ fn, ms, id });
        return id;
      },
      clearTimeout: (h) => {
        const i = timers.findIndex((t) => t.id === h);
        if (i >= 0) timers.splice(i, 1);
      },
    });
    let runs = 0;
    d.schedule(() => runs++);
    d.schedule(() => runs++);
    d.schedule(() => runs++);
    expect(timers.length).toBe(1); // 앞의 둘은 취소됨
    expect(d.pending).toBe(true);
    timers[0].fn();
    expect(runs).toBe(1);
    expect(d.pending).toBe(false);
    d.schedule(() => runs++);
    d.cancel();
    expect(timers.length).toBe(1 + 0); // 취소돼 남은 타이머 없음 (실행된 건 배열에 남아 있음)
    expect(d.pending).toBe(false);
  });
});

describe("실패·재시도·경고", () => {
  it("실패하면 횟수가 늘고 간격이 2분→4분→8분… 최대 30분", () => {
    let s = st();
    s = applyFailure(s, "서버 꺼짐", iso(0));
    expect(s.failures).toBe(1);
    expect(s.lastError).toBe("서버 꺼짐");
    expect(retryDelayMs(1)).toBe(2 * 60_000);
    expect(retryDelayMs(2)).toBe(4 * 60_000);
    expect(retryDelayMs(3)).toBe(8 * 60_000);
    expect(retryDelayMs(10)).toBe(30 * 60_000);
    expect(shouldWarn(s)).toBe(false);
    s = applyFailure(applyFailure(s, "x", iso(1)), "x", iso(2));
    expect(shouldWarn(s)).toBe(true);
    const ok = applySuccess(s, "ledger", iso(3));
    expect(ok.failures).toBe(0);
    expect(ok.lastError).toBeNull();
    expect(ok.lastLedgerOkAt).toBe(iso(3));
    expect(ok.lastPhotosOkAt).toBeNull(); // 장부만 성공은 사진 성공이 아니다
  });
});

describe("6. 백업 중 브라우저 종료", () => {
  it("성공 기록이 없으므로 다음에 열면 같은 백업을 다시 계획한다", () => {
    const s = st({ ledgerChangedAt: iso(-60_000), lastAttemptAt: iso(-30_000) }); // 보내다 끊김 → 성공 시각 없음
    expect(planAutoBackup(s, T0)).toBe("full");
  });
});

// ── 서버와 주고받기 (가짜 fetch) ───────────────────────────────────
function fakeServer(opts: { failAt?: "upload-ledger" | "upload-photos" | "finalize"; unverified?: boolean } = {}) {
  const calls: { url: string; headers: Record<string, string>; bodyLen: number; json?: unknown }[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    const url = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = init?.body;
    const bodyLen = body instanceof Uint8Array ? body.length : typeof body === "string" ? body.length : 0;
    const call = { url, headers, bodyLen, json: typeof body === "string" && headers["content-type"] === "application/json" ? JSON.parse(body) : undefined };
    calls.push(call);
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
    if (url.endsWith("/session")) return json({ ok: true, token: "t".repeat(64) });
    if (url.endsWith("/upload")) {
      if (opts.failAt === "upload-ledger" && headers["x-backup-kind"] === "ledger") return json({ ok: false, error: "디스크 공간이 부족해요" }, 500);
      if (opts.failAt === "upload-photos" && headers["x-backup-kind"] === "photos") return json({ ok: false, error: "너무 커요" }, 413);
      return json({ ok: true, size: bodyLen });
    }
    if (url.endsWith("/finalize")) {
      if (opts.failAt === "finalize") return json({ ok: false, error: "해시가 달라요" }, 422);
      const c = call.json as { id: string; mode: string; photos: unknown };
      return json({ ok: true, manifest: { id: c.id, mode: c.mode, storedAt: "2026-10-09T09:00:05.000Z", verified: !opts.unverified, ledger: { file: "l.json", sha256: "x", size: 1 }, photos: c.photos ? { file: "p.zip", sha256: "y", size: 2, count: 1 } : null } });
    }
    return json({ ok: false, error: "없는 주소" }, 404);
  };
  return { fetchFn, calls };
}
const deps = (fetchFn: typeof fetch): BackupDeps => ({
  fetchFn,
  session: async () => "s".repeat(64),
  getLedgerText: () => '{"app":"sootdak-ledger","version":1,"data":{"transactions":[]}}',
  getPhotosZip: async () => ({ zip: new Uint8Array([80, 75, 5, 6, 0, 0]), count: 1 }),
  newId: () => "11111111-2222-4333-8444-555555555555",
  now: () => T0,
});

describe("F. 백업 중 변경 — 성공 시각은 읽은 시각", () => {
  it("보내는 동안 장부가 바뀌면 성공 뒤에도 '아직 안 됨'이다", () => {
    const snapshotAt = iso(0);
    const changedDuring = iso(5_000); // 읽은 뒤, 서버가 저장하기 전
    const s = st({ ledgerChangedAt: changedDuring, photosChangedAt: changedDuring });
    const after = applySuccess(s, "full", snapshotAt);
    expect(after.lastLedgerOkAt).toBe(snapshotAt);
    expect(isFullyBackedUp(after)).toBe(false);
    expect(planAutoBackup(after, new Date(T0.getTime() + 10_000))).toBe("full"); // 사진도 바뀌었으니 전체로 다시
  });
  it("보내기 전에 바뀐 것은 성공으로 덮인다", () => {
    const s = st({ ledgerChangedAt: iso(-1000) });
    const after = applySuccess(s, "ledger", iso(0));
    expect(isFullyBackedUp({ ...after, lastFullOkAt: iso(0), lastPhotosOkAt: iso(0) })).toBe(true);
  });
  it("runBackupUpload 는 장부·사진을 업로드보다 먼저 읽고, 읽기 시작 시각을 돌려준다", async () => {
    const order: string[] = [];
    const { fetchFn } = fakeServer();
    const d = deps(async (i, init) => {
      order.push("net:" + String(i).split("/").pop());
      return fetchFn(i, init);
    });
    d.getLedgerText = () => {
      order.push("read:ledger");
      return '{"app":"sootdak-ledger","version":1,"data":{"transactions":[]}}';
    };
    d.getPhotosZip = async () => {
      order.push("read:photos");
      return { zip: new Uint8Array([1]), count: 0 };
    };
    const r = await runBackupUpload("full", d);
    expect(order).toEqual(["read:ledger", "read:photos", "net:upload", "net:upload", "net:finalize"]);
    expect(r.snapshotAt).toBe(T0.toISOString());
    expect(r.manifest.verified).toBe(true);
  });
  it("성공 응답 직전에 연결이 끊기면 실패로 기록된다 (서버엔 파일이 남을 수 있음)", async () => {
    const { fetchFn } = fakeServer();
    const d = deps(async (i, init) => {
      if (String(i).endsWith("/finalize")) throw new TypeError("Failed to fetch");
      return fetchFn(i, init);
    });
    await expect(runBackupUpload("ledger", d)).rejects.toThrow("Failed to fetch");
  });
});

describe("1·2·3. 장부·사진·통합 백업 주고받기", () => {
  it("장부만: 업로드 1번 + 마무리, 같은 식별자, 해시 헤더 포함", async () => {
    const { fetchFn, calls } = fakeServer();
    const { manifest: m } = await runBackupUpload("ledger", deps(fetchFn));
    expect(m.verified).toBe(true);
    expect(m.mode).toBe("ledger");
    expect(calls.map((c) => c.url)).toEqual(["/api/backup/upload", "/api/backup/finalize"]);
    expect(calls[0].headers["x-backup-id"]).toBe("11111111-2222-4333-8444-555555555555");
    expect(calls[0].headers["x-backup-sha256"]).toMatch(/^[0-9a-f]{64}$/);
    expect(calls[0].headers["x-backup-client"]).toBe("1");
    expect(calls[0].headers["x-backup-session"]).toHaveLength(64);
    const fin = calls[1].json as { id: string; mode: string; photos: unknown; ledger: { size: number } };
    expect(fin.id).toBe(calls[0].headers["x-backup-id"]);
    expect(fin.photos).toBeNull();
    expect(fin.ledger.size).toBe(calls[0].bodyLen);
  });
  it("전체: 장부·사진 둘 다 같은 식별자로 올리고 마무리에 사진 정보가 든다", async () => {
    const { fetchFn, calls } = fakeServer();
    const { manifest: m } = await runBackupUpload("full", deps(fetchFn));
    expect(m.photos?.count).toBe(1);
    expect(calls.map((c) => c.headers["x-backup-kind"] ?? "-")).toEqual(["ledger", "photos", "-"]);
    expect(new Set(calls.slice(0, 2).map((c) => c.headers["x-backup-id"])).size).toBe(1);
    const fin = calls[2].json as { photos: { count: number; size: number } };
    expect(fin.photos.count).toBe(1);
    expect(fin.photos.size).toBe(6);
  });
  it("서버가 '검증 완료'라고 하지 않으면 성공으로 치지 않는다", async () => {
    const { fetchFn } = fakeServer({ unverified: true });
    await expect(runBackupUpload("ledger", deps(fetchFn))).rejects.toThrow("검증");
  });
  it("어느 단계든 실패하면 서버 메시지 그대로 던진다", async () => {
    await expect(runBackupUpload("ledger", deps(fakeServer({ failAt: "upload-ledger" }).fetchFn))).rejects.toThrow("디스크 공간");
    await expect(runBackupUpload("full", deps(fakeServer({ failAt: "upload-photos" }).fetchFn))).rejects.toThrow("너무 커요");
    await expect(runBackupUpload("ledger", deps(fakeServer({ failAt: "finalize" }).fetchFn))).rejects.toBeInstanceOf(BackupClientError);
  });
  it("세션 요청이 503 이면 '꺼짐'으로 돌려준다", async () => {
    const off: typeof fetch = async () => new Response(JSON.stringify({ ok: false, enabled: false, error: "BACKUP_DIR 없음" }), { status: 503 });
    expect(await fetchSession(off)).toEqual({ disabled: "BACKUP_DIR 없음" });
  });
});
