"use client";

import { useEffect, useState } from "react";
import { applyExport, EXPORT_UPDATED_EVENT } from "@/components/useExport";
import { parseLedgerExport } from "@/lib/export/parse";
import { EXPORT_META_KEY, type ExportMeta } from "@/lib/export/types";
import { getStore, storageMode } from "@/lib/storage";

// 리뷰 수집기 도우미(npm run helper, 내 컴퓨터 127.0.0.1:4599)에서 최신 내보내기 파일을 자동으로 받아 온다.
// 장부를 열 때 한 번, 그 뒤 30분마다 "새 파일이 있나"만 묻고, 새것이면 받아서 넣는다. 사장님이 파일을 옮길 일이 없다.
//  - 내 PC 모드에서만 (시연 모드는 인터넷 DB라 내 컴퓨터 도우미와 상관없음)
//  - 도우미가 꺼져 있으면 조용히 넘어간다. 인터넷으로는 아무것도 나가지 않는다.
const HELPER = process.env.NEXT_PUBLIC_HELPER_URL || "http://127.0.0.1:4599";
const EVERY_MS = 30 * 60 * 1000;

export function AutoExportSync() {
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (storageMode() !== "local") return;
    let stopped = false;

    async function check() {
      try {
        const meta = (await (await fetch(`${HELPER}/ledger-export/meta`, { cache: "no-store" })).json()) as { ok: boolean; exportedAt: string | null };
        if (!meta.ok || !meta.exportedAt) return;
        const have = await getStore().getSetting<ExportMeta>(EXPORT_META_KEY);
        if (have && have.exportedAt >= meta.exportedAt) return; // 이미 같은(또는 더 새) 자료
        const text = await (await fetch(`${HELPER}/ledger-export`, { cache: "no-store" })).text();
        const parsed = parseLedgerExport(text);
        const saved = await applyExport(parsed);
        if (stopped) return;
        window.dispatchEvent(new Event(EXPORT_UPDATED_EVENT));
        setNote(`리뷰 수집기 자료를 자동으로 받았어요 — 리뷰 ${saved.reviews}건 · 순위 ${saved.rankPoints}줄 · 배민 정산 ${saved.settlements}건 (${meta.exportedAt.replace("T", " ").slice(0, 16)})`);
        setTimeout(() => !stopped && setNote(null), 12_000);
      } catch {
        /* 도우미가 꺼져 있거나 파일이 없으면 조용히 넘어간다 — 올리기 탭에서 손으로 올릴 수 있다 */
      }
    }

    void check();
    const t = setInterval(check, EVERY_MS);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, []);

  if (!note) return null;
  return (
    <div role="status" className="mx-4 mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900 ring-1 ring-emerald-200">
      {note}
    </div>
  );
}
