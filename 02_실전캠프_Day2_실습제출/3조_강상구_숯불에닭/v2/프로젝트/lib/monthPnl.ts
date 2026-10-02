import { DEFAULT_CHANNELS, type Channel } from "./categories";
import { PURCHASES_KEY_PREFIX, type Purchase } from "./costing/purchases";
import { monthSummary } from "./daily";
import { effectiveChannelSales } from "./effective";
import { fixedCostGaps, FIXED_COSTS_KEY, type FixedCost } from "./fixedCosts";
import { EMPTY_FIXED_LABOR, FIXED_LABOR_KEY, type FixedLabor } from "./labor";
import { nextMonth } from "./month";
import { computePnl, type Pnl } from "./pnl";
import { HOLIDAYS_KEY, SETTLEMENT_ADJUSTMENTS_KEY, SETTLEMENT_RULES_KEY, settleChannel, type ChannelSettlementSummary, type SettlementAdjustment, type SettlementRule } from "./settlement";
import type { Store } from "./storage";
import type { DailySale, Month, Transaction } from "./types";

// 정산 규칙이 있는 채널마다 이 달 매출 ↔ 통장 입금 짝 맞추기. 손익 탭(useSettlement)과 1년 화면이 같이 쓴다.
export function monthSettlements(
  month: Month,
  rules: SettlementRule[],
  channels: Channel[],
  dailySales: DailySale[],
  txsAll: Transaction[], // 이 달 + 다음 달 초 통장 (이 달 주문분 정산이 다음 달에 들어온다)
  lastBankDate: string,
  holidays: string[],
  adjustments: SettlementAdjustment[],
): ChannelSettlementSummary[] {
  if (!dailySales.some((s) => s.date.startsWith(month))) return [];
  const settleable = channels.filter((c) => c.active && c.kind !== "cash");
  return rules.filter((r) => settleable.some((c) => c.id === r.channel)).map((r) => settleChannel(r.channel, month, r, dailySales, txsAll, lastBankDate, holidays, adjustments));
}

// 나중에 생긴 기본 채널(현금영수증·계좌이체 등)은 저장해 둔 목록에 더해 준다 (useDaily와 같게)
export const mergeChannels = (saved: Channel[] | null) =>
  saved?.length ? [...saved, ...DEFAULT_CHANNELS.filter((d) => !saved.some((c) => c.id === d.id))] : DEFAULT_CHANNELS;

export interface MonthPnlRow {
  month: Month;
  pnl: Pnl;
  empty: boolean; // 그 달 자료가 하나도 없음
  closed: boolean;
}

// 여러 달 손익을 한 번에 — 1년 화면용. 계산은 손익 탭과 똑같다 (useMonthPnl과 같은 재료, 같은 함수).
export async function loadMonthPnls(store: Store, months: Month[]): Promise<MonthPnlRow[]> {
  const [rules, holidays, adjustments, channelsSaved, staff, fixedLabor, fixedCosts, uploads] = await Promise.all([
    store.getSetting<SettlementRule[]>(SETTLEMENT_RULES_KEY),
    store.getSetting<string[]>(HOLIDAYS_KEY),
    store.getSetting<SettlementAdjustment[]>(SETTLEMENT_ADJUSTMENTS_KEY),
    store.getSetting<Channel[]>("channels"),
    store.listStaff(),
    store.getSetting<FixedLabor>(FIXED_LABOR_KEY),
    store.getSetting<FixedCost[]>(FIXED_COSTS_KEY),
    store.listUploads(),
  ]);
  const channels = mergeChannels(channelsSaved);
  const lastBankDate = uploads.reduce((a, u) => (u.to > a ? u.to : a), "");
  const labor = fixedLabor ?? EMPTY_FIXED_LABOR;

  return Promise.all(
    months.map(async (month): Promise<MonthPnlRow> => {
      const [txs, nextTxs, saved, daily, shifts, purchases, closing] = await Promise.all([
        store.listTransactions(month),
        store.listTransactions(nextMonth(month)),
        store.listChannelSales(month),
        store.listDailySales(month),
        store.listShifts(month),
        store.getSetting<Purchase[]>(PURCHASES_KEY_PREFIX + month),
        store.getClosing(month),
      ]);
      const results = monthSettlements(month, rules ?? [], channels, daily, [...txs, ...nextTxs], lastBankDate, holidays ?? [], adjustments ?? []);
      const sales = effectiveChannelSales(month, saved, daily, channels, results);
      const summary = monthSummary(month, daily, shifts, staff);
      const material = (purchases ?? []).reduce((a, p) => a + (p.lines ?? []).filter((l) => l.category === "원재료비" || l.category === "기타재료비").reduce((x, l) => x + l.amount, 0), 0);
      const pnl = computePnl(txs, sales, { hourly: summary.labor, salary: labor.salary, insurance: labor.insurance }, material, fixedCostGaps(fixedCosts ?? [], txs));
      return { month, pnl, empty: txs.length === 0 && sales.length === 0, closed: !!closing?.closedAt };
    }),
  );
}
