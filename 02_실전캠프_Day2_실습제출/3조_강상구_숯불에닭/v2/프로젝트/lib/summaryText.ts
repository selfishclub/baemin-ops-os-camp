import type { Pnl } from "./pnl";
import { computeRatios, type RatioLimits } from "./ratios";

// 한 달 손익을 카톡에 붙일 몇 줄로 (본노엘 "카톡용 텍스트 복사"에서 따옴).
// 복사만 한다. 보내는 건 사장님이 직접 (자동 전송 없음).

export interface SummaryTextInput {
  monthName: string; // "9월"
  prevName?: string; // "8월"
  pnl: Pnl;
  prevProfit?: number | null;
  closed: boolean;
  missingDays: number;
  limits?: RatioLimits;
}

const n = (v: number) => Math.round(v).toLocaleString("ko-KR");
const p = (v: number | null) => (v === null ? "–" : `${v.toFixed(1)}%`);

export function monthSummaryText(i: SummaryTextInput): string {
  const { pnl } = i;
  const out: string[] = [];
  out.push(`[${i.monthName} 손익 요약] ${i.closed ? "마감" : "마감 전"}`);
  out.push(`매출 ${n(pnl.revenue)}원` + (pnl.revenueBasis === "실매출" ? ` (홀 ${n(pnl.hallRevenue)} · 배달 ${n(pnl.deliveryRevenue)})` : " (통장 입금액 기준)"));
  let profit = `영업이익 ${n(pnl.operatingProfit)}원 (이익률 ${p(pnl.operatingMargin)})`;
  if (i.prevProfit !== null && i.prevProfit !== undefined && i.prevName) {
    const d = pnl.operatingProfit - i.prevProfit;
    profit += ` · ${i.prevName}보다 ${d >= 0 ? "▲" : "▼"}${n(Math.abs(d))}`;
  }
  out.push(profit);
  const r = computeRatios(pnl, i.limits);
  out.push(r.slice(0, 3).map((x) => `${x.label} ${p(x.pct)}${x.over ? "(기준 넘음)" : ""}`).join(" · "));
  const big = pnl.lines
    .filter((l) => l.kind === "cost" && l.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3)
    .map((l) => `${l.label} ${n(l.amount)}`);
  if (big.length) out.push(`큰 비용: ${big.join(" · ")}`);
  if (pnl.ownerDraw > 0) out.push(`가져간 돈(생활비) ${n(pnl.ownerDraw)}원 — 비용엔 안 넣음`);
  const est = pnl.estimates.reduce((a, e) => a + e.amount, 0);
  if (est > 0) out.push(`※ 어림값 ${n(est)}원 포함 (아직 통장에서 안 나간 돈)`);
  if (i.missingDays > 0) out.push(`※ 매출 미입력 ${i.missingDays}일`);
  return out.join("\n");
}
