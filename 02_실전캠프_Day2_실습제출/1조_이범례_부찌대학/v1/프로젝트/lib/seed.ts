import type { Employee } from "./types";

// 시연용 가상 직원 (PRD 6번). 실제 직원 정보가 아님.
const weekday = (start: string, end: string, breakMin: number) => ({
  mon: { start, end, breakMin },
  tue: { start, end, breakMin },
  wed: { start, end, breakMin },
  thu: { start, end, breakMin },
  fri: { start, end, breakMin },
});

export const SEED_EMPLOYEES: Employee[] = [
  {
    id: "emp_a",
    alias: "가상 직원 A",
    store: "hall",
    role: "오전 설거지",
    wage: 10320,
    payCycle: "weekly",
    plan: weekday("09:00", "16:00", 30),
  },
  {
    id: "emp_b",
    alias: "가상 직원 B",
    store: "delivery",
    role: "저녁 포장",
    wage: 10320,
    payCycle: "weekly",
    plan: weekday("17:00", "22:00", 30),
  },
  {
    id: "emp_c",
    alias: "가상 직원 C",
    store: "delivery",
    role: "학생",
    wage: 10320,
    payCycle: "weekly",
    plan: { fri: { start: "17:00", end: "22:00", breakMin: 30 } },
  },
];
