"use client";

import { useEffect, useState } from "react";
import { ConfirmDialog, MoneyInput, Notice } from "@/components/ui";
import { newId } from "@/lib/classify";
import { ITEMS_KEY, type Item } from "@/lib/costing/types";
import {
  PURCHASES_KEY_PREFIX,
  PURCHASE_CATEGORIES,
  applyPurchaseToItems,
  guessItemQty,
  lineUnitCost,
  purchaseTotal,
  summarizePurchases,
  unitLabel,
  type Purchase,
  type PurchaseCategory,
  type PurchaseLine,
} from "@/lib/costing/purchases";
import { todayStr } from "@/lib/daily";
import { num, won } from "@/lib/format";
import { monthLabel } from "@/lib/month";
import { getStore } from "@/lib/storage";

// 매입 영수증 — 마트·거래처 영수증을 품목별로 적고, 품목에 연결하면 기준단가가 최근 매입가로 바뀐다.
const emptyLine = (): PurchaseLine => ({ name: "", unitPrice: 0, qty: 1, amount: 0, category: "원재료비", itemId: null, itemQty: 0 });

export default function PurchaseSection({ month, items, onItemsChange }: { month: string; items: Item[]; onItemsChange: () => Promise<void> }) {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<Purchase | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Purchase | null>(null);
  const [note, setNote] = useState<{ tone: "ok" | "info" | "warn"; text: string } | null>(null);
  const key = PURCHASES_KEY_PREFIX + month;

  async function load() {
    const list = (await getStore().getSetting<Purchase[]>(key)) ?? [];
    setPurchases(list.sort((a, b) => (a.date < b.date ? 1 : -1)));
    setLoaded(true);
  }
  useEffect(() => {
    setLoaded(false);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  async function save(p: Purchase) {
    const clean: Purchase = { ...p, vendor: p.vendor.trim() || "거래처", lines: p.lines.filter((l) => l.name.trim() && l.amount > 0) };
    if (clean.lines.length === 0) {
      setNote({ tone: "warn", text: "품목을 한 줄 이상 넣어 주세요 (상품명과 금액)." });
      return;
    }
    const store = getStore();
    const next = [...purchases.filter((x) => x.id !== clean.id), clean];
    await store.saveSetting(key, next);
    const applied = applyPurchaseToItems(items, clean);
    if (applied.updated.length) {
      await store.saveSetting(ITEMS_KEY, applied.items);
      await onItemsChange();
    }
    setEditing(null);
    await load();
    setNote({
      tone: "ok",
      text: `${clean.date.slice(5).replace("-", "/")} ${clean.vendor} ${won(purchaseTotal(clean))} 저장했어요.${applied.updated.length ? ` 기준단가 갱신: ${applied.updated.map((u) => `${u.name} ${num(u.from)}→${num(u.to)}`).join(", ")}` : ""}`,
    });
  }

  async function remove(p: Purchase) {
    setConfirmDelete(null);
    await getStore().saveSetting(
      key,
      purchases.filter((x) => x.id !== p.id),
    );
    await load();
  }

  if (!loaded) return null;
  const summary = summarizePurchases(purchases);
  const itemName = (id: string) => items.find((i) => i.id === id)?.name ?? id;
  const itemUnit = (id: string) => items.find((i) => i.id === id)?.baseUnit ?? "ea";

  return (
    <>
      <section className="card space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-bold">
            매입 영수증 <span className="text-[11px] font-normal text-stone-500">{monthLabel(month)} · 품목별 입고</span>
          </h2>
          <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => setEditing({ id: `pu_${newId().slice(0, 8)}`, date: month === todayStr().slice(0, 7) ? todayStr() : `${month}-01`, vendor: "", lines: [emptyLine(), emptyLine(), emptyLine()], discount: 0 })}>
            + 영수증 추가
          </button>
        </div>
        <p className="text-xs text-stone-600">
          마트·거래처 영수증을 상품 줄 그대로 적어요. 줄을 <b>원가율 품목에 연결</b>하고 품목 단위 수량(특란 30구×5 = 150개)을 넣으면 그 품목의 <b>기준단가가 최근 매입가로 자동</b>으로 바뀌어요. 손익은 통장 기준이라 여기 금액은 손익에 따로 더하지 않아요.
        </p>
        {note && <Notice tone={note.tone}>{note.text}</Notice>}

        {purchases.length > 0 && (
          <div className="num grid grid-cols-2 gap-2 rounded-xl bg-stone-50 p-2 text-xs sm:grid-cols-4">
            <div>
              <p className="text-[11px] text-stone-500">이 달 매입</p>
              <p className="font-bold">{won(summary.total)}</p>
              <p className="text-[11px] text-stone-500">{summary.count}건</p>
            </div>
            {PURCHASE_CATEGORIES.filter((c) => summary.byCategory[c] > 0).map((c) => (
              <div key={c}>
                <p className="text-[11px] text-stone-500">{c}</p>
                <p className="font-bold">{won(summary.byCategory[c])}</p>
              </div>
            ))}
          </div>
        )}

        {purchases.length === 0 ? (
          <p className="text-xs text-stone-500">아직 영수증이 없어요. “+ 영수증 추가”로 넣어 보세요.</p>
        ) : (
          <ul className="divide-y divide-stone-100 text-sm">
            {purchases.map((p) => (
              <li key={p.id} className="py-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">
                      {p.date.slice(5).replace("-", "/")} {p.vendor} <span className="num text-xs text-stone-500">{p.lines.length}줄</span>
                    </p>
                    <p className="text-[11px] text-stone-500">
                      {p.lines
                        .slice(0, 4)
                        .map((l) => l.name)
                        .join(" · ")}
                      {p.lines.length > 4 ? " …" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="num text-sm font-bold">{won(purchaseTotal(p))}</span>
                    <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setEditing({ ...p, lines: p.lines.map((l) => ({ ...l })) })}>
                      고치기
                    </button>
                    <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setConfirmDelete(p)}>
                      지우기
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {summary.byItem.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-semibold text-stone-500">품목별 이 달 매입</p>
            <ul className="num grid grid-cols-1 gap-x-4 text-xs text-stone-700 sm:grid-cols-2">
              {summary.byItem.map((r) => (
                <li key={r.itemId} className="flex justify-between py-0.5">
                  <span>{itemName(r.itemId)}</span>
                  <span>
                    {fmtQty(r.qty)}
                    {unitLabel(itemUnit(r.itemId))} · {won(r.net)} · {num(Math.round(r.net / r.qty))}원/{unitLabel(itemUnit(r.itemId))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {editing && <PurchaseEditor purchase={editing} items={items} onChange={setEditing} onSave={() => save(editing)} onCancel={() => setEditing(null)} />}
      {confirmDelete && (
        <ConfirmDialog title="영수증을 지울까요?" confirmLabel="지우기" cancelLabel="취소" danger onConfirm={() => remove(confirmDelete)} onCancel={() => setConfirmDelete(null)}>
          <p>
            {confirmDelete.date} {confirmDelete.vendor} {won(purchaseTotal(confirmDelete))}. 이미 바뀐 기준단가는 그대로 남아요.
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}

function PurchaseEditor({ purchase, items, onChange, onSave, onCancel }: { purchase: Purchase; items: Item[]; onChange: (p: Purchase) => void; onSave: () => void; onCancel: () => void }) {
  const p = purchase;
  const setLine = (i: number, patch: Partial<PurchaseLine>) => {
    const lines = p.lines.map((l, j) => {
      if (j !== i) return l;
      const next = { ...l, ...patch };
      if ("unitPrice" in patch || "qty" in patch) next.amount = Math.round(next.unitPrice * next.qty);
      if ("itemId" in patch && next.itemId) {
        const unit = items.find((x) => x.id === next.itemId)?.baseUnit ?? "ea";
        next.itemQty = guessItemQty(next.name, next.qty, unit) ?? 0;
      }
      if ("itemId" in patch && !next.itemId) next.itemQty = 0;
      return next;
    });
    onChange({ ...p, lines });
  };
  const activeItems = items.filter((i) => i.active);
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="매입 영수증">
      <div className="card max-h-[92vh] w-full max-w-2xl space-y-3 overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">매입 영수증</h2>
          <button className="btn-ghost px-2 py-1 text-xs" onClick={onCancel}>
            닫기
          </button>
        </div>
        <div className="grid grid-cols-[8.5rem_1fr] gap-2">
          <input aria-label="매입 날짜" type="date" className="field" value={p.date} onChange={(e) => onChange({ ...p, date: e.target.value })} />
          <input aria-label="거래처" className="field" placeholder="거래처 (예: 홈마트)" value={p.vendor} onChange={(e) => onChange({ ...p, vendor: e.target.value })} />
        </div>

        <div className="space-y-2">
          <div className="hidden grid-cols-[1fr_5rem_3.5rem_6rem_2rem] gap-1 px-1 text-[10px] text-stone-400 sm:grid">
            <span>상품명</span>
            <span className="text-right">단가</span>
            <span className="text-right">수량</span>
            <span className="text-right">금액</span>
            <span />
          </div>
          {p.lines.map((l, i) => (
            <div key={i} className="space-y-1 rounded-xl bg-stone-50 p-2">
              <div className="grid grid-cols-[1fr_5rem_3.5rem_6rem_2rem] items-center gap-1">
                <input aria-label={`상품명 ${i + 1}`} className="field px-2" placeholder="상품명 (예: 특란 30구)" value={l.name} onChange={(e) => setLine(i, { name: e.target.value })} />
                <MoneyInput label={`단가 ${i + 1}`} value={l.unitPrice} onChange={(n) => setLine(i, { unitPrice: n ?? 0 })} placeholder="단가" />
                <input aria-label={`수량 ${i + 1}`} inputMode="decimal" className="field num px-1 text-right" value={l.qty || ""} onChange={(e) => setLine(i, { qty: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })} placeholder="수량" />
                <MoneyInput label={`금액 ${i + 1}`} value={l.amount} onChange={(n) => setLine(i, { amount: n ?? 0 })} placeholder="금액" />
                <button className="btn-ghost px-1 py-1 text-xs" aria-label={`줄 ${i + 1} 지우기`} onClick={() => onChange({ ...p, lines: p.lines.filter((_, j) => j !== i) })}>
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-[6.5rem_1fr_7rem] items-center gap-1 text-xs">
                <select aria-label={`분류 ${i + 1}`} className="field px-2 py-1.5 text-xs" value={l.category} onChange={(e) => setLine(i, { category: e.target.value as PurchaseCategory })}>
                  {PURCHASE_CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <select aria-label={`품목 연결 ${i + 1}`} className="field px-2 py-1.5 text-xs" value={l.itemId ?? ""} onChange={(e) => setLine(i, { itemId: e.target.value || null })}>
                  <option value="">원가율 품목에 연결 안 함</option>
                  {activeItems.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.name} ({unitLabel(it.baseUnit)})
                    </option>
                  ))}
                </select>
                {l.itemId ? (
                  <div className="flex items-center gap-1">
                    <input aria-label={`품목 수량 ${i + 1}`} inputMode="decimal" className="field num px-1 py-1.5 text-right text-xs" value={l.itemQty || ""} onChange={(e) => setLine(i, { itemQty: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })} placeholder="수량" />
                    <span className="whitespace-nowrap text-[11px] text-stone-500">{unitLabel(itemUnitOf(items, l.itemId))}</span>
                  </div>
                ) : (
                  <span />
                )}
              </div>
              {l.itemId && l.itemQty > 0 && (
                <p className="num text-right text-[11px] text-stone-500">
                  → {num(lineUnitCost(p, l) ?? 0)}원/{unitLabel(itemUnitOf(items, l.itemId))} (할인 반영)
                </p>
              )}
            </div>
          ))}
          <button className="btn-ghost w-full py-1.5 text-xs" onClick={() => onChange({ ...p, lines: [...p.lines, emptyLine()] })}>
            + 줄 추가
          </button>
        </div>

        <div className="grid grid-cols-2 items-end gap-2">
          <label className="space-y-1 text-[11px] text-stone-500">
            할인 합계 (영수증의 할인금액)
            <MoneyInput label="할인 합계" value={p.discount} onChange={(n) => onChange({ ...p, discount: n ?? 0 })} />
          </label>
          <p className="num text-right text-sm">
            합계 <b>{won(purchaseTotal(p))}</b>
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost flex-1" onClick={onCancel}>
            취소
          </button>
          <button className="btn-primary flex-1" onClick={onSave}>
            저장
          </button>
        </div>
      </div>
    </div>
  );
}

// 10.4kg·0.2kg처럼 소수점이 있으면 한 자리까지
const fmtQty = (q: number) => (Number.isInteger(q) ? num(q) : q.toFixed(1));

function itemUnitOf(items: Item[], id: string) {
  return items.find((i) => i.id === id)?.baseUnit ?? "ea";
}
