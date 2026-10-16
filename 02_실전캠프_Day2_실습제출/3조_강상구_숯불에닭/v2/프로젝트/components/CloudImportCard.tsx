"use client";

import { useRef, useState } from "react";
import { Notice } from "@/components/ui";
import { isBasic } from "@/lib/edition";
import { getStore } from "@/lib/storage";
import { inspectBackup, type BackupInspection } from "@/lib/storage/backup";
import { importToStore, planImport, type ImportSummary } from "@/lib/storage/cloudImport";

// 인터넷 모드에서: 사장님 PC(내 PC 모드)에서 저장한 백업 파일(.json)을 이 가게의 인터넷 저장소에 넣는다.
//  1 파일 고르기 → 2 검사·요약 보여 주기 → 3 "넣기" → 4 진행률 → 끝.
//  이미 있는 자료 위에 겹쳐 넣는다 (같은 거래 번호는 바꾸고, 그날 매출·근무는 파일 것으로 통째로).
export function CloudImportCard({ onDone }: { onDone?: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [inspection, setInspection] = useState<Extract<BackupInspection, { ok: true }> | null>(null);
  const [plan, setPlan] = useState<ImportSummary | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "warn" | "error" | "info"; text: string } | null>(null);
  const basic = isBasic();

  async function onFile(file: File) {
    setMsg(null);
    setPlan(null);
    const text = await file.text();
    const ins = inspectBackup(text);
    if (!ins.ok) {
      setMsg({ tone: "error", text: ins.errors.join(" ") });
      setInspection(null);
      return;
    }
    setFileName(file.name);
    setInspection(ins);
    setPlan(planImport(ins.data, basic));
    if (fileRef.current) fileRef.current.value = "";
  }

  async function run() {
    if (!inspection || !plan || progress) return;
    setMsg(null);
    setProgress({ done: 0, total: plan.steps });
    try {
      const r = await importToStore(getStore(), inspection.data, basic, (done, total) => setProgress({ done, total }));
      setMsg({
        tone: "ok",
        text: `넣었어요 — 거래 ${r.transactions}줄 · 일별 매출 ${r.saleDates}일 · 근무 ${r.shiftDates}일 · 직원 ${r.staff}명 · 설정 ${r.settings}개${r.skippedSettings.length ? ` (리뷰·상권 자료 ${r.skippedSettings.length}개는 기본판에 없어서 뺐어요)` : ""}. 다른 기기에서도 같은 이메일로 로그인하면 보여요.`,
      });
      setInspection(null);
      setPlan(null);
      onDone?.();
    } catch (e) {
      setMsg({ tone: "error", text: `중간에 멈췄어요: ${e instanceof Error ? e.message : e}. 인터넷을 확인하고 같은 파일로 다시 넣으면 이어서 돼요 (같은 자료는 덮어써요).` });
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-stone-200 bg-stone-50 p-3">
      <h3 className="text-sm font-bold">내 PC 장부를 여기로 옮기기</h3>
      <p className="text-xs text-stone-600">
        PC 장부의 규칙 탭에서 <b>백업 파일 저장</b>으로 받은 .json 파일을 고르면, 이 가게의 인터넷 저장소에 들어가요. 이미 있는 자료 위에 겹쳐 넣어요.
      </p>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <input ref={fileRef} type="file" accept=".json" aria-label="내 PC 백업 파일" className="hidden" onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />
      {!inspection ? (
        <button className="btn-ghost" onClick={() => fileRef.current?.click()}>
          백업 파일 고르기
        </button>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-stone-600">
            <b>{fileName}</b> · 요약: 거래 {plan?.transactions}줄, 일별 매출 {plan?.saleDates}일, 근무 {plan?.shiftDates}일, 직원 {plan?.staff}명, 규칙 {plan?.rules}개, 설정 {plan?.settings}개
            {plan && plan.skippedSettings.length > 0 && <> (리뷰·상권 자료 {plan.skippedSettings.length}개는 기본판에 없어서 안 넣어요)</>}
          </p>
          {inspection.warnings.length > 0 && <Notice tone="warn">{inspection.warnings.slice(0, 3).join(" ")}</Notice>}
          {progress ? (
            <div>
              <div className="h-2 overflow-hidden rounded-full bg-stone-200">
                <div className="h-2 bg-[#6c8a66] transition-all" style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 100}%` }} />
              </div>
              <p className="num mt-1 text-xs text-stone-500">
                {progress.done} / {progress.total} — 창을 닫지 말고 기다려 주세요
              </p>
            </div>
          ) : (
            <div className="flex gap-2">
              <button className="btn-primary" onClick={() => void run()}>
                이 파일을 인터넷 저장소에 넣기
              </button>
              <button
                className="btn-ghost"
                onClick={() => {
                  setInspection(null);
                  setPlan(null);
                }}
              >
                취소
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
