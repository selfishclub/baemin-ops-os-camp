"use client";

import { useEffect, useState } from "react";
import { MoneyInput } from "@/components/ui";
import { num } from "@/lib/format";
import { getStore } from "@/lib/storage";
import { SourceTag } from "@/components/SourceTag";

// 동네 유동인구 — 소상공인365(bigdata.sbiz.or.kr) 상권분석 화면에서 달마다 옮겨 적는 칸.
// API가 없는 자료라 손으로 적는다 (카페스이 월말회의 표 방식: 작년 같은 달 vs 이번 달). 통신사 유료 API는 안 쓴다.
export const MARKET_MANUAL_KEY = "market_manual_v1";

export interface ManualEntry {
  month: string; // "2026-10"
  footTraffic: number | null; // 일평균 유동인구 (명)
  areaSales: number | null; // 상권 월 추정 매출 (원) — 소상공인365 "매출"
  sameStores: number | null; // 같은 업종 점포 수 (소상공인365 기준)
  note: string;
}

// 지난 달도 다 고를 수 있어야 한다. 이번 달만 띄우면 지난 달 숫자를 몰아 적을 수가 없고,
// 작년 같은 달 비교도 작년 치가 들어가 있어야 나온다. (2026-10-19 사장님이 24년부터 넣기로 했다.)
const START_MONTH = "2024-01";

/** from 부터 to 까지 달 목록 ("2024-01" … "2026-10") */
function monthsFrom(from: string, to: string): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4)), m = Number(from.slice(5));
  for (let i = 0; i < 600; i++) {
    const cur = `${y}-${String(m).padStart(2, "0")}`;
    if (cur > to) break;
    out.push(cur);
    if (m === 12) { y += 1; m = 1; } else m += 1;
  }
  return out;
}

const emptyEntry = (month: string): ManualEntry => ({ month, footTraffic: null, areaSales: null, sameStores: null, note: "" });
const prevYear = (m: string) => `${Number(m.slice(0, 4)) - 1}${m.slice(4)}`;
const label = (m: string) => `${m.slice(0, 4)}년 ${Number(m.slice(5))}월`;

const prevMonth = (m: string) => {
  const y = Number(m.slice(0, 4)), mo = Number(m.slice(5));
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`;
};

/** 작년 같은 달이 있으면 그것과, 없으면(올해부터 적기 시작) 전달과 비교 */
function Delta({ now, before, unit, label = "작년" }: { now: number | null; before: number | null; unit: string; label?: string }) {
  if (now === null || before === null || before === 0) return null;
  const pct = Math.round(((now - before) / before) * 1000) / 10;
  return (
    <span className={`num ml-1 text-[11px] ${pct > 0 ? "text-emerald-700" : pct < 0 ? "text-red-700" : "text-stone-500"}`}>
      {label} {num(before)}
      {unit} ({pct > 0 ? "+" : ""}
      {pct}%)
    </span>
  );
}

export function MarketManualCard({ today }: { today: string }) {
  const thisMonth = today.slice(0, 7);
  const [entries, setEntries] = useState<ManualEntry[]>([]);
  const [month, setMonth] = useState(thisMonth);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void getStore()
      .getSetting<ManualEntry[]>(MARKET_MANUAL_KEY)
      .then((v) => {
        setEntries(v ?? []);
        setLoaded(true);
      });
  }, []);

  const current = entries.find((e) => e.month === month) ?? emptyEntry(month);
  const lastYear = entries.find((e) => e.month === prevYear(month)) ?? null;
  const lastMonth = entries.find((e) => e.month === prevMonth(month)) ?? null;
  // 작년 자료가 없으면(올해부터 적기 시작) 전달과 비교한다
  const cmp = lastYear ?? lastMonth;
  const cmpLabel = lastYear ? "작년" : "전달";
  const months = [...new Set([...monthsFrom(START_MONTH, thisMonth), thisMonth, ...entries.map((e) => e.month)])].sort().reverse();

  const save = (next: ManualEntry) => {
    const list = [...entries.filter((e) => e.month !== next.month), next].sort((a, b) => a.month.localeCompare(b.month));
    setEntries(list);
    void getStore().saveSetting(MARKET_MANUAL_KEY, list).catch(() => {});
  };

  if (!loaded) return null;

  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">
          동네 유동인구 · 상권 매출 — 옮겨 적기
          <SourceTag from="카페스이" />
        </h2>
        <select className="field w-auto py-1 text-xs" value={month} onChange={(e) => setMonth(e.target.value)}>
          {months.map((m) => (
            <option key={m} value={m}>
              {label(m)}
            </option>
          ))}
        </select>
      </div>
      <p className="text-sm text-stone-600">
        유동인구는 통신사가 파는 자료라 API가 없어요. 달에 한 번{" "}
        <a className="font-semibold text-orange-700 underline" href="https://bigdata.sbiz.or.kr/" target="_blank" rel="noreferrer">
          소상공인365 상권분석
        </a>
        에서 우리 동네를 열어 숫자만 옮겨 적으세요 (카페스이 월말회의 표 방식). 작년 같은 달 칸이 있으면 비교가 나와요.
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block text-xs font-semibold text-stone-500">
          일평균 유동인구 (명)
          <MoneyInput label="일평균 유동인구" value={current.footTraffic} onChange={(v) => save({ ...current, footTraffic: v })} allowEmpty placeholder="예: 12,300" />
          <Delta now={current.footTraffic} before={cmp?.footTraffic ?? null} unit="명" label={cmpLabel} />
        </label>
        <label className="block text-xs font-semibold text-stone-500">
          상권 월 추정 매출 (원)
          <MoneyInput label="상권 월 추정 매출" value={current.areaSales} onChange={(v) => save({ ...current, areaSales: v })} allowEmpty placeholder="예: 3,200,000,000" />
          <Delta now={current.areaSales} before={cmp?.areaSales ?? null} unit="원" label={cmpLabel} />
        </label>
        <label className="block text-xs font-semibold text-stone-500">
          같은 업종 점포 수 (곳)
          <MoneyInput label="같은 업종 점포 수" value={current.sameStores} onChange={(v) => save({ ...current, sameStores: v })} allowEmpty placeholder="예: 24" />
          <Delta now={current.sameStores} before={cmp?.sameStores ?? null} unit="곳" label={cmpLabel} />
        </label>
      </div>
      <input className="field" placeholder="메모 — 예: 10월 유동인구는 평일 저녁이 늘었음 (소상공인365 시간대 표)" value={current.note} onChange={(e) => save({ ...current, note: e.target.value })} />
      {entries.filter((e) => e.footTraffic !== null || e.areaSales !== null).length > 1 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[22rem] text-sm">
            <thead className="text-left text-xs text-stone-500">
              <tr>
                <th className="py-1">달</th>
                <th className="text-right">유동인구/일</th>
                <th className="text-right">상권 매출/월</th>
                <th className="text-right">같은 업종</th>
              </tr>
            </thead>
            <tbody className="num divide-y divide-stone-100">
              {[...entries].reverse().map((e) => (
                <tr key={e.month}>
                  <td className="py-1">{label(e.month)}</td>
                  <td className="text-right">{e.footTraffic === null ? "–" : num(e.footTraffic)}</td>
                  <td className="text-right">{e.areaSales === null ? "–" : num(e.areaSales)}</td>
                  <td className="text-right">{e.sameStores === null ? "–" : num(e.sameStores)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-stone-500">KT 잘나가게(무료)에도 비슷한 숫자가 있어요. 어느 쪽이든 한 곳으로 정해서 같은 기준으로 적어야 비교가 돼요.</p>
    </section>
  );
}
