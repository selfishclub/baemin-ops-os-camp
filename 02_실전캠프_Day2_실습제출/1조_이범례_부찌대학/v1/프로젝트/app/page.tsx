"use client";

import { useState } from "react";
import { useData } from "@/components/DataProvider";
import { calcMonth, calcWeek, downloadCSV, fmtHM, fmtWon } from "@/lib/calc";
import { addDays, mondayOf, monthKey, shortDate, todayISO } from "@/lib/dates";
import { PAY_LABEL, STORE_LABEL, type Store } from "@/lib/types";

const STORES: Store[] = ["hall", "delivery"];

export default function SettlementPage() {
  const { employees, records, loaded } = useData();
  const [monday, setMonday] = useState(() => mondayOf(todayISO()));
  const [month, setMonth] = useState(() => monthKey(todayISO()));

  if (!loaded) return <p className="text-muted">불러오는 중…</p>;

  // ---- 주 정산표 (주급 직원)
  const weekly = employees
    .filter((e) => e.payCycle === "weekly")
    .map((e) => ({ e, w: calcWeek(e, monday, records) }));
  const weekTotal = weekly.reduce((s, x) => s + x.w.total, 0);
  const weekPending = weekly.reduce((s, x) => s + x.w.pending, 0);
  const weekLabel = `${shortDate(monday)}(월)~${shortDate(addDays(monday, 6))}(일)`;

  const weekCSV = () =>
    downloadCSV(`주정산_${monday}.csv`, [
      ["주", weekLabel],
      ["별칭", "사업장", "자리", "시급", "실근무(분)", "실근무", "기본급", "주휴수당", "주 세전 합계", "확인 필요(일)"],
      ...weekly.map(({ e, w }) => [e.alias, STORE_LABEL[e.store], e.role, e.wage, w.paidMin, fmtHM(w.paidMin), w.basePay, w.holidayPay, w.total, w.pending]),
      ["합계", "", "", "", "", "", weekly.reduce((s, x) => s + x.w.basePay, 0), weekly.reduce((s, x) => s + x.w.holidayPay, 0), weekTotal, weekPending],
    ]);

  // ---- 월 정산표 (전체)
  const monthly = employees.map((e) => ({ e, m: calcMonth(e, month, records) }));
  const byStore = STORES.map((s) => ({
    store: s,
    rows: monthly.filter((x) => x.e.store === s),
    total: monthly.filter((x) => x.e.store === s).reduce((t, x) => t + x.m.total, 0),
  }));
  const monthTotal = monthly.reduce((s, x) => s + x.m.total, 0);
  const monthPending = monthly.reduce((s, x) => s + x.m.pending, 0);
  const [my, mm] = month.split("-").map(Number);
  const shiftMonth = (n: number) => {
    const d = new Date(my, mm - 1 + n, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const monthCSV = () =>
    downloadCSV(`월정산_${month}.csv`, [
      ["월", `${my}년 ${mm}월`],
      ["별칭", "사업장", "자리", "지급 주기", "시급", "실근무(분)", "실근무", "기본급", "주휴수당", "월 세전 합계", "확인 필요(일)"],
      ...monthly.map(({ e, m }) => [e.alias, STORE_LABEL[e.store], e.role, PAY_LABEL[e.payCycle], e.wage, m.paidMin, fmtHM(m.paidMin), m.basePay, m.holidayPay, m.total, m.pending]),
      ...byStore.map((s) => [`${STORE_LABEL[s.store]} 합계`, "", "", "", "", "", "", "", "", s.total, ""]),
      ["전체 합계", "", "", "", "", "", "", "", "", monthTotal, monthPending],
    ]);

  return (
    <div className="space-y-10">
      {/* 주 정산표 */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold">주 정산표</h1>
          <span className="text-sm text-muted">주급 직원 {weekly.length}명</span>
          <div className="ml-auto flex items-center gap-1">
            <button className="btn-ghost btn-sm" onClick={() => setMonday(addDays(monday, -7))}>◀ 지난주</button>
            <button className="btn-ghost btn-sm" onClick={() => setMonday(mondayOf(todayISO()))}>이번 주</button>
            <button className="btn-ghost btn-sm" onClick={() => setMonday(addDays(monday, 7))}>다음 주 ▶</button>
          </div>
          <div className="w-full text-sm text-muted sm:w-auto">{weekLabel}</div>
        </div>
        {weekPending > 0 && (
          <p className="rounded-md bg-warn-soft px-3 py-2 text-sm font-semibold text-warn">
            확인 필요한 날이 {weekPending}일 있어요. 매장 화면에서 인정/조정을 마치면 금액이 채워집니다.
          </p>
        )}
        <div className="overflow-x-auto rounded-md border border-line bg-surface">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-bg text-xs text-muted">
              <tr>
                <th className="px-3 py-2 text-left">직원</th>
                <th className="px-3 py-2 text-left">사업장</th>
                <th className="px-3 py-2 text-right">실근무</th>
                <th className="px-3 py-2 text-right">기본급</th>
                <th className="px-3 py-2 text-right">주휴수당</th>
                <th className="px-3 py-2 text-right">주 세전 합계</th>
                <th className="px-3 py-2 text-left">상태</th>
              </tr>
            </thead>
            <tbody>
              {weekly.map(({ e, w }) => (
                <tr key={e.id} className="border-t border-line">
                  <td className="px-3 py-2 font-semibold">{e.alias} <span className="font-normal text-muted">· {e.role}</span></td>
                  <td className="px-3 py-2">{STORE_LABEL[e.store]}</td>
                  <td className="px-3 py-2 text-right num">{fmtHM(w.paidMin)}{w.diffMin !== 0 && <span className="ml-1 text-xs text-warn">({w.diffMin > 0 ? "+" : "−"}{Math.abs(w.diffMin)}분)</span>}</td>
                  <td className="px-3 py-2 text-right num">{fmtWon(w.basePay)}</td>
                  <td className="px-3 py-2 text-right num">{w.holidayEligible ? fmtWon(w.holidayPay) : <span className="text-muted">없음</span>}</td>
                  <td className="px-3 py-2 text-right num font-bold">{fmtWon(w.total)}</td>
                  <td className="px-3 py-2">{w.pending > 0 ? <span className="chip bg-warn-soft text-warn">확인 필요 {w.pending}일</span> : <span className="chip bg-ok-soft text-ok">완료</span>}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-ink bg-bg font-bold">
                <td className="px-3 py-2" colSpan={5}>주급 합계</td>
                <td className="px-3 py-2 text-right num text-accent">{fmtWon(weekTotal)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <button className="btn-ghost" onClick={weekCSV}>⬇ 주 정산표 CSV 내려받기</button>
      </section>

      {/* 월 정산표 */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-bold">월 정산표</h2>
          <span className="text-sm text-muted">전체 직원 · 세무사 전달용</span>
          <div className="ml-auto flex items-center gap-1">
            <button className="btn-ghost btn-sm" onClick={() => shiftMonth(-1)}>◀</button>
            <span className="num px-2 text-sm font-semibold">{my}년 {mm}월</span>
            <button className="btn-ghost btn-sm" onClick={() => shiftMonth(1)}>▶</button>
          </div>
        </div>
        {monthPending > 0 && (
          <p className="rounded-md bg-warn-soft px-3 py-2 text-sm font-semibold text-warn">확인 필요한 날이 {monthPending}일 있어요. 내려받기 전에 매장 화면에서 정리해 주세요.</p>
        )}
        <div className="overflow-x-auto rounded-md border border-line bg-surface">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-bg text-xs text-muted">
              <tr>
                <th className="px-3 py-2 text-left">직원</th>
                <th className="px-3 py-2 text-left">지급</th>
                <th className="px-3 py-2 text-right">실근무</th>
                <th className="px-3 py-2 text-right">기본급</th>
                <th className="px-3 py-2 text-right">주휴수당</th>
                <th className="px-3 py-2 text-right">월 세전 합계</th>
              </tr>
            </thead>
            <tbody>
              {byStore.map((s) => (
                <SectionRows key={s.store} title={`${STORE_LABEL[s.store]} 사업장`} total={s.total} rows={s.rows} />
              ))}
              <tr className="border-t-2 border-ink bg-bg font-bold">
                <td className="px-3 py-2" colSpan={5}>전체 인건비 (세전)</td>
                <td className="px-3 py-2 text-right num text-accent">{fmtWon(monthTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-primary" onClick={monthCSV}>⬇ 월 정산표 CSV 내려받기</button>
          <span className="text-xs text-muted">엑셀로 열립니다. 세무사에게는 사장님이 직접 보내세요.</span>
        </div>
        <p className="text-xs text-muted">[가정] 기본급은 그 달 날짜 기준, 주휴수당은 그 주 일요일이 속한 달에 넣었어요. 월 경계 주의 처리는 노무사·세무사 확인 후 바꿀 수 있어요. 4대보험·소득세 공제 전 금액입니다.</p>
      </section>
    </div>
  );
}

function SectionRows({ title, total, rows }: { title: string; total: number; rows: { e: ReturnType<typeof useData>["employees"][number]; m: ReturnType<typeof calcMonth> }[] }) {
  return (
    <>
      <tr className="border-t border-line bg-bg/60">
        <td className="px-3 py-1 text-xs font-semibold text-muted" colSpan={6}>{title}</td>
      </tr>
      {rows.length === 0 && (
        <tr className="border-t border-line"><td className="px-3 py-2 text-muted" colSpan={6}>직원 없음</td></tr>
      )}
      {rows.map(({ e, m }) => (
        <tr key={e.id} className="border-t border-line">
          <td className="px-3 py-2 font-semibold">{e.alias} <span className="font-normal text-muted">· {e.role}</span>{m.pending > 0 && <span className="ml-1 chip bg-warn-soft text-warn">확인 {m.pending}일</span>}</td>
          <td className="px-3 py-2">{PAY_LABEL[e.payCycle]}</td>
          <td className="px-3 py-2 text-right num">{fmtHM(m.paidMin)}</td>
          <td className="px-3 py-2 text-right num">{fmtWon(m.basePay)}</td>
          <td className="px-3 py-2 text-right num">{m.holidayPay > 0 ? fmtWon(m.holidayPay) : <span className="text-muted">없음</span>}</td>
          <td className="px-3 py-2 text-right num font-bold">{fmtWon(m.total)}</td>
        </tr>
      ))}
      <tr className="border-t border-line font-semibold">
        <td className="px-3 py-2 text-right" colSpan={5}>{title} 합계</td>
        <td className="px-3 py-2 text-right num">{fmtWon(total)}</td>
      </tr>
    </>
  );
}
