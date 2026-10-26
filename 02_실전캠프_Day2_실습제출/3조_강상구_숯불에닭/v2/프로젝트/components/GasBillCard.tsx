"use client";

import { useEffect, useMemo, useState } from "react";
import { CHANNELS_KEY } from "@/components/useDaily";
import { Notice } from "@/components/ui";
import { num, won } from "@/lib/format";
import { GAS_BILLS_KEY, gasBizDays, gasRows, parseGasSms, upsertGasBills, yearAgo, type GasBill, type GasRow } from "@/lib/gasBills";
import { HISTORY_KEY, type HistoryDay } from "@/lib/history";
import { mergeChannels } from "@/lib/monthPnl";
import { getStore } from "@/lib/storage";
import { isHall } from "@/lib/categories";
import type { Channel, DailySale } from "@/lib/types";

// 가스 사용량 — 평화가스 요금안내 문자를 붙여 넣으면 쌓인다 (2026-10-26).
// 가스비는 "단가가 올라서"와 "많이 써서"가 섞여 있어 둘을 나눠 보여 준다.
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const pctTxt = (p: number | null) => (p === null ? "–" : `${p > 0 ? "+" : ""}${p}%`);

export function GasBillCard({ month }: { month: string }) {
  const [bills, setBills] = useState<GasBill[]>([]);
  const [sales, setSales] = useState<DailySale[]>([]);
  const [channels, setChannels] = useState<Channel[]>(mergeChannels(null));
  const [history, setHistory] = useState<HistoryDay[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);
  const [all, setAll] = useState(false);

  useEffect(() => {
    const store = getStore();
    void Promise.all([
      store.getSetting<GasBill[]>(GAS_BILLS_KEY),
      store.listAllDailySales(),
      store.getSetting<Channel[]>(CHANNELS_KEY),
      store.getSetting<HistoryDay[]>(HISTORY_KEY),
    ]).then(([b, s, c, h]: [GasBill[] | null, DailySale[], Channel[] | null, HistoryDay[] | null]) => {
      setBills(b ?? []);
      setSales(s);
      setChannels(mergeChannels(c));
      setHistory(h ?? []);
      setLoaded(true);
    });
  }, []);

  const rows = useMemo(() => {
    const biz = gasBizDays(sales.map((s) => ({ date: s.date, amount: s.amount, hall: isHall(s.channel, channels) })), history);
    return gasRows(bills, biz);
  }, [bills, sales, channels, history]);

  async function save() {
    const { bills: add, errors } = parseGasSms(text);
    if (!add.length) {
      setMsg({ tone: "error", text: errors.join(" ") || "읽은 문자가 없어요." });
      return;
    }
    try {
      // 다른 창에서 바뀌었을 수 있으니 저장 직전에 다시 읽는다
      const cur = (await getStore().getSetting<GasBill[]>(GAS_BILLS_KEY)) ?? [];
      const r = upsertGasBills(cur, add);
      await getStore().saveSetting(GAS_BILLS_KEY, r.list);
      setBills(r.list);
      setText("");
      const head = `${add.map((b) => `${b.month.slice(2, 4)}년 ${Number(b.month.slice(5))}월`).join("·")} 문자를 저장했어요${r.replaced ? ` (이미 있던 ${r.replaced}건은 새 문자로 바꿈)` : ""}.`;
      setMsg({ tone: errors.length ? "warn" : "ok", text: [head, ...errors].join(" ") });
    } catch {
      setMsg({ tone: "error", text: "저장하지 못했어요. 장부 저장 공간을 확인해 주세요." });
    }
  }

  if (!loaded) return null;

  // 고른 달의 문자, 없으면 가장 최근 문자
  const focus = rows.find((r) => r.bill.month === month) ?? rows[rows.length - 1];
  const shown = all ? [...rows].reverse() : [...rows].reverse().slice(0, 13);

  return (
    <section className="card space-y-3">
      <div>
        <h2 className="text-sm font-bold">🔥 가스 사용량 (LPG)</h2>
        <p className="text-xs text-stone-500">평화가스 요금안내 문자를 그대로 붙여 넣으면 쌓여요. 가스비가 오른 게 단가 때문인지, 많이 써서인지 나눠 봐요.</p>
      </div>

      {focus ? <Focus row={focus} rows={rows} /> : <p className="rounded-lg bg-stone-50 px-2 py-3 text-sm text-stone-600">아직 저장된 가스 문자가 없어요. 아래에 붙여 넣어 주세요.</p>}

      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="num w-full min-w-[40rem] text-xs">
            <thead>
              <tr className="text-stone-500">
                <th className="py-1 text-left">청구월</th>
                <th className="text-left">사용기간</th>
                <th className="text-right">사용량</th>
                <th className="text-right">하루</th>
                <th className="text-right">㎥당 단가</th>
                <th className="text-right" title="그 기간 홀 매출 100만 원을 팔 때 쓴 가스">홀 100만당</th>
                <th className="text-right" title="그 기간 포스 영수 건수 100건당 (영수 건수가 있는 기간만)">100팀당</th>
                <th className="text-right">매출 대비</th>
                <th className="text-right">청구금액</th>
                <th className="pl-2 text-left">단가 안내</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.bill.month} className={`border-t border-stone-100 ${r.bill.month === focus?.bill.month ? "bg-orange-50" : ""}`}>
                  <td className="py-1 font-semibold">{r.bill.month.slice(2).replace("-", ".")}</td>
                  <td className="text-stone-600">
                    {md(r.bill.from)}~{md(r.bill.to)} <span className="text-stone-400">({r.days}일)</span>
                    {r.meterGap && <span className="ml-1 text-rose-600" title="앞 문자의 당월지침과 이번 전월지침이 달라요 — 빠진 달이 있을 수 있어요">⚠</span>}
                  </td>
                  <td className="text-right font-semibold">{r.bill.m3}㎥</td>
                  <td className="text-right">{r.perDay.toFixed(2)}</td>
                  <td className="text-right">{num(r.unitPrice)}</td>
                  <td className="text-right">{r.perHall === null ? "–" : r.perHall.toFixed(2)}</td>
                  <td className="text-right">{r.per100Teams === null ? "–" : r.per100Teams.toFixed(1)}</td>
                  <td className="text-right">{r.costPct === null ? "–" : `${r.costPct.toFixed(2)}%`}</td>
                  <td className="text-right">{num(r.bill.amount)}</td>
                  <td className="pl-2 text-stone-600">{r.bill.priceNote ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 13 && (
            <button className="mt-1 text-xs text-stone-500 underline" onClick={() => setAll(!all)}>
              {all ? "최근 13개만 보기" : `전체 ${rows.length}개 보기`}
            </button>
          )}
          <p className="mt-1 text-[11px] text-stone-500">
            단위: 사용량·하루·홀 100만당·100팀당은 ㎥. 1㎥ ≈ LPG 2.5kg. 매출은 장부(장부를 쓰기 전은 포스 홀+배달 지난 매출)로 셈하고, 가스 사용기간에 맞춰 더했어요.
            가게를 쉰 날도 기간에 들어가서 하루 사용량은 달력 날 기준이에요.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <textarea
          className="field h-24 w-full text-xs"
          placeholder={"[Web발신]\n평화가스\n2026년 11월  요금안내 … (문자 전체를 붙여 넣어 주세요. 여러 달을 한꺼번에 붙여도 돼요)"}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="btn-primary w-full" disabled={!text.trim()} onClick={() => void save()}>
          가스 문자 저장
        </button>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      </div>
    </section>
  );
}

