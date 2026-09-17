"use client";

import { useCallback, useEffect, useState } from "react";
import { logEdit, prevMonth } from "@/lib/month";
import { getStore } from "@/lib/storage";
import type { ChannelSale, Month, MonthClosing, Rule, Transaction } from "@/lib/types";

export interface Ledger {
  loading: boolean;
  error: string | null;
  txs: Transaction[];
  sales: ChannelSale[];
  prevTxs: Transaction[];
  prevSales: ChannelSale[];
  rules: Rule[];
  closing: MonthClosing | null;
  reload: () => Promise<void>;
  // 마감한 달을 고치면 기록을 남긴다 (마감 전이면 아무 일도 안 함)
  recordEdit: (what: string) => Promise<void>;
}

export function useLedger(month: Month): Ledger {
  const [state, setState] = useState<Omit<Ledger, "reload" | "recordEdit">>({
    loading: true,
    error: null,
    txs: [],
    sales: [],
    prevTxs: [],
    prevSales: [],
    rules: [],
    closing: null,
  });

  const reload = useCallback(async () => {
    const store = getStore();
    try {
      const prev = prevMonth(month);
      const [txs, sales, prevTxs, prevSales, rules, closing] = await Promise.all([
        store.listTransactions(month),
        store.listChannelSales(month),
        store.listTransactions(prev),
        store.listChannelSales(prev),
        store.listRules(),
        store.getClosing(month),
      ]);
      txs.sort((a, b) => a.date.localeCompare(b.date));
      setState({ loading: false, error: null, txs, sales, prevTxs, prevSales, rules, closing });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : String(e) }));
    }
  }, [month]);

  useEffect(() => {
    setState((s) => ({ ...s, loading: true }));
    void reload();
  }, [reload]);

  const recordEdit = useCallback(
    async (what: string) => {
      const store = getStore();
      const next = logEdit(await store.getClosing(month), what);
      if (next && next.closedAt) await store.saveClosing(next);
    },
    [month],
  );

  return { ...state, reload, recordEdit };
}
