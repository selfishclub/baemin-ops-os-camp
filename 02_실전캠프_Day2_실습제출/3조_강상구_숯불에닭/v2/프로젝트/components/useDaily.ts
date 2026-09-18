"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_CHANNELS, type Channel } from "@/lib/categories";
import { getStore } from "@/lib/storage";
import type { DailySale, Month, Shift, Staff } from "@/lib/types";

export const CHANNELS_KEY = "channels";

export interface Daily {
  loading: boolean;
  error: string | null;
  sales: DailySale[];
  shifts: Shift[];
  staff: Staff[];
  channels: Channel[];
  reload: () => Promise<void>;
}

// 한 달 치 일별 매출·근무 + 직원·채널 설정
export function useDaily(month: Month): Daily {
  const [state, setState] = useState<Omit<Daily, "reload">>({
    loading: true,
    error: null,
    sales: [],
    shifts: [],
    staff: [],
    channels: DEFAULT_CHANNELS,
  });

  const reload = useCallback(async () => {
    const store = getStore();
    try {
      const [sales, shifts, staff, channels] = await Promise.all([
        store.listDailySales(month),
        store.listShifts(month),
        store.listStaff(),
        store.getSetting<Channel[]>(CHANNELS_KEY),
      ]);
      setState({ loading: false, error: null, sales, shifts, staff, channels: channels?.length ? channels : DEFAULT_CHANNELS });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : String(e) }));
    }
  }, [month]);

  useEffect(() => {
    setState((s) => ({ ...s, loading: true }));
    void reload();
  }, [reload]);

  return { ...state, reload };
}
