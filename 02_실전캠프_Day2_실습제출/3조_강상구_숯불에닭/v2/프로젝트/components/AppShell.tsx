"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AutoExportSync } from "@/components/AutoExportSync";
import { CollectStatusBanner } from "@/components/CollectStatusBanner";
import { monthLabel, nextMonth, prevMonth } from "@/lib/month";
import { storageMode } from "@/lib/storage";
import { isBasic } from "@/lib/edition";
import { appTitle, loadStoreProfile, STORE_PROFILE_EVENT } from "@/lib/storeProfile";
import type { Month } from "@/lib/types";
import { DamagedRecovery, StorageFailureToast, useLocalHealth, useStorageFailure } from "@/components/StorageGuard";
import { isStorageError } from "@/lib/storage/errors";
import AutoBackupAgent from "@/components/AutoBackupAgent";
import { useSession } from "@/components/useSession";
import LoginScreen from "@/components/LoginScreen";
import { signOut } from "@/lib/supabase/client";

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

// 리뷰·상권은 전체판(사장님 PC)에만. 기본판(폰·공유용)은 캠프 때 만든 여섯 탭만 (lib/edition.ts)
const ALL_TABS = [
  { href: "/", label: "손익" },
  { href: "/today", label: "오늘" },
  { href: "/upload", label: "올리기" },
  { href: "/channels", label: "정산" },
  { href: "/costing", label: "원가율" },
  { href: "/reviews", label: "리뷰", fullOnly: true },
  { href: "/market", label: "상권", fullOnly: true },
  { href: "/rules", label: "규칙" },
];
// PC 사이드바에서 메뉴를 세 묶음으로 (매일 쓰는 것 / 들여다보는 것 / 설정)
const GROUPS: { title: string; hrefs: string[] }[] = [
  { title: "매일", hrefs: ["/", "/today", "/upload"] },
  { title: "분석", hrefs: ["/channels", "/costing", "/reviews", "/market"] },
  { title: "설정", hrefs: ["/rules"] },
];

