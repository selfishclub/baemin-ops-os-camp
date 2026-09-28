import { nextMonth } from "./month";
import type { Month } from "./types";

// 직원에게 카톡으로 보낼 급여 안내 글.
//  - 주휴수당·공제는 넣지 않는다 (사장님 확인 2026-09-29: 시간 × 시급 그대로 지급).
//  - 실명 대신 장부에 등록한 별칭을 쓴다.
export interface PayslipInput {
  month: Month; // "2026-09"
  alias: string;
  days: number;
  hours: number;
  wage: number;
  labor: number;
  payDay?: number | null; // 다음 달 며칠에 주는지 (규칙 탭 지급일)
}

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const hourText = (h: number) => `${Math.round(h * 10) / 10}시간`;

/** 다음 달 지급일을 "10월 10일"로. 그 달에 없는 날(2월 31일)이면 말일로 민다. */
export function payDateText(month: Month, payDay: number): string {
  const m = nextMonth(month);
  const [y, mm] = m.split("-").map(Number);
  const last = new Date(Date.UTC(y, mm, 0)).getUTCDate();
  return `${mm}월 ${Math.min(payDay, last)}일`;
}

export function buildPayslip(p: PayslipInput): string {
  const [y, m] = p.month.split("-").map(Number);
  const lines = [
    `${y}년 ${m}월 급여 — ${p.alias} 님`,
    "",
    `근무 ${p.days}일 · 총 ${hourText(p.hours)}`,
    `시급 ${won(p.wage)}`,
    `급여 ${won(p.labor)}`,
  ];
  if (p.payDay) lines.push("", `지급 예정일: ${payDateText(p.month, p.payDay)}`);
  return lines.join("\n");
}
