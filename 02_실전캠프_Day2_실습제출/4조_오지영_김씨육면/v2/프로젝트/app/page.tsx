"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Dashboard, type History } from "@/components/Dashboard";
import { Settlement } from "@/components/Settlement";
import { SettingsView } from "@/components/SettingsView";
import { YearDashboard } from "@/components/YearDashboard";
import { prevMonthOf } from "@/lib/fixedTemplate";
import { applySettings, loadSettings, type Settings } from "@/lib/settings";
import { buildYear, storedYears } from "@/lib/year";
import { MonthBar, type MonthBrief } from "@/components/MonthBar";
import { SalesView } from "@/components/SalesView";
import { buildRevenue } from "@/lib/dailySales";
import { clearAllMonths, listStoredMonths, loadMonth, newMonthState, saveMonth, unconfirmAllOnce, type MonthState } from "@/lib/store";
import { summarize } from "@/lib/summary";
import { spreadForMonth } from "@/lib/installment";
import { loadLearned, migrateFromMonths } from "@/lib/learned";
import { updateLearned } from "@/lib/useLearned";

const MONTHS = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`);
const DEFAULT_MONTH = "2026-08";

type View = "year" | "sales" | "month" | "work" | "settings";

export default function Page() {
  const [month, setMonth] = useState(DEFAULT_MONTH);
  const [state, setState] = useState<MonthState>(() => newMonthState(DEFAULT_MONTH));
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>("year");
  const [year, setYear] = useState(Number(DEFAULT_MONTH.slice(0, 4)));
  const [openStep, setOpenStep] = useState<number | undefined>();
  const [stored, setStored] = useState<string[]>([]);
  const [settings, setSettingsState] = useState<Settings | null>(null);
  /** 새로고침 — 올릴 때마다 저장된 것을 다시 읽고 화면의 임시 상태를 되돌린다 */
  const [tick, setTick] = useState(0);

  // 계정과목·고정비 설정을 레지스트리에 먼저 올려야 드롭다운과 집계가 맞는다
  useEffect(() => {
    const s = loadSettings();
    applySettings(s);
    setSettingsState(s);
  }, []);

  // 예전 버전은 배운 규칙을 달 안에 넣어 뒀다. 한 번만 전역으로 끌어올린다.
  useEffect(() => {
    if (!loadLearned().updatedAt) {
      const months = listStoredMonths().map((m) => loadMonth(m));
      updateLearned((l) => migrateFromMonths(l, months).next);
    }
    // 앱이 붙인 것과 사람이 고른 것이 섞여 있어 구분이 안 된다.
    // 기준을 한 번 맞춰 놓고 다시 시작한다 — 계정은 그대로 남고 '확인 전'으로만 바뀐다.
    unconfirmAllOnce();
  }, []);

  useEffect(() => {
    if (!settings) return;
    setState(loadMonth(month));
    setReady(true);
    setStored(listStoredMonths());
  }, [month, settings]);

  useEffect(() => {
    if (!ready) return;
    saveMonth(state);
    setStored(listStoredMonths());
  }, [state, ready]);

  /**
   * 할부를 달에 나눠 보려면 지난달에 산 것도 끌어와야 한다.
   * 저장된 달의 거래를 한 번 모아 두고, 집계할 때 그 달 몫만 꺼내 쓴다.
   * 저장된 거래 자체는 승인 전액 그대로다 — 카드 파일과 대조해야 하니까.
   */
  const allTx = useMemo(() => {
    if (!ready) return state.transactions;
    const others = stored.filter((m) => m !== month).flatMap((m) => loadMonth(m).transactions);
    return [...others, ...state.transactions];
  }, [ready, stored, month, state.transactions]);

  const summary = useMemo(
    () =>
      summarize(
        state.month,
        spreadForMonth(state.month, allTx),
        buildRevenue(state.month, state.dailySales ?? [], state.bankDeposits ?? [])
      ),
    // 설정(계정과목·고정변동 플래그)이 바뀌면 숫자도 다시 계산되어야 한다.
    // 빠져 있어서 설정을 고쳐도 옛 숫자가 그대로 남아 있었다.
    [state.month, allTx, state.bankDeposits, settings, tick]
  );

  /** 지난달 흐름은 저장된 월들을 그대로 읽어 만든다 */
  const history: History[] = useMemo(() => {
    if (!ready) return [];
    const months = [...new Set([...stored, month])].sort().slice(-6);
    return months.map((m) => {
      const st = m === month ? state : loadMonth(m);
      const s = summarize(m, spreadForMonth(m, allTx), buildRevenue(m, st.dailySales ?? [], st.bankDeposits ?? []));
      return {
        month: m,
        revenue: s.revenue.gross,
        expense: s.expense.total,
        profit: s.operatingProfit,
        primeRatio: s.primeCostRatio,
        feeRatio: s.revenue.feeRate,
      };
    });
  }, [ready, stored, month, state]);

  /** 연간 화면은 저장된 달을 전부 읽는다. 지금 보고 있는 달은 저장 전이라도 반영되게 넘긴다. */
  const yearView = useMemo(() => {
    if (!ready) return null;
    return buildYear(year, { month: state.month, state }, allTx);
  }, [ready, year, state, stored]);

  const years = useMemo(() => {
    if (!ready) return [year];
    return [...new Set([...storedYears(), year])].sort();
  }, [ready, stored, year]);

  // OS가 다크여도 라이트가 기본. 사용자가 고른 값만 기억한다.
  useEffect(() => {
    const saved = window.localStorage.getItem("kimssi-theme");
    if (saved === "dark") document.documentElement.setAttribute("data-theme", "dark");
  }, []);

  /** 전월 — 지표 비교와 고정비 누락 경고에 쓴다 */
  const prev = useMemo(() => {
    const pm = prevMonthOf(month);
    if (!ready) {
      return { month: pm, summary: summarize(pm, [], []), transactions: [], hasData: false };
    }
    const st = loadMonth(pm);
    return {
      month: pm,
      summary: summarize(pm, st.transactions, st.revenue),
      transactions: st.transactions,
      hasData: st.transactions.length > 0 || st.revenue.length > 0,
    };
  }, [month, ready, stored]);

  const update = useCallback((fn: (s: MonthState) => MonthState) => setState((s) => fn(s)), []);

  const goSettlement = useCallback((step?: number) => {
    setView("work");
    setOpenStep(step);
    window.scrollTo({ top: 0 });
  }, []);

  /**
   * 메뉴를 누르면 먼저 달을 고르게 한다.
   * 드롭다운에서 달을 찾는 건 번거롭다 — 열두 칸을 펼쳐 놓고 고른다.
   */
  /** 고르는 화면에 쓸 달별 간추림 */
  const briefs: MonthBrief[] = useMemo(() => {
    if (!ready) return [];
    return Array.from({ length: 12 }, (_, i) => {
      const m = `${year}-${String(i + 1).padStart(2, "0")}`;
      const st = m === month ? state : loadMonth(m);
      const has = st.transactions.length > 0 || (st.bankDeposits ?? []).length > 0 || (st.dailySales ?? []).length > 0;
      if (!has) return { month: m, hasData: false, closed: false, revenue: 0, expense: 0, pending: 0 };
      const s = summarize(
        m,
        spreadForMonth(m, allTx),
        buildRevenue(m, st.dailySales ?? [], st.bankDeposits ?? [])
      );
      return {
        month: m,
        hasData: true,
        closed: st.closed,
        revenue: s.revenue.gross || s.revenue.deposit,
        expense: s.expense.total,
        pending: s.pending.count,
      };
    });
  }, [ready, year, month, state, allTx, tick]);

  const go = (v: View) => {
    setView(v);
    setOpenStep(undefined);
    window.scrollTo({ top: 0 });
  };

  const openMonth = (m: string) => {
    setMonth(m);
    setView("month");
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="shell">
      {/* 사이드바를 걷어내고 상단 바 하나로 합쳤다 — 벤토가 쓸 가로폭을 벌기 위해서다 */}
      <header className="topbar">
        <div className="tb-logo">金</div>
        <div className="tb-mark">김씨육면</div>
        <nav className="tb-nav">
          <button aria-current={view === "year" ? "page" : undefined} onClick={() => go("year")}>대시보드</button>
          <button aria-current={view === "sales" ? "page" : undefined} onClick={() => go("sales")}>매출</button>
          <button aria-current={view === "month" ? "page" : undefined} onClick={() => go("month")}>월 요약</button>
          <button aria-current={view === "work" ? "page" : undefined} onClick={() => go("work")}>월 정산</button>
          <button aria-current={view === "settings" ? "page" : undefined} onClick={() => go("settings")}>설정</button>
        </nav>

        <div className="tb-right">
          <div className="tb-search">
            <span>⌕</span>
            <input placeholder="거래처 · 계정 검색은 다음 단계에 붙습니다" aria-label="검색" disabled />
            <span className="slash">/</span>
          </div>
          <select className="tb-pill" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="정산 월">
            {MONTHS.map((m) => (
              <option key={m} value={m}>
                {`${m.split("-")[0]}년 ${Number(m.split("-")[1])}월`}
                {stored.includes(m) ? " ·" : ""}
              </option>
            ))}
          </select>
          <button
            className="tb-ico"
            title="새로고침 — 저장된 것을 다시 읽습니다"
            onClick={() => {
              const s = loadSettings();
              applySettings(s);
              setSettingsState(s);
              setState(loadMonth(month));
              setStored(listStoredMonths());
              setTick((n) => n + 1);
            }}
          >
            ↻
          </button>
          <button
            className="tb-ico"
            title="이 달 지우기"
            onClick={() => {
              if (confirm(`${month} 데이터를 모두 지웁니다. 계속할까요?`)) setState(newMonthState(month));
            }}
          >
            ⌫
          </button>
          <button
            className="tb-ico"
            title="저장된 모든 달 지우기"
            onClick={() => {
              if (confirm("저장된 모든 달의 데이터를 지웁니다. 되돌릴 수 없습니다. 계속할까요?")) {
                clearAllMonths();
                setState(newMonthState(month));
                setStored([]);
              }
            }}
          >
            ⎚
          </button>
          <button
            className="tb-ico"
            title="테마 전환"
            onClick={() => {
              const r = document.documentElement;
              const next = r.getAttribute("data-theme") === "dark" ? "light" : "dark";
              r.setAttribute("data-theme", next);
              try {
                localStorage.setItem("kimssi-theme", next);
              } catch {
                /* 저장 실패가 화면을 막지 않는다 */
              }
            }}
          >
            ◐
          </button>
          <div className="tb-av" title="지영 · 김씨육면">지영</div>
        </div>
      </header>

      {/* 달은 메뉴 아래 줄에 붙인다. 드롭다운에서 찾는 것보다 눌러서 오가는 게 빠르다 */}
      {(view === "sales" || view === "month" || view === "work") && (
        <MonthBar
          year={year}
          years={years.length ? years : [year]}
          month={month}
          months={briefs}
          onYear={setYear}
          onPick={(m) => {
            setMonth(m);
            window.scrollTo({ top: 0 });
          }}
        />
      )}

      <div style={{ minWidth: 0 }}>
        {view === "sales" ? (
          <SalesView
            state={state}
            update={update}
            months={stored}
            loadSales={(m) => (m === month ? (state.dailySales ?? []) : (loadMonth(m).dailySales ?? []))}
          />
        ) : view === "settings" && settings ? (
          <SettingsView
            settings={settings}
            onChange={setSettingsState}
            onReloadMonth={() => {
              setState(loadMonth(month));
              setStored(listStoredMonths());
            }}
          />
        ) : view === "work" ? (
          <Settlement state={state} update={update} summary={summary} openStep={openStep} refreshKey={tick} />
        ) : view === "month" ? (
          <Dashboard
            summary={summary}
            transactions={state.transactions}
            history={history}
            prev={prev}
            onGoSettlement={goSettlement}
          />
        ) : yearView ? (
          <YearDashboard
            view={yearView}
            years={years}
            onYear={setYear}
            onOpenMonth={openMonth}
            onGoSettlement={() => goSettlement(1)}
          />
        ) : (
          // 브라우저 저장소를 읽기 전(서버 렌더). 월 정산으로 떨어지면 안 된다.
          <main className="work">
            <div className="greet">
              <h1>{year}년</h1>
              <p>불러오는 중입니다.</p>
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
