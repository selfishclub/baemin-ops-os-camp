"use client";

import { shortWon } from "./ui";

export interface MonthBrief {
  month: string;
  hasData: boolean;
  closed: boolean;
  revenue: number;
  expense: number;
  pending: number;
}

/**
 * 메뉴 바로 아래 붙는 달 줄.
 * 드롭다운을 열어 달을 찾는 것보다 눌러서 오가는 쪽이 빠르다.
 * 자료가 있는 달은 금액이 같이 보여, 어디를 손봐야 하는지 눈에 들어온다.
 */
export function MonthBar({
  year,
  years,
  month,
  months,
  onYear,
  onPick,
}: {
  year: number;
  /** 자료가 있는 해 — 쌓이면 늘어난다 */
  years: number[];
  month: string;
  months: MonthBrief[];
  onYear: (y: number) => void;
  onPick: (month: string) => void;
}) {
  return (
    <div className="monthbar">
      {years.length > 1 ? (
        <div className="yrs">
          {years.map((y) => (
            <button key={y} className="yr" aria-pressed={y === year} onClick={() => onYear(y)}>
              {y}
            </button>
          ))}
        </div>
      ) : (
        <span className="yrlab">{year}년</span>
      )}

      <div className="mos">
        {months.map((m) => {
          const n = Number(m.month.slice(5));
          const on = m.month === month;
          return (
            <button
              key={m.month}
              className={`mo${on ? " on" : ""}${m.hasData ? " has" : ""}`}
              aria-current={on ? "page" : undefined}
              onClick={() => onPick(m.month)}
              title={
                m.hasData
                  ? `매출 ${shortWon(m.revenue)} · 비용 ${shortWon(m.expense)}${m.pending ? ` · 확정 전 ${m.pending}건` : m.closed ? " · 마감" : ""}`
                  : "아직 비어 있습니다"
              }
            >
              <span className="n">{n}월</span>
              {m.hasData && <span className="v num">{shortWon(m.revenue || m.expense)}</span>}
              {m.pending > 0 && <i className="dot" aria-label={`확정 전 ${m.pending}건`} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
