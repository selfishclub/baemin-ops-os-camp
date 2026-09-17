"use client";

import { useState } from "react";
import { useData } from "@/components/DataProvider";
import { calcDay, DIFF_THRESHOLD_MIN, fmtDiffMin, toMin } from "@/lib/calc";
import { dayKeyOf, shortDate } from "@/lib/dates";
import { DAY_LABEL, type DayRecord, type Employee } from "@/lib/types";

/** 하루 칸 편집: 실제 출퇴근·휴게, 결근, 인정/조정 */
export default function DayEditor({ emp, date, onClose }: { emp: Employee; date: string; onClose: () => void }) {
  const { records, upsertRecord, removeRecord } = useData();
  const plan = emp.plan[dayKeyOf(date)];
  const existing = records.find((r) => r.employeeId === emp.id && r.date === date);
  const id = `${emp.id}_${date}`;

  const [rec, setRec] = useState<DayRecord>(
    existing ?? {
      id, employeeId: emp.id, date, kind: "work",
      start: plan?.start ?? "", end: plan?.end ?? "", breakMin: plan?.breakMin ?? 30,
    },
  );
  const [err, setErr] = useState("");

  const calc = calcDay(date, plan, rec);
  const big =
    rec.kind === "work" && rec.start && rec.end &&
    (!plan || Math.abs(toMin(rec.start) - toMin(plan.start)) >= DIFF_THRESHOLD_MIN || Math.abs(toMin(rec.end) - toMin(plan.end)) >= DIFF_THRESHOLD_MIN);

  const save = () => {
    if (rec.kind === "work") {
      if (!rec.start || !rec.end || rec.breakMin === undefined || Number.isNaN(rec.breakMin)) return setErr("출근·퇴근·휴게시간을 모두 넣어 주세요");
      if (big && !rec.decision) return setErr(`예정과 ${DIFF_THRESHOLD_MIN}분 이상 달라요. 인정 또는 조정을 골라 주세요`);
      if (big && rec.decision === "adjusted" && (!rec.adjStart || !rec.adjEnd || !rec.reason?.trim())) return setErr("조정 시각과 사유를 적어 주세요");
      if (calc.error) return setErr(calc.error);
    }
    const clean: DayRecord = { ...rec, confirmed: true };
    if (!big) { delete clean.decision; delete clean.adjStart; delete clean.adjEnd; delete clean.reason; }
    if (clean.kind === "absent") { delete clean.start; delete clean.end; delete clean.breakMin; delete clean.decision; }
    upsertRecord(clean);
    onClose();
  };

  return (
    <div className="card space-y-3 border-info bg-info-soft/30">
      <div className="flex items-center justify-between">
        <div className="font-bold">
          {emp.alias} · {shortDate(date)} ({DAY_LABEL[dayKeyOf(date)]})
        </div>
        <button className="btn-ghost btn-sm" onClick={onClose}>닫기</button>
      </div>

      <div className="text-sm text-muted">
        예정: {plan ? `${plan.start}–${plan.end} · 휴게 ${plan.breakMin}분` : "쉬는 날 (대체 근무로 추가)"}
      </div>

      <div className="flex flex-wrap gap-2">
        <button className={rec.kind === "work" ? "btn-primary btn-sm" : "btn-ghost btn-sm"} onClick={() => setRec({ ...rec, kind: "work" })}>근무</button>
        {plan && (
          <button className={rec.kind === "absent" ? "btn-primary btn-sm" : "btn-ghost btn-sm"} onClick={() => setRec({ ...rec, kind: "absent" })}>결근</button>
        )}
        {existing && plan && (
          <button className="btn-ghost btn-sm ml-auto" onClick={() => { removeRecord(id); onClose(); }}>예정대로 (기록 지우기)</button>
        )}
      </div>

      {rec.kind === "work" && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="label">실제 출근</label>
              <input type="time" className="input" value={rec.start ?? ""} onChange={(e) => setRec({ ...rec, start: e.target.value, decision: undefined })} />
              {plan && rec.start && <Diff min={toMin(rec.start) - toMin(plan.start)} late />}
            </div>
            <div>
              <label className="label">실제 퇴근</label>
              <input type="time" className="input" value={rec.end ?? ""} onChange={(e) => setRec({ ...rec, end: e.target.value, decision: undefined })} />
              {plan && rec.end && <Diff min={toMin(rec.end) - toMin(plan.end)} />}
            </div>
            <div>
              <label className="label">휴게(분)</label>
              <input type="number" inputMode="numeric" className="input num" value={rec.breakMin ?? ""} onChange={(e) => setRec({ ...rec, breakMin: Number(e.target.value) })} />
            </div>
          </div>

          {big && (
            <div className="rounded-md border border-warn/40 bg-warn-soft p-3 text-sm">
              <div className="mb-2 font-semibold text-warn">예정과 {DIFF_THRESHOLD_MIN}분 이상 달라요 — 어떻게 할까요?</div>
              <div className="flex flex-wrap gap-2">
                <button className={rec.decision === "accepted" ? "btn-primary btn-sm" : "btn-ghost btn-sm"} onClick={() => setRec({ ...rec, decision: "accepted" })}>
                  인정 (실제 시간대로)
                </button>
                <button className={rec.decision === "adjusted" ? "btn-primary btn-sm" : "btn-ghost btn-sm"} onClick={() => setRec({ ...rec, decision: "adjusted", adjStart: rec.adjStart ?? plan?.start ?? rec.start, adjEnd: rec.adjEnd ?? plan?.end ?? rec.end })}>
                  조정 (시간을 바꿔서)
                </button>
              </div>
              {rec.decision === "adjusted" && (
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div>
                    <label className="label">인정할 출근</label>
                    <input type="time" className="input" value={rec.adjStart ?? ""} onChange={(e) => setRec({ ...rec, adjStart: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">인정할 퇴근</label>
                    <input type="time" className="input" value={rec.adjEnd ?? ""} onChange={(e) => setRec({ ...rec, adjEnd: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">사유 (필수)</label>
                    <input className="input" value={rec.reason ?? ""} placeholder="예: 개인 용무로 일찍 옴" onChange={(e) => setRec({ ...rec, reason: e.target.value })} />
                  </div>
                </div>
              )}
            </div>
          )}
          {rec.decision === "accepted" && (
            <div>
              <label className="label">메모 (선택)</label>
              <input className="input" value={rec.reason ?? ""} placeholder="예: 마감 정리" onChange={(e) => setRec({ ...rec, reason: e.target.value })} />
            </div>
          )}
        </>
      )}

      {rec.kind === "absent" && <p className="text-sm text-muted">결근으로 저장하면 그날은 0시간, 그 주 주휴수당은 0원이 됩니다.</p>}

      {(err || calc.error) && <p className="text-sm font-semibold text-accent">{err || calc.error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary" onClick={save}>저장</button>
        <button className="btn-ghost" onClick={onClose}>취소</button>
      </div>
    </div>
  );
}

function Diff({ min, late }: { min: number; late?: boolean }) {
  if (min === 0) return <p className="mt-1 text-xs text-muted">예정과 같음</p>;
  return (
    <p className={`mt-1 text-xs font-semibold ${Math.abs(min) >= DIFF_THRESHOLD_MIN ? "text-warn" : "text-muted"}`}>
      {fmtDiffMin(min)} {late ? (min > 0 ? "늦게 출근" : "일찍 출근") : min > 0 ? "늦게 퇴근" : "일찍 퇴근"}
    </p>
  );
}
