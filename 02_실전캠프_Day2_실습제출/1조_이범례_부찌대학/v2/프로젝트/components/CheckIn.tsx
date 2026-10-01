"use client";

import { useState } from "react";
import { useData } from "@/components/DataProvider";
import { todayISO } from "@/lib/dates";
import { STORE_LABEL, type DayRecord, type Store } from "@/lib/types";

const pad = (n: number) => String(n).padStart(2, "0");
const nowHM = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** v2 — 매장 QR 출퇴근: 직원이 본인 폰으로 이름을 고르고 출근/퇴근을 누르면 지금 시각이 기록된다 */
export default function CheckIn({ store }: { store: Store }) {
  const { employees, records, loaded, upsertRecord } = useData();
  const [empId, setEmpId] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!loaded) return <p className="text-muted">불러오는 중…</p>;
  const staff = employees.filter((e) => e.store === store);
  const date = todayISO();
  const emp = staff.find((e) => e.id === empId);
  const rec = emp ? records.find((r) => r.employeeId === emp.id && r.date === date) : undefined;

  const clockIn = () => {
    if (!emp) return;
    if (rec?.start && !rec.confirmed) {
      setMsg({ ok: false, text: `이미 출근 중이에요 (${rec.start} 출근)` });
      return;
    }
    const t = nowHM();
    const r: DayRecord = { id: `${emp.id}_${date}`, employeeId: emp.id, date, kind: "work", start: t };
    upsertRecord(r);
    setMsg({ ok: true, text: `${emp.alias} 님 ${t} 출근 기록했어요` });
  };

  const clockOut = () => {
    if (!emp) return;
    if (!rec?.start || rec.confirmed) {
      setMsg({ ok: false, text: "출근 기록이 먼저 있어야 해요. 출근을 눌러 주세요" });
      return;
    }
    if (rec.end) {
      setMsg({ ok: false, text: `이미 퇴근했어요 (${rec.end} 퇴근)` });
      return;
    }
    const t = nowHM();
    upsertRecord({ ...rec, end: t });
    setMsg({ ok: true, text: `${emp.alias} 님 ${t} 퇴근 기록했어요. 수고하셨습니다` });
  };

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-xl font-bold">{STORE_LABEL[store]} 매장 출퇴근</h1>
      <p className="text-sm text-muted">본인 이름을 고르고 출근 또는 퇴근을 눌러 주세요.</p>

      <div className="grid grid-cols-2 gap-2">
        {staff.map((e) => (
          <button
            key={e.id}
            onClick={() => { setEmpId(e.id); setMsg(null); }}
            className={`rounded-lg border px-3 py-4 text-base font-semibold ${
              empId === e.id ? "border-ink bg-ink text-surface" : "border-line bg-surface"
            }`}
          >
            {e.alias}
          </button>
        ))}
      </div>

      {emp && (
        <div className="space-y-3">
          <p className="text-sm">
            오늘 기록: {rec?.start && !rec.confirmed ? `출근 ${rec.start}` : "출근 전"}
            {rec?.end && !rec.confirmed ? ` · 퇴근 ${rec.end}` : ""}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={clockIn} className="rounded-lg bg-ink px-4 py-6 text-lg font-bold text-surface">출근</button>
            <button onClick={clockOut} className="rounded-lg border border-ink px-4 py-6 text-lg font-bold">퇴근</button>
          </div>
        </div>
      )}

      {msg && (
        <p className={`rounded-lg px-4 py-3 text-base font-semibold ${msg.ok ? "bg-bg text-ok" : "bg-accent-soft text-accent"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
