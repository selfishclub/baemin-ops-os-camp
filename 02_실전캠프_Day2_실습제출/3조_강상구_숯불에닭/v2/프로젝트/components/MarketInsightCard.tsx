"use client";

import { useEffect, useMemo, useState } from "react";
import { Notice } from "@/components/ui";
import { MARKET_MANUAL_KEY, type ManualEntry } from "@/components/MarketManualCard";
import { todayStr } from "@/lib/daily";
import { HISTORY_KEY, type HistoryDay } from "@/lib/history";
import { buildInsights, openDays, reportAgeDays, weekdayCompare, withHistory, type DaySales, type Insight } from "@/lib/market/insight";
import { MARKET_REPORT_KEY, parseSbizReport, type SbizReport } from "@/lib/market/sbizReport";
import { getStore } from "@/lib/storage";
import type { DailyWeather } from "@/lib/weather";
import type { Shift } from "@/lib/types";

// 상권 읽어 주기 — 소상공인365 보고서(동네)와 장부(우리 가게)를 맞대서 해 볼 것까지 보여 준다.
// 우리 가게 숫자는 장부를 열 때마다 새로 계산하고, 동네 숫자는 보고서를 붙여 넣을 때 바뀐다.

const TONE: Record<Insight["tone"], string> = {
  warn: "bg-amber-50 ring-amber-200",
  good: "bg-emerald-50 ring-emerald-200",
  info: "bg-stone-50 ring-stone-200",
};

const monthLabel = (m: string) => `${m.slice(0, 4)}년 ${Number(m.slice(5, 7))}월`;

