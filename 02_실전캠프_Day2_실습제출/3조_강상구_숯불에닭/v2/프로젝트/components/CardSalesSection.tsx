"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Notice } from "@/components/ui";
import { CARDSALES_KEY, CardsalesParseError, cardsalesMonth, covered, mergeCardsales, parseCardsalesPurchase, rangesToFetch, type CardsalesData, type PayoutStatus } from "@/lib/cardsales";
import { num, won } from "@/lib/format";
import { monthLabel } from "@/lib/month";
import { getStore } from "@/lib/storage";
import type { Transaction } from "@/lib/types";

// 정산 탭 — 여신금융협회 카드매출조회의 "지급예정일"로 카드사 입금을 통장과 맞춘다 (사장님 PC 전용, 10/17).
//  규칙(+2영업일)으로 짐작하는 위쪽 짝 맞추기와 달리, 카드사가 알려 준 실제 예정일·금액으로 본다.
//  자료는 도우미가 Aside(사장님이 로그인해 둔 창)에서 받아 오거나, 엑셀을 직접 올린다. 카드번호·승인번호는 저장하지 않는다.

const HELPER = process.env.NEXT_PUBLIC_HELPER_URL || "http://127.0.0.1:4599";
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

const STATUS_CLS: Record<PayoutStatus, string> = {
  일치: "text-emerald-700",
  "늦게 들어옴": "text-emerald-700",
  차이: "text-red-600 font-bold",
  미입금: "text-red-600 font-bold",
  예정: "text-stone-500",
};

function rowsOf(bytes: ArrayBuffer): unknown[][] {
  const wb = XLSX.read(bytes, { type: "array" });
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: false });
    if (rows.some((r) => r.some((c) => String(c).includes("지급예정일")))) return rows;
  }
  throw new CardsalesParseError("여신협회 '기간별 매입내역 세부내역' 엑셀이 아닌 것 같아요.");
}

