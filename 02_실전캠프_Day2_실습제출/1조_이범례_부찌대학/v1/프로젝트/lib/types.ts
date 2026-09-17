// 근무·급여 원터치 — 데이터 구조

export type Store = "hall" | "delivery";
export type PayCycle = "weekly" | "monthly";
export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export const DAY_KEYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const DAY_LABEL: Record<DayKey, string> = {
  mon: "월", tue: "화", wed: "수", thu: "목", fri: "금", sat: "토", sun: "일",
};
export const STORE_LABEL: Record<Store, string> = { hall: "홀", delivery: "배달" };
export const PAY_LABEL: Record<PayCycle, string> = { weekly: "주급", monthly: "월급" };

/** 요일별 기본 근무 (예정) */
export interface DayPlan {
  start: string; // "09:00"
  end: string; // "16:00"
  breakMin: number; // 무급 휴게(분)
}

export interface Employee {
  id: string;
  alias: string; // 별칭 (실명 아님)
  store: Store;
  role: string; // 자리 (예: 오전 설거지)
  wage: number; // 시급
  payCycle: PayCycle;
  plan: Partial<Record<DayKey, DayPlan>>; // 없는 요일 = 쉬는 날
}

/** 하루 실제 기록. 예정대로면 기록이 없어도 된다 */
export interface DayRecord {
  id: string; // `${employeeId}_${date}`
  employeeId: string;
  date: string; // "2026-09-15"
  kind: "work" | "absent"; // absent = 결근
  start?: string; // 실제 출근
  end?: string; // 실제 퇴근
  breakMin?: number; // 실제 휴게 (없으면 예정 휴게)
  decision?: "accepted" | "adjusted"; // 10분 이상 차이일 때 사장님 판단
  adjStart?: string; // 조정한 출근
  adjEnd?: string; // 조정한 퇴근
  reason?: string; // 조정 사유 (조정이면 필수)
  confirmed?: boolean; // "오늘 예정대로" 확정 등
}

export interface Settings {
  minWage: number; // 최저시급
}

export const DEFAULT_SETTINGS: Settings = { minWage: 10320 };

export interface AppData {
  employees: Employee[];
  records: DayRecord[];
  settings: Settings;
}
