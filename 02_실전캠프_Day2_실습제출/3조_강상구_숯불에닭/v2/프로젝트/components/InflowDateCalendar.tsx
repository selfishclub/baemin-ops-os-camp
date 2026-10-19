"use client";

import { useEffect, useState } from "react";
import { INFLOW_FIRST_DAY, inflowPeriod, type InflowMode } from "@/lib/market/inflowPeriod";

const monthOf = (day: string) => `${day.slice(0, 7)}-01`;
function moveMonth(month: string, amount: number) {
  const date = new Date(`${month}T00:00:00Z`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1)).toISOString().slice(0, 10);
}

/** 날짜를 고르는 동안에는 조회하지 않고 적용할 때만 선택한 기간을 바꾼다. */
export function InflowDateCalendar({ anchor, latest, mode, onApply, onCancel }: {
  anchor: string; latest: string; mode: InflowMode; onApply: (day: string) => void; onCancel: () => void;
}) {
  const [draft, setDraft] = useState(anchor);
  const [leftMonth, setLeftMonth] = useState(() => {
    const previous = moveMonth(monthOf(anchor), -1);
    return previous < monthOf(INFLOW_FIRST_DAY) ? monthOf(INFLOW_FIRST_DAY) : previous;
  });
  const selection = inflowPeriod(mode, draft);
  const rightMonth = moveMonth(leftMonth, 1);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onCancel(); };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [onCancel]);
  return (
    <div role="dialog" aria-label="키워드 조회 날짜 선택" className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 px-4 py-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <h3 className="font-bold">▦ 날짜 선택</h3>
          <span className="text-xs text-stone-500">2024년 9월부터 어제까지 조회 가능</span>
        </div>
        <div className="flex gap-2">
          <button type="button" className="rounded-full border border-stone-200 px-3 py-1.5 text-sm" onClick={() => { setDraft(latest); setLeftMonth(moveMonth(monthOf(latest), -1) < monthOf(INFLOW_FIRST_DAY) ? monthOf(INFLOW_FIRST_DAY) : moveMonth(monthOf(latest), -1)); }}>최근 날짜</button>
          <button type="button" className="rounded-full border border-stone-200 px-4 py-1.5 text-sm" onClick={onCancel}>취소</button>
          <button type="button" className="rounded-full bg-emerald-600 px-5 py-1.5 text-sm font-semibold text-white" onClick={() => onApply(draft)}>적용</button>
        </div>
      </div>
      <div className="grid divide-y divide-stone-200 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        {[leftMonth, rightMonth].map((month, panel) => {
          const date = new Date(`${month}T00:00:00Z`);
          const count = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
          const offset = date.getUTCDay();
          return (
            <div key={month} className="min-w-0 px-3 pb-4 pt-3 sm:px-4">
              <div className="mb-3 grid grid-cols-[32px_1fr_32px] items-center">
                {panel === 0 ? <button type="button" aria-label="달력 이전 달" className="py-2 text-stone-500 disabled:opacity-20" disabled={leftMonth <= monthOf(INFLOW_FIRST_DAY)} onClick={() => setLeftMonth(moveMonth(leftMonth, -1))}>‹</button> : <span />}
                <h4 className="text-center text-xl font-bold">{month.slice(0, 7).replace("-", ".")}</h4>
                {panel === 1 ? <button type="button" aria-label="달력 다음 달" className="py-2 text-stone-500 disabled:opacity-20" disabled={rightMonth >= monthOf(latest)} onClick={() => setLeftMonth(moveMonth(leftMonth, 1))}>›</button> : <span />}
              </div>
              <div className="grid grid-cols-7 text-center text-sm">
                {[..."일월화수목금토"].map((day, i) => <div key={day} className={`pb-2 font-medium ${i === 0 ? "text-red-500" : "text-stone-500"}`}>{day}</div>)}
                {Array.from({ length: 42 }, (_, cell) => {
                  const day = cell - offset + 1;
                  if (day < 1 || day > count) return <span key={cell} className="h-11 sm:h-12" />;
                  const iso = `${month.slice(0, 7)}-${String(day).padStart(2, "0")}`;
                  const disabled = iso < INFLOW_FIRST_DAY || iso > latest;
                  const selected = iso === draft;
                  const inPeriod = !disabled && iso >= selection.start && iso <= selection.end;
                  return <button key={cell} type="button" aria-label={`${date.getUTCFullYear()}년 ${date.getUTCMonth() + 1}월 ${day}일`} aria-pressed={selected} disabled={disabled} className={`h-11 rounded-lg text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 sm:h-12 sm:text-base ${disabled ? "text-stone-300" : selected ? "bg-emerald-600 font-bold text-white" : inPeriod ? "bg-emerald-50 text-emerald-800" : cell % 7 === 0 ? "text-red-500 hover:bg-stone-50" : "text-stone-700 hover:bg-stone-50"}`} onClick={() => setDraft(iso)}>{day}</button>;
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
