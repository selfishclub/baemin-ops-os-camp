"use client";

import { useEffect, useState } from "react";
import { useData } from "@/components/DataProvider";
import { SEED_EMPLOYEES } from "@/lib/seed";

export default function SettingsPage() {
  const { settings, saveSettings, loaded, employees, records, saveEmployee, deleteEmployee, removeRecord, storage } = useData();
  const [minWage, setMinWage] = useState(settings.minWage);
  const [saved, setSaved] = useState(false);

  useEffect(() => setMinWage(settings.minWage), [settings.minWage]);

  if (!loaded) return <p className="text-muted">불러오는 중…</p>;

  const lowCount = employees.filter((e) => e.wage < settings.minWage).length;

  const resetDemo = () => {
    if (!confirm("직원 명단과 근무 기록을 모두 지우고 시연용 가상 직원 A·B·C로 되돌릴까요? 되돌릴 수 없어요.")) return;
    records.forEach((r) => removeRecord(r.id));
    employees.forEach((e) => deleteEmployee(e.id));
    SEED_EMPLOYEES.forEach((e) => saveEmployee(e));
  };

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-xl font-bold">설정</h1>

      <section className="card space-y-3">
        <h2 className="font-bold">최저시급</h2>
        <p className="text-sm text-muted">매년 바뀌면 여기서 고칩니다. 이 값보다 낮은 시급은 직원 명단과 근무표에 빨간 경고로 표시됩니다. (2026년: 10,320원)</p>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="label">최저시급 (원)</label>
            <input type="number" inputMode="numeric" className="input num" value={minWage} onChange={(e) => { setMinWage(Number(e.target.value)); setSaved(false); }} />
          </div>
          <button
            className="btn-primary"
            disabled={!minWage || minWage <= 0 || minWage === settings.minWage}
            onClick={() => { saveSettings({ ...settings, minWage }); setSaved(true); }}
          >
            저장
          </button>
        </div>
        {saved && <p className="text-sm font-semibold text-ok">저장했어요.</p>}
        {lowCount > 0 && <p className="text-sm font-semibold text-accent">지금 최저시급보다 낮은 직원이 {lowCount}명 있어요. 직원 명단에서 확인해 주세요.</p>}
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold">저장 위치</h2>
        {storage === "supabase" ? (
          <p className="text-sm text-ok font-semibold">Supabase 데이터 창고에 저장 중 — 홀·배달 두 매장 기기가 같은 기록을 봅니다.</p>
        ) : (
          <p className="text-sm text-muted">
            지금은 <b>이 브라우저 안</b>에만 저장됩니다. 다른 기기에서는 보이지 않아요. Supabase 열쇠(.env.local)를 넣으면 홀·배달 두 매장이 같은 기록을 봅니다.
          </p>
        )}
        <p className="text-sm text-muted">직원 {employees.length}명 · 근무 기록 {records.length}건</p>
      </section>

      <section className="card space-y-3 border-accent/40">
        <h2 className="font-bold">시연용 데이터로 되돌리기</h2>
        <p className="text-sm text-muted">직원 명단과 기록을 모두 지우고 가상 직원 A·B·C만 남깁니다. 발표 연습 뒤에 쓰세요.</p>
        <button className="btn-ghost text-accent" onClick={resetDemo}>모두 지우고 되돌리기</button>
      </section>
    </div>
  );
}
