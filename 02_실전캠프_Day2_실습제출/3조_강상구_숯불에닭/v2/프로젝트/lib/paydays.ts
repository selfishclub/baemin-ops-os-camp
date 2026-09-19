import type { Major } from "./categories";

// 지급일 설정 — 급여·거래처 대금을 내는 날. 가게마다 다르니(10일, 25일, 말일…) 규칙 탭에서 정한다.
// 이 날 나가는 인건비·재료비는 "지난달 비용으로"가 기본으로 체크된다. 사장님이 한 번 확인하면 규칙에 남아 다음 달부터 자동.
export const PAY_DAYS_KEY = "pay_days";
export const DEFAULT_PAY_DAYS = [10];
export const PREV_MONTH_MAJORS: Major[] = ["노무관리비", "매출원가"];

// "10, 25" 같은 글을 날짜 목록으로. 1~31 사이만, 중복 제거, 오름차순.
export function parsePayDays(text: string): number[] {
  const days = text
    .split(/[,\s·]+/)
    .map((s) => Number(s.replace(/일/g, "")))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 31);
  return [...new Set(days)].sort((a, b) => a - b);
}

// 이 거래를 "지난달 비용"으로 볼까? (통장 출금일이 지급일이고, 인건비·재료비일 때)
export function isPrevMonthDefault(date: string, major: Major | "" | null, payDays: number[]): boolean {
  if (!major || !PREV_MONTH_MAJORS.includes(major)) return false;
  const day = Number(date.slice(8, 10));
  return payDays.includes(day);
}
