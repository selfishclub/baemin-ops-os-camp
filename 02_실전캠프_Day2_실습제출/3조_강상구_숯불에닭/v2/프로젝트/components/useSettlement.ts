"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { useDaily } from "@/components/useDaily";
import type { useLedger } from "@/components/useLedger";
import { effectiveChannelSales } from "@/lib/effective";
import { HOLIDAYS_KEY, SETTLEMENT_ADJUSTMENTS_KEY, SETTLEMENT_RULES_KEY, settleChannel, type ChannelSettlementSummary, type SettlementAdjustment, type SettlementRule } from "@/lib/settlement";
import { getStore } from "@/lib/storage";
import type { ChannelSale } from "@/lib/types";

export interface SettlementState {
  loaded: boolean;
  rules: SettlementRule[];
  holidays: string[];
  results: ChannelSettlementSummary[]; // 규칙이 있고 일별 매출이 있는 채널만
  effectiveSales: ChannelSale[]; // 손익·수수료 계산용 이 달 실매출
  saveRules: (rules: SettlementRule[]) => Promise<void>;
  saveHolidays: (days: string[]) => Promise<void>;
  adjustments: SettlementAdjustment[];
  saveAdjustment: (a: SettlementAdjustment) => Promise<void>; // amount 0이면 지움
}

// 정산 규칙 + 짝 맞춤 결과 + 손익용 실매출. 정산 탭과 손익 탭이 같이 쓴다.
export function useSettlement(month: string, ledger: ReturnType<typeof useLedger>, daily: ReturnType<typeof useDaily>): SettlementState {
  const [rules, setRules] = useState<SettlementRule[]>([]);
  const [holidays, setHolidays] = useState<string[]>([]);
  const [adjustments, setAdjustments] = useState<SettlementAdjustment[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const store = getStore();
      const [r, h, a] = await Promise.all([store.getSetting<SettlementRule[]>(SETTLEMENT_RULES_KEY), store.getSetting<string[]>(HOLIDAYS_KEY), store.getSetting<SettlementAdjustment[]>(SETTLEMENT_ADJUSTMENTS_KEY)]);
      setAdjustments(a ?? []);
      // 예전 기본값(쿠팡이츠 주 단위 금요일 = 미확인 상태)은 확인된 규칙(+4영업일)으로 바꿔 둔다
      const fixed = (r ?? []).map((x) => {
        const y = x.channel === "coupang" && x.mode === "weekly" && x.weekday === 4 ? { ...x, mode: "days" as const, days: 4 } : x;
        return y.channel === "coupang" && y.manual === undefined ? { ...y, manual: true } : y; // 쿠팡이츠는 직접 출금 신청 (한 번만 켜 둠, 끌 수 있음)
      });
      if (JSON.stringify(fixed) !== JSON.stringify(r ?? [])) await store.saveSetting(SETTLEMENT_RULES_KEY, fixed);
      setRules(fixed);
      setHolidays(h ?? []);
      setLoaded(true);
    })();
  }, []);

  const saveRules = useCallback(async (next: SettlementRule[]) => {
    setRules(next);
    await getStore().saveSetting(SETTLEMENT_RULES_KEY, next);
  }, []);
  const saveHolidays = useCallback(async (next: string[]) => {
    setHolidays(next);
    await getStore().saveSetting(HOLIDAYS_KEY, next);
  }, []);
  const saveAdjustment = useCallback(
    async (a: SettlementAdjustment) => {
      const next = adjustments.filter((x) => !(x.channel === a.channel && x.date === a.date));
      if (a.amount > 0) next.push(a);
      setAdjustments(next);
      await getStore().saveSetting(SETTLEMENT_ADJUSTMENTS_KEY, next);
    },
    [adjustments],
  );

  const txsAll = useMemo(() => [...ledger.txs, ...ledger.nextTxs], [ledger.txs, ledger.nextTxs]);
  const hasDaily = daily.sales.some((s) => s.date.startsWith(month));

  const results = useMemo(() => {
    if (!hasDaily) return [];
    const settleable = daily.channels.filter((c) => c.active && c.kind !== "cash");
    return rules
      .filter((r) => settleable.some((c) => c.id === r.channel))
      .map((r) => settleChannel(r.channel, month, r, daily.sales, txsAll, ledger.lastBankDate, holidays, adjustments));
  }, [rules, hasDaily, daily.channels, daily.sales, month, txsAll, ledger.lastBankDate, holidays, adjustments]);

  const effectiveSales = useMemo(
    () => (ledger.loading || daily.loading ? [] : effectiveChannelSales(month, ledger.sales, daily.sales, daily.channels, results)),
    [ledger.loading, daily.loading, month, ledger.sales, daily.sales, daily.channels, results],
  );

  return { loaded, rules, holidays, results, effectiveSales, saveRules, saveHolidays, adjustments, saveAdjustment };
}