export function CardSalesSection({ month, txs, lastBankDate }: { month: string; txs: Transaction[]; lastBankDate: string }) {
  const [data, setData] = useState<CardsalesData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "warn" | "error" | "info"; text: string } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void getStore()
      .getSetting<CardsalesData>(CARDSALES_KEY)
      .then((d) => {
        setData(d);
        setLoaded(true);
      });
  }, []);

  const view = useMemo(() => cardsalesMonth(data, month, txs, lastBankDate), [data, month, txs, lastBankDate]);
  const hasMonth = view.checks.length > 0 || view.issuers.length > 0;

  async function save(next: CardsalesData) {
    await getStore().saveSetting(CARDSALES_KEY, next);
    setData(next);
  }

  // 여신협회에서 바로 가져오기 — 이 달 지급예정을 다 보려면 지난달 말 일주일부터. 31일씩 나눠 차례로(한 번에 한 건).
  async function fetchFromCardsales() {
    setMsg(null);
    const today = localDay();
    const all = rangesToFetch(month, today);
    if (!all.length) return setMsg({ tone: "info", text: `${monthLabel(month)}은 아직 받을 자료가 없어요.` });
    // 이미 다 받아 둔 앞 구간은 건너뛴다. 마지막 구간(요즘 것)은 늘 새로 받는다
    const todo = all.filter((r, i) => i === all.length - 1 || !covered(data, r));
    let cur = data;
    let rows = 0;
    try {
      for (let i = 0; i < todo.length; i++) {
        const r = todo[i];
        setBusy(`여신협회에서 받는 중… ${todo.length > 1 ? `(${i + 1}/${todo.length}) ` : ""}30초쯤`);
        // 여신협회는 "매입일"로 조회한다. 보통 거래 다음 날 매입되므로 하루 밀어서 묻는다
        const q = { report: "purchase", from: addDays(r.from, 1), to: addDays(r.to, 1) > today ? today : addDays(r.to, 1) };
        const res = await fetch(`${HELPER}/cardsales/fetch`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(q) });
        const j = (await res.json()) as { ok: boolean; message?: string; needLogin?: boolean; guard?: boolean; base64?: string | null };
        if (!j.ok) {
          setMsg({
            tone: "error",
            text: j.needLogin
              ? "여신협회 로그인이 필요해요. 리뷰 수집기 폴더에서 npm run login:source -- cardsales 를 돌리고 Aside 창에서 로그인한 뒤 다시 눌러 주세요."
              : j.guard
                ? `${j.message} 오늘은 다시 누르지 마세요.`
                : (j.message ?? "받지 못했어요."),
          });
          break;
        }
        if (!j.base64) continue; // 그 기간 자료 없음
        const bin = atob(j.base64);
        const bytes = new Uint8Array(bin.length);
        for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
        const parsed = parseCardsalesPurchase(rowsOf(bytes.buffer));
        cur = mergeCardsales(cur, parsed);
        await save(cur);
        rows += parsed.count;
        if (i < todo.length - 1) await new Promise((ok) => setTimeout(ok, 5000)); // 한 번에 한 건, 간격 두고
      }
      if (rows) setMsg({ tone: "ok", text: `카드 결제 ${num(rows)}건을 받았어요. 카드사별 지급예정일로 통장과 맞춰 봤어요.` });
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof CardsalesParseError ? e.message : "도우미에 연결하지 못했어요. 리뷰 수집기 폴더에서 npm run helper 를 켜 주세요." });
    } finally {
      setBusy(null);
    }
  }

  async function onFile(file: File) {
    setMsg(null);
    try {
      const parsed = parseCardsalesPurchase(rowsOf(await file.arrayBuffer()));
      await save(mergeCardsales(data, parsed));
      setMsg({ tone: "ok", text: `${file.name} — 카드 결제 ${num(parsed.count)}건(${md(parsed.from)}~${md(parsed.to)})을 넣었어요.` });
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const problems = view.checks.filter((c) => c.status === "미입금" || c.status === "차이");
  const list = showAll ? view.checks : problems;
  // 예정 돈이 하나도 통장에서 안 보이는 카드사 — 다른 통장으로 들어오는 것일 수 있다
  const otherAccount = view.issuers.filter((s) => s.expected > 0 && !s.matchedAny && s.missing > 0);

  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">카드사 입금 대조 · 여신금융협회</h2>
        <span className="text-xs text-stone-500">{data ? `받은 거래일 ${data.ranges.map((r) => `${md(r.from)}~${md(r.to)}`).join(", ")}` : "아직 안 받음"}</span>
      </div>
      <p className="text-xs text-stone-600">카드사가 여신금융협회에 알려 준 <b>실제 지급예정일·금액</b>으로 통장 입금을 맞춰 봐요. 위의 짝 맞추기는 "+2영업일" 규칙으로 짐작한 것이고, 여기는 확정 숫자예요.</p>

      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={!!busy} onClick={() => void fetchFromCardsales()}>
          {busy ?? `여신협회에서 바로 가져오기 (${monthLabel(month)})`}
        </button>
        <button className="btn-ghost" disabled={!!busy} onClick={() => fileRef.current?.click()}>
          매입내역 엑셀 올리기
        </button>
        <input ref={fileRef} type="file" accept=".xls,.xlsx" aria-label="여신협회 기간별 매입내역 엑셀" className="hidden" onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />
      </div>

      {loaded && !hasMonth && <p className="text-sm text-stone-500">{monthLabel(month)} 자료가 아직 없어요. 위 단추를 눌러 주세요.</p>}

      {hasMonth && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl bg-stone-50 p-2.5">
              <div className="text-[11px] text-stone-500">{monthLabel(month)} 카드 매입</div>
              <div className="num text-base font-bold">{won(view.totals.amount)}</div>
            </div>
            <div className="rounded-xl bg-stone-50 p-2.5">
              <div className="text-[11px] text-stone-500">카드 수수료 (실제)</div>
              <div className="num text-base font-bold">
                {won(view.totals.fee)} <span className="text-xs text-stone-500">{view.totals.feeRate}%</span>
              </div>
            </div>
            <div className="rounded-xl bg-stone-50 p-2.5">
              <div className="text-[11px] text-stone-500">통장 확인된 입금</div>
              <div className="num text-base font-bold">{won(view.totals.deposited)}</div>
            </div>
            <div className={`rounded-xl p-2.5 ${view.totals.missing ? "bg-red-50" : "bg-stone-50"}`}>
              <div className="text-[11px] text-stone-500">미입금 · 예정</div>
              <div className="num text-base font-bold">
                <span className={view.totals.missing ? "text-red-600" : ""}>{won(view.totals.missing)}</span> <span className="text-xs text-stone-500">· {won(view.totals.pending)}</span>
              </div>
            </div>
          </div>

          {!lastBankDate && <Notice tone="info">통장 내역을 아직 안 올려서 전부 "예정"으로 보여요. 올리기 탭에서 통장을 넣으면 맞춰 봐요.</Notice>}
          {otherAccount.length > 0 && (
            <Notice tone="warn">
              {otherAccount.map((s) => s.issuer).join(" · ")} 입금이 이 달 통장에서 하나도 안 보여요. 카드사 대금이 <b>다른 통장</b>으로 들어오는지(여신협회 입금내역의 결제계좌), 또는 그 통장 내역을 아직 안 올렸는지 확인해 주세요.
            </Notice>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
                  <th className="py-1.5">카드사</th>
                  <th className="text-right">이 달 매입</th>
                  <th className="text-right">수수료율</th>
                  <th className="text-right">이 달 지급예정</th>
                  <th className="text-right">통장 확인</th>
                  <th className="text-right">미입금</th>
                </tr>
              </thead>
              <tbody className="num">
                {view.issuers.map((s) => (
                  <tr key={s.issuer} className="border-b border-stone-100">
                    <td className="py-1.5 font-sans">{s.issuer}</td>
                    <td className="text-right">{num(s.amount)}</td>
                    <td className="text-right">{s.amount ? `${s.feeRate}%` : "-"}</td>
                    <td className="text-right">{num(s.expected)}</td>
                    <td className="text-right">{num(s.deposited)}</td>
                    <td className={`text-right ${s.missing ? "font-bold text-red-600" : "text-stone-400"}`}>{s.missing ? num(s.missing) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-1">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-bold">{showAll ? "날짜별 전체" : problems.length ? `확인할 입금 ${problems.length}건` : "안 맞는 입금 없음"}</h3>
              <button className="text-xs text-stone-500 underline" onClick={() => setShowAll((v) => !v)}>
                {showAll ? "확인할 것만" : "날짜별 전체 보기"}
              </button>
            </div>
            {list.length > 0 && (
              <ul className="divide-y divide-stone-100 text-sm">
                {list.map((c) => (
                  <li key={`${c.issuer}|${c.payDate}`} className="flex flex-wrap items-baseline justify-between gap-x-3 py-1">
                    <span>
                      <span className="num">{md(c.payDate)}</span> {c.issuer}
                    </span>
                    <span className="num text-xs">
                      예정 {num(c.expected)}
                      {c.deposited > 0 && ` · 통장 ${num(c.deposited)}${c.depositDate && c.depositDate !== c.payDate ? `(${md(c.depositDate)})` : ""}`} · <span className={STATUS_CLS[c.status]}>{c.status}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="text-[11px] text-stone-500">수수료는 매입금액에서 뺀 가맹점수수료(+부가세 대리납부)예요. 차이 0.5% 안은 일치로 봐요. 결과가 이상하면 해당 카드사에 문의하세요(여신협회 화면 아래 번호).</p>
        </>
      )}
    </section>
  );
}
