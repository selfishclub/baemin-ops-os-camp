import type { ChannelSale } from "./types";

// 저장을 막는 오류(error)와, "맞나요?" 하고 한 번 묻는 경고(warn)를 나눈다.
export interface Issue {
  level: "error" | "warn";
  message: string;
}

export const TEN_TIMES = 10;

export function checkChannelSale(s: Pick<ChannelSale, "name" | "orders" | "deposit" | "count">, prevOrders?: number): Issue[] {
  const issues: Issue[] = [];
  if (s.orders < 0 || s.deposit < 0 || s.count < 0) {
    issues.push({ level: "error", message: `${s.name}: 금액과 건수는 0보다 작을 수 없어요.` });
    return issues;
  }
  if (s.deposit > s.orders) {
    issues.push({ level: "warn", message: `${s.name}: 입금액이 주문금액보다 커요. 두 칸이 바뀌지 않았나요?` });
  }
  if (s.orders > 0 && s.deposit === 0 && s.name !== "홀(포스)") {
    issues.push({ level: "warn", message: `${s.name}: 입금액이 0원이에요. 맞나요?` });
  }
  if (prevOrders && prevOrders > 0 && s.orders >= prevOrders * TEN_TIMES) {
    issues.push({ level: "warn", message: `${s.name}: 주문금액이 지난달의 ${TEN_TIMES}배가 넘어요. 0이 하나 더 붙지 않았나요?` });
  }
  return issues;
}

export function checkExpense(amount: number, date: string, usualMax?: number): Issue[] {
  const issues: Issue[] = [];
  if (!Number.isFinite(amount) || amount <= 0) {
    issues.push({ level: "error", message: "금액은 0보다 커야 해요." });
    return issues;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    issues.push({ level: "error", message: "날짜를 골라 주세요." });
  }
  if (usualMax && amount >= usualMax * TEN_TIMES) {
    issues.push({ level: "warn", message: `평소 가장 큰 지출의 ${TEN_TIMES}배가 넘어요. 맞나요?` });
  }
  return issues;
}
