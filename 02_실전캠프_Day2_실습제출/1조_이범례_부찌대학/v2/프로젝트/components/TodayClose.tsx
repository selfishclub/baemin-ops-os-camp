"use client";

import { useState } from "react";
import { useData } from "@/components/DataProvider";
import DayEditor from "@/components/DayEditor";
import { calcDay } from "@/lib/calc";
import { addDays, dayKeyOf, shortDate, todayISO } from "@/lib/dates";
import { DAY_LABEL, type DayRecord, type Employee, type Store } from "@/lib/types";

/** 오늘 마감: 예정과 다른 사람만 고치고, 나머지는 한 번에 "예정대로" 확정 */
export default function TodayClose({ store }: { store: Store }) {
  const { employees, records, loaded, upsertRecords } = useData();
  const [date, setDate] = useState(todayISO);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [subId, setSubId] = useState("");

  if (!loaded) return null;
  const staff = employees.filter((e) => e.store === store);
  const key = dayKeyOf(date);
  const isToday = date === todayISO();

  // 오늘 예정자 + 예정은 없지만 기록이 있는 사람(대체 근무)
  const rows = staff
    .map((emp) => {
      const plan = emp.plan[key];
      const rec = records.find((r) => r.employeeId === emp.id && r.date === date);
      return { emp, plan, rec, calc: calcDay(date, plan, rec) };
    })
    .filter((r) => r.plan || r.rec);
  const offToday = staff.filter((e) => !e.plan[key] && !records.some((r) => r.employeeId === e.id && r.date === date));

  const unconfirmed = rows.filter((r) => r.plan && !r.rec);
  const confirmAll = () => {
    const rs: DayRecord[] = unconfirmed.map(({ emp, plan }) => ({
      id: `${emp.id}_${date}`, employeeId: emp.id, date, kind: "work",
      start: plan!.start, end: plan!.end, breakMin: plan!.breakMin, confirmed: true,
    }));
    upsertRecords(rs);
  };

  const statusText = (r: (typeof rows)[number]) => {
    if (!r.rec) return { t: "아직 확정 전", c: "text-muted" };
    if (r.rec.kind === "absent") return { t: "결근", c: "text-accent font-semibold" };
    if (r.calc.status === "needs-decision" || r.calc.status === "incomplete") return { t: "확인 필요", c: "text-warn font-semibold" };
    if (r.calc.status === "error") return { t: r.calc.error ?? "확인", c: "text-accent font-semibold" };
    const same = r.plan && r.rec.start === r.plan.start && r.rec.end === r.plan.end && (r.rec.breakMin ?? r.plan.breakMin) === r.plan.breakMin;
    if (same) return { t: "예정대로 확정", c: "text-ok font-semibold" };
    return { t: `${r.rec.start}–${r.rec.end} ${r.calc.status === "adjusted" ? "(조정)" : "(인정)"}`, c: "text-ok font-semibold" };
  };

  return (
    <section className="card space-y-3 border-ink">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold">{isToday ? "오늘 마감" : "마감"}</h2>
        <div className="ml-auto flex items-center gap-1">
          <button className="btn-ghost btn-sm" onClick={() => setDate(addDays(date, -1))}>◀</button>
          <span className="num px-1 text-sm font-semibold">
            {shortDate(date)} ({DAY_LABEL[key]}){isToday ? " · 오늘" : ""}
          </span>
          <button className="btn-ghost btn-sm" onClick={() => setDate(addDays(date, 1))}>▶</button>
          {!isToday && <button className="btn-ghost btn-sm" onClick={() => setDate(todayISO())}>오늘</button>}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted">이 날은 근무 예정인 직원이 없어요.</p>
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line">
          {rows.map((r) => {
            const s = statusText(r);
            return (
              <li key={r.emp.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <span className="font-semibold">{r.emp.alias}</span>
                <span className="num text-sm text-muted">{r.plan ? `${r.plan.start}–${r.plan.end}` : "대체 근무"}</span>
                <span className={`text-sm ${s.c}`}>{s.t}</span>
                <button className="btn-ghost btn-sm ml-auto" onClick={() => setEditing(r.emp)}>
                  {r.rec ? "고치기" : "다르게"}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {editing && <DayEditor emp={editing} date={date} onClose={() => setEditing(null)} />}

      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary" disabled={unconfirmed.length === 0} onClick={confirmAll}>
          {unconfirmed.length === 0 ? "모두 확정됨" : `나머지 ${unconfirmed.length}명 예정대로 확정`}
        </button>
        {offToday.length > 0 && (
          <div className="ml-auto flex items-center gap-1">
            <select className="input min-h-9 w-auto" value={subId} onChange={(e) => setSubId(e.target.value)}>
              <option value="">대체 근무자 고르기</option>
              {offToday.map((e) => (
                <option key={e.id} value={e.id}>{e.alias}</option>
              ))}
            </select>
            <button
              className="btn-ghost btn-sm"
              disabled={!subId}
              onClick={() => {
                const emp = staff.find((e) => e.id === subId);
                if (emp) setEditing(emp);
                setSubId("");
              }}
            >
              대체 근무 추가
            </button>
          </div>
        )}
      </div>
      <p className="text-xs text-muted">예정과 다른 사람만 "다르게"로 고치고, 나머지는 버튼 하나로 확정하세요. 확정하지 않아도 급여 계산은 예정 시간으로 됩니다.</p>
    </section>
  );
}
