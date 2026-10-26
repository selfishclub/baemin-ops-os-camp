"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Notice } from "@/components/ui";
import { HOMETAX_CHANGED } from "@/components/useMonthPnl";
import { PURCHASES_KEY_PREFIX, type Purchase } from "@/lib/costing/purchases";
import { num, won } from "@/lib/format";
import { HOMETAX_KEY, hometaxMonth, mergeHometax, parseHometaxSheet, type HometaxStore } from "@/lib/hometax";
import { monthLabel } from "@/lib/month";
import { getStore } from "@/lib/storage";

// 홈택스 매입 자료 올리기 — 세금계산서·계산서 목록 엑셀로 실제 매입 부가세를 넣고, 거래처마다 매입 영수증과 견준다.
export function HometaxCard({ month }: { month: string }) {
  const [store, setStore] = useState<HometaxStore | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);

  useEffect(() => {
    void Promise.all([getStore().getSetting<HometaxStore>(HOMETAX_KEY), getStore().getSetting<Purchase[]>(PURCHASES_KEY_PREFIX + month)]).then(([h, ps]) => {
      setStore(h);
      setPurchases(ps ?? []);
      setLoaded(true);
    });
  }, [month]);

  const hm = useMemo(() => hometaxMonth(store, month, purchases), [store, month, purchases]);

  async function upload(files: FileList) {
    const notes: string[] = [];
    let cur = (await getStore().getSetting<HometaxStore>(HOMETAX_KEY)) ?? null;
    let added = 0;
    for (const f of Array.from(files)) {
      try {
        const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
        const sheetRows = (i: number) => (wb.SheetNames[i] ? XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[i]], { header: 1, raw: false }) : []);
        const parsed = parseHometaxSheet(sheetRows(0), sheetRows(1));
        if (parsed.error) {
          notes.push(`${f.name}: ${parsed.error}`);
          continue;
        }
        const r = mergeHometax(cur, parsed.rows);
        cur = r.store;
        added += r.added;
        const months = [...new Set(parsed.rows.map((x) => x.date.slice(0, 7)))].map((m) => monthLabel(m).slice(6)).join("·");
        notes.push(`${f.name}: ${parsed.kind} ${parsed.rows.length}건 (${months})`);
      } catch {
        notes.push(`${f.name}: 파일을 읽지 못했어요.`);
      }
    }
    if (cur) {
      await getStore().saveSetting(HOMETAX_KEY, cur);
      setStore(cur);
      window.dispatchEvent(new Event(HOMETAX_CHANGED));
    }
    setMsg({ tone: notes.some((n) => /못|아니에요|매출|없어요/.test(n)) ? "warn" : "ok", text: `${notes.join(" · ")}${added ? ` — 새로 ${added}건 저장` : ""}` });
  }

  if (!loaded) return null;

  return (
    <section className="card space-y-3">
      <div>
        <h2 className="text-sm font-bold">🏛 홈택스 매입 자료 (세금계산서·계산서)</h2>
        <p className="text-xs text-stone-500">올리면 부가세 칸의 &quot;비용에 든 부가세&quot;가 어림 대신 실제 세액이 되고, 거래처마다 매입 영수증 합계와 맞는지 봐요.</p>
      </div>

      <details className="rounded-lg bg-stone-50 px-2 py-1.5 text-xs text-stone-600">
        <summary className="cursor-pointer font-semibold">홈택스에서 받는 법</summary>
        <ol className="mt-1 list-decimal space-y-0.5 pl-4">
          <li>홈택스 로그인 → 계산서·영수증·카드 → 전자(세금)계산서 조회 → 조회 → <b>월/분기별 목록조회</b></li>
          <li>분류 <b>전자세금계산서</b>, <b>매입</b>, 월별, 달 고르고 [조회] → 목록 위 <b>[엑셀내려받기]</b> → 엑셀</li>
          <li>분류를 <b>전자계산서</b>(면세 — 으뜸 닭고기 등)로 바꿔 한 번 더</li>
          <li>받은 파일 두 개를 아래에 올려요. 거래처들이 월말·다음 달 초에 끊어서, 한 달 치는 다음 달 10일쯤 다 들어와요.</li>
        </ol>
      </details>

      <label className="btn-ghost block w-full cursor-pointer py-2 text-center text-sm">
        홈택스 엑셀 올리기 (.xls)
        <input type="file" accept=".xls,.xlsx" multiple className="hidden" aria-label="홈택스 매입 엑셀" onChange={(e) => e.target.files?.length && void upload(e.target.files).then(() => (e.target.value = ""))} />
      </label>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      {hm ? (
        <div className="space-y-2">
          <p className="text-sm">
            <b>{monthLabel(month).slice(6)}</b> 세금계산서 {hm.taxCount}건 · 공급가 <b className="num">{won(hm.supply - hm.freeSupply)}</b> · 세액 <b className="num">{won(hm.vat)}</b>
            {hm.freeCount > 0 && (
              <>
                {" "}
                / 계산서(면세) {hm.freeCount}건 <b className="num">{won(hm.freeSupply)}</b>
              </>
            )}
          </p>
          <div className="overflow-x-auto">
            <table className="num w-full min-w-[30rem] text-xs">
              <thead>
                <tr className="text-stone-500">
                  <th className="py-1 text-left">거래처</th>
                  <th className="text-right">공급가</th>
                  <th className="text-right">세액</th>
                  <th className="text-right">장부 영수증 (공급가)</th>
                  <th className="pl-2 text-left">대조</th>
                </tr>
              </thead>
              <tbody>
                {hm.vendors.map((v) => {
                  const diff = v.receipts === null ? null : v.goods - v.receipts;
                  return (
                    <tr key={`${v.vendor}${v.free}`} className="border-t border-stone-100">
                      <td className="py-1">
                        {v.vendor}
                        {v.free && <span className="ml-1 rounded bg-stone-100 px-1 text-[10px] text-stone-500">면세</span>}
                        {v.count > 1 && <span className="ml-1 text-stone-400">{v.count}건</span>}
                      </td>
                      <td className="text-right">{num(v.supply)}</td>
                      <td className="text-right">{v.free ? "–" : num(v.vat)}</td>
                      <td className="text-right">{v.receipts === null ? <span className="text-stone-400">–</span> : `${num(v.receipts)} (${v.receiptCount}장)`}</td>
                      <td className={`pl-2 ${diff === null ? "text-stone-400" : Math.abs(diff) <= 100 ? "text-emerald-700" : "text-amber-700"}`}>
                        {diff === null ? "영수증 없음" : Math.abs(diff) <= 100 ? "맞음 ✓" : `${diff > 0 ? "영수증이 " + num(diff) + " 적어요" : "영수증이 " + num(-diff) + " 많아요"}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-stone-500">
            &quot;영수증 없음&quot;은 임대료·전기·배달앱 수수료처럼 매입 영수증을 안 넣는 곳이에요. 본사 세금계산서의 로열티·배송비·프로그램 사용료는 빼고 물건값만 영수증과 견줘요.
          </p>
        </div>
      ) : (
        <p className="rounded-lg bg-stone-50 px-2 py-3 text-sm text-stone-600">{monthLabel(month).slice(6)} 홈택스 매입 자료가 아직 없어요.</p>
      )}
    </section>
  );
}
