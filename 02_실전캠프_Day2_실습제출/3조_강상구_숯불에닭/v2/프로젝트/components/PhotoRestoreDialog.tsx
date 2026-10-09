"use client";

import { useEffect, useState } from "react";
import { Notice } from "@/components/ui";
import { addPhotosAtomic, getPhotoBlob, listAllPhotos } from "@/lib/photos";
import { inspectPhotoBackup, mbText, planPhotoRestore, restorePhotos, sha256Hex, type PhotoBackupInspection, type PhotoRestorePlan, type PhotoRestoreResult } from "@/lib/photoBackup";
import { photoOwnerIds } from "@/lib/storage/backup";
import { readLocal } from "@/lib/storage/local";

// 사진 ZIP 복원 창. 장부 복원과 별개다.
//  검사(manifest·해시·경로) → 계획(새 사진/건너뜀/충돌, 연결 여부) → 확인 → 한 트랜잭션으로 추가.
//  기존 사진은 절대 지우지 않고, 같은 id 는 덮어쓰지 않는다. 실패하면 하나도 저장되지 않으며 다시 시도할 수 있다.

type Step = "checking" | "rejected" | "preview" | "done";

export default function PhotoRestoreDialog({ file, onClose, onDone }: { file: File; onClose: () => void; onDone: (summary: string) => void }) {
  const [step, setStep] = useState<Step>("checking");
  const [ins, setIns] = useState<PhotoBackupInspection | null>(null);
  const [plan, setPlan] = useState<PhotoRestorePlan | null>(null);
  const [ledgerNote, setLedgerNote] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PhotoRestoreResult | null>(null);
  const [attempt, setAttempt] = useState(0);

  async function makePlan(inspection: Extract<PhotoBackupInspection, { ok: true }>) {
    // 지금 있는 사진 중 같은 id 의 내용 해시 (충돌 판단용)
    const existing = await listAllPhotos();
    const ids = new Set(inspection.entries.map((e) => e.entry.id));
    const existingSha = new Map<string, string>();
    for (const m of existing) {
      if (!ids.has(m.id)) continue;
      const blob = await getPhotoBlob(m.id);
      existingSha.set(m.id, blob ? await sha256Hex(new Uint8Array(await blob.arrayBuffer())) : "");
    }
    let owners = new Set<string>();
    try {
      owners = photoOwnerIds(readLocal());
      setLedgerNote(null);
    } catch {
      setLedgerNote("지금 장부를 읽을 수 없어서 어느 영수증과 연결되는지 확인하지 못했어요. 사진은 그대로 넣을 수 있고, 장부를 복구하면 연결돼요.");
    }
    return planPhotoRestore(inspection, existingSha, owners);
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const inspection = await inspectPhotoBackup(bytes);
        if (!alive) return;
        setIns(inspection);
        if (!inspection.ok) return setStep("rejected");
        setPlan(await makePlan(inspection));
        if (!alive) return;
        setStep("preview");
      } catch (e) {
        if (!alive) return;
        setIns({ ok: false, errors: [`파일을 읽지 못했어요: ${e instanceof Error ? e.message : String(e)}`] });
        setStep("rejected");
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, attempt]);

  async function run() {
    if (!plan || !confirmed || running) return;
    setRunning(true);
    try {
      const r = await restorePhotos(plan, { addAll: (rs) => addPhotosAtomic(rs.map((x) => ({ ...x.meta, blob: x.blob }))) });
      setResult(r);
      setStep("done");
    } finally {
      setRunning(false);
    }
  }

  const summaryText = (r: PhotoRestoreResult) => `사진 ${r.added}장을 넣었어요. 건너뜀 ${r.skipped}장, 충돌 ${r.conflicts}장.`;

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="사진 백업 복원">
      <div className="card max-h-[90vh] w-full max-w-lg space-y-3 overflow-y-auto">
        <h2 className="text-base font-bold">사진 백업 복원 — {file.name}</h2>

        {step === "checking" && <p className="text-sm text-stone-600">ZIP 을 검사하고 사진마다 해시를 맞춰 보고 있어요… 아직 아무것도 바꾸지 않았어요.</p>}

        {step === "rejected" && ins && !ins.ok && (
          <>
            <Notice tone="error">이 파일은 복원할 수 없어요. 기존 사진은 그대로예요.</Notice>
            <ul className="list-disc space-y-1 pl-5 text-sm text-stone-700">
              {ins.errors.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
            <button className="btn-ghost w-full" onClick={onClose}>
              닫기
            </button>
          </>
        )}

        {step === "preview" && ins?.ok && plan && (
          <>
            <div className="rounded-xl bg-stone-50 p-3 text-sm ring-1 ring-stone-200">
              <p>
                <b>백업 만든 시각:</b> {ins.manifest.createdAt || "알 수 없음"} · <b>형식:</b> {ins.manifest.format} · <b>앱:</b> {ins.manifest.appVersion}
                {ins.manifest.ledgerSavedAt && (
                  <>
                    <br />
                    <b>같이 받은 장부 백업:</b> {ins.manifest.ledgerSavedAt}
                  </>
                )}
              </p>
              <table className="mt-2 w-full text-xs">
                <tbody className="num">
                  <tr>
                    <td className="py-0.5">ZIP 안 사진</td>
                    <td className="py-0.5 text-right">{ins.entries.length}장 · {mbText(ins.totalBytes)}</td>
                  </tr>
                  <tr>
                    <td className="py-0.5">검사 통과(정상)</td>
                    <td className="py-0.5 text-right">{ins.entries.length}장</td>
                  </tr>
                  <tr className="text-emerald-800">
                    <td className="py-0.5">새로 넣을 사진</td>
                    <td className="py-0.5 text-right">
                      {plan.add}장 · {mbText(plan.addBytes)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-0.5">이미 있어서 건너뜀 (같은 사진)</td>
                    <td className="py-0.5 text-right">{plan.skip}장</td>
                  </tr>
                  <tr className={plan.conflict ? "text-red-700" : ""}>
                    <td className="py-0.5">충돌 (같은 번호, 다른 내용) — 덮어쓰지 않음</td>
                    <td className="py-0.5 text-right">{plan.conflict}장</td>
                  </tr>
                  <tr>
                    <td className="py-0.5">넣을 사진 중 장부의 영수증·고정비와 연결됨</td>
                    <td className="py-0.5 text-right">{plan.linked}장</td>
                  </tr>
                  <tr className={plan.unlinked ? "text-amber-800" : ""}>
                    <td className="py-0.5">넣을 사진 중 연결 안 됨 (장부에 그 영수증 없음)</td>
                    <td className="py-0.5 text-right">{plan.unlinked}장</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {ins.warnings.map((m) => (
              <Notice key={m} tone="warn">
                {m}
              </Notice>
            ))}
            {ledgerNote && <Notice tone="warn">{ledgerNote}</Notice>}
            {plan.conflict > 0 && <Notice tone="error">충돌 {plan.conflict}장은 그대로 두고 넣지 않아요. 지금 있는 사진이 유지돼요. 백업 쪽 사진이 필요하면 도와주는 사람에게 알려 주세요.</Notice>}
            {plan.unlinked > 0 && <Notice tone="warn">연결 안 되는 {plan.unlinked}장은 넣어도 화면에 보이지 않아요 (영수증 기록이 없어서). 장부 백업을 먼저 복원하면 연결될 수 있어요.</Notice>}
            <Notice tone="info">기존 사진은 지우지 않아요. 새 사진 {plan.add}장만 더해요. 전부 들어가거나, 문제가 생기면 하나도 들어가지 않아요.</Notice>
            {plan.add > 0 && (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} aria-label="사진 복원 확인" />
                <span>위 내용을 확인했고, 새 사진 {plan.add}장을 넣는 데 동의해요.</span>
              </label>
            )}
            <div className="flex gap-2 pt-1">
              <button className="btn-ghost flex-1" onClick={onClose} disabled={running}>
                취소 (아무것도 바꾸지 않음)
              </button>
              <button className="btn-primary flex-1 disabled:opacity-40" disabled={plan.add === 0 || !confirmed || running} onClick={run}>
                {running ? "넣는 중…" : plan.add === 0 ? "넣을 사진이 없어요" : `사진 ${plan.add}장 넣기`}
              </button>
            </div>
          </>
        )}

        {step === "done" && result && (
          <>
            {result.error ? (
              <>
                <Notice tone="error">
                  사진을 넣지 못했어요. <b>하나도 저장되지 않았고 기존 사진은 그대로예요.</b>
                  <br />
                  {result.error}
                </Notice>
                <div className="flex gap-2">
                  <button className="btn-ghost flex-1" onClick={onClose}>
                    닫기
                  </button>
                  <button
                    className="btn-primary flex-1"
                    onClick={() => {
                      setResult(null);
                      setConfirmed(false);
                      setStep("checking");
                      setAttempt((a) => a + 1);
                    }}
                  >
                    다시 시도
                  </button>
                </div>
              </>
            ) : (
              <>
                <Notice tone="ok">{summaryText(result)}</Notice>
                <button className="btn-primary w-full" onClick={() => onDone(summaryText(result))}>
                  확인
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
