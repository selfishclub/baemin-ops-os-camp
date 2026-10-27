"use client";

import { useEffect, useMemo, useState } from "react";
import { useDaily } from "@/components/useDaily";
import { useLedger } from "@/components/useLedger";
import { useSettlement } from "@/components/useSettlement";
import { PURCHASES_KEY_PREFIX, materialPaidBasis, type Purchase } from "@/lib/costing/purchases";
import { monthSummary, todayStr } from "@/lib/daily";
import { fixedCostGaps, FIXED_COSTS_KEY, type FixedCost } from "@/lib/fixedCosts";
import { EMPTY_FIXED_LABOR, FIXED_LABOR_KEY, type FixedLabor } from "@/lib/labor";
import { computePnl } from "@/lib/pnl";
import { getStore } from "@/lib/storage";
import { vatBasisFrom, type VatBasis } from "@/lib/vatBasis";
import { HOMETAX_KEY, hometaxMonth, type HometaxMonth, type HometaxStore } from "@/lib/hometax";

/** 홈택스 매입 자료를 새로 올리면 손익을 다시 계산하라는 신호 (components/HometaxCard.tsx) */
export const HOMETAX_CHANGED = "hometax-changed";
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
  // 손익은 부가세 뺀 공급가로 본다 (2026-10-26) — 재료비 공급가 비율·의제매입세액은 그 달 영수증에서
  // 홈택스 자료가 있는 달은 카드로 산 것의 부가세를 그 달 통장 줄(체크카드 결제)에서 센다
  const [vatSrc, setVatSrc] = useState<{ ps: Purchase[]; hm: HometaxMonth | null }>({ ps: [], hm: null });
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
    const load = () =>
      Promise.all([getStore().getSetting<Purchase[]>(PURCHASES_KEY_PREFIX + month), getStore().getSetting<HometaxStore>(HOMETAX_KEY)])
        .then(([ps, ht]) => {
          const sum = materialPaidBasis(ps ?? []);
          setMaterialPurchases(sum);
          setPurchaseCount((ps ?? []).length);
          setVatSrc({ ps: ps ?? [], hm: hometaxMonth(ht, month, ps ?? []) });
        })
        .catch(() => {
          setMaterialPurchases(0);
          setPurchaseCount(0);
          setVatSrc({ ps: [], hm: null });
        });
    void load();
    window.addEventListener(HOMETAX_CHANGED, load);
    return () => window.removeEventListener(HOMETAX_CHANGED, load);
  }, [month]);

  const vat = useMemo<VatBasis>(() => vatBasisFrom(vatSrc.ps, undefined, vatSrc.hm, ledger.txs), [vatSrc, ledger.txs]);
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
        fixedCostGaps(fixedCosts, ledger.txs, month),
        vat,
      ),
    [ledger.txs, settlement.effectiveSales, summary.labor, fixedLabor, materialPurchases, fixedCosts, month, vat],
  );
  const empty = ledger.txs.length === 0 && settlement.effectiveSales.length === 0;

  return { loading, ledger, daily, settlement, summary, pnl, empty, purchaseCount, fixedCosts, today, vat };
}
