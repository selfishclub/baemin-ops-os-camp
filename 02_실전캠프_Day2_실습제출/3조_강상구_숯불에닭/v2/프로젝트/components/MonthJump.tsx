"use client";

import { useEffect, useRef, useState } from "react";
import { monthLabel } from "@/lib/month";
import type { Month } from "@/lib/types";

// 월 표시를 누르면 연도 + 12달 칸이 뜨는 작은 창 — ◀ ▶ 로 한 달씩 넘기지 않고 몇 달을 한 번에 건너뛴다 (2026-10-27 사장님 요청)
export function MonthJump({ month, onPick }: { month: Month; onPick: (m: Month) => void }) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(Number(month.slice(0, 4)));
  const box = useRef<HTMLDivElement>(null);
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  useEffect(() => {
    if (!open) return;
    setYear(Number(month.slice(0, 4)));
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open, month]);

  const pick = (m: Month) => {
    onPick(m);
    setOpen(false);
  };

  return (
    <div ref={box} className="relative">
      <button
        aria-label="달 고르기"
        aria-expanded={open}
        className="num min-w-[5.5rem] whitespace-nowrap rounded-full px-1 text-center text-sm font-bold hover:bg-stone-100"
        onClick={() => setOpen(!open)}
      >
        {monthLabel(month)} <span className="text-[10px] text-stone-400">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-60 rounded-xl border border-stone-200 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <button aria-label="달 고르기 이전 해" className="rounded-full px-2 py-1 text-xs hover:bg-stone-100" onClick={() => setYear(year - 1)}>
              ◀
            </button>
            <span className="num text-sm font-bold">{year}년</span>
            <button aria-label="달 고르기 다음 해" className="rounded-full px-2 py-1 text-xs hover:bg-stone-100" onClick={() => setYear(year + 1)}>
              ▶
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {Array.from({ length: 12 }, (_, i) => {
              const m = `${year}-${String(i + 1).padStart(2, "0")}`;
              const selected = m === month;
              const future = m > thisMonth;
              return (
                <button
                  key={m}
                  aria-label={`${year}년 ${i + 1}월`}
                  className={`num rounded-lg py-1.5 text-sm ${selected ? "bg-stone-800 font-bold text-white" : m === thisMonth ? "font-bold text-[#6c8a66] ring-1 ring-[#6c8a66]" : future ? "text-stone-300 hover:bg-stone-50" : "hover:bg-stone-100"}`}
                  onClick={() => pick(m)}
                >
                  {i + 1}월
                </button>
              );
            })}
          </div>
          {month !== thisMonth && (
            <button className="mt-2 w-full rounded-lg bg-stone-100 py-1.5 text-xs text-stone-700 hover:bg-stone-200" onClick={() => pick(thisMonth)}>
              이번 달로 ({monthLabel(thisMonth)})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
