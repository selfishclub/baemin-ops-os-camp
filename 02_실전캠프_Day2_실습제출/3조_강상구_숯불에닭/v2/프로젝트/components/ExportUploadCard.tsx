"use client";

import { useRef, useState } from "react";
import { Notice } from "@/components/ui";
import type { ExportState } from "@/components/useExport";
import { ExportParseError, parseLedgerExport } from "@/lib/export/parse";

const SAMPLE = "/sample/가짜_리뷰수집기_내보내기.json";
const fmt = (iso: string | null | undefined) => (iso ? iso.replace("T", " ").slice(0, 16) : "–");

// 리뷰 수집기에서 만든 내보내기 파일(data/ledger-export.json)을 올린다. 리뷰·상권·정산 탭 위에 같은 카드가 있다.
export function ExportUploadCard({ exp, what }: { exp: ExportState; what: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [showHow, setShowHow] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setMessage(null);
    try {
      const parsed = parseLedgerExport(await file.text());
      const meta = await exp.save(parsed);
      setMessage({ tone: "ok", text: `${file.name}: 리뷰 ${meta.reviews}건 · 순위 기록 ${meta.rankPoints}줄 · 배민 정산 ${meta.settlements}건 (내보낸 때 ${fmt(meta.exportedAt)})` });
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof ExportParseError ? e.message : `파일을 읽지 못했어요. (${e instanceof Error ? e.message : e})` });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // 시연용 가짜 파일 (public/sample, scripts/make-sample-export.mjs 가 만든 것)
  async function loadSample() {
    const res = await fetch(SAMPLE);
    await handleFile(new File([await res.blob()], "가짜_리뷰수집기_내보내기.json"));
  }

  return (
    <section className="card space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">리뷰 수집기 내보내기 파일 올리기</h2>
        <span className="text-xs text-stone-500">{exp.meta ? `마지막 올림 ${fmt(exp.meta.uploadedAt)}` : "아직 안 올렸어요"}</span>
      </div>
      <p className="text-sm text-stone-600">
        {what} — 리뷰 수집기(review-onetouch)가 모은 자료로 채워요. 수집기에서 내보낸 <b>ledger-export.json</b> 파일을 여기 올리면 돼요. 파일은 이 브라우저에만 저장돼요.
      </p>
      <input
        ref={fileRef}
        type="file"
        aria-label="내보내기 파일"
        accept=".json,application/json"
        disabled={busy}
        className="block w-full text-sm file:mr-3 file:rounded-xl file:border-0 file:bg-orange-600 file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-white hover:file:bg-orange-700 disabled:opacity-50"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      <div className="flex flex-wrap gap-2">
        <button className="btn-ghost" disabled={busy} onClick={loadSample}>
          가짜 내보내기 파일로 해 보기
        </button>
      </div>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <button className="text-xs font-semibold text-stone-500 underline" onClick={() => setShowHow(!showHow)}>
        {showHow ? "순서 접기" : "파일은 어떻게 만드나요?"}
      </button>
      {showHow && (
        <ol className="list-decimal space-y-1 rounded-lg bg-stone-50 px-6 py-2 text-xs text-stone-600">
          <li>
            리뷰 수집기 폴더에서 평소처럼 리뷰를 모읍니다: <code>npm run auto</code> (또는 collect · ingest · draft)
          </li>
          <li>
            순위도 보려면 <code>npm run rank</code>, 배민 정산까지 보려면 <code>npm run collect:baemin-settle</code> (배민에 로그인한 창이 있어야 해요)
          </li>
          <li>
            <code>npm run export:ledger</code> → <code>data/ledger-export.json</code> 이 생깁니다
          </li>
          <li>그 파일을 위 버튼으로 올립니다. 닉네임은 가려져 있고, 파일은 어디에도 보내지 않아요.</li>
        </ol>
      )}
    </section>
  );
}
