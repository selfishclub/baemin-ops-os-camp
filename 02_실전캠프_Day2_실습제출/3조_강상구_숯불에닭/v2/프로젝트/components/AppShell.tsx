"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AutoExportSync } from "@/components/AutoExportSync";
import { monthLabel, nextMonth, prevMonth } from "@/lib/month";
import { storageMode } from "@/lib/storage";
import { appTitle, loadStoreProfile, STORE_PROFILE_EVENT } from "@/lib/storeProfile";
import type { Month } from "@/lib/types";
import { DamagedRecovery, StorageFailureToast, useLocalHealth, useStorageFailure } from "@/components/StorageGuard";
import { isStorageError } from "@/lib/storage/errors";
import AutoBackupAgent from "@/components/AutoBackupAgent";

const MONTH_KEY = "sootdak-ledger-month";

// 처음 열면 이번 달. (전에는 "지난달 정산"이라 지난달을 보여 줬는데, 오늘 탭에 넣은 이번 달 매출이 안 보여 헷갈렸다.)
// 지난달 정산은 ◀ 한 번이면 된다. 고른 달은 브라우저에 남겨 새 탭에서도 같은 달이 열린다.
function defaultMonth(): Month {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
function readMonth(): Month | null {
  try {
    return window.localStorage.getItem(MONTH_KEY);
  } catch {
    return null;
  }
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
  { href: "/costing", label: "원가율", icon: "🍗" },
  { href: "/reviews", label: "리뷰", icon: "⭐" },
  { href: "/market", label: "상권", icon: "📍" },
  { href: "/rules", label: "규칙", icon: "⚙️" },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [month, setMonthState] = useState<Month | null>(null);
  const [title, setTitle] = useState(appTitle(null));
  const mode = storageMode();
  // 내 PC 모드에서만: 저장된 장부를 읽을 수 있는지 확인하고, 저장 실패 알림을 받는다
  const { health, recheck } = useLocalHealth(mode === "local");
  const { failure, dismiss } = useStorageFailure(recheck);
  const damaged = health !== null && !health.ok;

  useEffect(() => {
    setMonthState(readMonth() ?? defaultMonth());
  }, []);

  // 저장 실패는 이미 빨간 알림으로 보여 줬으므로, catch 가 없는 화면에서 올라온 같은 오류가 콘솔에 "Uncaught" 로 찍히지 않게 한다.
  // 저장소 오류만 조용히 하고, 다른 오류는 그대로 둔다.
  useEffect(() => {
    const quiet = (e: PromiseRejectionEvent) => {
      if (isStorageError(e.reason)) e.preventDefault();
    };
    window.addEventListener("unhandledrejection", quiet);
    return () => window.removeEventListener("unhandledrejection", quiet);
  }, []);

  // 가게 이름은 설정에 있다. 서버에서 그려지는 <title>은 못 바꾸니 여기서 다시 적어 준다
  useEffect(() => {
    const apply = () =>
      void loadStoreProfile().then((p) => {
        const t = appTitle(p);
        setTitle(t);
        document.title = t;
      });
    apply();
    window.addEventListener(STORE_PROFILE_EVENT, apply);
    return () => window.removeEventListener(STORE_PROFILE_EVENT, apply);
  }, [pathname]);

  const setMonth = (m: Month) => {
    try {
      window.localStorage.setItem(MONTH_KEY, m);
    } catch {}
    setMonthState(m);
  };

  const monthPicker = month && (
    <div className="flex shrink-0 items-center gap-0.5 rounded-full border border-stone-200 bg-white px-1 py-0.5">
      <button aria-label="이전 달" className="rounded-full px-2 py-1 text-xs hover:bg-stone-100" onClick={() => setMonth(prevMonth(month))}>
        ◀
      </button>
      <span className="num min-w-[5.5rem] whitespace-nowrap text-center text-sm font-bold">{monthLabel(month)}</span>
      <button aria-label="다음 달" className="rounded-full px-2 py-1 text-xs hover:bg-stone-100" onClick={() => setMonth(nextMonth(month))}>
        ▶
      </button>
    </div>
  );

  return (
    <div className="min-h-screen md:flex">
      {/* 저장 실패 알림 — 어느 화면이든 위에 뜬다 */}
      <StorageFailureToast failure={failure} onDismiss={dismiss} />
      {/* 내 PC 모드이고 장부를 읽을 수 있을 때만 자동 백업 일꾼을 띄운다 */}
      {mode === "local" && health?.ok && <AutoBackupAgent />}
      {/* PC: 왼쪽 사이드바 메뉴 (김씨육면 손익관리의 사이드 메뉴 구성을 가져옴) */}
      <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:flex md:w-56 md:flex-col md:gap-5 md:bg-stone-900 md:px-3 md:py-5">
        <h1 className="flex min-w-0 items-center gap-2 px-2 text-base font-bold text-white">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-600 text-lg">🔥</span>
          <span className="truncate">{title}</span>
        </h1>
        <nav className="flex flex-col gap-1" aria-label="메뉴">
          <div className="px-3 pb-1 text-[11px] font-bold tracking-wider text-stone-500">메뉴</div>
          {TABS.map((t) => {
            const active = pathname === t.href;
            return (
              <Link key={t.href} href={t.href} className={`side-nav ${active ? "side-nav-active" : ""}`} aria-current={active ? "page" : undefined}>
                <span className="w-5 text-center text-base leading-none">{t.icon}</span>
                {t.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto px-2 text-[11px] leading-relaxed text-stone-500">
          {mode === "local" ? "내 PC 모드 — 데이터가 이 컴퓨터에만 저장돼요" : "시연 모드 — 가짜 데이터만 넣으세요"}
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col md:pl-56">
        <div
          role="status"
          className={`px-4 py-1.5 text-center text-xs font-semibold ${
            damaged ? "bg-red-600 text-white" : mode === "local" ? "bg-emerald-600 text-white" : "bg-amber-400 text-amber-950"
          }`}
        >
          {damaged
            ? "저장된 장부를 읽을 수 없어요 — 입력이 잠겼어요. 아래 안내대로 복구해 주세요"
            : mode === "local"
              ? "내 PC 모드 — 데이터가 이 컴퓨터에만 저장돼요"
              : "시연 모드 — 가짜 데이터만 넣으세요. 누구나 볼 수 있어요"}
        </div>

        {/* 위 헤더: 폰에서는 로고·가게 이름 + 월 선택 + 가로 탭, PC에서는 지금 탭 이름 + 월 선택만 (메뉴는 왼쪽) */}
        <header className="sticky top-0 z-10 border-b border-stone-200 bg-stone-100/85 px-4 pb-2 pt-3 backdrop-blur-md md:pb-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="flex min-w-0 items-center gap-2 text-sm font-bold md:hidden">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-600 text-base">🔥</span>
              <span className="truncate">{title}</span>
            </h1>
            <span className="hidden text-sm font-bold text-stone-700 md:block">{TABS.find((t) => t.href === pathname)?.label ?? ""}</span>
            {monthPicker}
          </div>
          <nav className="tabs mt-2 md:hidden" aria-label="메뉴">
            {TABS.map((t) => {
              const active = pathname === t.href;
              return (
                <Link key={t.href} href={t.href} className={`tab ${active ? "tab-active" : ""}`} aria-current={active ? "page" : undefined}>
                  <span className="mr-1">{t.icon}</span>
                  {t.label}
                </Link>
              );
            })}
          </nav>
        </header>

        <AutoExportSync />

        <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 pb-10 pt-4">
          {/* 장부를 읽을 수 없으면 화면을 띄우지 않는다 — 어떤 화면도 빈 장부를 보고 저장하지 못하게 */}
          {health && !health.ok ? (
            <DamagedRecovery read={health} onRecovered={recheck} />
          ) : month ? (
            <MonthContext.Provider value={{ month, setMonth }}>{children}</MonthContext.Provider>
          ) : null}
        </main>
      </div>
    </div>
  );
}
