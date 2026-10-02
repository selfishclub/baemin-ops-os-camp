import type { MonthPnlRow } from "./monthPnl";

// 1년 화면 숫자 — 월별 손익을 모아 누적·비용 구성·많이 쓴 항목을 낸다 (김씨육면 연간 대시보드에서 따옴)

export interface YearMonth {
  month: string;
  revenue: number;
  cost: number; // 매출 − 영업이익 = 비용 합계
  profit: number;
  margin: number | null;
  costRate: number | null; // 원가율
  laborRate: number | null; // 인건비율
  estimated: number; // 어림값 합계
  closed: boolean;
}

export interface YearSummary {
  months: YearMonth[]; // 자료 있는 달만, 1월부터
  revenue: number;
  profit: number;
  margin: number | null;
  ownerDraw: number;
  estimated: number;
  costByMajor: { label: string; amount: number; pct: number | null }[]; // 큰 순서, 매출 대비 %
  topMinors: { major: string; label: string; amount: number }[]; // 많이 쓴 세부 항목
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

export function yearMonths(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
}

export function summarizeYear(rows: MonthPnlRow[], topN = 8): YearSummary {
  const filled = rows.filter((r) => !r.empty).sort((a, b) => a.month.localeCompare(b.month));
  const months = filled.map(({ month, pnl, closed }): YearMonth => {
    const line = (l: string) => pnl.lines.find((x) => x.label === l)?.amount ?? 0;
    return {
      month,
      revenue: pnl.revenue,
      cost: pnl.revenue - pnl.operatingProfit,
      profit: pnl.operatingProfit,
      margin: pnl.operatingMargin,
      costRate: pct(line("매출원가"), pnl.revenue),
      laborRate: pct(line("노무관리비"), pnl.revenue),
      estimated: pnl.estimates.reduce((a, e) => a + e.amount, 0),
      closed,
    };
  });

  const byMajor = new Map<string, number>();
  const byMinor = new Map<string, { major: string; label: string; amount: number }>();
  for (const { pnl } of filled)
    for (const l of pnl.lines) {
      if (l.kind !== "cost") continue;
      byMajor.set(l.label, (byMajor.get(l.label) ?? 0) + l.amount);
      for (const m of l.minors ?? []) {
        const k = `${l.label}|${m.label}`;
        const prev = byMinor.get(k);
        byMinor.set(k, { major: l.label, label: m.label, amount: (prev?.amount ?? 0) + m.amount });
      }
    }

  const revenue = months.reduce((a, m) => a + m.revenue, 0);
  const profit = months.reduce((a, m) => a + m.profit, 0);
  return {
    months,
    revenue,
    profit,
    margin: pct(profit, revenue),
    ownerDraw: filled.reduce((a, r) => a + r.pnl.ownerDraw, 0),
    estimated: months.reduce((a, m) => a + m.estimated, 0),
    costByMajor: [...byMajor.entries()]
      .filter(([, v]) => v > 0)
      .map(([label, amount]) => ({ label, amount, pct: pct(amount, revenue) }))
      .sort((a, b) => b.amount - a.amount),
    topMinors: [...byMinor.values()]
      .filter((m) => m.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, topN),
  };
}
