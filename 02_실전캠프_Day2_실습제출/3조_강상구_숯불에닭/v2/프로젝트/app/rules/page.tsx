"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useMonth } from "@/components/AppShell";
import { CategorySelect, ConfirmDialog, Notice } from "@/components/ui";
import { useLedger } from "@/components/useLedger";
import { DEFAULT_CHANNELS, type Major } from "@/lib/categories";
import { monthLabel } from "@/lib/month";
import { getStore, storageMode } from "@/lib/storage";
import { exportBackup, importBackup } from "@/lib/storage/backup";
import type { Rule } from "@/lib/types";

export default function RulesPage() {
  const { month } = useMonth();
  const ledger = useLedger(month);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [note, setNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const local = storageMode() === "local";

  const channelName = (id: string | null) => DEFAULT_CHANNELS.find((c) => c.id === id)?.name;

  async function saveRule() {
    if (!editing) return;
    await getStore().saveRule(editing);
    setEditing(null);
    await ledger.reload();
  }

  async function removeRule(id: string) {
    await getStore().deleteRule(id);
    await ledger.reload();
  }

  function downloadBackup() {
    const blob = new Blob([exportBackup()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sootdak-ledger-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setNote({ tone: "ok", text: "백업 파일을 저장했어요. 실제 숫자가 들어 있으니 GitHub나 단톡방에 올리지 마세요." });
  }

  async function restore(file: File) {
    try {
      importBackup(await file.text());
      setNote({ tone: "ok", text: "백업을 불러왔어요." });
      await ledger.reload();
    } catch (e) {
      setNote({ tone: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function deleteMonth() {
    setConfirmDelete(false);
    await getStore().deleteMonth(month);
    setNote({ tone: "ok", text: `${monthLabel(month)} 데이터를 지웠어요.` });
    await ledger.reload();
  }

  return (
    <>
      <Link href="/guide" className="card flex items-center justify-between text-sm font-semibold text-orange-800">
        <span>📖 처음이세요? 사용법 — 어디에 무엇을 넣나</span>
        <span>→</span>
      </Link>

      <section className="card space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-bold">
            분류 규칙 <span className="text-stone-400">{ledger.rules.length}</span>
          </h2>
          <span className="text-[11px] text-stone-500">거래처 이름에 이 글자가 있으면 → 이 항목</span>
        </div>
        <p className="text-sm text-stone-600">올리기 탭에서 "확인 필요" 줄을 고를 때마다 여기에 규칙이 쌓여요. 잘못 기억한 규칙은 고치거나 지우세요.</p>
        <ul className="divide-y divide-stone-100">
          {ledger.rules.map((r) => (
            <li key={r.id} className="py-2">
              {editing?.id === r.id ? (
                <div className="space-y-2">
                  <input aria-label="키워드" className="field" value={editing.keyword} onChange={(e) => setEditing({ ...editing, keyword: e.target.value })} />
                  <CategorySelect
                    idPrefix="규칙"
                    includeIncome={r.direction === "in"}
                    major={editing.major}
                    minor={editing.minor}
                    onChange={(m, n) => m && setEditing({ ...editing, major: m as Major, minor: n })}
                  />
                  <label className="flex items-center gap-2 text-xs text-stone-700">
                    <input type="checkbox" className="h-4 w-4 accent-orange-600" checked={!!editing.ambiguous} onChange={(e) => setEditing({ ...editing, ambiguous: e.target.checked })} />
                    매번 확인하기 (마트처럼 재료비/생활비가 섞이는 곳)
                  </label>
                  {editing.direction === "out" && (
                    <label className="flex items-center gap-2 text-xs text-stone-700">
                      <input type="checkbox" className="h-4 w-4 accent-orange-600" checked={!!editing.prev_month} onChange={(e) => setEditing({ ...editing, prev_month: e.target.checked })} />
                      지난달 비용으로 (급여·거래처 대금처럼 다음 달 10일에 내는 돈)
                    </label>
                  )}
                  <div className="flex gap-2">
                    <button className="btn-ghost flex-1" onClick={() => setEditing(null)}>
                      취소
                    </button>
                    <button className="btn-primary flex-1" disabled={!editing.keyword.trim()} onClick={saveRule}>
                      저장
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2 text-sm">
                  <div>
                    <p className="font-semibold">
                      {r.keyword}
                      <span className={`ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${r.direction === "in" ? "bg-sky-100 text-sky-800" : "bg-stone-100 text-stone-600"}`}>
                        {r.direction === "in" ? "입금" : "출금"}
                      </span>
                      {r.ambiguous && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">매번 확인</span>}
                      {r.prev_month && <span className="ml-1 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-900">지난달 비용</span>}
                    </p>
                    <p className="text-xs text-stone-500">
                      {r.major} › {r.minor}
                      {r.channel && ` · ${channelName(r.channel)}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setEditing(r)}>
                      고치기
                    </button>
                    <button className="btn-ghost px-2 py-1 text-xs" onClick={() => removeRule(r.id)}>
                      지우기
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="card space-y-3">
        <h2 className="text-base font-bold">데이터 관리</h2>
        {note && <Notice tone={note.tone}>{note.text}</Notice>}
        {local ? (
          <>
            <p className="text-sm text-stone-600">
              내 PC 모드의 데이터는 <b>이 컴퓨터의 이 브라우저</b>에만 있어요. 브라우저 기록을 지우면 사라지니, 정산을 마칠 때마다 백업 파일을 저장해 두세요.
            </p>
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" onClick={downloadBackup}>
                백업 파일 저장
              </button>
              <button className="btn-ghost" onClick={() => fileRef.current?.click()}>
                백업 불러오기
              </button>
              <input ref={fileRef} type="file" accept=".json" aria-label="백업 파일" className="hidden" onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
            </div>
          </>
        ) : (
          <p className="text-sm text-stone-600">시연 모드예요. 데이터는 인터넷 데이터 창고(Supabase)에 저장되고 누구나 볼 수 있으니 가짜 데이터만 넣으세요.</p>
        )}
        <button className="btn w-full bg-red-50 text-red-700 hover:bg-red-100" onClick={() => setConfirmDelete(true)}>
          {monthLabel(month)} 데이터 지우기
        </button>
      </section>

      {confirmDelete && (
        <ConfirmDialog title={`${monthLabel(month)} 데이터를 지울까요?`} confirmLabel="지우기" cancelLabel="취소" danger onConfirm={deleteMonth} onCancel={() => setConfirmDelete(false)}>
          <p>이 달의 거래 줄, 실매출 입력, 마감 기록, 올린 파일 기록이 모두 지워져요. 되돌릴 수 없어요. (분류 규칙은 남아요)</p>
        </ConfirmDialog>
      )}
    </>
  );
}
