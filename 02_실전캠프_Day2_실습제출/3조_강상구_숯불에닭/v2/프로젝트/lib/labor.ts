// 월 고정 인건비 — 손익 어림용. 급여가 아직 통장에서 안 나간 달에 오늘 탭의 알바 어림 인건비와 합쳐 노무관리비를 임시로 채운다.
export const FIXED_LABOR_KEY = "fixed_labor";

export interface FixedLabor {
  salary: number; // 월급제 직원 급여 합계 (주방 등)
  insurance: number; // 4대보험 사업주 부담 월 금액
}

export const EMPTY_FIXED_LABOR: FixedLabor = { salary: 0, insurance: 0 };

// 손익에 넣을 어림 인건비 묶음
export interface LaborEstimate {
  hourly: number; // 오늘 탭 근무시간 × 시급 합계
  salary: number;
  insurance: number;
}

export const laborEstimateTotal = (e: LaborEstimate) => e.hourly + e.salary + e.insurance;