/** 보고서 13개월을 "옮겨 적기" 칸에도 채운다 — 해마다 견줘 보기가 그 칸을 읽는다 */
function mergeManual(entries: ManualEntry[], r: SbizReport): ManualEntry[] {
  const by = new Map(entries.map((e) => [e.month, e]));
  for (const m of r.months) {
    const old = by.get(m.month) ?? { month: m.month, footTraffic: null, areaSales: null, sameStores: null, note: "" };
    by.set(m.month, {
      ...old,
      footTraffic: m.footTraffic ?? old.footTraffic,
      areaSales: m.sales ?? old.areaSales,
      sameStores: m.stores ?? old.sameStores,
      note: old.note || `소상공인365 보고서 — 매출·점포 수는 ${r.region} ${r.industry}, 유동인구는 선택 영역`,
    });
  }
  return [...by.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export function MarketInsightCard({ onSaved }: { onSaved?: () => void }) {
  const today = todayStr();
  const [report, setReport] = useState<SbizReport | null>(null);
  const [days, setDays] = useState<DaySales[]>([]);
  const [weather, setWeather] = useState<DailyWeather[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [history, setHistory] = useState<HistoryDay[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    const store = getStore();
    void Promise.all([store.getSetting<SbizReport>(MARKET_REPORT_KEY), store.listAllDailySales(), store.listWeather("2000-01-01", "2100-01-01"), store.listAllShifts(), store.getSetting<HistoryDay[]>(HISTORY_KEY)]).then(([r, sales, w, sh, hist]) => {
      const by = new Map<string, number>();
      for (const s of sales) by.set(s.date, (by.get(s.date) ?? 0) + s.amount);
      setReport(r ?? null);
      setDays([...by].map(([date, total]) => ({ date, total })).sort((a, b) => a.date.localeCompare(b.date)));
      setWeather(w);
      setShifts(sh);
      setHistory(hist ?? []);
      setLoaded(true);
    });
  }, []);

  const insights = useMemo(() => buildInsights(report, days, weather, shifts, today, history), [report, days, weather, shifts, today, history]);
  const weekday = useMemo(() => (report ? weekdayCompare(report, openDays(withHistory(days, history), today)) : null), [report, days, history, today]);

  const savePaste = async () => {
    const r = parseSbizReport(paste, today);
    if (!r || r.months.every((m) => m.sales === null && m.footTraffic === null)) {
      setMsg({ tone: "error", text: "보고서 글자를 못 읽었어요. 소상공인365 상세분석 리포트 화면에서 전체 선택(Ctrl+A) → 복사(Ctrl+C) 한 그대로 붙여 넣어 주세요." });
      return;
    }
    const store = getStore();
    try {
      await store.saveSetting(MARKET_REPORT_KEY, r);
      const manual = (await store.getSetting<ManualEntry[]>(MARKET_MANUAL_KEY)) ?? [];
      await store.saveSetting(MARKET_MANUAL_KEY, mergeManual(manual, r));
      setReport(r);
      setPaste("");
      setPasteOpen(false);
      const missing = [!r.salesWeekday && "요일", !r.salesHours && "시간대", !r.salesAge && "나이", r.regularPct === null && "단골"].filter(Boolean);
      setMsg({ tone: "ok", text: `${monthLabel(r.asOf)}까지 ${r.months.length}개월을 넣었어요.${missing.length ? ` 못 읽은 것: ${missing.join("·")}` : ""}` });
      onSaved?.();
    } catch (e) {
      setMsg({ tone: "error", text: `저장하지 못했어요: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  if (!loaded) return null;
  const age = report ? reportAgeDays(report, today) : null;

  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">
          상권 읽어 주기 <span className="text-xs font-normal text-stone-500">동네 숫자와 우리 장부를 맞대서 해 볼 것까지</span>
        </h2>
        {report && (
          <span className="num text-xs text-stone-500">
            상권 자료 {monthLabel(report.asOf)} 기준 · {report.region} · {report.industry}
          </span>
        )}
      </div>

      {!report && <Notice tone="info">아직 소상공인365 보고서가 없어요. 아래 "보고서 넣기"에서 붙여 넣으면 동네와 견준 내용이 나와요. 그 전에는 우리 가게 흐름만 보여요.</Notice>}
      {age !== null && age >= 30 && (
        <Notice tone="warn">
          보고서를 넣은 지 {age}일 지났어요. 소상공인365에서 다시 「분석하기」를 눌러 새 달을 받아 주세요 (자료는 석 달쯤 늦게 올라와요).
        </Notice>
      )}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      {insights.length === 0 ? (
        <p className="text-sm text-stone-500">장부에 매출이 3주 넘게 쌓이면 여기에 읽어 드릴게요.</p>
      ) : (
        <ul className="space-y-2">
          {insights.map((x) => (
            <li key={x.id} className={`rounded-xl px-3 py-2 ring-1 ${TONE[x.tone]}`}>
              <p className="text-sm font-bold">{x.title}</p>
              <p className="num mt-0.5 text-xs text-stone-600">{x.detail}</p>
              {x.todo && (
                <p className="mt-1 text-sm">
                  <b className="text-orange-800">해 볼 것</b> {x.todo}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {weekday && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[22rem] text-sm">
            <thead className="text-xs text-stone-500">
              <tr>
                <th className="py-1 text-left">요일별 매출 비율</th>
                {weekday.map((w) => (
                  <th key={w.label} className="text-right font-normal">
                    {w.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="num divide-y divide-stone-100">
              <tr>
                <td className="py-1 text-xs text-stone-500">우리</td>
                {weekday.map((w) => (
                  <td key={w.label} className={`text-right ${w.gap <= -2 ? "font-bold text-red-700" : w.gap >= 2 ? "font-bold text-emerald-700" : ""}`}>
                    {w.ours}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-1 text-xs text-stone-500">동네</td>
                {weekday.map((w) => (
                  <td key={w.label} className="text-right text-stone-500">
                    {w.area}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-xl bg-stone-50 p-3">
        <button type="button" className="text-xs font-semibold text-stone-600" onClick={() => setPasteOpen((v) => !v)}>
          {pasteOpen ? "▾" : "▸"} 보고서 {report ? "새로 " : ""}넣기 — 한 달에 한 번
        </button>
        {pasteOpen && (
          <div className="mt-2 space-y-2">
            <ol className="list-decimal space-y-0.5 pl-5 text-xs text-stone-600">
              <li>
                <a className="font-semibold text-orange-700 underline" href="https://bigdata.sbiz.or.kr/" target="_blank" rel="noreferrer">
                  소상공인365 상권분석
                </a>
                에서 지난번과 같은 영역 · 같은 업종(닭/오리고기 구이/찜)으로 「분석하기」
              </li>
              <li>상세분석 리포트 화면에서 Ctrl+A → Ctrl+C</li>
              <li>아래 칸에 붙여 넣고 「읽어서 넣기」</li>
            </ol>
            <textarea className="field h-28 text-xs" placeholder="보고서 화면 글자를 여기에 붙여 넣기" value={paste} onChange={(e) => setPaste(e.target.value)} />
            <button type="button" className="btn-primary px-3 py-1.5 text-sm" disabled={!paste.trim()} onClick={() => void savePaste()}>
              읽어서 넣기
            </button>
          </div>
        )}
      </div>

      <p className="text-xs text-stone-500">동네 숫자는 같은 업종 가게들의 평균이라 우리와 꼭 같지 않아요. 우리 가게 숫자(요일·날씨·이번 달 흐름)는 장부가 쌓일수록 더 믿을 만해져요. 부가세 날짜는 개인 일반과세자 기준이에요.</p>
    </section>
  );
}
