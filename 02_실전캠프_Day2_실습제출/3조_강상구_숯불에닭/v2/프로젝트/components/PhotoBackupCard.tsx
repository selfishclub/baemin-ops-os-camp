"use client";

import { useEffect, useRef, useState } from "react";
import { Notice } from "@/components/ui";
import PhotoRestoreDialog from "@/components/PhotoRestoreDialog";
import { getPhotoBlob, listAllPhotos, photosAvailable, photosTotalSize } from "@/lib/photos";
import { buildPhotoBackup, markPhotoBackupStarted, mbText, PHOTO_BACKUP_MAX_BYTES, PHOTO_BACKUP_WARN_BYTES, readLastPhotoBackupAt, type PhotoBytes } from "@/lib/photoBackup";
import { exportBackup, photoOwnerIds } from "@/lib/storage/backup";
import { markBackupStarted, readLocal } from "@/lib/storage/local";

// 규칙 탭 "영수증 사진 백업" 카드.
//  - 사진 수·용량 표시, ZIP 으로 내려받기, ZIP 불러오기(복원 창), 장부+사진 한 번에 받기.
//  - 사진 0장이어도 manifest 만 든 ZIP 을 정상으로 만든다.
//  - 백업은 읽기만 한다. 복원은 PhotoRestoreDialog 가 맡는다.

