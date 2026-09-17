"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Dashboard, type History } from "@/components/Dashboard";
import { Settlement } from "@/components/Settlement";
import { SettingsView } from "@/components/SettingsView";
import { YearDashboard } from "@/components/YearDashboard";
import { prevMonthOf } from "@/lib/fixedTemplate";
import { applySettings, loadSettings, type Settings } from "@/lib/settings";
import { buildYear, storedYears } from "@/lib/year";
import { clearAllMonths, listStoredMonths, loadMonth, newMonthState, saveMonth, type MonthState } from "@/lib/store";
import { summarize } from "@/lib/summary";

const MONTHS = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`);
const DEFAULT_MONTH = "2026-08";

type View = "year" | "month" | "work" | "settings";

export default function Page() {
  const [month, setMonth] = useState(DEFAULT_MONTH);
  const [state, setState] = useState<MonthState>(() => newMonthState(DEFAULT_MONTH));
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>("year");
  const [year, setYear] = useState(Number(DEFAULT_MONTH.slice(0, 4)));
  const [openStep, setOpenStep] = useState<number | undefined>();
  const [stored, setStored] = useState<string[]>([]);
  const [settings, setSettingsState] = useState<Settings | null>(null);

  // 계정과목·고정비 설정을 레지스트리에 먼저 올려야 드롭다운과 집계가 맞는다
  useEffect(() => {
    const s = loadSettings();
    applySettings(s);
    setSettingsState(s);
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

  const summary = useMemo(
    () => summarize(state.month, state.transactions, state.revenue),
    [state.month, state.transactions, state.revenue]
  );

  /** 지난달 흐름은 저장된 월들을 그대로 읽어 만든다 */
  const history: History[] = useMemo(() => {
    if (!ready) return [];
    const months = [...new Set([...stored, month])].sort().slice(-6);
    return months.map((m) => {
      const st = m === month ? state : loadMonth(m);
      const s = summarize(m, st.transactions, st.revenue);
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
    return buildYear(year, { month: state.month, state });
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
      <aside className="side">
        <div className="logo">
          <div className="box">🍜</div>
          <div>
            <div className="tt">김씨육면</div>
            <div className="st">월말 정산·손익관리</div>
          </div>
        </div>

        <div className="navgrp">
          <div className="lab">정산</div>
          <button className="nav" aria-current={view === "year" ? "page" : undefined} onClick={() => go("year")}>
            <span className="ic">◲</span>대시보드<span className="ch">›</span>
          </button>
          <button className="nav" aria-current={view === "month" ? "page" : undefined} onClick={() => go("month")}>
            <span className="ic">◷</span>월 요약<span className="ch">›</span>
          </button>
          <button className="nav" aria-current={view === "work" ? "page" : undefined} onClick={() => go("work")}>
            <span className="ic">✓</span>월 정산<span className="ch">›</span>
          </button>
        </div>

        <div className="navgrp">
          <div className="lab">설정</div>
          <button className="nav" aria-current={view === "settings" ? "page" : undefined} onClick={() => go("settings")}>
            <span className="ic">▤</span>계정과목 · 고정비<span className="ch">›</span>
          </button>
        </div>

        <div className="helpcard">
          <div className="hi">{state.closed ? "✓" : "!"}</div>
          <h4>{`${Number(month.split("-")[1])}월, ${state.closed ? "마감됨" : "마감 전"}`}</h4>
          <p>
            {summary.reviewCount
              ? `검수 ${summary.reviewCount}건이 남아 있습니다. 처리하면 영업이익이 다시 움직입니다.`
              : state.transactions.length
                ? "검수할 건이 없습니다. 매출까지 넣으면 마감할 수 있습니다."
                : "카드 파일을 올리면 여기부터 채워집니다."}
          </p>
          <button onClick={() => goSettlement(summary.reviewCount ? 3 : 1)}>
            {summary.reviewCount ? "검수하러 가기" : "월 정산 열기"}
          </button>
        </div>
      </aside>

      <div style={{ minWidth: 0 }}>
        <header className="head">
          <div className="search">
            <span style={{ color: "var(--muted)", fontSize: 13 }}>⌕</span>
            <input id="q" placeholder="거래처 · 계정 검색은 다음 단계에 붙습니다" aria-label="검색" disabled />
          </div>
          <div className="hright">
            <select className="mselect" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="정산 월">
              {MONTHS.map((m) => (
                <option key={m} value={m}>
                  {`${m.split("-")[0]}년 ${Number(m.split("-")[1])}월`}
                  {stored.includes(m) ? " ·" : ""}
                </option>
              ))}
            </select>
            <button
              className="iconbtn"
              title="이 달 지우기"
              onClick={() => {
                if (confirm(`${month} 데이터를 모두 지웁니다. 계속할까요?`)) setState(newMonthState(month));
              }}
            >
              ⌫
            </button>
            <button
              className="iconbtn"
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
              className="iconbtn"
              title="테마 전환"
              onClick={() => {
                const r = document.documentElement;
                const next = r.getAttribute("data-theme") === "dark" ? "light" : "dark";
                r.setAttribute("data-theme", next);
                window.localStorage.setItem("kimssi-theme", next);
              }}
            >
              ◐
            </button>
            <div className="prof">
              <div className="av">지영</div>
              <div className="txt">
                <div className="nm">지영</div>
                <div className="rl">김씨육면</div>
              </div>
            </div>
          </div>
        </header>

        {view === "settings" && settings ? (
          <SettingsView
            settings={settings}
            onChange={setSettingsState}
            onReloadMonth={() => {
              setState(loadMonth(month));
              setStored(listStoredMonths());
            }}
          />
        ) : view === "work" ? (
          <Settlement state={state} update={update} summary={summary} openStep={openStep} />
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
