"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { monthLabel, nextMonth, prevMonth } from "@/lib/month";
import { storageMode } from "@/lib/storage";
import type { Month } from "@/lib/types";

const MONTH_KEY = "sootdak-ledger-month";

// 정산은 보통 "지난달"을 하니까, 처음 열면 지난달을 보여 준다.
function defaultMonth(): Month {
  const now = new Date();
  return prevMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
}

const MonthContext = createContext<{ month: Month; setMonth: (m: Month) => void }>({
  month: "2026-08",
  setMonth: () => {},
});
export const useMonth = () => useContext(MonthContext);

const TABS = [
  { href: "/", label: "손익", icon: "📊" },
  { href: "/today", label: "오늘", icon: "📝" },
  { href: "/upload", label: "올리기", icon: "📥" },
  { href: "/channels", label: "정산", icon: "🛵" },
  { href: "/rules", label: "규칙", icon: "⚙️" },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [month, setMonthState] = useState<Month | null>(null);
  const mode = storageMode();

  useEffect(() => {
    setMonthState(window.sessionStorage.getItem(MONTH_KEY) ?? defaultMonth());
  }, []);

  const setMonth = (m: Month) => {
    window.sessionStorage.setItem(MONTH_KEY, m);
    setMonthState(m);
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col">
      <div
        role="status"
        className={`px-4 py-1.5 text-center text-xs font-semibold ${
          mode === "local" ? "bg-emerald-600 text-white" : "bg-amber-400 text-amber-950"
        }`}
      >
        {mode === "local"
          ? "내 PC 모드 — 데이터가 이 컴퓨터에만 저장돼요"
          : "시연 모드 — 가짜 데이터만 넣으세요. 누구나 볼 수 있어요"}
      </div>

      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-stone-100/95 px-4 py-3 backdrop-blur">
        <h1 className="min-w-0 truncate text-sm font-bold sm:text-base">🔥 한눈 손익 장부</h1>
        {month && (
          <div className="flex shrink-0 items-center gap-1">
            <button aria-label="이전 달" className="btn-ghost px-2.5 py-1.5" onClick={() => setMonth(prevMonth(month))}>
              ◀
            </button>
            <span className="num min-w-[5.5rem] whitespace-nowrap text-center text-sm font-bold">{monthLabel(month)}</span>
            <button aria-label="다음 달" className="btn-ghost px-2.5 py-1.5" onClick={() => setMonth(nextMonth(month))}>
              ▶
            </button>
          </div>
        )}
      </header>

      <main className="flex-1 space-y-4 px-4 pb-28">
        {month ? <MonthContext.Provider value={{ month, setMonth }}>{children}</MonthContext.Provider> : null}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-stone-200 bg-white">
        <ul className="mx-auto grid max-w-3xl grid-cols-5">
          {TABS.map((t) => {
            const active = pathname === t.href;
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${
                    active ? "text-orange-600" : "text-stone-500"
                  }`}
                >
                  <span className="text-lg leading-none">{t.icon}</span>
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
