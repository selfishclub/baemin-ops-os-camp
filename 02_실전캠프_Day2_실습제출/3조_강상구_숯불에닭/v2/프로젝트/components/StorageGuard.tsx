"use client";

import { useEffect, useRef, useState } from "react";
import { Notice } from "@/components/ui";
import { mb } from "@/lib/storage/errors";
import { onStorageFailure, type StorageFailedDetail } from "@/lib/storage/events";
import { inspectLocal, type LocalRead } from "@/lib/storage/local";
import RestoreDialog from "@/components/RestoreDialog";

// 저장소가 실패했을 때 화면에 보이는 두 가지:
//  1) StorageFailureToast — 어느 화면에서든 저장이 실패하면 위에 빨간 알림. 사장님이 닫기 전까지 남는다.
//  2) DamagedRecovery — 저장된 장부를 읽을 수 없을 때, 화면 대신 보이는 복구 안내. 입력은 전부 잠긴다.

const time = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export function useStorageFailure(onFail?: (d: StorageFailedDetail) => void) {
  const [failure, setFailure] = useState<StorageFailedDetail | null>(null);
  const cb = useRef(onFail);
  cb.current = onFail;
  useEffect(
    () =>
      onStorageFailure((d) => {
        setFailure(d);
        cb.current?.(d);
      }),
    [],
  );
  return { failure, dismiss: () => setFailure(null) };
}

export function StorageFailureToast({ failure, onDismiss }: { failure: StorageFailedDetail | null; onDismiss: () => void }) {
  if (!failure) return null;
  return (
    <div role="alert" className="fixed inset-x-0 top-0 z-40 mx-auto max-w-3xl px-3 pt-2">
      <div className="rounded-xl bg-red-600 px-4 py-3 text-sm text-white shadow-lg ring-2 ring-red-800">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="font-bold">⚠️ 저장되지 않았어요 ({time(failure.at)})</p>
            <p>{failure.message}</p>
            <p className="text-xs text-red-100">화면에 보이는 값은 아직 저장 전이에요. 원인을 해결한 뒤 다시 저장해 주세요.</p>
          </div>
          <button aria-label="알림 닫기" className="shrink-0 rounded-lg bg-red-700 px-2 py-1 text-xs font-semibold hover:bg-red-800" onClick={onDismiss}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

export function useLocalHealth(enabled: boolean) {
  const [health, setHealth] = useState<LocalRead | null>(null);
  const recheck = () => {
    if (!enabled) return;
    setHealth(inspectLocal());
  };
  useEffect(recheck, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  return { health, recheck };
}

export function DamagedRecovery({ read, onRecovered }: { read: Extract<LocalRead, { ok: false }>; onRecovered: () => void }) {
  const [note, setNote] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const rawBytes = read.raw.length * 2;

  function downloadRaw() {
    const blob = new Blob([read.raw], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sootdak-ledger-damaged-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
    setNote({ tone: "info", text: "손상된 원본 내려받기를 시작했어요. 다운로드 폴더에 파일이 있는지 확인하고, 지우지 말고 보관해 주세요." });
  }

  // 복원은 규칙 탭과 같은 안전 절차(검사 → 미리보기 → 원본 내려받기 확인 + "복원" 입력)를 쓴다. 파일을 골라도 바로 덮어쓰지 않는다.
  function pickRestore(file: File) {
    setRestoreFile(file);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <section className="card space-y-3 border-2 border-red-300" role="alert">
      <h2 className="text-base font-bold text-red-700">{read.kind === "unavailable" ? "브라우저 저장소에 접근할 수 없어요" : "저장된 장부를 읽을 수 없어요"}</h2>
      <p className="text-sm text-stone-700">
        이유: <b>{read.reason}</b>
      </p>
      <p className="text-sm text-stone-700">
        장부를 잘못 덮어쓰지 않도록 <b>모든 입력을 잠갔어요.</b> 원본은 건드리지 않았어요{read.kind === "damaged" ? ` (${mb(rawBytes)})` : ""}.
      </p>
      {read.kind === "damaged" && (
        <ol className="list-decimal space-y-1 pl-5 text-sm text-stone-700">
          <li>먼저 <b>손상된 원본을 내려받아</b> 보관하세요. 나중에 사람이 고쳐서 살릴 수도 있어요.</li>
          <li>규칙 탭에서 받아 둔 <b>백업 파일(.json)</b>로 복원하세요. 복원 전에는 원본을 덮어쓰지 않아요.</li>
          <li>백업 파일이 없으면 <b>아무것도 누르지 말고</b> 도와주는 사람에게 연락하세요.</li>
        </ol>
      )}
      {read.kind === "unavailable" && (
        <p className="text-sm text-stone-700">사생활 보호(시크릿) 창이거나 브라우저가 저장을 막고 있을 수 있어요. 평소 쓰던 창으로 다시 열어 주세요.</p>
      )}
      {note && <Notice tone={note.tone}>{note.text}</Notice>}
      <div className="flex flex-wrap gap-2">
        {read.kind === "damaged" && (
          <button className="btn-primary" onClick={downloadRaw}>
            손상된 원본 내려받기
          </button>
        )}
        <button className="btn-ghost" onClick={() => fileRef.current?.click()}>
          백업 파일로 복원
        </button>
        <input ref={fileRef} type="file" accept=".json" aria-label="백업 파일" className="hidden" onChange={(e) => e.target.files?.[0] && pickRestore(e.target.files[0])} />
        <button className="btn-ghost" onClick={onRecovered}>
          다시 확인
        </button>
      </div>
      {restoreFile && (
        <RestoreDialog
          file={restoreFile}
          current={read}
          onClose={() => setRestoreFile(null)}
          onRestored={() => {
            setRestoreFile(null);
            setNote({ tone: "ok", text: "백업을 불러왔어요. 장부를 다시 확인할게요." });
            onRecovered();
          }}
        />
      )}
    </section>
  );
}
