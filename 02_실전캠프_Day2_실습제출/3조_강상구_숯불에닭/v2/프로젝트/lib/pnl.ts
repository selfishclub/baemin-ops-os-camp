import { EXCLUDED_MAJOR, EXPENSE_MAJORS, OWNER_DRAW, isHall, type Major } from "./categories";
import { feeOf, round1 } from "./channels";
import type { ChannelSale, Transaction } from "./types";

export interface PnlLine {
  label: string;
  amount: number;
  pct: number | null; // 매출 대비 %
  kind: "revenue" | "cost" | "subtotal" | "result";
  minors?: { label: string; amount: number }[];
}

export interface Pnl {
  revenue: number;
  revenueBasis: "실매출" | "입금액"; // 채널 입력이 없으면 통장 입금액 기준
  hallRevenue: number;
  deliveryRevenue: number;
  otherIncome: number;
  lines: PnlLine[];
  operatingProfit: number;
  operatingMargin: number | null;
  ownerDraw: number; // 내가 가져간 돈(생활비) — 가게 비용 아님
  excluded: { in: number; out: number }; // "제외"로 분류한 돈(내 계좌 이체 등) — 손익에 안 넣음
  deliveryFee: number; // 배달앱 수수료 = 주문금액 − 입금액
  unclassified: number; // 아직 분류 안 된 줄 수
  needsReview: number; // 확인 필요 표시가 남은 줄 수
}

const pct = (amount: number, revenue: number) => (revenue > 0 ? round1((amount / revenue) * 100) : null);

// 손익 순서는 사장님 엑셀의 손익계산서 그대로, 단 임대료를 빠뜨리지 않는다.
// 매출액 → 매출원가 → 매출총이익 → 가맹수수료 → 경영주수입 → 영업비·임대료·세금과공과·노무관리비·기타 → 영업이익
export function computePnl(txs: Transaction[], sales: ChannelSale[]): Pnl {
  const hasSales = sales.some((s) => s.orders > 0);

  // 통장 입금: 채널이 붙은 줄은 대조용. 채널 입력이 있으면 매출로 다시 더하지 않는다(중복 방지).
  let bankChannelIn = 0;
  let otherIncome = 0;
  const excluded = { in: 0, out: 0 };
  for (const t of txs) {
    if (t.major === EXCLUDED_MAJOR) {
      excluded.in += t.in;
      excluded.out += t.out;
    }
  }
  for (const t of txs) {
    if (t.in <= 0 || t.major !== "수입") continue;
    if (t.channel) bankChannelIn += t.in;
    else otherIncome += t.in;
  }

  const hallRevenue = sales.filter((s) => isHall(s.channel)).reduce((a, s) => a + s.orders, 0);
  const deliveryRevenue = sales.filter((s) => !isHall(s.channel)).reduce((a, s) => a + s.orders, 0);
  const revenue = hasSales ? hallRevenue + deliveryRevenue + otherIncome : bankChannelIn + otherIncome;
  const deliveryFee = hasSales ? sales.reduce((a, s) => a + feeOf(s), 0) : 0;

  // 대분류·소분류별 비용 = 출금 − 같은 항목으로 분류한 입금(환급·결제 취소). 환급은 매출이 아니라 원래 비용에서 빠진다.
  const byMajor = new Map<Major, Map<string, number>>();
  let ownerDraw = 0;
  for (const t of txs) {
    if (!t.major || t.major === "수입" || t.major === EXCLUDED_MAJOR) continue;
    const amount = t.out - t.in;
    if (amount === 0) continue;
    const minor = t.minor ?? "기타";
    if (t.major === OWNER_DRAW.major && minor === OWNER_DRAW.minor) {
      ownerDraw += amount;
      continue;
    }
    const m = byMajor.get(t.major) ?? new Map<string, number>();
    m.set(minor, (m.get(minor) ?? 0) + amount);
    byMajor.set(t.major, m);
  }
  if (deliveryFee !== 0) {
    const m = byMajor.get("영업비") ?? new Map<string, number>();
    m.set("배달앱 수수료", (m.get("배달앱 수수료") ?? 0) + deliveryFee);
    byMajor.set("영업비", m);
  }

  const total = (major: Major) => [...(byMajor.get(major)?.values() ?? [])].reduce((a, b) => a + b, 0);
  const costLine = (major: Major): PnlLine => ({
    label: major,
    amount: total(major),
    pct: pct(total(major), revenue),
    kind: "cost",
    minors: [...(byMajor.get(major)?.entries() ?? [])]
      .map(([label, amount]) => ({ label, amount }))
      .sort((a, b) => b.amount - a.amount),
  });

  const grossProfit = revenue - total("매출원가");
  const ownerIncome = grossProfit - total("가맹수수료");
  const rest = EXPENSE_MAJORS.filter((m) => m !== "매출원가" && m !== "가맹수수료");
  const operatingProfit = ownerIncome - rest.reduce((a, m) => a + total(m), 0);

  const lines: PnlLine[] = [
    { label: "매출액", amount: revenue, pct: revenue > 0 ? 100 : null, kind: "revenue" },
    costLine("매출원가"),
    { label: "매출총이익", amount: grossProfit, pct: pct(grossProfit, revenue), kind: "subtotal" },
    costLine("가맹수수료"),
    { label: "경영주수입", amount: ownerIncome, pct: pct(ownerIncome, revenue), kind: "subtotal" },
    ...rest.map(costLine),
    { label: "영업이익", amount: operatingProfit, pct: pct(operatingProfit, revenue), kind: "result" },
  ];

  return {
    revenue,
    revenueBasis: hasSales ? "실매출" : "입금액",
    hallRevenue,
    deliveryRevenue,
    otherIncome,
    lines,
    operatingProfit,
    operatingMargin: pct(operatingProfit, revenue),
    ownerDraw,
    excluded,
    deliveryFee,
    unclassified: txs.filter((t) => !t.major).length,
    needsReview: txs.filter((t) => t.review).length,
  };
}

// 지난달 대비 증감 (같은 label끼리)
export function compareLines(now: Pnl, prev: Pnl | null): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const line of now.lines) {
    const p = prev?.lines.find((l) => l.label === line.label);
    out[line.label] = p ? line.amount - p.amount : null;
  }
  return out;
}
