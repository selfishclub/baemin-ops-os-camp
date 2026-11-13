"use client";

import { useEffect, useMemo, useState } from "react";
import { MoneyInput, Notice } from "@/components/ui";
import { PURCHASES_KEY_PREFIX, type Purchase } from "@/lib/costing/purchases";
import { todayStr } from "@/lib/daily";
import { won } from "@/lib/format";
import { monthsBetween, nextMonth, prevMonth } from "@/lib/month";
import { PAYABLES_KEY, computePayables, type PayableRow, type PayablesSetting } from "@/lib/payables";
import { getStore } from "@/lib/storage";
import type { Transaction } from "@/lib/types";

// 미지급금 — 거래처에 아직 안 낸 돈 (부가세 포함 = 앞으로 통장에서 나갈 돈).
// 원가율·재료비는 공급가로 따로 센다 (lib/costing/purchases.ts).
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

export function PayablesCard() {
  const [setting, setSetting] = useState<PayablesSetting | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ amount: number | null; date: string; opening: number | null }>({ amount: null, date: todayStr(), opening: null });
  const [msg, setMsg] = useState<string | null>(null);

  async function load(s: PayablesSetting) {
    const store = getStore();
    const today = todayStr();
    const months = monthsBetween(s.since, today);
    const [ps, ts] = await Promise.all([
      Promise.all(months.map((m) => store.getSetting<Purchase[]>(PURCHASES_KEY_PREFIX + m))),
      // 거래 줄은 귀속 달(지난달 비용 등)로 저장돼 있어 앞뒤 한 달씩 더 읽고 날짜로 거른다
      Promise.all([prevMonth(months[0]), ...months, nextMonth(months[months.length - 1])].map((m) => store.listTransactions(m))),
    ]);
    setPurchases(ps.flatMap((x) => x ?? []));
    setTxs(ts.flat());
  }

  useEffect(() => {
    void getStore()
      .getSetting<PayablesSetting>(PAYABLES_KEY)
      .then(async (v) => {
        // 처음 열면 이번 달 1일부터 센다 (그 전 잔액은 0으로 본다) — 바꿀 수 있다
        const s = v ?? { since: `${todayStr().slice(0, 7)}-01`, settled: {}, statements: {} };
        if (!v) await getStore().saveSetting(PAYABLES_KEY, s);
        setSetting(s);
        await load(s);
      });
  }, []);

  const result = useMemo(() => (setting ? computePayables(purchases, txs, setting) : null), [purchases, txs, setting]);

  async function update(patch: (s: PayablesSetting) => PayablesSetting, note?: string) {
    // 다른 창에서 바뀌었을 수 있으니 저장 직전에 다시 읽는다
    const cur = (await getStore().getSetting<PayablesSetting>(PAYABLES_KEY)) ?? setting!;
    const next = patch(cur);
    await getStore().saveSetting(PAYABLES_KEY, next);
    setSetting(next);
    if (next.since !== cur.since) await load(next);
    if (note) setMsg(note);
  }

  if (!setting || !result) return null;

  return (
    <section className="card space-y-3">
      <div>
        <h2 className="text-sm font-bold">📒 미지급금 — 거래처에 아직 안 낸 돈</h2>
        <p className="text-xs text-stone-500">부가세 포함, 앞으로 통장에서 나갈 돈이에요. 외상 영수증(체크카드로 바로 낸 것 빼고) − 통장 이체로 셌어요. 재료비·원가율은 부가세 뺀 공급가로 따로 계산해요.</p>
      </div>

      <div className="flex items-baseline justify-between rounded-lg bg-amber-50 px-3 py-2 ring-1 ring-amber-200">
        <span className="text-sm">합계</span>
        <b className="num text-lg">{won(result.total)}</b>
      </div>

      {result.rows.length === 0 ? (
        <p className="text-sm text-stone-600">남은 외상이 없어요.</p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {result.rows.map((r) => (
            <Row key={r.key} r={r} open={open === r.key} onToggle={() => {
              setOpen(open === r.key ? null : r.key);
              setDraft({ amount: r.statement?.amount ?? null, date: r.statement?.date ?? todayStr(), opening: r.opening || null });
            }}>
              <div className="space-y-2 rounded-lg bg-stone-50 p-2 text-xs">
                <p className="text-stone-600">
                  {r.opening ? `${md(setting.since)}에 있던 외상 ${won(r.opening)} + ` : ""}외상 영수증 {r.receipts}장 {won(r.billed)} − 통장 이체 {won(r.paid)}
                  {r.lastDate && ` (마지막 영수증 ${md(r.lastDate)})`}
                </p>
                {r.vatUnknown > 0 && <p className="text-amber-700">부가세를 안 적은 영수증이 {r.vatUnknown}장 있어요. 부가세 별도 명세표라면 원가 탭에서 부가세를 적어 주세요.</p>}
                <div className="grid grid-cols-[1fr_8.5rem] items-end gap-2">
                  <label className="space-y-1 text-stone-500">
                    거래처가 알려 준 잔액 (명세서 총미수·채권잔액)
                    <MoneyInput label={`${r.vendor} 거래처 잔액`} allowEmpty value={draft.amount} onChange={(n) => setDraft({ ...draft, amount: n })} />
                  </label>
                  <input type="date" aria-label={`${r.vendor} 잔액 날짜`} className="field" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
                </div>
                <label className="block space-y-1 text-stone-500">
                  {md(setting.since)}에 이미 있던 외상 (지난달 분 — 첫 명세서의 전미수)
                  <MoneyInput label={`${r.vendor} 시작일 외상`} allowEmpty placeholder="없음" value={draft.opening} onChange={(n) => setDraft({ ...draft, opening: n })} />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="btn-ghost px-2 py-1 text-xs"
                    onClick={() =>
                      void update((s) => {
                        const statements = { ...s.statements };
                        if (draft.amount === null) delete statements[r.key];
                        else statements[r.key] = { amount: draft.amount, date: draft.date };
                        const opening = { ...(s.opening ?? {}) };
                        if (!draft.opening) delete opening[r.key];
                        else opening[r.key] = draft.opening;
                        return { ...s, statements, opening };
                      }, `${r.vendor} 잔액을 적어 뒀어요.`)
                    }
                  >
                    저장
                  </button>
                  <button className="btn-ghost px-2 py-1 text-xs" onClick={() => void update((s) => ({ ...s, settled: { ...s.settled, [r.key]: todayStr() } }), `${r.vendor}: 오늘까지 다 낸 것으로 뒀어요. 앞으로 들어오는 영수증만 셀게요.`)}>
                    현금 등으로 오늘까지 다 냈어요
                  </button>
                </div>
              </div>
            </Row>
          ))}
        </ul>
      )}

      <label className="flex items-center justify-between gap-2 text-xs text-stone-500">
        이 날부터 셌어요 (그 전 외상은 0으로 봐요)
        <input type="date" aria-label="미지급금 시작일" className="field !w-40" value={setting.since} onChange={(e) => e.target.value && void update((s) => ({ ...s, since: e.target.value }))} />
      </label>
      {msg && <Notice tone="ok">{msg}</Notice>}
    </section>
  );
}

