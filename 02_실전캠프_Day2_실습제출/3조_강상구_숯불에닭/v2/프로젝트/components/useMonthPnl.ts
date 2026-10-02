"use client";

import { useEffect, useMemo, useState } from "react";
import { useDaily } from "@/components/useDaily";
import { useLedger } from "@/components/useLedger";
import { useSettlement } from "@/components/useSettlement";
import { PURCHASES_KEY_PREFIX, type Purchase } from "@/lib/costing/purchases";
import { monthSummary, todayStr } from "@/lib/daily";
import { fixedCostGaps, FIXED_COSTS_KEY, type FixedCost } from "@/lib/fixedCosts";
import { EMPTY_FIXED_LABOR, FIXED_LABOR_KEY, type FixedLabor } from "@/lib/labor";
import { computePnl } from "@/lib/pnl";
import { getStore } from "@/lib/storage";
import type { Month } from "@/lib/types";

// 한 달 손익을 손익 탭과 똑같은 방식으로 계산한다.
// 이번 달과 지난달에 같이 써서 "지난달 대비"가 같은 잣대로 비교되게 한다
// (전에는 지난달을 통장 + 정산 탭 월 합계만으로 계산해서, 일별 매출·어림 인건비가 빠진 채 비교됐다).
export function useMonthPnl(month: Month) {
  const ledger = useLedger(month);
  const daily = useDaily(month);
  const settlement = useSettlement(month, ledger, daily);
  const [fixedLabor, setFixedLabor] = useState<FixedLabor>(EMPTY_FIXED_LABOR);
  // 그 달 매입 영수증의 재료비 합계 — 통장에서 아직 안 나간 몫을 원가에 더하려고
  const [materialPurchases, setMaterialPurchases] = useState(0);
  const [purchaseCount, setPurchaseCount] = useState(0); // 그 달 매입 영수증 수 — "자료 다 들어왔나" 체크용
  const [fixedCosts, setFixedCosts] = useState<FixedCost[]>([]);

  useEffect(() => {
    getStore()
      .getSetting<FixedLabor>(FIXED_LABOR_KEY)
      .then((v) => v && setFixedLabor(v))
      .catch(() => {});
    getStore()
      .getSetting<FixedCost[]>(FIXED_COSTS_KEY)
      .then((v) => setFixedCosts(v ?? []))
      .catch(() => {});
  }, []);
  useEffect(() => {
    getStore()
      .getSetting<Purchase[]>(PURCHASES_KEY_PREFIX + month)
      .then((ps) => {
        const sum = (ps ?? []).reduce((a, p) => a + (p.lines ?? []).filter((l) => l.category === "원재료비" || l.category === "기타재료비").reduce((x, l) => x + l.amount, 0), 0);
        setMaterialPurchases(sum);
        setPurchaseCount((ps ?? []).length);
      })
      .catch(() => {
        setMaterialPurchases(0);
        setPurchaseCount(0);
      });
  }, [month]);

  const loading = ledger.loading || daily.loading || !settlement.loaded;
  const today = todayStr();
  const summary = useMemo(() => monthSummary(month, daily.sales, daily.shifts, daily.staff, today), [month, daily.sales, daily.shifts, daily.staff, today]);
  const pnl = useMemo(
    () =>
      computePnl(
        ledger.txs,
        settlement.effectiveSales,
        { hourly: summary.labor, salary: fixedLabor.salary, insurance: fixedLabor.insurance },
        materialPurchases,
        fixedCostGaps(fixedCosts, ledger.txs),
      ),
    [ledger.txs, settlement.effectiveSales, summary.labor, fixedLabor, materialPurchases, fixedCosts],
  );
  const empty = ledger.txs.length === 0 && settlement.effectiveSales.length === 0;

  return { loading, ledger, daily, settlement, summary, pnl, empty, purchaseCount, fixedCosts, today };
}
