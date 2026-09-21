"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog, MoneyInput, Notice } from "@/components/ui";
import { newId } from "@/lib/classify";
import { ITEMS_KEY, type Item } from "@/lib/costing/types";
import { RECEIPT_EXEMPT_KEY, cardPayee, emptyExempt, matchCardReceipts, type ReceiptExempt } from "@/lib/costing/receiptMatch";
import { SAMPLE_PURCHASES, SAMPLE_PURCHASES_MONTH } from "@/lib/costing/samplePurchases";
import type { Transaction } from "@/lib/types";
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
import { LiquorParseError, liquorBrands, liquorDayToPurchase, newLiquorItems, parseLiquorLedgerGrid, type LiquorLedger } from "@/lib/costing/liquorLedger";
import { ReceiptSheetError, linkableCategory, parseReceiptSheets, receiptDiscount, receiptTotal, sheetReceiptToPurchase, toPurchaseCategory, type SheetReceipt } from "@/lib/costing/receiptSheet";
import { RECEIPT_PROMPT, matchItem, parseReceiptText, toPurchaseLine } from "@/lib/costing/receiptText";
import { todayStr } from "@/lib/daily";
import { num, won } from "@/lib/format";
import { monthLabel, nextMonth } from "@/lib/month";
import { addPhoto, countPhotosByOwner, deletePhoto, deletePhotosOf, getPhotoBlob, listPhotos, photosAvailable, type PhotoMeta } from "@/lib/photos";
import { getStore } from "@/lib/storage";

// 매입 영수증 — 마트·거래처 영수증을 품목별로 적고, 품목에 연결하면 기준단가가 최근 매입가로 바뀐다.
const LIQUOR_VENDOR_KEY = "liquor_vendor"; // 주류 도매상 이름 (한 번 적으면 다음에도)
const emptyLine = (): PurchaseLine => ({ name: "", unitPrice: 0, qty: 1, amount: 0, category: "원재료비", itemId: null, itemQty: 0 });

