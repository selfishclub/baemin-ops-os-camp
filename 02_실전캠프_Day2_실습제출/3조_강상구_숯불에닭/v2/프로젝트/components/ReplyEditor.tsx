"use client";

import { useEffect, useState } from "react";
import { EXPORT_UPDATED_EVENT } from "@/components/useExport";
import { EXPORT_REVIEWS_KEY, type ExportReview } from "@/lib/export/types";
import { getStore } from "@/lib/storage";

// 답글 쓰기 — 장부 안에서 초안을 고쳐 "확정"하고, 리뷰 도우미(npm run helper)가 Aside 창에서 그 플랫폼의 답글칸에 글을 넣어 준다.
// 넘지 않는 선: 등록 버튼은 사장님이 플랫폼에서 직접 누른다. 도우미는 채우고 멈춘다. 모든 통신은 내 컴퓨터 안(127.0.0.1).
const HELPER = process.env.NEXT_PUBLIC_HELPER_URL || "http://127.0.0.1:4599";

let helperAlive: boolean | null = null; // 한 번 확인하면 같이 쓴다
async function checkHelper(): Promise<boolean> {
  if (helperAlive !== null) return helperAlive;
  try {
    const r = await fetch(`${HELPER}/health`, { cache: "no-store" });
    helperAlive = r.ok;
  } catch {
    helperAlive = false;
  }
  return helperAlive;
}

const STATUS_LABEL: Record<string, string> = { approved: "확정됨 — 채울 수 있어요", edited: "고쳐 둠 (아직 확정 전)", draft: "자동 초안" };

export function ReplyEditor({ review }: { review: ExportReview }) {
  const [text, setText] = useState(review.draft?.text ?? "");
  const [status, setStatus] = useState(review.draft?.status ?? "draft");
  const [alive, setAlive] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<"save" | "approve" | "fill" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState(false);
  const id = `${review.platform}:${review.id}`;

  useEffect(() => {
    void checkHelper().then(setAlive);
  }, []);

  /** 장부에 저장된 내보내기 자료에도 반영해, 새로고침해도 고친 글이 남게 한다 (다음 내보내기 파일이 오면 그 값으로 바뀐다) */
  async function rememberLocally(nextText: string, nextStatus: string) {
    const store = getStore();
    const list = (await store.getSetting<ExportReview[]>(EXPORT_REVIEWS_KEY)) ?? [];
    const updated = list.map((r) => (r.platform === review.platform && r.id === review.id ? { ...r, draft: { text: nextText, status: nextStatus, needsOwnerInput: false } } : r));
    await store.saveSetting(EXPORT_REVIEWS_KEY, updated);
    window.dispatchEvent(new Event(EXPORT_UPDATED_EVENT));
  }

  async function save(approved: boolean) {
    setBusy(approved ? "approve" : "save");
    setMsg(null);
    try {
      const r = await fetch(`${HELPER}/draft`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, text, approved }) });
      const j = (await r.json()) as { ok: boolean; message?: string; status?: string };
      if (!j.ok) {
        setMsg({ ok: false, text: j.message ?? "저장하지 못했어요." });
        return;
      }
      const next = j.status ?? (approved ? "approved" : "edited");
      setStatus(next);
      await rememberLocally(text, next);
      setMsg({ ok: true, text: approved ? "확정했어요. 이제 “답글칸 채우기”를 누르면 돼요." : "고친 글을 저장해 뒀어요." });
    } catch {
      setMsg({ ok: false, text: "도우미에 연결하지 못했어요. 리뷰 수집기 폴더에서 npm run helper 를 켜 주세요." });
    } finally {
      setBusy(null);
    }
  }

  async function fill() {
    setBusy("fill");
    setMsg({ ok: true, text: "Aside 창에서 답글칸을 찾는 중… (1~2분) 창이 뜨면 기다려 주세요." });
    try {
      const r = await fetch(`${HELPER}/fill`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
      const j = (await r.json()) as { ok: boolean; message?: string };
      setMsg({ ok: j.ok, text: j.ok ? `${j.message ?? "채웠어요"} — 플랫폼 창에서 내용을 확인하고 등록 버튼을 직접 누르세요.` : j.message ?? "채우지 못했어요." });
    } catch {
      setMsg({ ok: false, text: "도우미에 연결하지 못했어요. 리뷰 수집기 폴더에서 npm run helper 를 켜 주세요." });
    } finally {
      setBusy(null);
    }
  }

  const changed = text !== (review.draft?.text ?? "");
  const canFill = status === "approved" && !changed && !text.includes("【");

  return (
    <div className="mt-2 rounded-lg bg-stone-50 px-2 py-1.5">
      <p className="flex flex-wrap items-center justify-between gap-1 text-[11px] font-semibold text-stone-500">
        <span>
          답글 {STATUS_LABEL[status] ?? status}
          {text.includes("【") && <span className="ml-1 text-amber-700">· 【 】 자리를 채워 주세요</span>}
        </span>
        <span className="flex gap-1">
          <button className="rounded bg-stone-200 px-2 py-0.5 text-[11px] font-bold text-stone-700" onClick={() => setOpen(!open)}>
            {open ? "접기" : "고쳐 쓰기"}
          </button>
          <button className="rounded bg-stone-800 px-2 py-0.5 text-[11px] font-bold text-white" onClick={() => void navigator.clipboard.writeText(text).catch(() => {})}>
            복사
          </button>
        </span>
      </p>
      {open ? (
        <textarea className="field mt-1 min-h-[6rem] text-xs" value={text} onChange={(e) => setText(e.target.value)} />
      ) : (
        <p className="mt-1 whitespace-pre-wrap text-xs text-stone-700">{text}</p>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <button className="btn-ghost px-3 py-1 text-xs" disabled={busy !== null || alive === false || !text.trim()} onClick={() => save(false)}>
          {busy === "save" ? "저장 중…" : "고친 글 저장"}
        </button>
        <button className="btn-primary px-3 py-1 text-xs" disabled={busy !== null || alive === false || !text.trim() || text.includes("【")} onClick={() => save(true)}>
          {busy === "approve" ? "확정 중…" : "이 답글로 확정"}
        </button>
        <button className="rounded-xl bg-emerald-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-40" disabled={busy !== null || alive === false || !canFill} title={canFill ? "Aside 창에서 답글칸에 이 글을 넣고 멈춰요" : "먼저 확정해야 채울 수 있어요"} onClick={fill}>
          {busy === "fill" ? "채우는 중…" : "답글칸 채우기"}
        </button>
        {alive === false && <span className="text-[11px] text-amber-700">도우미가 꺼져 있어요 — 리뷰 수집기 폴더에서 npm run helper</span>}
      </div>
      {msg && <p className={`mt-1 text-[11px] ${msg.ok ? "text-emerald-800" : "text-red-700"}`}>{msg.text}</p>}
    </div>
  );
}
