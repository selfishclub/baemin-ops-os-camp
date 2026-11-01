"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Notice } from "@/components/ui";
import { todayStr } from "@/lib/daily";
import { num, signed, won } from "@/lib/format";
import { monthLabel, prevMonth } from "@/lib/month";
import { PURCHASES_KEY_PREFIX, type Purchase, unitLabel } from "@/lib/costing/purchases";
import { guessPackSizes, isCountable, packLabel, packSizeOf, putStockLine, recommendCountable, valueStock } from "@/lib/costing/stock";
import { ITEMS_KEY, STOCK_KEY_PREFIX, type Item, type StockCount, type StockCountLine } from "@/lib/costing/types";
import { getStore } from "@/lib/storage";

// 월말 재고 실사 — 냉장고·창고에 남은 것을 박스 + 낱개로 적는다 (2026-11-01 사장님).
// 여기 숫자는 손익을 바꾸지 않는다. 원가율 탭의 "재고 반영 원가율" 한 줄에만 쓴다.

/** 빈칸은 null(= 안 셌다), 숫자는 소수까지 (원육 12.4kg) */
function parseQty(s: string): number | null {
  const t = s.replace(/[^\d.]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
const show = (n: number | null) => (n === null ? "" : String(n));
/** 수량은 소수를 그대로 보여 준다 — num() 은 반올림해서 7.5kg 을 "8kg" 으로 보여 준다 (2026-11-01) */
const qty = (n: number) => (Number.isInteger(n) ? num(n) : (Math.round(n * 100) / 100).toLocaleString("ko-KR"));

export default function StockCountSection({ month, items, onItemsChange }: { month: string; items: Item[]; onItemsChange: () => Promise<void> }) {
  const [count, setCount] = useState<StockCount | null>(null);
  const [prev, setPrev] = useState<StockCount | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // 칸을 빠르게 옮기며 셀 때 앞의 입력이 날아가지 않게:
  //  - countRef 에 지금 장을 바로 담아 둔다 (useState 는 다음 그림까지 안 바뀌어서, 두 칸을 잇따라 고치면 앞의 것이 묻힌다)
  //  - 저장은 줄줄이 이어 붙여 순서대로 (IndexedDB 쓰기가 서로 덮어쓰지 않게)
  const countRef = useRef<StockCount | null>(null);
  const saving = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    const store = getStore();
    setLoaded(false);
    // 박스 환산은 최근 매입에서 뽑는다 — 석 달이면 넉넉하다
    const months = [month, prevMonth(month), prevMonth(prevMonth(month))];
    void (async () => {
      const [c, p] = await Promise.all([store.getSetting<StockCount>(STOCK_KEY_PREFIX + month), store.getSetting<StockCount>(STOCK_KEY_PREFIX + prevMonth(month))]);
      const ps = await Promise.all(months.map((m) => store.getSetting<Purchase[]>(PURCHASES_KEY_PREFIX + m)));
      countRef.current = c ?? null;
      setCount(c ?? null);
      setPrev(p ?? null);
      setPurchases(ps.flatMap((x) => x ?? []));
      setLoaded(true);
    })();
  }, [month]);

  const targets = useMemo(() => items.filter(isCountable), [items]);
  const packSizes = useMemo(() => guessPackSizes(purchases), [purchases]);
  const value = useMemo(() => valueStock(count, items, packSizes), [count, items, packSizes]);
  const prevValue = useMemo(() => valueStock(prev, items, packSizes), [prev, items, packSizes]);

  async function save(next: StockCount) {
    countRef.current = next;
    setCount(next);
    saving.current = saving.current.then(() => getStore().saveSetting(STOCK_KEY_PREFIX + month, next));
    await saving.current;
  }

  /** 한 품목의 박스·낱개를 고친다 */
  async function setLine(itemId: string, patch: Partial<Omit<StockCountLine, "itemId">>) {
    await save(putStockLine(countRef.current, { month, countedOn: todayStr() }, itemId, patch));
  }

  async function turnOnRecommended() {
    const ids = new Set(recommendCountable(items, purchases));
    if (ids.size === 0) {
      setNote("매입 영수증이 아직 없어서 추천할 품목을 못 골랐어요. 아래에서 직접 켜 주세요.");
      return;
    }
    await getStore().saveSetting(ITEMS_KEY, items.map((i) => (ids.has(i.id) ? { ...i, countable: true } : i)));
    await onItemsChange();
    setNote(`금액 큰 품목 ${ids.size}개를 켰어요. 상하는 채소·계란은 빼 뒀어요 — 품목·레시피 설정에서 넣고 뺄 수 있어요.`);
  }

  if (!loaded) return <p className="py-10 text-center text-sm text-stone-500">불러오는 중…</p>;

  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">
          {monthLabel(month)} 말 재고 <span className="text-xs font-normal text-stone-500">냉장고·창고에 남은 것</span>
        </h2>
        {value && (
          <span className="num text-sm font-bold text-stone-800">
            합계 {won(value.total)}
            {prevValue && <span className="ml-1 text-xs font-semibold text-stone-500">지난달 {signed(value.total - prevValue.total)}</span>}
          </span>
        )}
      </div>

      <p className="rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-950 ring-1 ring-sky-200">
        여기 적은 재고는 <b>손익을 바꾸지 않아요.</b> 손익의 매출원가는 세무사 장부와 같게 매입 기준 그대로예요. 대신 결과 탭에 <b>재고 반영 원가율</b>(매입 + 지난달 말 재고 − 이번 달 말 재고)이 한 줄 더 나와서, 원가 차이가 ①시세 ②로스 ③재고 중 어느 것인지 갈라 보여 줘요.
      </p>
      {note && <Notice tone="ok">{note}</Notice>}

      {targets.length === 0 ? (
        <>
          <Notice tone="info">아직 세는 품목이 없어요. 쌓이는 것(냉동 원육·소스·주류·숯)만 켜면 돼요 — 상하는 채소는 매일 사서 매일 쓰니 세 봐야 재고가 안 움직여요.</Notice>
          <button className="btn-primary" onClick={() => void turnOnRecommended()}>
            금액 큰 품목 켜기 (추천)
          </button>
        </>
      ) : (
        <>
          <label className="flex items-center gap-2 text-sm text-stone-600">
            센 날
            <input
              type="date"
              aria-label="재고를 센 날"
              className="field w-40"
              value={count?.countedOn ?? todayStr()}
              onChange={(e) => void save({ month, countedOn: e.target.value, lines: countRef.current?.lines ?? [], note: countRef.current?.note })}
            />
          </label>

          <ul className="divide-y divide-stone-100">
            {targets.map((it) => {
              const line = count?.lines.find((l) => l.itemId === it.id);
              const row = value?.rows.find((r) => r.itemId === it.id);
              const size = packSizeOf(it, packSizes);
              const u = unitLabel(it.baseUnit);
              return (
                <li key={it.id} className={`py-2 ${row ? "" : "bg-amber-50"}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-stone-800">{it.name}</span>
                    <span className="num shrink-0 text-sm font-bold text-stone-900">{row ? won(row.amount) : <span className="text-xs font-semibold text-amber-700">안 셌어요</span>}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-stone-500">
                    {size && (
                      <>
                        <input
                          aria-label={`${it.name} ${packLabel(it)} 수`}
                          inputMode="decimal"
                          className="field num w-14 px-1.5 py-1 text-right"
                          placeholder="0"
                          defaultValue={show(line?.packs ?? null)}
                          key={`p-${it.id}-${show(line?.packs ?? null)}`}
                          onBlur={(e) => {
                            const v = parseQty(e.target.value);
                            if (v !== (line?.packs ?? null)) void setLine(it.id, { packs: v });
                          }}
                        />
                        <span>
                          {packLabel(it)} +
                        </span>
                      </>
                    )}
                    <input
                      aria-label={`${it.name} 낱개 ${u}`}
                      inputMode="decimal"
                      className="field num w-16 px-1.5 py-1 text-right"
                      placeholder="0"
                      defaultValue={show(line?.units ?? null)}
                      key={`u-${it.id}-${show(line?.units ?? null)}`}
                      onBlur={(e) => {
                        const v = parseQty(e.target.value);
                        if (v !== (line?.units ?? null)) void setLine(it.id, { units: v });
                      }}
                    />
                    <span>{u}</span>
                    {row && (
                      <b className="num text-stone-700">
                        = {qty(row.quantity)}
                        {u}
                      </b>
                    )}
                    <span className="text-stone-400">
                      {size ? `1${packLabel(it)} = ${qty(size)}${u} · ` : ""}
                      {num(it.standardCost)}원/{u}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          {value && value.missing.length > 0 && (
            <Notice tone="warn">
              아직 안 센 품목 <b>{value.missing.length}개</b>: {value.missing.slice(0, 6).map((m) => m.name).join(", ")}
              {value.missing.length > 6 && " …"} — 없으면 <b>0</b>을 넣어 주세요. 빈칸은 “안 셌다”로 둬서 재고에 넣지 않아요.
            </Notice>
          )}

          {!prevValue && (
            <Notice tone="info">
              {monthLabel(prevMonth(month))} 말 재고가 없어서 이번 달은 <b>재고 반영 원가를 낼 수 없어요.</b> 지금 센 것이 다음 달의 “지난달 말 재고”가 되니, {monthLabel(month)}부터 세어 두면 다음 달 원가가 정확해져요.
            </Notice>
          )}

          <label className="block text-xs text-stone-500">
            메모
            <input
              aria-label="재고 메모"
              className="field mt-1 w-full text-sm"
              placeholder="예: 창고 숯 2포는 눌려서 뺐음"
              defaultValue={count?.note ?? ""}
              onBlur={(e) => {
                const v = e.target.value.trim();
                const cur = countRef.current;
                if (v !== (cur?.note ?? "")) void save({ month, countedOn: cur?.countedOn ?? todayStr(), lines: cur?.lines ?? [], note: v || undefined });
              }}
            />
          </label>
        </>
      )}
    </section>
  );
}