function Row({ r, open, onToggle, children }: { r: PayableRow; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  const st = r.statement;
  const showStatement = st && st.date >= r.lastDate && st.date >= r.lastPaymentDate;
  const diff = st ? r.due - st.amount : null;
  return (
    <li className="py-2">
      <button className="flex w-full items-center justify-between gap-2 text-left" onClick={onToggle}>
        <span className="min-w-0">
          <span className={`text-sm ${r.due === 0 ? "text-stone-500" : "font-semibold"}`}>{r.vendor}</span>
          {st && (
            <span className={`block text-xs ${diff === 0 ? "text-emerald-700" : "text-amber-700"}`}>
              거래처 잔액 {won(st.amount)} ({md(st.date)}) {diff === 0 ? "— 딱 맞아요 ✓" : `— ${won(Math.abs(diff!))} ${diff! > 0 ? "장부가 많아요" : "장부가 적어요"}`}
            </span>
          )}
        </span>
        <span className={`num shrink-0 text-sm font-bold ${r.due < 0 ? "text-sky-700" : r.due === 0 ? "font-normal text-stone-400" : ""}`}>{r.due < 0 ? `미리 냄 ${won(-r.due)}` : r.due === 0 ? "다 냄" : won(r.due)}</span>
      </button>
      {open && <div className="mt-2">{children}</div>}
    </li>
  );
}
