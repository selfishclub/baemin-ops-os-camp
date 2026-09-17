"use client";

import { useState } from "react";
import { useData } from "@/components/DataProvider";
import { fmtHM, workMinutes } from "@/lib/calc";
import { DAY_KEYS, DAY_LABEL, PAY_LABEL, STORE_LABEL, type DayKey, type DayPlan, type Employee } from "@/lib/types";

const EMPTY: Employee = { id: "", alias: "", store: "hall", role: "", wage: 10320, payCycle: "weekly", plan: {} };

export default function StaffPage() {
  const { employees, loaded, settings } = useData();
  const [editing, setEditing] = useState<Employee | null>(null);

  if (!loaded) return <p className="text-muted">불러오는 중…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">직원 명단</h1>
        <button className="btn-primary" onClick={() => setEditing({ ...EMPTY, id: `emp_${Date.now()}` })}>
          + 직원 추가
        </button>
      </div>

      {editing && <EmployeeForm initial={editing} onClose={() => setEditing(null)} />}

      <div className="grid gap-3 sm:grid-cols-2">
        {employees.map((e) => {
          const weekly = DAY_KEYS.reduce((s, k) => {
            const p = e.plan[k];
            return p ? s + Math.max(0, workMinutes(p.start, p.end, p.breakMin).min) : s;
          }, 0);
          const low = e.wage < settings.minWage;
          return (
            <div key={e.id} className="card space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-lg font-bold">{e.alias}</div>
                  <div className="text-sm text-muted">
                    {STORE_LABEL[e.store]} · {e.role || "자리 미정"} · {PAY_LABEL[e.payCycle]}
                  </div>
                </div>
                <button className="btn-ghost btn-sm" onClick={() => setEditing(e)}>수정</button>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <span className="num">시급 {e.wage.toLocaleString()}원{low && <span className="ml-1 font-semibold text-accent">최저시급 미만</span>}</span>
                <span className="num">주 예정 {fmtHM(weekly)}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {DAY_KEYS.map((k) => {
                  const p = e.plan[k];
                  return (
                    <span key={k} className={`chip ${p ? "bg-info-soft text-info" : "bg-bg text-muted"}`}>
                      {DAY_LABEL[k]} {p ? `${p.start}–${p.end}` : "휴"}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {employees.length === 0 && <p className="text-muted">직원이 없어요. "직원 추가"를 눌러 주세요.</p>}
    </div>
  );
}

function EmployeeForm({ initial, onClose }: { initial: Employee; onClose: () => void }) {
  const { saveEmployee, deleteEmployee, employees, settings } = useData();
  const isNew = !employees.some((e) => e.id === initial.id);
  const [e, setE] = useState<Employee>(initial);
  const [err, setErr] = useState("");

  const setPlan = (k: DayKey, p: DayPlan | undefined) =>
    setE((x) => {
      const plan = { ...x.plan };
      if (p) plan[k] = p;
      else delete plan[k];
      return { ...x, plan };
    });

  const submit = () => {
    if (!e.alias.trim()) return setErr("별칭을 적어 주세요 (실명 말고 A, B처럼)");
    if (!e.wage || e.wage <= 0) return setErr("시급을 적어 주세요");
    for (const k of DAY_KEYS) {
      const p = e.plan[k];
      if (!p) continue;
      const w = workMinutes(p.start, p.end, p.breakMin);
      if (w.error) return setErr(`${DAY_LABEL[k]}요일: ${w.error}`);
    }
    saveEmployee({ ...e, alias: e.alias.trim(), role: e.role.trim() });
    onClose();
  };

  return (
    <div className="card space-y-4 border-info">
      <div className="text-lg font-bold">{isNew ? "직원 추가" : `${initial.alias} 수정`}</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">별칭 (실명 대신)</label>
          <input className="input" value={e.alias} onChange={(ev) => setE({ ...e, alias: ev.target.value })} placeholder="예: 가상 직원 D" />
        </div>
        <div>
          <label className="label">자리</label>
          <input className="input" value={e.role} onChange={(ev) => setE({ ...e, role: ev.target.value })} placeholder="예: 오전 주방" />
        </div>
        <div>
          <label className="label">사업장</label>
          <select className="input" value={e.store} onChange={(ev) => setE({ ...e, store: ev.target.value as Employee["store"] })}>
            <option value="hall">홀</option>
            <option value="delivery">배달</option>
          </select>
        </div>
        <div>
          <label className="label">지급 주기</label>
          <select className="input" value={e.payCycle} onChange={(ev) => setE({ ...e, payCycle: ev.target.value as Employee["payCycle"] })}>
            <option value="weekly">주급</option>
            <option value="monthly">월급</option>
          </select>
        </div>
        <div>
          <label className="label">시급 (원)</label>
          <input className="input num" type="number" inputMode="numeric" value={e.wage} onChange={(ev) => setE({ ...e, wage: Number(ev.target.value) })} />
          {e.wage > 0 && e.wage < settings.minWage && (
            <p className="mt-1 text-sm font-semibold text-accent">최저시급 {settings.minWage.toLocaleString()}원보다 낮아요 (저장은 됩니다)</p>
          )}
        </div>
      </div>

      <div>
        <div className="label">요일별 기본 근무 (예정) — 체크한 요일만 근무</div>
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="w-full min-w-[440px] text-sm">
            <thead className="bg-bg text-xs text-muted">
              <tr>
                <th className="px-2 py-2 text-left">요일</th>
                <th className="px-2 py-2 text-left">출근</th>
                <th className="px-2 py-2 text-left">퇴근</th>
                <th className="px-2 py-2 text-left">휴게(분)</th>
                <th className="px-2 py-2 text-right">실근무</th>
              </tr>
            </thead>
            <tbody>
              {DAY_KEYS.map((k) => {
                const p = e.plan[k];
                const w = p ? workMinutes(p.start, p.end, p.breakMin) : null;
                return (
                  <tr key={k} className="border-t border-line">
                    <td className="px-2 py-1">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" className="h-5 w-5" checked={!!p} onChange={(ev) => setPlan(k, ev.target.checked ? { start: "09:00", end: "18:00", breakMin: 30 } : undefined)} />
                        {DAY_LABEL[k]}
                      </label>
                    </td>
                    <td className="px-2 py-1"><input type="time" className="input min-h-9" disabled={!p} value={p?.start ?? ""} onChange={(ev) => p && setPlan(k, { ...p, start: ev.target.value })} /></td>
                    <td className="px-2 py-1"><input type="time" className="input min-h-9" disabled={!p} value={p?.end ?? ""} onChange={(ev) => p && setPlan(k, { ...p, end: ev.target.value })} /></td>
                    <td className="px-2 py-1"><input type="number" inputMode="numeric" className="input min-h-9 w-20 num" disabled={!p} value={p?.breakMin ?? ""} onChange={(ev) => p && setPlan(k, { ...p, breakMin: Number(ev.target.value) })} /></td>
                    <td className={`px-2 py-1 text-right num ${w?.error ? "text-accent" : ""}`}>{w ? (w.error ? "확인" : fmtHM(w.min)) : "휴"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {err && <p className="text-sm font-semibold text-accent">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" onClick={submit}>저장</button>
        <button className="btn-ghost" onClick={onClose}>취소</button>
        {!isNew && (
          <button
            className="btn-ghost ml-auto text-accent"
            onClick={() => {
              if (confirm(`${initial.alias}을(를) 명단에서 지울까요? 근무 기록은 남습니다.`)) {
                deleteEmployee(initial.id);
                onClose();
              }
            }}
          >
            명단에서 삭제
          </button>
        )}
      </div>
    </div>
  );
}
