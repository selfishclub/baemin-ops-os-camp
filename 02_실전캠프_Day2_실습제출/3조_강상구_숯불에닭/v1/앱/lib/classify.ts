import type { ChannelId, Major } from "./categories";
import type { BankRow, Rule, Transaction } from "./types";

// 이 금액 이상 출금은 규칙이 있어도 한 번 확인받는다
export const LARGE_AMOUNT = 5_000_000;
// 같은 거래처의 평소 금액보다 이 배수 이상이면 확인받는다
export const UNUSUAL_TIMES = 3;

export const newId = () => crypto.randomUUID();

export function findRule(row: BankRow, rules: Rule[]): Rule | null {
  const direction = row.in > 0 ? "in" : "out";
  const payee = row.payee.replace(/\s/g, "");
  let best: Rule | null = null;
  for (const r of rules) {
    if (r.direction !== direction) continue;
    const k = r.keyword.replace(/\s/g, "");
    if (!k || !payee.includes(k)) continue;
    if (!best || k.length > best.keyword.replace(/\s/g, "").length) best = r; // 긴 키워드가 더 정확
  }
  return best;
}

// usual: 규칙(keyword)별 평소 금액. 지난 달들의 평균을 넘겨 주면 "평소의 3배"를 잡아낸다.
export function classifyRows(
  rows: BankRow[],
  rules: Rule[],
  usual: Record<string, number> = {},
): Transaction[] {
  return rows.map((row) => {
    const rule = findRule(row, rules);
    const base: Transaction = {
      ...row,
      id: newId(),
      month: row.date.slice(0, 7),
      source: "bank",
      major: null,
      minor: null,
      channel: null,
      review: "처음 보는 거래처",
    };
    if (!rule) return base;

    const amount = row.out || row.in;
    const usualAmount = usual[rule.keyword];
    let review: Transaction["review"] = null;
    if (rule.ambiguous) review = "재료비/생활비 애매";
    else if (row.out >= LARGE_AMOUNT) review = "금액이 큼";
    else if (usualAmount && amount >= usualAmount * UNUSUAL_TIMES) review = "금액이 큼";

    return { ...base, major: rule.major, minor: rule.minor, channel: rule.channel, review };
  });
}

// 사장님이 "확인 필요" 줄을 직접 고르면, 같은 거래처는 다음부터 자동으로 분류되게 규칙을 만든다.
export function ruleFromChoice(
  tx: Pick<Transaction, "payee" | "in" | "out">,
  major: Major,
  minor: string,
  channel: ChannelId | null = null,
  ambiguous = false,
): Rule {
  return {
    id: newId(),
    keyword: tx.payee.trim(),
    direction: tx.in > 0 ? "in" : "out",
    major,
    minor,
    channel,
    ambiguous,
  };
}

// 규칙별 평소 금액(평균) — 지난 거래들로 계산
export function usualAmounts(past: Transaction[], rules: Rule[]): Record<string, number> {
  const sum: Record<string, { total: number; n: number }> = {};
  for (const t of past) {
    const rule = findRule(t, rules);
    if (!rule) continue;
    const s = (sum[rule.keyword] ??= { total: 0, n: 0 });
    s.total += t.out || t.in;
    s.n += 1;
  }
  return Object.fromEntries(Object.entries(sum).map(([k, s]) => [k, s.total / s.n]));
}
