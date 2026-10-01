"use client";

import { useState } from "react";
import { useData } from "@/components/DataProvider";
import DayEditor from "@/components/DayEditor";
import { calcWeek, fmtDiffMin, fmtHM, fmtWon, type DayCalc } from "@/lib/calc";
import { addDays, dayKeyOf, mondayOf, shortDate, todayISO } from "@/lib/dates";
import { DAY_LABEL, PAY_LABEL, type Employee, type Store } from "@/lib/types";

const STATUS: Record<DayCalc["status"], { label: string; cls: string }> = {
  off: { label: "휴", cls: "text-muted" },
  planned: { label: "예정대로", cls: "text-muted" },
  absent: { label: "결근", cls: "bg-accent-soft text-accent" },
  ok: { label: "실제 입력", cls: "bg-ok-soft text-ok" },
  "needs-decision": { label: "확인 필요", cls: "bg-warn-soft text-warn" },
  accepted: { label: "인정", cls: "bg-ok-soft text-ok" },
  adjusted: { label: "조정", cls: "bg-info-soft text-info" },
  incomplete: { label: "미입력", cls: "bg-warn-soft text-warn" },
  error: { label: "확인", cls: "bg-accent-soft text-accent" },
};

export default function WeekBoard({ store }: { store: Store }) {
  const { employees, records, loaded, settings } = useData();
  const [monday, setMonday] = useState(() => mondayOf(todayISO()));
  const [editing, setEditing] = useState<{ emp: Employee; date: string } | null>(null);

  if (!loaded) return <p className="text-muted">불러오는 중…</p>;
  const staff = employees.filter((e) => e.store === store);
  const today = todayISO();

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold">주간 근무표</h2>
        <div className="ml-auto flex items-center gap-1">
          <button className="btn-ghost btn-sm" onClick={() => setMonday(addDays(monday, -7))}>◀ 지난주</button>
          <button className="btn-ghost btn-sm" onClick={() => setMonday(mondayOf(today))}>이번 주</button>
          <button className="btn-ghost btn-sm" onClick={() => setMonday(addDays(monday, 7))}>다음 주 ▶</button>
        </div>
        <div className="w-full text-sm text-muted sm:w-auto">
          {shortDate(monday)}(월) ~ {shortDate(addDays(monday, 6))}(일)
        </div>
      </div>

      {staff.length === 0 && <p className="text-muted">이 매장에 직원이 없어요. 직원 명단에서 추가해 주세요.</p>}

      {staff.map((emp) => {
        const w = calcWeek(emp, monday, records);
        return (
          <div key={emp.id} className="card space-y-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-lg font-bold">{emp.alias}</span>
              <span className="text-sm text-muted">{emp.role} · {PAY_LABEL[emp.payCycle]} · 시급 {emp.wage.toLocaleString()}원</span>
              {w.pending > 0 && <span className="chip bg-warn-soft text-warn">확인 필요 {w.pending}일</span>}
              {emp.wage < settings.minWage && <span className="chip bg-accent-soft text-accent">최저시급 미만</span>}
            </div>

            <div className="overflow-x-auto rounded-md border border-line">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-bg text-xs text-muted">
                  <tr>
                    <th className="px-2 py-2 text-left">날짜</th>
                    <th className="px-2 py-2 text-left">예정</th>
                    <th className="px-2 py-2 text-left">실제</th>
                    <th className="px-2 py-2 text-right">차이</th>
                    <th className="px-2 py-2 text-right">실근무</th>
                    <th className="px-2 py-2 text-left">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {w.days.map((d) => {
                    const r = d.record;
                    const samePlan = r?.kind === "work" && d.plan && r.start === d.plan.start && r.end === d.plan.end && (r.breakMin ?? d.plan.breakMin) === d.plan.breakMin;
                    const st = samePlan ? { label: "예정대로 확정", cls: "bg-ok-soft text-ok" } : STATUS[d.status];
                    const actual =
                      r?.kind === "absent" ? "—" :
                      r?.start && r?.end ? `${r.start}–${r.end}${r.breakMin !== undefined && r.breakMin !== d.plan?.breakMin ? ` · 휴게 ${r.breakMin}분` : ""}` :
                      d.plan ? "(예정과 같음)" : "";
                    const paid = d.status === "adjusted" && r?.adjStart && r?.adjEnd ? `→ ${r.adjStart}–${r.adjEnd}` : "";
                    const diffTotal = d.diffEndMin - d.diffStartMin;
                    const isToday = d.date === today;
                    return (
                      <tr
                        key={d.date}
                        className={`cursor-pointer border-t border-line hover:bg-bg ${d.status === "needs-decision" || d.status === "incomplete" ? "bg-warn-soft/40" : ""} ${isToday ? "font-semibold" : ""}`}
                        onClick={() => setEditing({ emp, date: d.date })}
                      >
                        <td className="whitespace-nowrap px-2 py-2">
                          {shortDate(d.date)} <span className="text-muted">({DAY_LABEL[dayKeyOf(d.date)]})</span>
                          {isToday && <span className="ml-1 chip bg-ink text-surface">오늘</span>}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 num text-muted">{d.plan ? `${d.plan.start}–${d.plan.end}` : "휴"}</td>
                        <td className="whitespace-nowrap px-2 py-2 num">
                          {actual} {paid && <span className="text-info">{paid}</span>}
                          {r?.reason && <span className="ml-1 text-xs text-muted">· {r.reason}</span>}
                        </td>
                        <td className={`whitespace-nowrap px-2 py-2 text-right num ${diffTotal !== 0 && r?.kind === "work" && r.start ? "font-semibold text-warn" : "text-muted"}`}>
                          {r?.kind === "work" && r.start && d.plan ? fmtDiffMin(diffTotal) : "—"}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-right num">
                          {d.status === "off" ? "" : d.status === "needs-decision" || d.status === "incomplete" || d.status === "error" ? <span className="text-warn">?</span> : fmtHM(d.paidMin)}
                        </td>
                        <td className="px-2 py-2">
                          <span className={`chip ${st.cls}`}>{st.label}</span>
                          {d.error && <span className="ml-1 text-xs text-accent">{d.error}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {editing?.emp.id === emp.id && (
              <DayEditor emp={emp} date={editing.date} onClose={() => setEditing(null)} />
            )}

            <WeekSummary w={w} />
          </div>
        );
      })}
      <p className="text-xs text-muted">날짜 줄을 누르면 실제 출퇴근·결근·대체 근무를 넣을 수 있어요. 예정과 10분 이상 다르면 노란색으로 표시되고, 사장님이 인정/조정을 골라야 급여에 들어갑니다.</p>
    </section>
  );
}

export function WeekSummary({ w }: { w: ReturnType<typeof calcWeek> }) {
  return (
    <div className="grid gap-2 rounded-md bg-bg p-3 text-sm sm:grid-cols-5">
      <Stat label="주 실근무" value={fmtHM(w.paidMin)} sub={w.diffMin !== 0 ? `예정 대비 ${fmtDiffMin(w.diffMin)}` : `예정 ${fmtHM(w.plannedMin)}`} warn={w.diffMin !== 0} />
      <Stat label="기본급" value={fmtWon(w.basePay)} sub={w.diffPay !== 0 ? `예정 대비 ${w.diffPay > 0 ? "+" : "−"}${fmtWon(Math.abs(w.diffPay))}` : undefined} warn={w.diffPay !== 0} />
      <Stat
        label="주휴수당"
        value={w.holidayEligible ? fmtWon(w.holidayPay) : "없음"}
        sub={w.holidayEligible ? `${fmtHM(w.holidayMin)} (소정시간 기준)` : w.hasAbsent ? "결근 있음" : "주 15시간 미만"}
      />
      <Stat label="주 세전 합계" value={fmtWon(w.total)} strong />
      {w.pending > 0 ? (
        <Stat label="상태" value={`확인 필요 ${w.pending}일`} warn />
      ) : (
        <Stat label="상태" value="계산 완료" />
      )}
    </div>
  );
}

function Stat({ label, value, sub, warn, strong }: { label: string; value: string; sub?: string; warn?: boolean; strong?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className={`num ${strong ? "text-lg font-bold text-accent" : "font-semibold"} ${warn && !strong ? "text-warn" : ""}`}>{value}</div>
      {sub && <div className={`text-xs ${warn ? "text-warn" : "text-muted"}`}>{sub}</div>}
    </div>
  );
}