export default function PurchaseSection({ month, items, onItemsChange }: { month: string; items: Item[]; onItemsChange: () => Promise<void> }) {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<Purchase | null>(null);
  const [editingIsNew, setEditingIsNew] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [viewing, setViewing] = useState<Purchase | null>(null);
  const [photoCounts, setPhotoCounts] = useState<Record<string, number>>({});
  const [liquor, setLiquor] = useState<{ ledger: LiquorLedger; fileName: string; vendor: string } | null>(null);
  const liquorRef = useRef<HTMLInputElement>(null);
  const [sheet, setSheet] = useState<{ receipts: SheetReceipt[]; notes: string[]; fileName: string } | null>(null);
  const sheetRef = useRef<HTMLInputElement>(null);
  const [confirmDelete, setConfirmDelete] = useState<Purchase | null>(null);
  const [note, setNote] = useState<{ tone: "ok" | "info" | "warn"; text: string } | null>(null);
  const [bankTxs, setBankTxs] = useState<Transaction[]>([]);
  const [exempt, setExempt] = useState<ReceiptExempt>(emptyExempt());
  const key = PURCHASES_KEY_PREFIX + month;

  // 이 달부터 이번 달까지의 매입 영수증 (기준단가를 바꿀 때 "더 최근에 산 기록"이 있는지 보려고)
  async function purchasesSince(fromMonth: string): Promise<Purchase[]> {
    const store = getStore();
    const out: Purchase[] = [];
    const last = todayStr().slice(0, 7) > fromMonth ? todayStr().slice(0, 7) : fromMonth;
    for (let m = fromMonth; m <= last; m = nextMonth(m)) out.push(...((await store.getSetting<Purchase[]>(PURCHASES_KEY_PREFIX + m)) ?? []));
    return out;
  }

  async function load() {
    const list = (await getStore().getSetting<Purchase[]>(key)) ?? [];
    setPurchases(list.sort((a, b) => (a.date < b.date ? 1 : -1)));
    setPhotoCounts(await countPhotosByOwner());
    setBankTxs(await getStore().listTransactions(month));
    setExempt({ ...emptyExempt(), ...((await getStore().getSetting<ReceiptExempt>(RECEIPT_EXEMPT_KEY)) ?? {}) });
    setLoaded(true);
  }

  // 새 영수증을 만들다 취소하면 그 사이 붙인 사진도 같이 지운다 (주인 없는 사진이 남지 않게)
  async function cancelEdit() {
    if (editing && editingIsNew) await deletePhotosOf(editing.id);
    setEditing(null);
    setEditingIsNew(false);
    await load();
  }

  function startNew(prefill?: Partial<Purchase>) {
    setEditing({
      id: `pu_${newId().slice(0, 8)}`,
      date: month === todayStr().slice(0, 7) ? todayStr() : `${month}-01`,
      vendor: "",
      lines: [emptyLine(), emptyLine(), emptyLine()],
      discount: 0,
      ...prefill,
    });
    setEditingIsNew(true);
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
    const applied = applyPurchaseToItems(items, clean, await purchasesSince(clean.date.slice(0, 7)));
    if (applied.updated.length) {
      await store.saveSetting(ITEMS_KEY, applied.items);
      await onItemsChange();
    }
    setEditing(null);
    setEditingIsNew(false);
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
    await deletePhotosOf(p.id);
    await load();
  }

  // 주류 도매상 매출원장 엑셀 → 입고일마다 매입 영수증
  async function readLiquorFile(file: File) {
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null }) as never[][];
      const ledger = parseLiquorLedgerGrid(grid);
      const vendor = (await getStore().getSetting<string>(LIQUOR_VENDOR_KEY)) ?? "주류";
      setLiquor({ ledger, fileName: file.name, vendor });
    } catch (e) {
      setNote({ tone: "warn", text: e instanceof LiquorParseError ? e.message : "파일을 읽지 못했어요. 주류 도매상에서 받은 매출원장 엑셀인지 확인해 주세요." });
    } finally {
      if (liquorRef.current) liquorRef.current.value = "";
    }
  }

  async function saveLiquor(ledger: LiquorLedger, vendor: string, createItems: boolean) {
    const store = getStore();
    const v = vendor.trim() || "주류";
    let nextItems = items;
    const made = createItems ? newLiquorItems(ledger, items) : [];
    if (made.length) nextItems = [...items, ...made];
    // 달마다 나눠 저장 (같은 입고일은 id가 같아 바뀌기만 한다)
    const byMonth = new Map<string, Purchase[]>();
    for (const d of ledger.days) {
      if (d.lines.length === 0) continue;
      const p = liquorDayToPurchase(d, v, nextItems);
      const m = d.date.slice(0, 7);
      byMonth.set(m, [...(byMonth.get(m) ?? []), p]);
    }
    const updated = new Map<string, { name: string; from: number; to: number }>();
    for (const [m, list] of byMonth) {
      const k = PURCHASES_KEY_PREFIX + m;
      const old = (await store.getSetting<Purchase[]>(k)) ?? [];
      const ids = new Set(list.map((p) => p.id));
      await store.saveSetting(k, [...old.filter((p) => !ids.has(p.id)), ...list]);
    }
    const all = await purchasesSince([...byMonth.keys()].sort()[0]);
    for (const [, list] of byMonth) {
      // 오래된 입고일부터 반영해 마지막 기준단가 = 가장 최근 매입가 (더 최근에 산 기록이 있으면 그대로)
      for (const p of [...list].sort((a, b) => (a.date < b.date ? -1 : 1))) {
        const applied = applyPurchaseToItems(nextItems, p, all);
        nextItems = applied.items;
        for (const u of applied.updated) updated.set(u.name, { ...u, from: updated.get(u.name)?.from ?? u.from });
      }
    }
    if (made.length || updated.size) {
      await store.saveSetting(ITEMS_KEY, nextItems);
      await onItemsChange();
    }
    await store.saveSetting(LIQUOR_VENDOR_KEY, v);
    setLiquor(null);
    await load();
    const count = [...byMonth.values()].reduce((a, l) => a + l.length, 0);
    setNote({
      tone: "ok",
      text: `주류 입고 ${count}건 넣었어요 (술값 ${won(ledger.totals.subtotal)}, 보증금은 뺌).${made.length ? ` 새 품목 ${made.length}개: ${made.map((i) => i.name).join(", ")}.` : ""}${updated.size ? ` 병당 기준단가 갱신 ${updated.size}개.` : ""}`,
    });
  }

  // 영수증 정리 엑셀(폰 AI로 만든 품목별내역·영수증요약) → 영수증마다 매입 영수증
  async function readSheetFile(file: File) {
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheets = wb.SheetNames.map((name) => ({ name, grid: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null }) as never[][] }));
      const parsed = parseReceiptSheets(sheets);
      setSheet({ ...parsed, fileName: file.name });
    } catch (e) {
      setNote({ tone: "warn", text: e instanceof ReceiptSheetError ? e.message : "파일을 읽지 못했어요. 영수증을 정리한 엑셀인지 확인해 주세요." });
    } finally {
      if (sheetRef.current) sheetRef.current.value = "";
    }
  }

  async function saveSheet(picked: SheetReceipt[], link: boolean) {
    const store = getStore();
    let nextItems = items;
    const byMonth = new Map<string, Purchase[]>();
    for (const rc of picked) {
      const p = sheetReceiptToPurchase(rc, nextItems, link);
      byMonth.set(rc.date.slice(0, 7), [...(byMonth.get(rc.date.slice(0, 7)) ?? []), p]);
    }
    const updated = new Map<string, { name: string; from: number; to: number }>();
    for (const [m, list] of byMonth) {
      const k = PURCHASES_KEY_PREFIX + m;
      const old = (await store.getSetting<Purchase[]>(k)) ?? [];
      const ids = new Set(list.map((p) => p.id));
      await store.saveSetting(k, [...old.filter((p) => !ids.has(p.id)), ...list]);
    }
    const all = await purchasesSince([...byMonth.keys()].sort()[0]);
    for (const [, list] of byMonth) {
      for (const p of [...list].sort((a, b) => (a.date < b.date ? -1 : 1))) {
        const applied = applyPurchaseToItems(nextItems, p, all);
        nextItems = applied.items;
        for (const u of applied.updated) updated.set(u.name, { ...u, from: updated.get(u.name)?.from ?? u.from });
      }
    }
    if (updated.size) {
      await store.saveSetting(ITEMS_KEY, nextItems);
      await onItemsChange();
    }
    setSheet(null);
    await load();
    setNote({
      tone: "ok",
      text: `영수증 ${picked.length}건 넣었어요 (${won(picked.reduce((a, r) => a + receiptTotal(r), 0))}).${updated.size ? ` 기준단가 갱신: ${[...updated.values()].map((u) => `${u.name} ${num(u.from)}→${num(u.to)}`).join(", ")}` : ""}`,
    });
  }

  if (!loaded) return null;
  const summary = summarizePurchases(purchases);
  const itemName = (id: string) => items.find((i) => i.id === id)?.name ?? id;
  const itemUnit = (id: string) => items.find((i) => i.id === id)?.baseUnit ?? "ea";

  return (
    <>
      <section className="card space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold">
            매입 영수증 <span className="text-[11px] font-normal text-stone-500">{monthLabel(month)} · 품목별 입고</span>
          </h2>
          <div className="flex flex-wrap gap-1.5">
            <button className="btn-ghost whitespace-nowrap px-3 py-1.5 text-xs" onClick={() => sheetRef.current?.click()}>
              🧾 영수증 엑셀 올리기
            </button>
            <input ref={sheetRef} type="file" accept=".xlsx,.xls" aria-label="영수증 정리 엑셀" className="hidden" onChange={(e) => e.target.files?.[0] && readSheetFile(e.target.files[0])} />
            <button className="btn-ghost whitespace-nowrap px-3 py-1.5 text-xs" onClick={() => liquorRef.current?.click()}>
              🍺 주류 원장 올리기
            </button>
            <input ref={liquorRef} type="file" accept=".xlsx,.xls" aria-label="주류 매출원장 엑셀" className="hidden" onChange={(e) => e.target.files?.[0] && readLiquorFile(e.target.files[0])} />
            <button className="btn-ghost whitespace-nowrap px-3 py-1.5 text-xs" onClick={() => setPasting(true)}>
              📋 텍스트로 붙여넣기
            </button>
            <button className="btn-primary whitespace-nowrap px-3 py-1.5 text-xs" onClick={() => startNew()}>
              + 영수증 추가
            </button>
          </div>
        </div>
        <p className="text-xs text-stone-600">
          마트·거래처 영수증을 상품 줄 그대로 적어요. 줄을 <b>원가율 품목에 연결</b>하고 품목 단위 수량(특란 30구×5 = 150개)을 넣으면 그 품목의 <b>기준단가가 최근 매입가로 자동</b>으로 바뀌어요. 손익은 통장 기준이라 여기 금액은 손익에 따로 더하지 않아요.
        </p>
        <p className="text-xs text-stone-600">
          손으로 치기 번거로우면 <b>폰 클로드·챗GPT 앱에 영수증 사진</b>을 올려 글자로 받은 다음, “텍스트로 붙여넣기”에 그대로 붙이세요. 줄과 품목 연결까지 자동으로 채워집니다. 실물 사진은 영수증마다 붙여 두면 나중에 숫자와 나란히 볼 수 있어요.
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
          <div className="space-y-2">
            <p className="text-xs text-stone-500">아직 영수증이 없어요. “+ 영수증 추가”로 넣어 보세요.</p>
            {month === SAMPLE_PURCHASES_MONTH && (
              <button
                className="btn-ghost text-xs"
                onClick={async () => {
                  await getStore().saveSetting(key, SAMPLE_PURCHASES);
                  await load();
                  setNote({ tone: "info", text: `가짜 예시 영수증 ${SAMPLE_PURCHASES.length}장을 넣었어요. 올리기 탭에 “가짜 9월 파일”도 올리면 아래에서 체크카드 결제와 맞춰 봐요.` });
                }}
              >
                가짜 예시 영수증 넣기 (시연용)
              </button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-stone-100 text-sm">
            {purchases.map((p) => (
              <li key={p.id} className="py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {p.date.slice(5).replace("-", "/")} {p.vendor} <span className="num text-xs text-stone-500">{p.lines.length}줄</span>
                      {photoCounts[p.id] > 0 && <span className="num ml-1 rounded bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-600">📷 {photoCounts[p.id]}</span>}
                    </p>
                    <p className="text-[11px] text-stone-500">
                      {p.lines
                        .slice(0, 4)
                        .map((l) => l.name)
                        .join(" · ")}
                      {p.lines.length > 4 ? " …" : ""}
                    </p>
                    {p.memo && <p className="text-[11px] text-stone-400">{p.memo}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="num text-sm font-bold">{won(purchaseTotal(p))}</span>
                    {photoCounts[p.id] > 0 && (
                      <button className="btn-ghost whitespace-nowrap px-2 py-1 text-xs" onClick={() => setViewing(p)}>
                        사진 보기
                      </button>
                    )}
                    <button
                      className="btn-ghost whitespace-nowrap px-2 py-1 text-xs"
                      onClick={() => {
                        setEditing({ ...p, lines: p.lines.map((l) => ({ ...l })) });
                        setEditingIsNew(false);
                      }}
                    >
                      고치기
                    </button>
                    <button className="btn-ghost whitespace-nowrap px-2 py-1 text-xs" onClick={() => setConfirmDelete(p)}>
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

      <CardReceiptCheck
        txs={bankTxs}
        purchases={purchases}
        exempt={exempt}
        onExempt={async (next) => {
          await getStore().saveSetting(RECEIPT_EXEMPT_KEY, next);
          setExempt(next);
        }}
        onAddReceipt={(t) => startNew({ date: t.date, vendor: cardPayee(t.payee), lines: [{ ...emptyLine(), unitPrice: t.out, amount: t.out }] })}
      />

      {pasting && (
        <PasteDialog
          month={month}
          items={items}
          onCancel={() => setPasting(false)}
          onUse={(p) => {
            setPasting(false);
            startNew(p);
          }}
        />
      )}
      {sheet && <SheetDialog {...sheet} items={items} onCancel={() => setSheet(null)} onSave={(picked, link) => void saveSheet(picked, link)} />}
      {liquor && <LiquorDialog {...liquor} items={items} onCancel={() => setLiquor(null)} onSave={(vendor, createItems) => void saveLiquor(liquor.ledger, vendor, createItems)} />}
      {viewing && <PurchaseViewer purchase={viewing} items={items} onClose={() => setViewing(null)} />}
      {editing && <PurchaseEditor purchase={editing} items={items} onChange={setEditing} onSave={() => save(editing)} onCancel={() => void cancelEdit()} />}
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

        <PhotoStrip ownerId={p.id} />

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

// 텍스트로 붙여넣기 — 폰 클로드·챗GPT 앱에 영수증 사진을 올려 받은 글자를 그대로 붙이면 줄로 바꿔 준다.
function PasteDialog({ month, items, onUse, onCancel }: { month: string; items: Item[]; onUse: (p: Partial<Purchase>) => void; onCancel: () => void }) {
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const parsed = useMemo(() => (text.trim() ? parseReceiptText(text, month) : null), [text, month]);

  const build = () => {
    if (!parsed) return;
    const lines: PurchaseLine[] = parsed.lines.map((l) => {
      const line = toPurchaseLine(l);
      const it = matchItem(l.name, items);
      if (it) {
        line.itemId = it.id;
        line.itemQty = guessItemQty(l.name, l.qty, it.baseUnit) ?? 0;
      }
      return line;
    });
    onUse({ date: parsed.date || undefined, vendor: parsed.vendor || "", lines, discount: parsed.discount });
  };

  const linked = parsed ? parsed.lines.filter((l) => matchItem(l.name, items)).length : 0;
  const sum = parsed ? parsed.lines.reduce((a, l) => a + l.amount, 0) - parsed.discount : 0;

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="텍스트로 영수증 붙여넣기">
      <div className="card max-h-[92vh] w-full max-w-2xl space-y-3 overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">텍스트로 붙여넣기</h2>
          <button className="btn-ghost px-2 py-1 text-xs" onClick={onCancel}>
            닫기
          </button>
        </div>

        <details className="rounded-xl bg-stone-50 p-2 text-xs text-stone-600">
          <summary className="cursor-pointer font-semibold text-stone-700">폰에서 하는 법 (누르면 펼쳐져요)</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>폰 클로드(또는 챗GPT) 앱을 열고 영수증 사진을 올려요.</li>
            <li>아래 지시문을 같이 붙여 넣어요. (한 번 복사해 두면 계속 써요)</li>
            <li>나온 글자를 복사해서 아래 칸에 붙여 넣어요.</li>
          </ol>
          <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-white p-2 text-[11px] text-stone-700">{RECEIPT_PROMPT}</pre>
          <button
            className="btn-ghost mt-1 px-2 py-1 text-[11px]"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(RECEIPT_PROMPT);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? "복사했어요" : "지시문 복사"}
          </button>
        </details>

        <textarea
          aria-label="영수증 텍스트"
          className="field h-40 w-full font-mono text-xs"
          placeholder={"거래처: 홈마트\n날짜: 2026-09-20\n특란 30구 | 5,800 | 2 | 11,600\n대파 1단 | 2,500 | 3 | 7,500\n할인: 600\n합계: 18,500"}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        {parsed && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-stone-500">이렇게 읽었어요</p>
            <div className="num grid grid-cols-3 gap-2 rounded-xl bg-stone-50 p-2 text-xs">
              <div>
                <p className="text-[11px] text-stone-500">거래처</p>
                <p className="font-bold">{parsed.vendor || "못 읽음"}</p>
              </div>
              <div>
                <p className="text-[11px] text-stone-500">날짜</p>
                <p className="font-bold">{parsed.date || "못 읽음"}</p>
              </div>
              <div>
                <p className="text-[11px] text-stone-500">합계</p>
                <p className="font-bold">{won(sum)}</p>
              </div>
            </div>
            {parsed.notes.map((n, i) => (
              <Notice key={i} tone="warn">
                {n}
              </Notice>
            ))}
            {parsed.lines.length > 0 && (
              <>
                <ul className="divide-y divide-stone-100 text-xs">
                  {parsed.lines.map((l, i) => {
                    const it = matchItem(l.name, items);
                    return (
                      <li key={i} className="flex items-center justify-between gap-2 py-1">
                        <span className="min-w-0 flex-1 truncate">
                          {l.name}
                          {it && <span className="ml-1 rounded bg-orange-50 px-1 py-0.5 text-[10px] text-orange-700">→ {it.name}</span>}
                        </span>
                        <span className="num whitespace-nowrap text-stone-500">
                          {num(l.unitPrice)} × {fmtQty(l.qty)} ={" "}
                        </span>
                        <span className="num whitespace-nowrap font-semibold">{won(l.amount)}</span>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-[11px] text-stone-500">
                  {parsed.lines.length}줄 · 품목 자동 연결 {linked}개{parsed.discount > 0 ? ` · 할인 ${won(parsed.discount)}` : ""}. 넣은 뒤에도 고칠 수 있어요.
                </p>
              </>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button className="btn-ghost flex-1" onClick={onCancel}>
            취소
          </button>
          <button className="btn-primary flex-1" disabled={!parsed || parsed.lines.length === 0} onClick={build}>
            이대로 넣기
          </button>
        </div>
      </div>
    </div>
  );
}

// 영수증 사진 — 이 브라우저 안에만 저장한다 (다른 기기·시연 모드에서는 안 보임)
function PhotoStrip({ ownerId, readOnly = false }: { ownerId: string; readOnly?: boolean }) {
  const [photos, setPhotos] = useState<PhotoMeta[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const available = photosAvailable();

  async function load() {
    const list = await listPhotos(ownerId);
    const next: Record<string, string> = {};
    for (const p of list) {
      const blob = await getPhotoBlob(p.id);
      if (blob) next[p.id] = URL.createObjectURL(blob);
    }
    setPhotos(list);
    setUrls((old) => {
      Object.values(old).forEach((u) => URL.revokeObjectURL(u));
      return next;
    });
  }
  useEffect(() => {
    if (available) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId]);

  if (!available) return null;

  async function addFiles(files: FileList) {
    setBusy(true);
    for (const f of Array.from(files)) {
      if (f.type.startsWith("image/")) await addPhoto(ownerId, f);
    }
    setBusy(false);
    await load();
  }

  return (
    <div className="space-y-1 rounded-xl bg-stone-50 p-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-stone-600">
          영수증·명세표 사진 {photos.length > 0 && <span className="num text-stone-500">{photos.length}장</span>}
        </p>
        {!readOnly && (
          <>
            <button className="btn-ghost px-2 py-1 text-[11px]" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? "넣는 중…" : "+ 사진 붙이기"}
            </button>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" aria-label="영수증 사진" onChange={(e) => e.target.files?.length && addFiles(e.target.files)} />
          </>
        )}
      </div>
      {photos.length === 0 ? (
        !readOnly && <p className="text-[11px] text-stone-500">폰으로 찍은 영수증 사진을 붙여 두면 나중에 숫자와 나란히 볼 수 있어요. 사진은 이 컴퓨터 브라우저에만 남아요.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {photos.map((p) => (
            <div key={p.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urls[p.id]} alt={p.name} className="h-20 w-20 cursor-zoom-in rounded-lg object-cover" onClick={() => urls[p.id] && window.open(urls[p.id], "_blank")} />
              {!readOnly && (
                <button
                  className="absolute -right-1 -top-1 rounded-full bg-white px-1.5 text-[11px] text-stone-600 shadow"
                  aria-label={`사진 지우기 ${p.name}`}
                  onClick={async () => {
                    await deletePhoto(p.id);
                    await load();
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 사진 보기 — 실물 명세표와 입력한 숫자를 나란히 놓고 대조한다
function PurchaseViewer({ purchase, items, onClose }: { purchase: Purchase; items: Item[]; onClose: () => void }) {
  const p = purchase;
  const [photos, setPhotos] = useState<PhotoMeta[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const made: string[] = [];
    void (async () => {
      const list = await listPhotos(p.id);
      const next: Record<string, string> = {};
      for (const ph of list) {
        const blob = await getPhotoBlob(ph.id);
        if (blob) {
          next[ph.id] = URL.createObjectURL(blob);
          made.push(next[ph.id]);
        }
      }
      if (!alive) {
        made.forEach((u) => URL.revokeObjectURL(u));
        return;
      }
      setPhotos(list);
      setUrls(next);
      setCurrent(list[0]?.id ?? null);
    })();
    return () => {
      alive = false;
      made.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [p.id]);

  const itemName = (id: string) => items.find((i) => i.id === id)?.name ?? id;
  const currentUrl = current ? urls[current] : undefined;

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="영수증 사진과 입력한 숫자">
      <div className="card max-h-[92vh] w-full max-w-4xl space-y-3 overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">
            {p.date.slice(5).replace("-", "/")} {p.vendor} <span className="num text-xs font-normal text-stone-500">{won(purchaseTotal(p))}</span>
          </h2>
          <button className="btn-ghost px-2 py-1 text-xs" onClick={onClose}>
            닫기
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            {currentUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={currentUrl} alt="영수증 사진" className="max-h-[60vh] w-full cursor-zoom-in rounded-xl object-contain" onClick={() => window.open(currentUrl, "_blank")} />
            ) : (
              <p className="text-xs text-stone-500">사진이 없어요.</p>
            )}
            {photos.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {photos.map((ph) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={ph.id} src={urls[ph.id]} alt={ph.name} className={`h-14 w-14 cursor-pointer rounded-lg object-cover ${current === ph.id ? "ring-2 ring-orange-500" : ""}`} onClick={() => setCurrent(ph.id)} />
                ))}
              </div>
            )}
            <p className="text-[11px] text-stone-500">사진을 누르면 새 창에서 크게 봐요. 사진은 이 컴퓨터 브라우저에만 있어요.</p>
          </div>
          <div>
            <ul className="divide-y divide-stone-100 text-xs">
              {p.lines.map((l, i) => (
                <li key={i} className="flex items-center justify-between gap-2 py-1">
                  <span className="min-w-0 flex-1">
                    {l.name}
                    {l.itemId && <span className="ml-1 rounded bg-orange-50 px-1 py-0.5 text-[10px] text-orange-700">{itemName(l.itemId)}</span>}
                  </span>
                  <span className="num whitespace-nowrap text-stone-500">
                    {num(l.unitPrice)} × {fmtQty(l.qty)}
                  </span>
                  <span className="num w-20 whitespace-nowrap text-right font-semibold">{won(l.amount)}</span>
                </li>
              ))}
            </ul>
            {p.discount > 0 && (
              <p className="num mt-1 flex justify-between text-xs text-stone-500">
                <span>할인</span>
                <span>-{won(p.discount)}</span>
              </p>
            )}
            <p className="num mt-1 flex justify-between border-t border-stone-200 pt-1 text-sm font-bold">
              <span>합계</span>
              <span>{won(purchaseTotal(p))}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// 주류 원장 미리보기 — 입고일별 술값·보증금·검산, 술별 병당 원가와 품목 연결을 보여 주고 넣는다
function LiquorDialog({ ledger, fileName, vendor: initialVendor, items, onSave, onCancel }: { ledger: LiquorLedger; fileName: string; vendor: string; items: Item[]; onSave: (vendor: string, createItems: boolean) => void; onCancel: () => void }) {
  const [vendor, setVendor] = useState(initialVendor);
  const [createItems, setCreateItems] = useState(true);
  const brands = liquorBrands(ledger);
  const willCreate = newLiquorItems(ledger, items);
  const days = ledger.days.filter((d) => d.lines.length > 0);
  const netDeposit = ledger.totals.deposit - ledger.totals.returned;

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="주류 원장 미리보기">
      <div className="card max-h-[92vh] w-full max-w-2xl space-y-3 overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">
            주류 원장 <span className="text-[11px] font-normal text-stone-500">{fileName}</span>
          </h2>
          <button className="btn-ghost px-2 py-1 text-xs" onClick={onCancel}>
            닫기
          </button>
        </div>

        <label className="block space-y-1 text-[11px] text-stone-500">
          거래처 이름 (한 번 적으면 다음에도 그대로)
          <input aria-label="주류 거래처" className="field" value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="예: ○○주류" />
        </label>

        {ledger.notes.map((n, i) => (
          <Notice key={i} tone="warn">
            {n}
          </Notice>
        ))}
        {ledger.notes.length === 0 && <Notice tone="ok">입고일마다 일계 줄과 맞춰 봤어요. 빠진 줄 없이 다 맞아요.</Notice>}

        <div>
          <p className="mb-1 text-xs font-semibold text-stone-500">입고일별</p>
          <div className="num overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[10px] text-stone-400">
                <tr>
                  <th className="py-1 text-left font-normal">날짜</th>
                  <th className="text-right font-normal">박스</th>
                  <th className="text-right font-normal">술값</th>
                  <th className="text-right font-normal">보증금</th>
                  <th className="text-right font-normal">빈병 반납</th>
                  <th className="text-right font-normal">검산</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {days.map((d) => (
                  <tr key={d.date}>
                    <td className="py-1">{d.date.slice(5).replace("-", "/")}</td>
                    <td className="text-right">{num(d.lines.reduce((a, l) => a + l.box, 0))}</td>
                    <td className="text-right font-semibold">{won(d.subtotal)}</td>
                    <td className="text-right text-stone-500">{won(d.deposit)}</td>
                    <td className="text-right text-stone-500">{d.returned ? `-${won(d.returned)}` : "-"}</td>
                    <td className="text-right">{d.mismatch ? "⚠" : d.checked ? "✓" : "-"}</td>
                  </tr>
                ))}
                <tr className="font-bold">
                  <td className="py-1">합계</td>
                  <td className="text-right">{num(ledger.totals.box)}</td>
                  <td className="text-right">{won(ledger.totals.subtotal)}</td>
                  <td className="text-right text-stone-500">{won(ledger.totals.deposit)}</td>
                  <td className="text-right text-stone-500">-{won(ledger.totals.returned)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-[11px] text-stone-500">
            매입 영수증에는 <b>술값만</b> 들어가요. 보증금은 빈병을 돌려주면 돌아오는 돈이라 원가가 아니에요 (이 파일 기간 동안 아직 안 돌아온 보증금 {won(netDeposit)}).
            {ledger.balance !== null && (
              <>
                {" "}
                파일 끝 외상 잔액은 <b>{won(ledger.balance)}</b> — 말일 결제 때 통장에서 나가는 돈과 맞춰 보세요.
              </>
            )}
          </p>
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold text-stone-500">술별 병당 원가 (부가세 포함)</p>
          <ul className="num divide-y divide-stone-100 text-xs">
            {brands.map((b) => {
              const linked = matchItem(b.displayName, items);
              const creating = !linked && willCreate.some((i) => i.name === b.displayName);
              return (
                <li key={`${b.displayName}${b.specMl}`} className="flex items-center justify-between gap-2 py-1">
                  <span className="min-w-0 flex-1">
                    {b.displayName} <span className="text-stone-400">{b.specMl}ml</span>
                    {linked ? (
                      <span className="ml-1 rounded bg-orange-50 px-1 py-0.5 text-[10px] text-orange-700">→ {linked.name}</span>
                    ) : creating && createItems ? (
                      <span className="ml-1 rounded bg-emerald-50 px-1 py-0.5 text-[10px] text-emerald-700">새 품목</span>
                    ) : (
                      <span className="ml-1 rounded bg-stone-100 px-1 py-0.5 text-[10px] text-stone-500">연결 안 함</span>
                    )}
                  </span>
                  <span className="whitespace-nowrap text-stone-500">
                    {num(b.box)}박스{b.bottles !== null ? ` · ${num(b.bottles)}병` : ""}
                  </span>
                  <span className="w-20 whitespace-nowrap text-right font-semibold">{b.perBottle !== null ? `${num(Math.round(b.perBottle))}원/병` : "병 수 모름"}</span>
                </li>
              );
            })}
          </ul>
          {willCreate.length > 0 && (
            <label className="mt-2 flex items-start gap-2 text-xs text-stone-600">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-orange-600" checked={createItems} onChange={(e) => setCreateItems(e.target.checked)} />
              <span>
                원가율 품목에 없는 술 {willCreate.length}개를 <b>병 단위 품목</b>으로 새로 만들어요 ({willCreate.map((i) => i.name).join(", ")}). 이미 다른 이름으로 있는 술이면 끄고 나중에 영수증에서 직접 연결하세요.
              </span>
            </label>
          )}
        </div>

        <div className="flex gap-2">
          <button className="btn-ghost flex-1" onClick={onCancel}>
            취소
          </button>
          <button className="btn-primary flex-1" disabled={days.length === 0} onClick={() => onSave(vendor, createItems)}>
            {days.length}건 넣기
          </button>
        </div>
        <p className="text-[11px] text-stone-500">같은 파일을 다시 올려도 겹치지 않고 그 입고일 영수증이 새 내용으로 바뀌어요.</p>
      </div>
    </div>
  );
}

// 영수증 정리 엑셀 미리보기 — 영수증마다 넣을지 고르고, 식비·개인 물품뿐인 영수증은 기본으로 빼 둔다
function SheetDialog({ receipts, notes, fileName, items, onSave, onCancel }: { receipts: SheetReceipt[]; notes: string[]; fileName: string; items: Item[]; onSave: (picked: SheetReceipt[], link: boolean) => void; onCancel: () => void }) {
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(receipts.map((r) => [r.key, !r.personal])));
  const [link, setLink] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const picked = receipts.filter((r) => on[r.key]);
  const total = picked.reduce((a, r) => a + receiptTotal(r), 0);
  const skipped = receipts.filter((r) => !on[r.key]);
  // 영수증에 할인이 적혀 있는데 결제액이 품목 합계와 같으면: 할인은 이미 품목 가격에 들어간 것으로 본다
  const shownOnly = receipts.filter((r) => r.shownDiscount > 0 && receiptDiscount(r) === 0);

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="영수증 엑셀 미리보기">
      <div className="card max-h-[92vh] w-full max-w-2xl space-y-3 overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">
            영수증 엑셀 <span className="text-[11px] font-normal text-stone-500">{fileName}</span>
          </h2>
          <button className="btn-ghost px-2 py-1 text-xs" onClick={onCancel}>
            닫기
          </button>
        </div>

        {notes.map((n, i) => (
          <Notice key={i} tone="warn">
            {n}
          </Notice>
        ))}
        {shownOnly.length > 0 && (
          <Notice tone="info">
            할인이 적혀 있지만 결제액이 품목 합계와 같은 영수증이 {shownOnly.length}건 있어요 ({shownOnly.map((r) => `${r.date.slice(5).replace("-", "/")} ${r.vendor}`).join(", ")}). 할인은 이미 품목 가격에 들어간 것으로 보고 <b>결제액 그대로</b> 넣어요. 카드 내역과 다르면 알려 주세요.
          </Notice>
        )}

        <ul className="divide-y divide-stone-100 text-xs">
          {receipts.map((r) => {
            const kinds = [...new Set(r.lines.map((l) => l.rawCategory).filter(Boolean))];
            return (
              <li key={r.key} className={`py-1.5 ${on[r.key] ? "" : "opacity-50"}`}>
                <div className="flex items-center gap-2">
                  <input type="checkbox" aria-label={`${r.date} ${r.vendor} 넣기`} className="h-4 w-4 accent-orange-600" checked={!!on[r.key]} onChange={(e) => setOn({ ...on, [r.key]: e.target.checked })} />
                  <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(open === r.key ? null : r.key)}>
                    <span className="num font-semibold">
                      {r.date.slice(5).replace("-", "/")} {r.time}
                    </span>{" "}
                    <span className="font-semibold">{r.vendor}</span> <span className="text-stone-400">{r.lines.length}줄 ▾</span>
                    <span className="block truncate text-[11px] text-stone-500">
                      {kinds.join(" · ")}
                      {r.personal ? " — 식비·개인 물품이라 뺐어요" : ""}
                    </span>
                  </button>
                  <span className="num whitespace-nowrap text-right font-semibold">
                    {won(receiptTotal(r))}
                    {receiptDiscount(r) > 0 && <span className="block text-[10px] font-normal text-stone-500">할인 -{won(receiptDiscount(r))}</span>}
                  </span>
                </div>
                {open === r.key && (
                  <ul className="mt-1 space-y-0.5 rounded-lg bg-stone-50 p-2 text-[11px]">
                    {r.lines.map((l, i) => {
                      const it = link && linkableCategory(toPurchaseCategory(l.rawCategory)) ? matchItem(l.name, items) : null;
                      return (
                        <li key={i} className="flex justify-between gap-2">
                          <span className="min-w-0 flex-1">
                            {l.name} <span className="text-stone-400">{l.rawCategory}</span>
                            {it && <span className="ml-1 rounded bg-orange-50 px-1 text-[10px] text-orange-700">→ {it.name}</span>}
                          </span>
                          <span className="num whitespace-nowrap text-stone-500">
                            {num(l.unitPrice)} × {fmtQty(l.qty)} = {won(l.amount)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>

        <div className="num flex justify-between rounded-xl bg-stone-50 p-2 text-sm">
          <span>
            넣을 영수증 <b>{picked.length}건</b>
            {skipped.length > 0 && <span className="text-xs text-stone-500"> · 뺀 것 {skipped.length}건 {won(skipped.reduce((a, r) => a + receiptTotal(r), 0))}</span>}
          </span>
          <b>{won(total)}</b>
        </div>

        <label className="flex items-start gap-2 text-xs text-stone-600">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-orange-600" checked={link} onChange={(e) => setLink(e.target.checked)} />
          <span>상품명에 원가율 품목 이름이 들어 있으면 자동으로 연결해요 (줄을 눌러 “→ 품목”을 확인하세요). 연결되고 수량이 잡히면 그 품목의 기준단가가 이 매입가로 바뀌어요.</span>
        </label>
        <p className="text-[11px] text-stone-500">매입 영수증은 품목별 매입가를 보는 곳이라 손익에 따로 더하지 않아요. 손익은 통장의 체크카드 출금으로 잡혀요. 같은 파일을 다시 올려도 겹치지 않아요.</p>

        <div className="flex gap-2">
          <button className="btn-ghost flex-1" onClick={onCancel}>
            취소
          </button>
          <button className="btn-primary flex-1" disabled={picked.length === 0} onClick={() => onSave(picked, link)}>
            {picked.length}건 넣기
          </button>
        </div>
      </div>
    </div>
  );
}

// 영수증 없는 체크카드 결제 — 체크카드 출금마다 매입 영수증이 있는지 맞춰 보고, 없는 것만 모아 보여 준다
function CardReceiptCheck({
  txs,
  purchases,
  exempt,
  onExempt,
  onAddReceipt,
}: {
  txs: Transaction[];
  purchases: Purchase[];
  exempt: ReceiptExempt;
  onExempt: (next: ReceiptExempt) => Promise<void>;
  onAddReceipt: (t: Transaction) => void;
}) {
  const [showDone, setShowDone] = useState(false);
  const r = useMemo(() => matchCardReceipts(txs, purchases, exempt), [txs, purchases, exempt]);
  if (r.cardCount === 0)
    return (
      <section className="card space-y-1">
        <h2 className="text-base font-bold">영수증 없는 체크카드 결제</h2>
        <p className="text-xs text-stone-500">
          이 달 통장에 체크카드 결제가 없어요. 올리기 탭에 은행 거래내역을 올리면 체크카드 결제(농협은 “NH체크 ○○”)를 매입 영수증과 맞춰 보고, 영수증이 없는 결제만 여기에 모아 보여 줘요.
        </p>
      </section>
    );
  const missingSum = r.missing.reduce((a, t) => a + t.out, 0);
  const md = (d: string) => d.slice(5).replace("-", "/");

  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">
          영수증 없는 체크카드 결제 <span className="text-[11px] font-normal text-stone-500">통장 체크카드 출금 ↔ 매입 영수증</span>
        </h2>
        <span className="num text-xs text-stone-500">
          체크카드 {r.cardCount}건 · 영수증과 맞음 {r.matched.length} · 필요 없음 {r.exempt.length} · 취소 {r.cancelled.length}
        </span>
      </div>
      <p className="text-xs text-stone-600">
        통장의 체크카드 결제를 금액이 같은 매입 영수증(날짜 ±3일, 한 번에 여러 곳을 결제했으면 영수증 2~3장의 합)과 맞춰 봐요. 같은 날 카드 취소는 원래 결제와 함께 빠지고, “손익에 안 넣음”(개인)·통신비 같은 청구서도 빠져요.
      </p>

      {r.missing.length === 0 ? (
        <Notice tone="ok">이 달 체크카드 결제는 모두 영수증과 맞아요.</Notice>
      ) : (
        <>
          <Notice tone="warn">
            영수증이 없는 결제 <b>{r.missing.length}건</b> · {won(missingSum)}
          </Notice>
          <ul className="divide-y divide-stone-100 text-sm">
            {r.missing.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="font-semibold">
                    <span className="num">{md(t.date)}</span> {cardPayee(t.payee)}
                  </p>
                  <p className="text-[11px] text-stone-500">
                    지금 분류: {t.major ?? "미분류"}
                    {t.minor ? ` / ${t.minor}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="num w-20 text-right font-bold">{won(t.out)}</span>
                  <button className="btn-primary whitespace-nowrap px-2 py-1 text-xs" onClick={() => onAddReceipt(t)}>
                    영수증 넣기
                  </button>
                  <button className="btn-ghost whitespace-nowrap px-2 py-1 text-xs" onClick={() => void onExempt({ ...exempt, txIds: [...exempt.txIds, t.id] })}>
                    이 결제는 필요 없음
                  </button>
                  <button className="btn-ghost whitespace-nowrap px-2 py-1 text-xs" onClick={() => void onExempt({ ...exempt, payees: [...exempt.payees, cardPayee(t.payee)] })}>
                    이 거래처는 늘 필요 없음
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-stone-500">개인 결제면 올리기 탭에서 그 줄을 “제외 · 손익에 안 넣음”으로 바꾸면 여기서도 빠져요. 교통·주차·식대처럼 영수증까지는 필요 없는 건 “필요 없음”을 누르세요.</p>
        </>
      )}

      <button className="text-xs text-stone-500 underline" onClick={() => setShowDone((v) => !v)}>
        {showDone ? "맞춘 결과 접기" : "맞춘 결과 보기 (영수증과 맞음 · 필요 없음 · 취소)"}
      </button>
      {showDone && (
        <div className="space-y-3 text-xs">
          {r.matched.length > 0 && (
            <div>
              <p className="mb-1 font-semibold text-stone-500">영수증과 맞음 {r.matched.length}건</p>
              <ul className="num divide-y divide-stone-100">
                {r.matched.map((m) => (
                  <li key={m.tx.id} className="flex justify-between gap-2 py-1">
                    <span>
                      {md(m.tx.date)} {cardPayee(m.tx.payee)}
                    </span>
                    <span className="text-stone-500">→ {m.purchases.map((p) => `${md(p.date)} ${p.vendor}`).join(" + ")}</span>
                    <span className="w-20 text-right">{won(m.tx.out)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {r.exempt.length > 0 && (
            <div>
              <p className="mb-1 font-semibold text-stone-500">영수증 필요 없음 {r.exempt.length}건</p>
              <ul className="num divide-y divide-stone-100">
                {r.exempt.map((e) => (
                  <li key={e.tx.id} className="flex items-center justify-between gap-2 py-1">
                    <span>
                      {md(e.tx.date)} {cardPayee(e.tx.payee)} <span className="text-stone-400">· {e.reason}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {won(e.tx.out)}
                      {e.manual && (
                        <button
                          className="btn-ghost px-1.5 py-0.5 text-[11px]"
                          onClick={() =>
                            void onExempt({
                              txIds: exempt.txIds.filter((id) => id !== e.tx.id),
                              payees: e.reason.startsWith("늘") ? exempt.payees.filter((p) => p !== cardPayee(e.tx.payee)) : exempt.payees,
                            })
                          }
                        >
                          되돌리기
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {r.cancelled.length > 0 && (
            <div>
              <p className="mb-1 font-semibold text-stone-500">카드 취소로 빠진 결제 {r.cancelled.length}건</p>
              <ul className="num divide-y divide-stone-100">
                {r.cancelled.map((c) => (
                  <li key={c.tx.id} className="flex justify-between gap-2 py-1">
                    <span>
                      {md(c.tx.date)} {cardPayee(c.tx.payee)}
                    </span>
                    <span className="text-stone-500">
                      {won(c.tx.out)} → 취소 {md(c.cancel.date)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
