"use client";

import { useEffect, useRef } from "react";
import {
  applyFailure,
  applySuccess,
  Debouncer,
  DEBOUNCE_MS,
  fetchSession,
  fetchStatus,
  GIVE_UP_FAILURES,
  planAutoBackup,
  publishView,
  readAutoState,
  retryDelayMs,
  runBackupUpload,
  setManualRunner,
  writeAutoState,
  type AgentView,
  type AutoBackupState,
  type BackupMode,
  type ServerStatus,
} from "@/lib/autoBackup";
import { buildPhotoBackup, type PhotoBytes } from "@/lib/photoBackup";
import { getPhotoBlob, listAllPhotos } from "@/lib/photos";
import { exportBackup, photoOwnerIds } from "@/lib/storage/backup";
import { onLedgerChanged, onPhotosChanged } from "@/lib/storage/events";
import { readLocal } from "@/lib/storage/local";

// 화면 어딘가에 하나만 떠 있는 "자동 백업 일꾼". 보이는 건 없다.
//  - 앱이 열리면 서버에 세션을 받고 상태를 묻는다. 서버가 꺼져 있으면(503) 아무것도 안 한다.
//  - 장부가 바뀌면 30초 뒤 한 번 보낸다. 사진이 바뀌었거나 하루가 지났으면 전체(장부+사진)로.
//  - 실패하면 점점 긴 간격으로 다시. 6번 연속 실패하면 멈추고 사장님이 "지금 백업"을 눌러야 한다.
//  - 동시에 두 번 보내지 않는다 (running 가드).

const START_DELAY_MS = 8_000;
const PERIODIC_CHECK_MS = 30 * 60 * 1000;

export default function AutoBackupAgent() {
  const token = useRef<string | null>(null);
  const server = useRef<ServerStatus | null>(null);
  const state = useRef<AutoBackupState>(readAutoState());
  const running = useRef<BackupMode | null>(null);
  const retryHandle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextRetryAt = useRef<string | null>(null);
  const debouncer = useRef(new Debouncer(DEBOUNCE_MS));

  useEffect(() => {
    let alive = true;
    const deb = debouncer.current;
    // fetch 를 객체의 메서드로 넘기면 this 가 바뀌어 "Illegal invocation" 이 난다 → 항상 window 에서 부르는 함수로 감싼다
    const fetchFn: typeof fetch = (input, init) => window.fetch(input, init);
    const push = () => publishView({ server: server.current, state: state.current, running: running.current, nextRetryAt: nextRetryAt.current } satisfies AgentView);
    const save = (s: AutoBackupState) => {
      state.current = s;
      writeAutoState(s);
      push();
    };

    const session = async (): Promise<string> => {
      if (token.current) return token.current;
      const r = await fetchSession(fetchFn);
      if ("disabled" in r) throw new Error(r.disabled);
      token.current = r.token;
      return r.token;
    };

    const refreshStatus = async () => {
      try {
        const t = await session();
        server.current = await fetchStatus(fetchFn, t);
      } catch (e) {
        server.current = { enabled: false, reason: e instanceof Error ? e.message : String(e) };
      }
      push();
    };

    const getPhotosZip = async () => {
      const metas = await listAllPhotos();
      const photos: PhotoBytes[] = [];
      for (const meta of metas) {
        const blob = await getPhotoBlob(meta.id);
        if (!blob) throw new Error(`사진 ${meta.id} 를 읽지 못했어요.`);
        photos.push({ meta, bytes: new Uint8Array(await blob.arrayBuffer()) });
      }
      let owners = 0;
      try {
        owners = photoOwnerIds(readLocal()).size;
      } catch {}
      const { zip } = await buildPhotoBackup(photos, { ledgerOwnerIds: owners });
      return { zip, count: photos.length };
    };

    const run = async (mode: BackupMode, manual = false) => {
      if (!alive) return;
      if (running.current) return; // 중복 요청 무시
      if (server.current && !server.current.enabled) return;
      if (!manual && state.current.failures >= GIVE_UP_FAILURES) return;
      if (retryHandle.current) {
        clearTimeout(retryHandle.current);
        retryHandle.current = null;
        nextRetryAt.current = null;
      }
      running.current = mode;
      push();
      const at = new Date().toISOString();
      try {
        const m = await runBackupUpload(mode, { fetchFn, session, getLedgerText: exportBackup, getPhotosZip, newId: () => crypto.randomUUID(), now: () => new Date() });
        save(applySuccess(state.current, mode, m.storedAt));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if ((e as { status?: number })?.status === 401) token.current = null; // 세션 만료 → 다음엔 새로 받는다
        const next = applyFailure(state.current, msg, at);
        save(next);
        if (alive && next.failures < GIVE_UP_FAILURES) {
          const delay = retryDelayMs(next.failures);
          nextRetryAt.current = new Date(Date.now() + delay).toISOString();
          retryHandle.current = setTimeout(() => void run(planAutoBackup(state.current, new Date()) ?? mode), delay);
        }
      } finally {
        running.current = null;
        push();
        void refreshStatus();
      }
    };

    const kick = () => {
      const mode = planAutoBackup(state.current, new Date());
      if (mode) void run(mode);
    };

    // 변경 신호 → debounce → 보내기
    const offLedger = onLedgerChanged(() => {
      save({ ...state.current, ledgerChangedAt: new Date().toISOString() });
      deb.schedule(kick);
    });
    const offPhotos = onPhotosChanged(() => {
      save({ ...state.current, photosChangedAt: new Date().toISOString() });
      deb.schedule(kick);
    });
    setManualRunner((mode) => void run(mode, true));

    // 시작: 상태 확인 → 잠시 뒤 밀린 백업
    push();
    void refreshStatus().then(() => {
      if (!alive || !server.current?.enabled) return;
      setTimeout(kick, START_DELAY_MS);
    });
    const periodic = setInterval(() => {
      if (server.current?.enabled) kick();
    }, PERIODIC_CHECK_MS);

    return () => {
      alive = false;
      offLedger();
      offPhotos();
      setManualRunner(null);
      deb.cancel();
      if (retryHandle.current) clearTimeout(retryHandle.current);
      clearInterval(periodic);
    };
  }, []);

  return null;
}