/** 하위 주소(/market/keywords)도 그 탭으로 본다 */
const isActive = (pathname: string | null, href: string) => pathname === href || (href !== "/" && !!pathname?.startsWith(href + "/"));

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [month, setMonthState] = useState<Month | null>(null);
  const [title, setTitle] = useState(appTitle(null));
  const mode = storageMode();
  const cloud = mode === "supabase";
  const basic = isBasic();
  const TABS = basic ? ALL_TABS.filter((t) => !t.fullOnly) : ALL_TABS;
  // 내 PC 모드에서만: 저장된 장부를 읽을 수 있는지 확인하고, 저장 실패 알림을 받는다
  const { health, recheck } = useLocalHealth(mode === "local");
  const { failure, dismiss } = useStorageFailure(recheck);
  const damaged = health !== null && !health.ok;
  // 인터넷 모드에서만: 로그인돼 있나. 안 돼 있으면 장부 대신 로그인 화면
  const { session, ready } = useSession(cloud);
  const email = session?.user?.email ?? "";

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
  // (인터넷 모드는 로그인한 뒤에야 설정을 읽을 수 있다)
  useEffect(() => {
    if (cloud && !session) {
      setTitle(appTitle(null));
      return;
    }
    const apply = () =>
      void loadStoreProfile()
        .then((p) => {
          const t = appTitle(p);
          setTitle(t);
          document.title = t;
        })
        .catch(() => {});
    apply();
    window.addEventListener(STORE_PROFILE_EVENT, apply);
    return () => window.removeEventListener(STORE_PROFILE_EVENT, apply);
  }, [pathname, cloud, session]);

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

  // 위 띠와 사이드바 아래에 쓰는 "지금 어떤 모드인가" 한 줄
  const modeLine = damaged
    ? "저장된 장부를 읽을 수 없어요 — 입력이 잠겼어요. 아래 안내대로 복구해 주세요"
    : !cloud
      ? "내 PC 모드 — 데이터가 이 컴퓨터에만 저장돼요"
      : session
        ? `인터넷 모드 — ${email} 가게 장부. 폰·PC 어디서나 같은 장부`
        : "인터넷 모드 — 로그인하면 내 가게 장부만 보여요";
  const modeColor = damaged ? "bg-red-600 text-white" : !cloud ? "bg-emerald-600 text-white" : session ? "bg-[#6c8a66] text-white" : "bg-amber-400 text-amber-950";

  // 인터넷 모드에서 로그인 전이면 장부 대신 로그인 화면. 확인이 끝나기 전엔 아무것도 띄우지 않는다(깜빡임 방지)
  const body =
    health && !health.ok ? (
      <DamagedRecovery read={health} onRecovered={recheck} />
    ) : cloud && !ready ? null : cloud && !session ? (
      <LoginScreen />
    ) : month ? (
      <MonthContext.Provider value={{ month, setMonth }}>{children}</MonthContext.Provider>
    ) : null;

  return (
    <div className="min-h-screen md:flex">
      {/* 저장 실패 알림 — 어느 화면이든 위에 뜬다 */}
      <StorageFailureToast failure={failure} onDismiss={dismiss} />
      {/* 내 PC 모드이고 장부를 읽을 수 있을 때만 자동 백업 일꾼을 띄운다 */}
      {mode === "local" && health?.ok && <AutoBackupAgent />}
      {/* PC: 왼쪽 사이드바 메뉴 — 카페스이 색감(브라운 크림), 글자만, 세 묶음 */}
      <aside className="side hidden md:fixed md:inset-y-0 md:left-0 md:flex md:w-60 md:flex-col md:px-4 md:py-6">
        <h1 className="flex min-w-0 items-center gap-2.5 px-2">
          <span className="h-3 w-3 shrink-0 rounded-sm bg-[#be9235]" aria-hidden />
          <span className="min-w-0">
            <span className="block truncate font-serif text-base font-bold text-white">{title}</span>
            <span className="block text-[11px] text-stone-200/60">한눈 손익 장부</span>
          </span>
        </h1>
        <nav className="mt-4 flex flex-col gap-0.5" aria-label="메뉴">
          {GROUPS.map((g) => {
            const tabs = g.hrefs.map((href) => TABS.find((x) => x.href === href)).filter((t): t is (typeof TABS)[number] => !!t);
            if (!tabs.length) return null;
            return (
              <div key={g.title} className="flex flex-col gap-0.5">
                <div className="side-group">{g.title}</div>
                {tabs.map((t) => {
                  const active = isActive(pathname, t.href);
                  return (
                    <Link key={t.href} href={t.href} className={`side-nav ${active ? "side-nav-active" : ""}`} aria-current={active ? "page" : undefined}>
                      {t.label}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <div className="mt-auto space-y-2 px-2 text-[11px] leading-relaxed text-stone-200/60">
          <p>{modeLine}</p>
          {cloud && session && (
            <button className="rounded-lg border border-stone-200/30 px-2 py-1 text-[11px] text-stone-200/80 hover:bg-white/10" onClick={() => void signOut()}>
              로그아웃
            </button>
          )}
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col md:pl-60">
        <div role="status" className={`px-4 py-1.5 text-center text-xs font-semibold ${modeColor}`}>
          {modeLine}
        </div>

        {/* 위 헤더: 폰에서는 로고·가게 이름 + 월 선택 + 가로 탭, PC에서는 지금 탭 이름 + 월 선택만 (메뉴는 왼쪽) */}
        <header className="sticky top-0 z-10 border-b border-stone-200 bg-stone-100/85 px-4 pb-2 pt-3 backdrop-blur-md md:pb-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="flex min-w-0 items-center gap-2 text-sm font-bold md:hidden">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-[#be9235]" aria-hidden />
              <span className="truncate">{title}</span>
            </h1>
            <span className="hidden text-sm font-bold text-stone-700 md:block">{TABS.find((t) => isActive(pathname, t.href))?.label ?? ""}</span>
            {monthPicker}
          </div>
          <nav className="tabs mt-2 md:hidden" aria-label="메뉴">
            {TABS.map((t) => {
              const active = isActive(pathname, t.href);
              return (
                <Link key={t.href} href={t.href} className={`tab ${active ? "tab-active" : ""}`} aria-current={active ? "page" : undefined}>
                  {t.label}
                </Link>
              );
            })}
          </nav>
        </header>

        {/* 리뷰 수집기 도우미와의 자동 연결은 전체판(사장님 PC)에서만 */}
        {!basic && <AutoExportSync />}
        {!basic && <CollectStatusBanner />}

        <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 pb-10 pt-4">
          {/* 장부를 읽을 수 없으면 화면을 띄우지 않는다 — 어떤 화면도 빈 장부를 보고 저장하지 못하게 */}
          {body}
        </main>
      </div>
    </div>
  );
}
