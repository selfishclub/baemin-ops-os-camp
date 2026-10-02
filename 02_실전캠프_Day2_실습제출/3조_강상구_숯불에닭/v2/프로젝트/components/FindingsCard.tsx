"use client";

import Link from "next/link";
import type { Finding, SourceCheck } from "@/lib/findings";

const TONE = {
  danger: { dot: "bg-red-500", text: "text-red-800" },
  warn: { dot: "bg-amber-400", text: "text-amber-900" },
  info: { dot: "bg-sky-400", text: "text-stone-700" },
};

// 손익 탭 맨 위 — 이번 달 자료가 다 들어왔는지 + 확인할 것 목록. 마감을 막지는 않는다.
export function FindingsCard({ sources, findings }: { sources: SourceCheck[]; findings: Finding[] }) {
  const done = sources.filter((s) => s.done).length;
  return (
    <section className="card space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-bold">이번 달 확인할 것</h2>
        <span className="num text-xs text-stone-500">
          자료 {done}/{sources.length} 들어옴
        </span>
      </div>

      <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {sources.map((s) => (
          <li key={s.label}>
            <Link href={s.href} className={`block rounded-lg px-2 py-1.5 text-xs ring-1 ${s.done ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : "bg-stone-50 text-stone-600 ring-stone-200"}`}>
              <span className="font-bold">
                {s.done ? "✅" : "⬜"} {s.label}
              </span>
              <span className="num mt-0.5 block text-[11px]">{s.detail}</span>
            </Link>
          </li>
        ))}
      </ul>

      {findings.length === 0 ? (
        <p className="rounded-lg bg-emerald-50 px-2 py-1.5 text-sm text-emerald-900">확인할 것이 없어요 👍</p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {findings.map((f) => (
            <li key={f.text} className="flex items-start gap-2 py-2">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE[f.level].dot}`} aria-hidden />
              <span className={`flex-1 text-sm ${TONE[f.level].text}`}>{f.text}</span>
              <Link href={f.href} className="shrink-0 whitespace-nowrap text-xs font-bold text-orange-700 underline">
                {f.action} →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
