// 급여 계산. 규칙은 v1/PRD.md 5번·6번.
import type { DayPlan, DayRecord, Employee } from "./types";
import { addDays, dayKeyOf, mondayOf, monthDates, monthKey, weekDates } from "./dates";

export const DIFF_THRESHOLD_MIN = 10; // 이 이상 차이면 노란 표시 → 인정/조정
export const WEEKLY_HOLIDAY_MIN_HOURS = 15; // 주휴수당 기준 주 15시간

export function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function fmtHM(min: number): string {
  const sign = min < 0 ? "-" : "";
  const a = Math.abs(min);
  const h = Math.floor(a / 60);
  const m = a % 60;
  if (h === 0) return `${sign}${m}분`;
  if (m === 0) return `${sign}${h}시간`;
  return `${sign}${h}시간 ${m}분`;
}

export function fmtWon(n: number): string {
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

export function fmtDiffMin(min: number): string {
  return `${min > 0 ? "+" : min < 0 ? "−" : ""}${Math.abs(min)}분`;
}

/** 시각·휴게로 실근무(분) 계산. 문제가 있으면 error */
export function workMinutes(start: string, end: string, breakMin: number): { min: number; error?: string } {
  const s = toMin(start);
  const e = toMin(end);
  if (e <= s) return { min: 0, error: "퇴근이 출근보다 빠릅니다. 시간을 다시 확인해 주세요" };
  const gross = e - s;
  if (breakMin > gross) return { min: 0, error: "휴게시간이 근무시간보다 깁니다" };
  return { min: gross - breakMin };
}

export type DayStatus =
  | "off" // 예정 없음, 기록 없음
  | "planned" // 예정대로 (실제 입력 없음)
  | "absent" // 결근
  | "ok" // 실제 입력됨, 차이 10분 미만
  | "needs-decision" // 차이 10분 이상, 아직 인정/조정 안 함
  | "accepted"
  | "adjusted"
  | "incomplete" // 출근·퇴근·휴게 중 빈 값
  | "error"; // 퇴근<출근 등

export interface DayCalc {
  date: string;
  plan?: DayPlan;
  record?: DayRecord;
  status: DayStatus;
  plannedMin: number; // 예정 실근무(분)
  paidMin: number; // 급여에 들어가는 실근무(분)
  diffStartMin: number; // 실제 출근 − 예정 출근 (양수 = 늦게 옴)
  diffEndMin: number; // 실제 퇴근 − 예정 퇴근 (양수 = 늦게 감)
  error?: string;
}

/** 하루 계산 */
export function calcDay(date: string, plan: DayPlan | undefined, record: DayRecord | undefined): DayCalc {
  const base: DayCalc = { date, plan, record, status: "off", plannedMin: 0, paidMin: 0, diffStartMin: 0, diffEndMin: 0 };

  if (plan) {
    const p = workMinutes(plan.start, plan.end, plan.breakMin);
    base.plannedMin = p.error ? 0 : p.min;
    if (p.error) return { ...base, status: "error", error: `기본 근무표: ${p.error}` };
  }

  if (!record) {
    if (!plan) return base;
    return { ...base, status: "planned", paidMin: base.plannedMin };
  }

  if (record.kind === "absent") return { ...base, status: "absent", paidMin: 0 };

  const start = record.start ?? plan?.start;
  const end = record.end ?? plan?.end;
  const breakMin = record.breakMin ?? plan?.breakMin;
  if (!start || !end || breakMin === undefined || Number.isNaN(breakMin)) {
    return { ...base, status: "incomplete", paidMin: 0 };
  }

  const diffStartMin = plan ? toMin(start) - toMin(plan.start) : 0;
  const diffEndMin = plan ? toMin(end) - toMin(plan.end) : 0;
  const big = !plan || Math.abs(diffStartMin) >= DIFF_THRESHOLD_MIN || Math.abs(diffEndMin) >= DIFF_THRESHOLD_MIN;

  // 급여에 쓸 시각: 조정이면 조정값, 아니면 실제값
  let payStart = start;
  let payEnd = end;
  let status: DayStatus = big ? "needs-decision" : "ok";
  if (big && record.decision === "accepted") status = "accepted";
  if (big && record.decision === "adjusted") {
    if (!record.adjStart || !record.adjEnd || !record.reason?.trim()) {
      return { ...base, status: "needs-decision", diffStartMin, diffEndMin, paidMin: 0, error: "조정 시각과 사유를 적어 주세요" };
    }
    payStart = record.adjStart;
    payEnd = record.adjEnd;
    status = "adjusted";
  }

  const w = workMinutes(payStart, payEnd, breakMin);
  if (w.error) return { ...base, status: "error", diffStartMin, diffEndMin, paidMin: 0, error: w.error };

  // 인정/조정 전에는 급여에 넣지 않고 "확인 필요"로 둔다
  const paidMin = status === "needs-decision" ? 0 : w.min;
  return { ...base, status, diffStartMin, diffEndMin, paidMin };
}

export interface WeekCalc {
  monday: string;
  days: DayCalc[];
  plannedMin: number;
  paidMin: number;
  hasAbsent: boolean;
  pending: number; // 확인 필요한 날 수
  basePay: number; // 기본급 = 실근무 × 시급 (1분 단위)
  holidayEligible: boolean;
  holidayMin: number; // 주휴 시간(분)
  holidayPay: number;
  total: number; // 주 세전
  diffMin: number; // 예정 대비 분
  diffPay: number; // 예정 대비 원
}

/** 한 직원의 한 주 계산 */
export function calcWeek(emp: Employee, monday: string, records: DayRecord[]): WeekCalc {
  const days = weekDates(monday).map((date) => {
    const rec = records.find((r) => r.employeeId === emp.id && r.date === date);
    return calcDay(date, emp.plan[dayKeyOf(date)], rec);
  });
  const plannedMin = days.reduce((s, d) => s + d.plannedMin, 0);
  const paidMin = days.reduce((s, d) => s + d.paidMin, 0);
  const hasAbsent = days.some((d) => d.status === "absent");
  const pending = days.filter((d) => d.status === "needs-decision" || d.status === "incomplete" || d.status === "error").length;

  const basePay = (paidMin / 60) * emp.wage;
  // 주휴수당: 주 소정(예정) 15시간 이상 + 결근 없음. (소정 ÷ 40h) × 8h, 최대 8h
  const holidayEligible = plannedMin >= WEEKLY_HOLIDAY_MIN_HOURS * 60 && !hasAbsent;
  const holidayMin = holidayEligible ? Math.min(480, (plannedMin / 2400) * 480) : 0;
  const holidayPay = (holidayMin / 60) * emp.wage;
  const plannedBase = (plannedMin / 60) * emp.wage;

  return {
    monday, days, plannedMin, paidMin, hasAbsent, pending,
    basePay: Math.round(basePay),
    holidayEligible,
    holidayMin,
    holidayPay: Math.round(holidayPay),
    total: Math.round(basePay + holidayPay),
    diffMin: paidMin - plannedMin,
    diffPay: Math.round(basePay - plannedBase),
  };
}

export interface MonthCalc {
  month: string; // "2026-09"
  paidMin: number; // 그 달 날짜의 실근무 합
  basePay: number;
  holidayMin: number; // 그 달에 끝나는(일요일이 속한) 주들의 주휴 합
  holidayPay: number;
  total: number;
  pending: number; // 확인 필요한 날 수
  weeks: number; // 주휴를 센 주 수
}

/**
 * 한 직원의 한 달 계산.
 * [가정] 기본급은 그 달에 속한 날짜로, 주휴수당은 그 주의 일요일이 속한 달에 넣는다.
 * (월 경계 주의 처리 기준은 노무사·세무사 확인 후 바꿀 수 있음)
 */
export function calcMonth(emp: Employee, month: string, records: DayRecord[]): MonthCalc {
  const dates = monthDates(month);
  let paidMin = 0;
  let pending = 0;
  for (const date of dates) {
    const rec = records.find((r) => r.employeeId === emp.id && r.date === date);
    const d = calcDay(date, emp.plan[dayKeyOf(date)], rec);
    paidMin += d.paidMin;
    if (d.status === "needs-decision" || d.status === "incomplete" || d.status === "error") pending++;
  }
  // 이 달에 일요일이 있는 주들
  let holidayMin = 0;
  let holidayPay = 0;
  let weeks = 0;
  let monday = mondayOf(dates[0]);
  while (monthKey(addDays(monday, 6)) <= month) {
    if (monthKey(addDays(monday, 6)) === month) {
      const w = calcWeek(emp, monday, records);
      holidayMin += w.holidayMin;
      holidayPay += w.holidayPay;
      weeks++;
    }
    monday = addDays(monday, 7);
  }
  const basePay = Math.round((paidMin / 60) * emp.wage);
  return { month, paidMin, basePay, holidayMin, holidayPay, total: basePay + holidayPay, pending, weeks };
}

/** 엑셀에서 바로 열리는 CSV 내려받기 (한글 깨짐 방지 BOM 포함) */
export function downloadCSV(filename: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = "﻿" + rows.map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
