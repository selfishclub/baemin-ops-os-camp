"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_CHANNELS, type Channel } from "@/lib/categories";
import { todayStr } from "@/lib/daily";
import { getStore } from "@/lib/storage";
import type { DailySale, Shift, Staff } from "@/lib/types";
import { analyzeWeather, fetchForecast, fetchPastWeather, missingWeatherDates, type DailyWeather, type WeatherAnalysis } from "@/lib/weather";
import { CHANNELS_KEY } from "./useDaily";

export interface WeatherState {
  loading: boolean;
  error: string | null;
  sales: DailySale[]; // 전체 기간
  weather: DailyWeather[]; // 전체 기간 (저장된 것)
  forecast: DailyWeather[]; // 오늘부터 7일 (저장 안 함)
  channels: Channel[];
  analysis: WeatherAnalysis;
  fetching: boolean;
  fillMissing: () => Promise<number>; // 매출 있는 날의 빠진 날씨를 받아 저장. 받은 날 수
}

// 전체 기간 일별 매출 + 날씨 + 예보. 오늘 탭과 날씨 화면이 같이 쓴다.
export function useWeather(): WeatherState {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sales, setSales] = useState<DailySale[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [weather, setWeather] = useState<DailyWeather[]>([]);
  const [forecast, setForecast] = useState<DailyWeather[]>([]);
  const [channels, setChannels] = useState<Channel[]>(DEFAULT_CHANNELS);
  const [fetching, setFetching] = useState(false);

  const load = useCallback(async () => {
    const store = getStore();
    try {
      const [s, sh, st, w, ch] = await Promise.all([store.listAllDailySales(), store.listAllShifts(), store.listStaff(), store.listWeather("2000-01-01", "2100-01-01"), store.getSetting<Channel[]>(CHANNELS_KEY)]);
      setSales(s);
      setShifts(sh);
      setStaff(st);
      setWeather(w);
      setChannels(ch?.length ? ch : DEFAULT_CHANNELS);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // 예보는 저장하지 않고 열 때마다 받는다 (실패해도 화면은 뜬다)
    fetchForecast(7).then(setForecast).catch(() => setForecast([]));
  }, [load]);

  const fillMissing = useCallback(async () => {
    const missing = missingWeatherDates(sales, weather, todayStr());
    if (missing.length === 0) return 0;
    setFetching(true);
    try {
      const got = await fetchPastWeather(missing[0], missing[missing.length - 1]);
      const need = new Set(missing);
      const records = got.filter((w) => need.has(w.date));
      await getStore().saveWeather(records);
      await load();
      return records.length;
    } finally {
      setFetching(false);
    }
  }, [sales, weather, load]);

  const analysis = useMemo(() => analyzeWeather(sales, weather, channels, shifts, staff), [sales, weather, channels, shifts, staff]);

  return { loading, error, sales, weather, forecast, channels, analysis, fetching, fillMissing };
}
