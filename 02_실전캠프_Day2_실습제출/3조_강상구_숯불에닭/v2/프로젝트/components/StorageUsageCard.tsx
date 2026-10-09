"use client";

import { useEffect, useState } from "react";
import { mb } from "@/lib/storage/errors";
import { readLastBackupAt, storageUsage, type StorageUsage } from "@/lib/storage/local";

// 규칙 탭 "데이터 관리" 안에 보이는 저장 공간·백업 상태.
// 브라우저는 한도를 알려 주지 않으므로 "추정"이라고 적는다. 백업 시각은 "내려받기를 시작한" 시각이다.

export const BACKUP_STALE_DAYS = 7;

export function backupStatus(lastAt: string | null, now = new Date()): { tone: "ok" | "warn"; text: string; days: number | null } {
  if (!lastAt) return { tone: "warn", text: "아직 백업 파일을 받은 기록이 없어요. 지금 받아 두세요.", days: null };
  const days = Math.floor((now.getTime() - new Date(lastAt).getTime()) / 86_400_000);
  if (days >= BACKUP_STALE_DAYS) return { tone: "warn", text: `마지막 백업이 ${days}일 전이에요. 다시 받아 두세요.`, days };
  return { tone: "ok", text: days === 0 ? "오늘 백업을 받았어요." : `${days}일 전에 백업을 받았어요.`, days };
}

const when = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export default function StorageUsageCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [lastAt, setLastAt] = useState<string | null>(null);
  useEffect(() => {
    setUsage(storageUsage());
    setLastAt(readLastBackupAt());
  }, [refreshKey]);
  if (!usage) return null;

  const pct = Math.min(100, Math.round(usage.ratio * 100));
  const bar = usage.level === "critical" ? "bg-red-500" : usage.level === "warn" ? "bg-amber-400" : "bg-emerald-500";
  const backup = backupStatus(lastAt);

  return (
    <div className="space-y-2 rounded-xl bg-stone-50 p-3 text-sm ring-1 ring-stone-200">
      <div className="flex items-baseline justify-between">
        <span className="font-semibold">저장 공간</span>
        <span className="num text-xs text-stone-600">
          장부 {mb(usage.ledgerBytes)} · 전체 {mb(usage.totalBytes)} / 약 {mb(usage.estimatedLimitBytes)} (추정)
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-stone-200" aria-label="저장 공간 사용량">
        <div className={`h-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-stone-500">
        브라우저가 정확한 한도를 알려 주지 않아요. 보통 5MB 안팎이라 그 값으로 어림했어요 ({pct}%).
        {usage.level !== "ok" && <b className="text-red-700"> 공간이 거의 찼어요. 백업 파일을 받은 뒤 오래된 달을 정리하세요.</b>}
      </p>
      <div className={`rounded-lg px-2 py-1.5 text-xs ${backup.tone === "ok" ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
        <b>마지막 백업:</b> {lastAt ? `${when(lastAt)} 에 내려받기 시작` : "없음"} — {backup.text}
        <span className="block text-[11px] opacity-80">파일이 실제로 저장됐는지는 다운로드 폴더에서 직접 확인해 주세요.</span>
      </div>
    </div>
  );
}