/** 고른 달 요약 — 작년 같은 달과 견줘 "단가"와 "쓴 양"을 나눠 말한다 */
function Focus({ row, rows }: { row: GasRow; rows: GasRow[] }) {
  const m = row.bill.month;
  const price = yearAgo(rows, m, (r) => r.unitPrice);
  const perHall = yearAgo(rows, m, (r) => r.perHall);
  const perDay = yearAgo(rows, m, (r) => r.perDay);
  return (
    <div className="space-y-1 rounded-lg bg-stone-50 px-3 py-2 text-sm">
      <p>
        <b>{Number(m.slice(5))}월 청구</b> ({md(row.bill.from)}~{md(row.bill.to)}, {row.days}일) — <b className="num">{row.bill.m3}㎥</b> · <b className="num">{won(row.bill.amount)}</b>
        {row.bill.priceNote && <span className="text-stone-500"> · 단가 {row.bill.priceNote}</span>}
      </p>
      <p className="num text-xs text-stone-600">
        하루 {row.perDay.toFixed(2)}㎥ · ㎥당 {num(row.unitPrice)}원 · 홀 100만 원당 {row.perHall === null ? "–" : `${row.perHall.toFixed(2)}㎥`}
        {row.costPct !== null && ` · 매출 대비 ${row.costPct.toFixed(2)}%`}
        {row.missingDays > 0 && row.hallSales !== null && <span className="text-stone-400"> (매출 없는 날 {row.missingDays}일 포함)</span>}
      </p>
      {price !== null ? (
        <p className="text-xs text-stone-700">
          작년 같은 달보다 <b>단가 {pctTxt(price)}</b>, <b>홀 100만 원당 쓴 양 {pctTxt(perHall)}</b>, 하루 쓴 양 {pctTxt(perDay)}
          {perHall !== null && (price > 5 && perHall < 5 ? " — 주로 단가가 올라서예요." : perHall > 5 && price < 5 ? " — 주로 많이 써서예요." : price > 5 && perHall > 5 ? " — 단가도 오르고 쓰기도 더 썼어요." : "")}
        </p>
      ) : (
        <p className="text-xs text-stone-500">작년 같은 달 문자가 있으면 단가와 쓴 양을 나눠 견줘요.</p>
      )}
    </div>
  );
}
