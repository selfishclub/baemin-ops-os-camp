"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMonth } from "@/components/AppShell";
import { MoneyInput, Notice } from "@/components/ui";
import { useLedger } from "@/components/useLedger";
import PurchaseSection from "@/components/PurchaseSection";
import { newId } from "@/lib/classify";
import { buildCostRateReport, recipeUnitCost } from "@/lib/costing/costRate";
import { parsePosAbcGrid, PosParseError } from "@/lib/costing/okpos";
import sample from "@/lib/costing/sample.json";
import { ITEMS_KEY, MENUS_KEY, POS_KEY_PREFIX, RECIPES_KEY, type BaseUnit, type Item, type Menu, type PosSalesReport, type Recipe } from "@/lib/costing/types";
import { num, pctText, won } from "@/lib/format";
import { monthLabel } from "@/lib/month";
import { getStore } from "@/lib/storage";

const SAMPLE_POS = "/sample/가짜_상품ABC분석_2026-09.xlsx";
const UNITS: BaseUnit[] = ["g", "kg", "ml", "L", "ea"];

export default function CostingPage() {
  const { month, setMonth } = useMonth();
  const ledger = useLedger(month);
  const [items, setItems] = useState<Item[]>([]);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [pos, setPos] = useState<PosSalesReport | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [view, setView] = useState<"report" | "purchases" | "setup">("report");
  const [help, setHelp] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const store = getStore();
    const [i, m, r, p] = await Promise.all([
      store.getSetting<Item[]>(ITEMS_KEY),
      store.getSetting<Menu[]>(MENUS_KEY),
      store.getSetting<Recipe[]>(RECIPES_KEY),
      store.getSetting<PosSalesReport>(POS_KEY_PREFIX + month),
    ]);
    setItems(i ?? []);
    setMenus(m ?? []);
    setRecipes(r ?? []);
    setPos(p ?? null);
    setLoaded(true);
  }
  useEffect(() => {
    setLoaded(false);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  // 통장의 실제 재료비 = 매출원가 대분류 출금 합계
  const actualCost = useMemo(() => ledger.txs.filter((t) => t.major === "매출원가").reduce((a, t) => a + t.out - t.in, 0), [ledger.txs]); // 환급 입금은 뺀다
  const report = useMemo(() => (pos && menus.length ? buildCostRateReport(pos, menus, recipes, items, actualCost) : null), [pos, menus, recipes, items, actualCost]);

  async function handleFile(file: Blob, name: string) {
    setBusy(true);
    setMessage(null);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null }) as never[][];
      const parsed = parsePosAbcGrid(grid);
      await getStore().saveSetting(POS_KEY_PREFIX + parsed.month, parsed);
      setMessage({ tone: "ok", text: `${name}: ${parsed.lines.length}개 메뉴, 매출 ${won(parsed.totalAmount)} (${parsed.periodStart} ~ ${parsed.periodEnd})` });
      if (parsed.month !== month) setMonth(parsed.month);
      else await load();
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof PosParseError ? e.message : `파일을 읽지 못했어요. (${e instanceof Error ? e.message : e})` });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function loadSampleSetup() {
    const store = getStore();
    await store.saveSetting(ITEMS_KEY, sample.items);
    await store.saveSetting(MENUS_KEY, sample.menus);
    await store.saveSetting(RECIPES_KEY, sample.recipes);
    await load();
    setMessage({ tone: "ok", text: "가짜 품목 11개·메뉴 12개·레시피 10개를 넣었어요. (시연용 — 실제 레시피는 설정에서 직접 넣으세요)" });
  }

  if (!loaded || ledger.loading) return <p className="py-10 text-center text-sm text-stone-500">불러오는 중…</p>;

  return (
    <>
      <section className="card space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-bold">원가율 — 레시피 기준 vs 통장 기준</h2>
          <div className="flex gap-1 text-[11px]">
            <button className={`rounded-lg px-2 py-1 ${view === "report" ? "bg-orange-100 text-orange-800" : "text-stone-500"}`} onClick={() => setView("report")}>
              결과
            </button>
            <button className={`rounded-lg px-2 py-1 ${view === "purchases" ? "bg-orange-100 text-orange-800" : "text-stone-500"}`} onClick={() => setView("purchases")}>
              매입 영수증
            </button>
            <button className={`rounded-lg px-2 py-1 ${view === "setup" ? "bg-orange-100 text-orange-800" : "text-stone-500"}`} onClick={() => setView("setup")}>
              품목·레시피 설정
            </button>
          </div>
        </div>
        <button className="w-full text-left text-[12px] text-sky-800" onClick={() => setHelp((v) => !v)}>
          {help ? "▲" : "?"} 무엇을 넣고 무엇이 나오나
        </button>
        {help && (
          <div className="rounded-xl bg-sky-50 px-3 py-2 text-[12px] text-sky-950 ring-1 ring-sky-200">
            <ul className="list-disc space-y-0.5 pl-4">
              <li>
                <b>넣는 것 ①</b> 포스 ASP → 매출관리 → 매출분석 → <b>상품ABC분석</b>을 한 달(1일~말일)로 조회해 엑셀로 받아 올리기
              </li>
              <li>
                <b>넣는 것 ②</b> (처음 한 번) 품목과 기준단가(대략값), 메뉴별 레시피(품목 + g/ml/개). “품목·레시피 설정”에서
              </li>
              <li>
                <b>나오는 것</b> 메뉴별 판매량 × 레시피 원가 = <b>이론 재료비·이론 원가율</b>. 올리기 탭의 통장 재료비(매출원가)와 나란히 놓고 차이를 보여 줘요
              </li>
              <li>차이가 크면 “시세가 올랐나, 로스가 늘었나”를 봐야 해요. 그 분해는 입고 단가·실사 재고가 있어야 해서 다음 버전(매장관리자)에서 해요.</li>
            </ul>
          </div>
        )}

        {view === "report" && (
          <>
            <div className="space-y-2">
              <input ref={fileRef} type="file" aria-label="포스 상품ABC분석 엑셀" accept=".xlsx,.xls" disabled={busy} className="block w-full text-sm file:mr-3 file:rounded-xl file:border-0 file:bg-orange-600 file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-white" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0], e.target.files[0].name)} />
              <div className="flex flex-wrap gap-2">
                <button className="btn-ghost" disabled={busy} onClick={async () => handleFile(await (await fetch(SAMPLE_POS)).blob(), "가짜 9월 포스 파일")}>
                  가짜 9월 포스 파일로 해 보기
                </button>
                {menus.length === 0 && (
                  <button className="btn-ghost" onClick={loadSampleSetup}>
                    가짜 품목·레시피 넣기
                  </button>
                )}
              </div>
              {message && <Notice tone={message.tone}>{message.text}</Notice>}
            </div>
            {menus.length === 0 && <Notice tone="info">품목·레시피가 아직 없어요. “품목·레시피 설정”에서 넣거나, 시연이면 “가짜 품목·레시피 넣기”를 누르세요.</Notice>}
            {!pos && <Notice tone="info">{monthLabel(month)} 포스 판매 자료가 아직 없어요. 상품ABC분석 엑셀을 올려 주세요.</Notice>}
          </>
        )}
      </section>

      {view === "report" && report && (
        <>
          <section className="grid grid-cols-3 gap-2">
            <Stat label="이론 원가율 (레시피)" value={pctText(report.theoreticalRate)} sub={`이론 재료비 ${num(report.theoreticalCost)}`} />
            <Stat label="실제 원가율 (통장)" value={pctText(report.actualRate)} sub={`재료비 출금 ${num(report.actualCost)}`} />
            <Stat
              label="차이"
              value={report.gapRate === null ? "–" : `${report.gapRate > 0 ? "+" : ""}${report.gapRate.toFixed(1)}%p`}
              sub={`${report.gap > 0 ? "+" : ""}${num(report.gap)}원`}
              tone={report.gapRate === null ? undefined : report.gapRate > 3 ? "bad" : report.gapRate < -3 ? "good" : undefined}
            />
          </section>
          {report.coverage !== null && report.coverage < 100 && (
            <Notice tone={report.coverage < 70 ? "warn" : "info"}>
              레시피가 있는 메뉴가 매출의 <b>{report.coverage}%</b>예요. 나머지({report.unmapped.length}개 메뉴, {won(report.salesAmount - report.coveredAmount)})는 같은 원가율로 어림해서 “차이”를 계산했어요. 레시피를 더 넣을수록 정확해져요.
            </Notice>
          )}
          {report.gapRate !== null && report.gapRate > 3 && (
            <Notice tone="warn">
              통장 재료비가 레시피 기준보다 <b>{report.gapRate.toFixed(1)}%p</b>({won(report.gap)}) 많아요. 원인은 셋 중 하나예요: ① 재료값이 올랐다(시세) ② 레시피보다 많이 쓰거나 버렸다(로스) ③ 이달에 산 재료가 아직 냉장고에 있다(재고). 다음 버전에서 입고·실사를 붙이면 셋을 나눠 보여 드려요.
            </Notice>
          )}

          <section className="card space-y-2">
            <h2 className="text-base font-bold">메뉴별 원가율 <span className="text-[11px] font-normal text-stone-500">원가율 높은 순 · {monthLabel(month)}</span></h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-sm">
                <thead className="text-left text-xs text-stone-500">
                  <tr>
                    <th className="py-1">메뉴</th>
                    <th className="text-right">판매량</th>
                    <th className="text-right">매출</th>
                    <th className="text-right">1개 원가</th>
                    <th className="text-right">이론 재료비</th>
                    <th className="text-right">원가율</th>
                    <th className="text-right">1개 마진</th>
                  </tr>
                </thead>
                <tbody className="num divide-y divide-stone-100">
                  {report.rows.map((r) => (
                    <tr key={r.code} className={(r.costRate ?? 0) >= 40 ? "bg-amber-50" : ""}>
                      <td className="py-1.5 font-semibold">{r.name}</td>
                      <td className="text-right">{num(r.quantity)}</td>
                      <td className="text-right">{num(r.amount)}</td>
                      <td className="text-right">{r.unitCost === null ? "–" : num(r.unitCost)}</td>
                      <td className="text-right">{num(r.theoreticalCost)}</td>
                      <td className="text-right font-bold">{pctText(r.costRate)}</td>
                      <td className="text-right">{r.marginPerUnit === null ? "–" : num(r.marginPerUnit)}</td>
                    </tr>
                  ))}
                  {report.unmapped.map((r) => (
                    <tr key={r.code} className="text-stone-400">
                      <td className="py-1.5">
                        {r.name} <span className="rounded bg-stone-100 px-1 text-[10px]">레시피 없음</span>
                      </td>
                      <td className="text-right">{num(r.quantity)}</td>
                      <td className="text-right">{num(r.amount)}</td>
                      <td className="text-right">–</td>
                      <td className="text-right">–</td>
                      <td className="text-right">–</td>
                      <td className="text-right">–</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card space-y-2">
            <h2 className="text-base font-bold">품목별 이론 사용량 <span className="text-[11px] font-normal text-stone-500">이만큼 나갔어야 해요</span></h2>
            <ul className="num divide-y divide-stone-100 text-sm">
              {report.itemUsage.map((u) => (
                <li key={u.itemId} className="flex justify-between py-1.5">
                  <span>{u.name}</span>
                  <span>
                    {num(u.quantity)} {u.unit} · <b>{won(u.cost)}</b>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {view === "purchases" && <PurchaseSection month={month} items={items} onItemsChange={load} />}
      {view === "setup" && <Setup items={items} menus={menus} recipes={recipes} onChange={load} />}
    </>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "good" | "bad" }) {
  return (
    <div className={`card ${tone === "bad" ? "ring-red-300" : tone === "good" ? "ring-emerald-300" : ""}`}>
      <p className="text-[11px] font-semibold text-stone-500">{label}</p>
      <p className={`num mt-1 text-xl font-extrabold ${tone === "bad" ? "text-red-600" : tone === "good" ? "text-emerald-700" : ""}`}>{value}</p>
      <p className="num mt-0.5 text-[11px] text-stone-500">{sub}</p>
    </div>
  );
}

// 품목·메뉴·레시피 설정. 실제 레시피와 단가는 내 PC 모드에서만 넣는다.
function Setup({ items, menus, recipes, onChange }: { items: Item[]; menus: Menu[]; recipes: Recipe[]; onChange: () => Promise<void> }) {
  const importRef = useRef<HTMLInputElement>(null);
  const [ioNote, setIoNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [itemName, setItemName] = useState("");
  const [itemUnit, setItemUnit] = useState<BaseUnit>("kg");
  const [itemCost, setItemCost] = useState(0);
  const [menuName, setMenuName] = useState("");
  const [menuCode, setMenuCode] = useState("");
  const [menuPrice, setMenuPrice] = useState(0);
  const [editMenu, setEditMenu] = useState<string | null>(null);
  const [line, setLine] = useState<{ itemId: string; unit: BaseUnit; quantity: number }>({ itemId: "", unit: "g", quantity: 0 });

  const store = getStore();
  const today = new Date().toISOString().slice(0, 10);

  async function addItem() {
    if (!itemName.trim()) return;
    await store.saveSetting(ITEMS_KEY, [...items, { id: `it_${newId().slice(0, 8)}`, name: itemName.trim(), baseUnit: itemUnit, standardCost: itemCost, category: "etc", active: true } as Item]);
    setItemName("");
    setItemCost(0);
    await onChange();
  }
  async function setItemCostOf(id: string, cost: number) {
    await store.saveSetting(ITEMS_KEY, items.map((i) => (i.id === id ? { ...i, standardCost: cost } : i)));
    await onChange();
  }
  async function addMenu() {
    if (!menuName.trim()) return;
    await store.saveSetting(MENUS_KEY, [...menus, { id: `m_${newId().slice(0, 8)}`, name: menuName.trim(), posCode: menuCode.trim() || null, price: menuPrice, active: true }]);
    setMenuName("");
    setMenuCode("");
    setMenuPrice(0);
    await onChange();
  }
  function exportJson() {
    const blob = new Blob([JSON.stringify({ app: "sootdak-ledger-costing", version: 1, exportedAt: new Date().toISOString(), items, menus, recipes }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `레시피_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setIoNote({ tone: "ok", text: "레시피 파일을 저장했어요. 가게 노하우라 GitHub·단톡방에 올리지 마세요." });
  }
  async function importJson(file: File) {
    try {
      const j = JSON.parse(await file.text()) as { app?: string; items?: Item[]; menus?: Menu[]; recipes?: Recipe[] };
      if (j.app !== "sootdak-ledger-costing" || !Array.isArray(j.items) || !Array.isArray(j.menus) || !Array.isArray(j.recipes)) throw new Error("이 도구의 레시피 파일이 아니에요.");
      // 같은 id는 덮어쓰고, 없는 것은 더한다 (기준단가는 파일 값이 0이면 기존 값을 지킨다)
      const mergedItems = [...items];
      for (const it of j.items) {
        const i = mergedItems.findIndex((x) => x.id === it.id);
        if (i >= 0) mergedItems[i] = { ...mergedItems[i], ...it, standardCost: it.standardCost || mergedItems[i].standardCost };
        else mergedItems.push(it);
      }
      const mergedMenus = [...menus];
      for (const m of j.menus) {
        const i = mergedMenus.findIndex((x) => x.id === m.id);
        if (i >= 0) mergedMenus[i] = { ...mergedMenus[i], ...m };
        else mergedMenus.push(m);
      }
      const mergedRecipes = [...recipes.filter((r) => !j.recipes!.some((x) => x.menuId === r.menuId && x.effectiveFrom === r.effectiveFrom)), ...j.recipes];
      await store.saveSetting(ITEMS_KEY, mergedItems);
      await store.saveSetting(MENUS_KEY, mergedMenus);
      await store.saveSetting(RECIPES_KEY, mergedRecipes);
      await onChange();
      const noCost = mergedItems.filter((x) => x.active && !x.standardCost).length;
      setIoNote({ tone: "ok", text: `품목 ${j.items.length}·메뉴 ${j.menus.length}·레시피 ${j.recipes.length}개를 가져왔어요.${noCost ? ` 기준단가가 비어 있는 품목 ${noCost}개는 위에서 대략값을 넣어 주세요.` : ""}` });
    } catch (e) {
      setIoNote({ tone: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  }
  function currentRecipe(menuId: string): Recipe | undefined {
    return recipes.filter((r) => r.menuId === menuId).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  }
  async function saveRecipeLines(menuId: string, lines: Recipe["lines"]) {
    // 오늘 날짜로 새 레시피 줄을 만든다 (지난달 계산은 옛 레시피로 유지)
    const others = recipes.filter((r) => !(r.menuId === menuId && r.effectiveFrom === today));
    await store.saveSetting(RECIPES_KEY, [...others, { menuId, effectiveFrom: today, lines }]);
    await onChange();
  }

  return (
    <>
      <section className="card space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold">레시피 파일</h2>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => importRef.current?.click()}>
              가져오기 (JSON)
            </button>
            <button className="btn-ghost" onClick={exportJson} disabled={items.length === 0 && menus.length === 0}>
              내보내기
            </button>
            <input ref={importRef} type="file" accept=".json" aria-label="레시피 파일" className="hidden" onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
          </div>
        </div>
        <p className="text-[11px] text-stone-500">다른 곳에서 만든 품목·메뉴·레시피(예: 매장관리자에서 뽑은 파일)를 한 번에 가져와요. 실제 레시피 파일은 내 PC 모드에서만 쓰고 저장소에 올리지 않아요.</p>
        {ioNote && <Notice tone={ioNote.tone}>{ioNote.text}</Notice>}
      </section>

      <section className="card space-y-3">
        <h2 className="text-base font-bold">품목과 기준단가 <span className="text-[11px] font-normal text-stone-500">대략값이면 돼요</span></h2>
        <ul className="divide-y divide-stone-100 text-sm">
          {items.map((i) => (
            <li key={i.id} className={`grid grid-cols-[1fr_8rem_3rem] items-center gap-2 py-1.5 ${!i.standardCost ? "bg-amber-50" : ""}`}>
              <span className="font-semibold">
                {i.name}
                {!i.standardCost && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-800">단가 필요</span>}
              </span>
              <MoneyInput label={`${i.name} 기준단가`} value={i.standardCost} onChange={(n) => setItemCostOf(i.id, n ?? 0)} />
              <span className="text-xs text-stone-500">원/{i.baseUnit}</span>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-[1fr_4.5rem_7rem_4rem] gap-2">
          <input aria-label="새 품목 이름" className="field" placeholder="품목 (예: 닭 원육)" value={itemName} onChange={(e) => setItemName(e.target.value)} />
          <select aria-label="새 품목 단위" className="field" value={itemUnit} onChange={(e) => setItemUnit(e.target.value as BaseUnit)}>
            {["kg", "L", "ea"].map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
          <MoneyInput label="새 품목 기준단가" value={itemCost} onChange={(n) => setItemCost(n ?? 0)} placeholder="단가" />
          <button className="btn-primary px-2" disabled={!itemName.trim()} onClick={addItem}>
            추가
          </button>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="text-base font-bold">메뉴와 레시피 <span className="text-[11px] font-normal text-stone-500">포스 상품코드로 판매 자료와 맞춰요</span></h2>
        <ul className="divide-y divide-stone-100 text-sm">
          {menus.map((m) => {
            const r = currentRecipe(m.id);
            const cost = r ? recipeUnitCost(r, items).cost : null;
            return (
              <li key={m.id} className="py-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">
                      {m.name} <span className="num text-[11px] text-stone-400">{m.posCode ?? "코드 없음"}</span>
                    </p>
                    <p className="text-xs text-stone-500">
                      {r && r.lines.length ? r.lines.map((l) => `${items.find((i) => i.id === l.itemId)?.name ?? "?"} ${l.quantity}${l.unit}`).join(" · ") : <span className="text-amber-700">레시피 없음</span>}
                      {cost !== null && <span className="num"> → 1개 원가 {num(cost)}원{m.price > 0 && ` (${Math.round((cost / m.price) * 1000) / 10}%)`}</span>}
                    </p>
                  </div>
                  <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setEditMenu(editMenu === m.id ? null : m.id)}>
                    {editMenu === m.id ? "닫기" : "레시피"}
                  </button>
                </div>
                {editMenu === m.id && (
                  <div className="mt-2 space-y-2 rounded-xl bg-stone-50 p-2">
                    {(r?.lines ?? []).map((l, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span>
                          {items.find((x) => x.id === l.itemId)?.name} {l.quantity}
                          {l.unit}
                        </span>
                        <button className="btn-ghost px-2 py-0.5 text-[11px]" onClick={() => saveRecipeLines(m.id, (r?.lines ?? []).filter((_, j) => j !== i))}>
                          지우기
                        </button>
                      </div>
                    ))}
                    <div className="grid grid-cols-[1fr_4.5rem_4rem_3.5rem] gap-2">
                      <select aria-label="레시피 품목" className="field" value={line.itemId} onChange={(e) => setLine({ ...line, itemId: e.target.value })}>
                        <option value="">품목 고르기</option>
                        {items.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.name}
                          </option>
                        ))}
                      </select>
                      <input aria-label="레시피 양" inputMode="decimal" className="field num text-right" placeholder="양" value={line.quantity || ""} onChange={(e) => setLine({ ...line, quantity: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })} />
                      <select aria-label="레시피 단위" className="field" value={line.unit} onChange={(e) => setLine({ ...line, unit: e.target.value as BaseUnit })}>
                        {UNITS.map((u) => (
                          <option key={u}>{u}</option>
                        ))}
                      </select>
                      <button
                        className="btn-primary px-2"
                        disabled={!line.itemId || line.quantity <= 0}
                        onClick={() => {
                          void saveRecipeLines(m.id, [...(r?.lines ?? []), { itemId: line.itemId, unit: line.unit, quantity: line.quantity }]);
                          setLine({ itemId: "", unit: "g", quantity: 0 });
                        }}
                      >
                        추가
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <div className="grid grid-cols-[1fr_5.5rem_6rem_4rem] gap-2">
          <input aria-label="새 메뉴 이름" className="field" placeholder="메뉴 이름" value={menuName} onChange={(e) => setMenuName(e.target.value)} />
          <input aria-label="새 메뉴 포스 코드" className="field num" placeholder="포스코드" value={menuCode} onChange={(e) => setMenuCode(e.target.value)} />
          <MoneyInput label="새 메뉴 판매가" value={menuPrice} onChange={(n) => setMenuPrice(n ?? 0)} placeholder="판매가" />
          <button className="btn-primary px-2" disabled={!menuName.trim()} onClick={addMenu}>
            추가
          </button>
        </div>
        <p className="text-[11px] text-stone-500">실제 레시피·단가는 가게의 노하우예요. 시연 모드(웹)에는 가짜 값만 넣고, 실제 값은 내 PC 모드에서만 넣으세요.</p>
      </section>
    </>
  );
}