const when = (iso: string | null) => {
  if (!iso) return "없음";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

function downloadBytes(bytes: Uint8Array, name: string, type: string) {
  const blob = new Blob([bytes as BlobPart], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
function downloadText(text: string, name: string, type: string) {
  const blob = new Blob([text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function PhotoBackupCard({ onLedgerBackup }: { onLedgerBackup?: () => void }) {
  const [size, setSize] = useState<{ count: number; bytes: number } | null>(null);
  const [lastAt, setLastAt] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: "ok" | "error" | "warn" | "info"; text: string } | null>(null);
  const [confirmBig, setConfirmBig] = useState<null | (() => void)>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    photosTotalSize()
      .then(setSize)
      .catch(() => setSize({ count: 0, bytes: 0 }));
    setLastAt(readLastPhotoBackupAt());
  }, [tick]);

  // 사진을 전부 읽어 ZIP 바이트로 만든다. 브라우저 저장소는 읽기만.
  async function makeZip(ledgerSavedAt: string | null): Promise<Uint8Array> {
    const metas = await listAllPhotos();
    const photos: PhotoBytes[] = [];
    let done = 0;
    for (const meta of metas) {
      const blob = await getPhotoBlob(meta.id);
      if (!blob) throw new Error(`사진 ${meta.name} 의 내용을 읽지 못했어요 (${meta.id}). 백업을 멈췄어요.`);
      photos.push({ meta, bytes: new Uint8Array(await blob.arrayBuffer()) });
      done += 1;
      if (done % 20 === 0) setBusy(`사진 읽는 중 ${done}/${metas.length}…`);
    }
    let ownerCount = 0;
    try {
      ownerCount = photoOwnerIds(readLocal()).size;
    } catch {}
    setBusy("ZIP 만드는 중…");
    const { zip } = await buildPhotoBackup(photos, { ledgerSavedAt, ledgerOwnerIds: ownerCount });
    return zip;
  }

  async function runBackup(withLedger: boolean) {
    const go = async () => {
      setConfirmBig(null);
      setBusy("준비 중…");
      setNote(null);
      try {
        let ledgerSavedAt: string | null = null;
        if (withLedger) {
          const text = exportBackup(); // 장부가 손상 상태면 여기서 오류 → 아래 catch
          ledgerSavedAt = (JSON.parse(text) as { savedAt?: string }).savedAt ?? null;
          downloadText(text, `sootdak-ledger-backup-${new Date().toISOString().slice(0, 10)}.json`, "application/json");
          markBackupStarted();
          onLedgerBackup?.();
        }
        const zip = await makeZip(ledgerSavedAt);
        const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        downloadBytes(zip, `sootdak-ledger-photos-${stamp}.zip`, "application/zip");
        markPhotoBackupStarted();
        setTick((t) => t + 1);
        setNote({
          tone: "ok",
          text: `${withLedger ? "장부 파일(.json)과 " : ""}사진 ZIP(${mbText(zip.length)}, ${size?.count ?? 0}장) 내려받기를 시작했어요. 다운로드 폴더에 파일이 ${withLedger ? "두 개 " : ""}있는지 직접 확인해 주세요. 사진이 들어 있으니 단톡방 등에 올리지 마세요.`,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const oom = /memory|allocation|RangeError|Array buffer/i.test(msg) || e instanceof RangeError;
        setNote({ tone: "error", text: oom ? `브라우저 메모리가 모자라 ZIP 을 만들지 못했어요. 다른 탭을 닫고 다시 해 보세요. (${msg})` : `사진 백업을 만들지 못했어요: ${msg}` });
      } finally {
        setBusy(null);
      }
    };
    const bytes = size?.bytes ?? 0;
    if (bytes > PHOTO_BACKUP_MAX_BYTES) {
      setNote({ tone: "error", text: `사진이 ${mbText(bytes)}라 한 번에 백업하기엔 너무 커요 (한도 ${mbText(PHOTO_BACKUP_MAX_BYTES)}). 나눠 받는 기능은 아직 없어요.` });
      return;
    }
    if (bytes > PHOTO_BACKUP_WARN_BYTES) {
      setConfirmBig(() => go);
      return;
    }
    await go();
  }

  if (!photosAvailable()) return null;

  return (
    <div className="space-y-2 rounded-xl bg-stone-50 p-3 text-sm ring-1 ring-stone-200">
      <div className="flex items-baseline justify-between">
        <span className="font-semibold">영수증 사진</span>
        <span className="num text-xs text-stone-600">{size ? `${size.count}장 · ${mbText(size.bytes)}` : "세는 중…"}</span>
      </div>
      <p className="text-xs text-stone-500">
        사진은 장부 백업 파일(.json)에 들어가지 않아요. 따로 ZIP 으로 받아 두세요. 마지막 사진 백업: {when(lastAt)}
        {lastAt && " 에 내려받기 시작"}
      </p>
      {note && <Notice tone={note.tone}>{note.text}</Notice>}
      {busy && <Notice tone="info">{busy}</Notice>}
      {confirmBig && (
        <Notice tone="warn">
          사진이 {mbText(size?.bytes ?? 0)}예요. ZIP 을 만드는 동안 브라우저 메모리를 그만큼 더 써요. 다른 탭을 닫고 진행하세요.
          <div className="mt-2 flex gap-2">
            <button className="btn-ghost text-xs" onClick={() => setConfirmBig(null)}>
              취소
            </button>
            <button className="btn-primary text-xs" onClick={() => confirmBig()}>
              그래도 진행
            </button>
          </div>
        </Notice>
      )}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={!!busy} onClick={() => runBackup(false)}>
          사진 백업 ZIP 받기
        </button>
        <button className="btn-ghost" disabled={!!busy} onClick={() => runBackup(true)}>
          장부 + 사진 한 번에 받기
        </button>
        <button className="btn-ghost" disabled={!!busy} onClick={() => fileRef.current?.click()}>
          사진 백업 불러오기
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".zip,application/zip"
          aria-label="사진 백업 파일"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setRestoreFile(f);
            e.target.value = "";
          }}
        />
      </div>
      {restoreFile && (
        <PhotoRestoreDialog
          file={restoreFile}
          onClose={() => setRestoreFile(null)}
          onDone={(summary) => {
            setRestoreFile(null);
            setTick((t) => t + 1);
            setNote({ tone: "ok", text: summary });
          }}
        />
      )}
    </div>
  );
}
