"use client";

import { useRef, useState } from "react";
import { Notice } from "@/components/ui";
import { EXPORT_UPDATED_EVENT } from "@/components/useExport";
import { inspectBackup, mergeSettings, settingChoices, type BackupInspection, type SettingChoice } from "@/lib/storage/backup";
import { inspectLocal } from "@/lib/storage/local";

// 백업에서 "설정만" 골라 되살리기 — 백업 전체를 불러오면 그 뒤 넣은 매출·거래가 지워지는데,
// 리뷰 수집 자료·키워드 엑셀·광고 시작안처럼 설정 칸에 든 것만 끼워 넣으면 매출은 그대로 둘 수 있다.
export function SettingsRestoreCard({ onDone }: { onDone?: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [inspection, setInspection] = useState<Extract<BackupInspection, { ok: true }> | null>(null);
  const [choices, setChoices] = useState<SettingChoice[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ tone: "ok" | "warn" | "error" | "info"; text: string } | null>(null);

  async function onFile(file: File) {
    setMsg(null);
    const text = await file.text();
    const ins = inspectBackup(text);
    if (!ins.ok) {
      setMsg({ tone: "error", text: ins.errors.join(" ") });
      setInspection(null);
      return;
    }
    const cur = inspectLocal();
    const list = settingChoices(ins.data, cur.ok ? cur.data : null);
    setFileName(file.name);
    setInspection(ins);
    setChoices(list);
    setPicked(new Set(list.filter((c) => !c.inCurrent).map((c) => c.key))); // 지금 없는 것만 기본으로 체크
    if (fileRef.current) fileRef.current.value = "";
  }

  function apply() {
    if (!inspection || picked.size === 0) return;
    try {
      const r = mergeSettings(inspection.data, [...picked]);
      window.dispatchEvent(new CustomEvent(EXPORT_UPDATED_EVENT));
      setMsg({ tone: "ok", text: `설정 ${r.added.length + r.replaced.length}개를 넣었어요 (새로 ${r.added.length} · 덮어씀 ${r.replaced.length}). 거래·매출은 그대로예요. 리뷰·상권 탭을 열면 보여요.` });
      setInspection(null);
      setChoices([]);
      onDone?.();
    } catch (e) {
      setMsg({ tone: "error", text: `넣지 못했어요 (${e instanceof Error ? e.message : e}). 저장 공간이 부족하면 오래된 사진 백업을 지워 주세요.` });
    }
  }

  const missing = choices.filter((c) => !c.inCurrent);
  const present = choices.filter((c) => c.inCurrent);
  const toggle = (k: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  return (
    <div className="rounded-xl bg-stone-50 p-3 space-y-2">
      <p className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <b>백업에서 설정만 되살리기</b>
        <button className="btn-ghost px-3 py-1 text-xs" onClick={() => fileRef.current?.click()}>
          백업 파일 고르기
        </button>
        <input ref={fileRef} type="file" accept=".json" aria-label="설정 되살릴 백업 파일" className="hidden" onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />
      </p>
      <p className="text-xs text-stone-500">백업 전체를 불러오면 그 뒤에 넣은 매출·거래가 사라져요. 리뷰 수집 자료·키워드 엑셀·광고 시작안처럼 "설정" 칸에 든 것만 골라 넣으면 매출은 그대로 두고 되살릴 수 있어요. 자동 백업 폴더(문서 → 손익장부백업)의 ledger-날짜.json 파일을 고르세요.</p>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {inspection && (
        <>
          <p className="num text-xs text-stone-600">
            {fileName} · 저장 시각 {inspection.savedAt?.replace("T", " ").slice(0, 16) ?? "?"} · 설정 {choices.length}개
          </p>
          {missing.length === 0 ? (
            <Notice tone="info">이 백업의 설정은 지금 장부에 다 있어요. 덮어쓸 것이 있으면 아래에서 체크하세요.</Notice>
          ) : (
            <div>
              <p className="text-xs font-semibold text-stone-500">지금 장부에 없는 것 (기본 체크)</p>
              <ul className="mt-1 grid gap-1 sm:grid-cols-2">
                {missing.map((c) => (
                  <li key={c.key}>
                    <label className="flex items-start gap-2 text-sm">
                      <input type="checkbox" className="mt-0.5" checked={picked.has(c.key)} onChange={() => toggle(c.key)} />
                      <span>
                        {c.label} <span className="num text-[11px] text-stone-400">{Math.round(c.chars / 1000)}천자</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {present.length > 0 && (
            <details className="text-xs text-stone-500">
              <summary className="cursor-pointer">지금도 있는 설정 {present.length}개 — 체크하면 백업 것으로 덮어써요</summary>
              <ul className="mt-1 grid gap-1 sm:grid-cols-2">
                {present.map((c) => (
                  <li key={c.key}>
                    <label className="flex items-start gap-2 text-sm">
                      <input type="checkbox" className="mt-0.5" checked={picked.has(c.key)} onChange={() => toggle(c.key)} />
                      <span>{c.label}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-primary" disabled={picked.size === 0} onClick={apply}>
              선택한 설정 {picked.size}개만 넣기
            </button>
            <button className="btn-ghost text-xs" onClick={() => setInspection(null)}>
              취소
            </button>
          </div>
        </>
      )}
    </div>
  );
}
