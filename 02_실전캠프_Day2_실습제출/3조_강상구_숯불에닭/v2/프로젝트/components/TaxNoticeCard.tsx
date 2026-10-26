"use client";

import { useEffect, useMemo, useState } from "react";
import PhotoStrip from "@/components/PhotoStrip";
import { Notice } from "@/components/ui";
import { todayStr } from "@/lib/daily";
import { parseNum, won } from "@/lib/format";
import { deletePhotosOf } from "@/lib/photos";
import { getStore } from "@/lib/storage";
import { TAX_KINDS, TAX_NOTICES_KEY, paymentMonths, sortNotices, taxStatus, type TaxKind, type TaxNotice, type TaxStatus } from "@/lib/taxNotices";
import type { Transaction } from "@/lib/types";

// 세금 고지서 — 고지서 PDF·사진을 금액·납부기한과 같이 두고, 통장에서 낸 줄과 짝을 맞춘다.
// 내는 건 사장님이 홈택스·은행에서 한다. 장부는 보관과 확인만.
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const newId = () => `tn_${Math.random().toString(36).slice(2, 10)}`;

interface Draft {
  id: string;
  kind: TaxKind;
  title: string;
  amount: string;
  due: string;
}

export function TaxNoticeCard() {
  const [list, setList] = useState<TaxNotice[]>([]);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const today = todayStr();

  async function loadTxs(notices: TaxNotice[]) {
    const months = [...new Set(notices.flatMap((n) => paymentMonths(n.due)))];
    const rows = (await Promise.all(months.map((m) => getStore().listTransactions(m)))).flat();
    setTxs(rows);
  }

  useEffect(() => {
    void getStore()
      .getSetting<TaxNotice[]>(TAX_NOTICES_KEY)
      .then(async (v) => {
        setList(v ?? []);
        await loadTxs(v ?? []);
        setLoaded(true);
      });
  }, []);

  const statusOf = useMemo(() => {
    const cache = new Map<string, TaxStatus>();
    return (n: TaxNotice) => {
      if (!cache.has(n.id)) cache.set(n.id, taxStatus(n, txs, today));
      return cache.get(n.id)!;
    };
  }, [txs, today]);
  const sorted = useMemo(() => sortNotices(list, statusOf), [list, statusOf]);

  async function save() {
    if (!draft) return;
    const amount = parseNum(draft.amount);
    if (!draft.title.trim() || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(draft.due)) {
      setMsg({ tone: "error", text: "이름·금액·납부기한을 다 채워 주세요." });
      return;
    }
    const item: TaxNotice = { id: draft.id, kind: draft.kind, title: draft.title.trim(), amount, due: draft.due, addedAt: new Date().toISOString() };
    try {
      // 다른 창에서 바뀌었을 수 있으니 저장 직전에 다시 읽는다
      const cur = (await getStore().getSetting<TaxNotice[]>(TAX_NOTICES_KEY)) ?? [];
      const next = [...cur.filter((n) => n.id !== item.id), item];
      await getStore().saveSetting(TAX_NOTICES_KEY, next);
      setList(next);
      await loadTxs(next);
      setDraft(null);
      setMsg({ tone: "ok", text: `저장했어요: ${item.title}` });
    } catch {
      setMsg({ tone: "error", text: "저장하지 못했어요. 장부 저장 공간을 확인해 주세요." });
    }
  }

  async function cancelDraft() {
    // 새로 만들다 그만두면 그 사이 붙인 파일도 지운다 (주인 없는 파일이 남지 않게)
    if (draft && !list.some((n) => n.id === draft.id)) await deletePhotosOf(draft.id).catch(() => {});
    setDraft(null);
  }

  async function remove(n: TaxNotice) {
    const cur = (await getStore().getSetting<TaxNotice[]>(TAX_NOTICES_KEY)) ?? [];
    const next = cur.filter((x) => x.id !== n.id);
    await getStore().saveSetting(TAX_NOTICES_KEY, next);
    await deletePhotosOf(n.id).catch(() => {});
    setList(next);
    setOpen(null);
  }

  if (!loaded) return null;
  const pending = sorted.filter((n) => statusOf(n).state !== "paid");

  return (
    <section className="card space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold">🧾 세금 고지서</h2>
          <p className="text-xs text-stone-500">고지서 PDF·사진을 금액·납부기한과 같이 보관해요. 통장에서 같은 금액이 나가면 &quot;냈어요&quot;로 바뀌어요.</p>
        </div>
        {!draft && (
          <button className="btn-ghost shrink-0 px-2 py-1 text-xs" onClick={() => setDraft({ id: newId(), kind: "부가세", title: "", amount: "", due: "" })}>
            + 고지서 넣기
          </button>
        )}
      </div>

      {pending.length > 0 && (
        <div className="space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
          {pending.map((n) => {
            const s = statusOf(n);
            return (
              <p key={n.id}>
                <b>{n.title}</b> <span className="num">{won(n.amount)}</span> —{" "}
                {s.state === "late" ? <b className="text-rose-700">납부기한({md(n.due)}) {s.daysLate}일 지났어요. 냈는데 통장 자료가 아직 안 들어온 건지 확인해 주세요.</b> : s.state === "open" && s.daysLeft === 0 ? <b>오늘({md(n.due)})까지 내야 해요</b> : s.state === "open" ? `${md(n.due)}까지 · ${s.daysLeft}일 남음` : null}
              </p>
            );
          })}
        </div>
      )}

      {sorted.length > 0 ? (
        <ul className="divide-y divide-stone-100">
          {sorted.map((n) => {
            const s = statusOf(n);
            return (
              <li key={n.id} className="py-2">
                <button className="flex w-full items-center justify-between gap-2 text-left" onClick={() => setOpen(open === n.id ? null : n.id)}>
                  <span className="min-w-0">
                    <span className="mr-1 rounded bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-600">{n.kind}</span>
                    <span className="text-sm font-semibold">{n.title}</span>
                    <span className="block text-xs text-stone-500">납부기한 {n.due}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="num block text-sm font-bold">{won(n.amount)}</span>
                    <span className={`block text-xs ${s.state === "paid" ? "text-emerald-700" : s.state === "late" ? "text-rose-700" : "text-amber-700"}`}>
                      {s.state === "paid" ? `냈어요 (${md(s.date)} 통장)` : s.state === "late" ? `${s.daysLate}일 지남` : `${s.daysLeft}일 남음`}
                    </span>
                  </span>
                </button>
                {open === n.id && (
                  <div className="mt-2 space-y-2">
                    <PhotoStrip ownerId={n.id} />
                    {s.state === "paid" && <p className="text-xs text-stone-500">통장 줄: {s.date} · {s.payee}</p>}
                    {confirmDel === n.id ? (
                      <p className="text-xs text-rose-700">
                        정말 지울까요? 붙인 파일도 같이 지워져요.{" "}
                        <button className="font-semibold underline" onClick={() => void remove(n)}>
                          지우기
                        </button>{" "}
                        <button className="underline" onClick={() => setConfirmDel(null)}>
                          그만두기
                        </button>
                      </p>
                    ) : (
                      <button className="text-xs text-stone-500 underline" onClick={() => setConfirmDel(n.id)}>
                        이 고지서 지우기
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        !draft && <p className="rounded-lg bg-stone-50 px-2 py-3 text-sm text-stone-600">아직 넣은 고지서가 없어요.</p>
      )}

      {draft && (
        <div className="space-y-2 rounded-xl bg-stone-50 p-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-stone-600">
              종류
              <select className="field mt-1 w-full" aria-label="세금 종류" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as TaxKind })}>
                {TAX_KINDS.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-stone-600">
              납부기한
              <input type="date" className="field mt-1 w-full" aria-label="납부기한" value={draft.due} onChange={(e) => setDraft({ ...draft, due: e.target.value })} />
            </label>
          </div>
          <label className="block text-xs text-stone-600">
            이름
            <input className="field mt-1 w-full" aria-label="고지서 이름" placeholder="2026년 2기 부가세 예정고지" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </label>
          <label className="block text-xs text-stone-600">
            낼 금액 (원)
            <input className="field num mt-1 w-full" inputMode="numeric" aria-label="고지 금액" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
          </label>
          <PhotoStrip ownerId={draft.id} />
          <div className="flex gap-2">
            <button className="btn-ghost flex-1" onClick={() => void cancelDraft()}>
              취소
            </button>
            <button className="btn-primary flex-1" onClick={() => void save()}>
              저장
            </button>
          </div>
        </div>
      )}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </section>
  );
}
