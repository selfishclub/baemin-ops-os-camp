"use client";

import { useEffect, useState } from "react";
import { Notice } from "@/components/ui";
import { countPhotosByOwner } from "@/lib/photos";
import { applyBackup, canRestore, diffBackup, exportBackup, inspectBackup, photoLinkRisk, RESTORE_WORD, summarize, type BackupDiff, type BackupInspection, type PhotoLinkRisk } from "@/lib/storage/backup";
import { mb } from "@/lib/storage/errors";
import { LAST_BACKUP_KEY, type LocalRead } from "@/lib/storage/local";

// 백업 파일 복원 창. 파일을 골라도 바로 덮어쓰지 않는다.
//  1 검사 → 2 미리보기(요약·차이·경고) → 3 사전 백업 확인 + "복원" 입력 → 4 한 번에 덮어쓰기
// 취소하면 어느 단계에서든 아무것도 바뀌지 않는다. 쓰기는 applyBackup 한 곳뿐이다.

type Step = "checking" | "rejected" | "preview" | "confirm" | "done" | "failed";

const when = (iso: string | null) => {
  if (!iso) return "알 수 없음";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

function download(text: string, name: string, type = "application/json") {
  const blob = new Blob([text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function RestoreDialog({ file, current, onClose, onRestored }: { file: File; current: LocalRead; onClose: () => void; onRestored: () => void }) {
  const [step, setStep] = useState<Step>("checking");
  const [inspection, setInspection] = useState<BackupInspection | null>(null);
  const [diff, setDiff] = useState<BackupDiff | null>(null);
  const [photos, setPhotos] = useState<PhotoLinkRisk | null>(null);
  const [typed, setTyped] = useState("");
  const [preBackupStarted, setPreBackupStarted] = useState(false);
  const [preBackupConfirmed, setPreBackupConfirmed] = useState(false);
  const [failMessage, setFailMessage] = useState<string | null>(null);

  const currentData = current.ok ? current.data : null;
  const damaged = !current.ok;
  const hasCurrent = damaged || (current.ok && !current.empty);

  useEffect(() => {
    let alive = true;
    (async () => {
      const text = await file.text();
      const ins = inspectBackup(text);
      if (!alive) return;
      setInspection(ins);
      if (!ins.ok) return setStep("rejected");
      if (currentData) setDiff(diffBackup(summarize(currentData), ins.summary));
      let counts: Record<string, number> = {};
      try {
        counts = await countPhotosByOwner();
      } catch {}
      if (!alive) return;
      setPhotos(photoLinkRisk(currentData, ins.data, counts));
      setStep("preview");
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  function downloadPreBackup() {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    if (damaged) download(current.raw, `sootdak-ledger-damaged-${stamp}.txt`, "text/plain");
    else download(exportBackup(), `sootdak-ledger-before-restore-${stamp}.json`);
    setPreBackupStarted(true);
  }

  function restore() {
    if (!inspection?.ok || !canRestore({ hasCurrent, typed, preBackupConfirmed })) return;
    try {
      applyBackup(inspection);
      try {
        window.localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString()); // 방금 사전 백업을 받았으니 백업 시각으로 친다
      } catch {}
      setStep("done");
    } catch (e) {
      setFailMessage(e instanceof Error ? e.message : String(e));
      setStep("failed");
    }
  }

  const s = inspection?.ok ? inspection.summary : null;

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="백업 파일 복원">
      <div className="card max-h-[90vh] w-full max-w-lg space-y-3 overflow-y-auto">
        <h2 className="text-base font-bold">백업 파일 복원 — {file.name}</h2>

        {step === "checking" && <p className="text-sm text-stone-600">파일을 검사하고 있어요… 아직 아무것도 바꾸지 않았어요.</p>}

        {step === "rejected" && inspection && !inspection.ok && (
          <>
            <Notice tone="error">이 파일은 복원할 수 없어요. 장부는 그대로예요.</Notice>
            <ul className="list-disc space-y-1 pl-5 text-sm text-stone-700">
              {inspection.errors.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
            <button className="btn-ghost w-full" onClick={onClose}>
              닫기
            </button>
          </>
        )}

        {step === "preview" && inspection?.ok && s && (
          <>
            <div className="rounded-xl bg-stone-50 p-3 text-sm ring-1 ring-stone-200">
              <p>
                <b>백업 저장 시각:</b> {when(inspection.savedAt)} · <b>버전:</b> {inspection.version} · <b>크기:</b> {mb(file.size)}
              </p>
              <table className="mt-2 w-full text-xs">
                <thead>
                  <tr className="text-stone-500">
                    <th className="py-0.5 text-left font-normal">항목</th>
                    <th className="py-0.5 text-right font-normal">{damaged ? "현재(읽을 수 없음)" : "현재 장부"}</th>
                    <th className="py-0.5 text-right font-normal">이 파일</th>
                  </tr>
                </thead>
                <tbody className="num">
                  {(diff?.rows ?? [
                    { label: "거래(통장)", current: 0, backup: s.transactions },
                    { label: "일별 매출", current: 0, backup: s.dailySales },
                    { label: "직원", current: 0, backup: s.staff },
                    { label: "근무 기록", current: 0, backup: s.shifts },
                    { label: "설정", current: 0, backup: s.settings },
                  ]).map((r) => (
                    <tr key={r.label} className={r.backup < r.current ? "text-red-700" : ""}>
                      <td className="py-0.5">{r.label}</td>
                      <td className="py-0.5 text-right">{damaged ? "—" : r.current.toLocaleString()}</td>
                      <td className="py-0.5 text-right">{r.backup.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-stone-600">
                거래가 있는 달: {s.txMonths.length ? s.txMonths.join(", ") : "없음"}
                <br />
                일별 매출: {s.saleDates ? `${s.saleDates.from} ~ ${s.saleDates.to}` : "없음"}
                <br />
                설정 {s.settings}개{s.settingKeys.length ? ` (${s.settingKeys.slice(0, 6).join(", ")}${s.settingKeys.length > 6 ? " …" : ""})` : ""}
              </p>
            </div>

            {inspection.filled.length > 0 && (
              <Notice tone="info">
                파일에 없어서 기본값으로 채우는 항목:
                <ul className="list-disc pl-5">
                  {inspection.filled.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </Notice>
            )}
            {inspection.warnings.map((m) => (
              <Notice key={m} tone="warn">
                {m}
              </Notice>
            ))}
            {diff?.olderThanCurrent && <Notice tone="warn">이 백업은 현재 장부보다 오래됐어요. 그 뒤에 넣은 숫자는 복원하면 사라져요.</Notice>}
            {diff && diff.losses.length > 0 && (
              <Notice tone="error">
                <b>복원하면 사라질 수 있는 것</b>
                <ul className="list-disc pl-5">
                  {diff.losses.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </Notice>
            )}
            {damaged && <Notice tone="warn">지금 저장된 장부는 읽을 수 없는 상태라 현재와 비교할 수 없어요. 이 파일로 덮어쓰면 손상된 원본은 사라져요. 다음 단계에서 원본을 먼저 내려받아요.</Notice>}
            {photos?.message && <Notice tone={photos.orphanedAfter > 0 ? "error" : "info"}>{photos.message}</Notice>}
            <Notice tone="info">영수증 사진은 이 파일에 들어 있지 않아요. 복원해도 사진은 지워지지 않아요.</Notice>

            <div className="flex gap-2 pt-1">
              <button className="btn-ghost flex-1" onClick={onClose}>
                취소 (아무것도 바꾸지 않음)
              </button>
              <button className="btn-primary flex-1" onClick={() => setStep("confirm")}>
                내용을 확인했어요 → 다음
              </button>
            </div>
          </>
        )}

        {step === "confirm" && inspection?.ok && (
          <>
            {hasCurrent ? (
              <>
                <p className="text-sm text-stone-700">
                  복원하면 <b>현재 저장된 장부가 통째로 바뀌어요.</b> 되돌릴 수 있게, 먼저 {damaged ? "손상된 원본" : "현재 장부"}를 파일로 받아 두세요.
                </p>
                <button className="btn-primary w-full" onClick={downloadPreBackup}>
                  {damaged ? "손상된 원본 내려받기 (.txt)" : "현재 장부 백업 파일 받기 (.json)"}
                </button>
                {preBackupStarted && <Notice tone="info">내려받기를 시작했어요. 브라우저는 파일이 실제로 저장됐는지 알려 주지 않아요. 다운로드 폴더를 열어 파일이 있는지 확인한 뒤 아래에 체크해 주세요.</Notice>}
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1" checked={preBackupConfirmed} onChange={(e) => setPreBackupConfirmed(e.target.checked)} aria-label="사전 백업 파일 확인" />
                  <span>다운로드 폴더에서 {damaged ? "손상된 원본 파일" : "방금 받은 백업 파일"}이 저장된 것을 직접 확인했어요.</span>
                </label>
                <label className="block text-sm">
                  확인했으면 아래에 <b>{RESTORE_WORD}</b> 이라고 적어 주세요.
                  <input className="field mt-1 w-full" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={RESTORE_WORD} aria-label="복원 확인 글자" />
                </label>
              </>
            ) : (
              <p className="text-sm text-stone-700">지금 장부가 비어 있어서 잃을 것이 없어요. 바로 복원할 수 있어요.</p>
            )}
            <div className="flex gap-2 pt-1">
              <button className="btn-ghost flex-1" onClick={onClose}>
                취소 (아무것도 바꾸지 않음)
              </button>
              <button className="btn flex-1 bg-red-600 text-white hover:bg-red-700 disabled:opacity-40" disabled={!canRestore({ hasCurrent, typed, preBackupConfirmed })} onClick={restore}>
                복원 실행
              </button>
            </div>
          </>
        )}

        {step === "done" && (
          <>
            <Notice tone="ok">복원했어요. 장부를 다시 읽어요.</Notice>
            <button className="btn-primary w-full" onClick={onRestored}>
              확인
            </button>
          </>
        )}

        {step === "failed" && (
          <>
            <Notice tone="error">
              복원하지 못했어요. <b>현재 장부는 그대로예요.</b>
              <br />
              {failMessage}
            </Notice>
            <button className="btn-ghost w-full" onClick={onClose}>
              닫기
            </button>
          </>
        )}
      </div>
    </div>
  );
}
