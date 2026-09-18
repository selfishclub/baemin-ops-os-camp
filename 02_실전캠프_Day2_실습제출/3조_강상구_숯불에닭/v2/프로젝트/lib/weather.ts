import type { Channel } from "./categories";
import { daysInMonth, shiftDate, todayStr } from "./daily";
import type { DailySale, Shift, Staff } from "./types";

// 날씨 × 매출 — 일별 매출 옆에 그날 날씨를 붙여 "비 오는 날 배달이 얼마나 느나"를 본다.
// 날씨는 Open-Meteo(무료, 키 없음)에서 가져온다. 청주 율량동 좌표.
export const STORE_LOCATION = { latitude: 36.66, longitude: 127.48, name: "청주 율량동" };

export type WeatherKind = "맑음" | "흐림" | "비" | "눈";

export interface DailyWeather {
  date: string;
  kind: WeatherKind;
  tempMax: number;
  tempMin: number;
  rainMm: number;
  source: "open-meteo" | "sample";
}

// WMO 날씨 코드 → 네 가지로 줄인다
export function kindFromCode(code: number): WeatherKind {
  if (code <= 1) return "맑음";
  if (code <= 3 || code === 45 || code === 48) return "흐림";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "눈";
  return "비";
}

export const KIND_ICON: Record<WeatherKind, string> = { 맑음: "☀️", 흐림: "☁️", 비: "🌧️", 눈: "❄️" };

interface OpenMeteoDaily {
  time: string[];
  weathercode: number[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  precipitation_sum: number[];
}

function toRecords(d: OpenMeteoDaily): DailyWeather[] {
  return d.time.map((date, i) => ({
    date,
    kind: kindFromCode(d.weathercode[i] ?? 0),
    tempMax: Math.round((d.temperature_2m_max[i] ?? 0) * 10) / 10,
    tempMin: Math.round((d.temperature_2m_min[i] ?? 0) * 10) / 10,
    rainMm: Math.round((d.precipitation_sum[i] ?? 0) * 10) / 10,
    source: "open-meteo",
  }));
}

const DAILY = "weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum";

// 과거 날씨 (어제까지). 오늘·미래는 forecast 로.
export async function fetchPastWeather(from: string, to: string): Promise<DailyWeather[]> {
  const { latitude, longitude } = STORE_LOCATION;
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude}&longitude=${longitude}&start_date=${from}&end_date=${to}&daily=${DAILY}&timezone=Asia%2FSeoul`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`날씨를 가져오지 못했어요 (${res.status})`);
  const json = (await res.json()) as { daily?: OpenMeteoDaily };
  return json.daily ? toRecords(json.daily) : [];
}

// 오늘부터 7일 예보 (오늘 포함)
export async function fetchForecast(days = 7): Promise<DailyWeather[]> {
  const { latitude, longitude } = STORE_LOCATION;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=${DAILY}&forecast_days=${days}&timezone=Asia%2FSeoul`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`예보를 가져오지 못했어요 (${res.status})`);
  const json = (await res.json()) as { daily?: OpenMeteoDaily };
  return json.daily ? toRecords(json.daily) : [];
}

// 매출이 있는 날 중 날씨가 아직 없는 날짜 (과거만)
export function missingWeatherDates(sales: DailySale[], weather: DailyWeather[], today = todayStr()): string[] {
  const have = new Set(weather.map((w) => w.date));
  return [...new Set(sales.map((s) => s.date))].filter((d) => d < today && !have.has(d)).sort();
}

// ── 분석 ────────────────────────────────────────────────────────────
export interface WeatherStat {
  kind: WeatherKind;
  days: number;
  avgSales: number;
  avgHall: number;
  avgDelivery: number;
  deliveryShare: number | null; // 배달 ÷ 전체 %
  laborRate: number | null; // 인건비 ÷ 매출 %
}

export interface WeatherAnalysis {
  days: number; // 매출과 날씨가 둘 다 있는 날
  overallAvg: number;
  byKind: WeatherStat[];
  byWeekdayKind: Record<number, Partial<Record<WeatherKind, { days: number; avgSales: number }>>>; // 0=월
  rainEffect: { delivery: number | null; hall: number | null; total: number | null }; // 비 오는 날 vs 맑은 날 %
  hot: { threshold: number; days: number; avgSales: number } | null; // 30도 이상
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const dow = (d: string) => (new Date(d + "T00:00:00Z").getUTCDay() + 6) % 7;

export function analyzeWeather(sales: DailySale[], weather: DailyWeather[], channels: Channel[], shifts: Shift[] = [], staff: Staff[] = []): WeatherAnalysis {
  const isDelivery = (ch: string) => channels.find((c) => c.id === ch)?.kind === "delivery";
  const wByDate = new Map(weather.map((w) => [w.date, w]));
  const wage = new Map(staff.map((s) => [s.id, s.wage]));

  // 날짜별 합계
  const days = new Map<string, { total: number; hall: number; delivery: number; labor: number; w: DailyWeather }>();
  for (const s of sales) {
    const w = wByDate.get(s.date);
    if (!w) continue;
    const d = days.get(s.date) ?? { total: 0, hall: 0, delivery: 0, labor: 0, w };
    d.total += s.amount;
    if (isDelivery(s.channel)) d.delivery += s.amount;
    else d.hall += s.amount;
    days.set(s.date, d);
  }
  for (const sh of shifts) {
    const d = days.get(sh.date);
    if (d) d.labor += sh.hours * (wage.get(sh.staffId) ?? 0);
  }

  const list = [...days.entries()].filter(([, d]) => d.total > 0);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
  const kinds: WeatherKind[] = ["맑음", "흐림", "비", "눈"];
  const byKind: WeatherStat[] = kinds
    .map((kind) => {
      const ds = list.filter(([, d]) => d.w.kind === kind).map(([, d]) => d);
      const avgSales = avg(ds.map((d) => d.total));
      const avgDelivery = avg(ds.map((d) => d.delivery));
      const labor = ds.reduce((a, d) => a + d.labor, 0);
      const total = ds.reduce((a, d) => a + d.total, 0);
      return {
        kind,
        days: ds.length,
        avgSales,
        avgHall: avg(ds.map((d) => d.hall)),
        avgDelivery,
        deliveryShare: avgSales > 0 ? r1((avgDelivery / avgSales) * 100) : null,
        laborRate: total > 0 && labor > 0 ? r1((labor / total) * 100) : null,
      };
    })
    .filter((k) => k.days > 0);

  const byWeekdayKind: WeatherAnalysis["byWeekdayKind"] = {};
  for (let i = 0; i < 7; i++) byWeekdayKind[i] = {};
  for (const [date, d] of list) {
    const cell = (byWeekdayKind[dow(date)][d.w.kind] ??= { days: 0, avgSales: 0 });
    cell.avgSales = Math.round((cell.avgSales * cell.days + d.total) / (cell.days + 1));
    cell.days += 1;
  }

  const sunny = byKind.find((k) => k.kind === "맑음");
  const rainy = byKind.find((k) => k.kind === "비");
  const eff = (a?: number, b?: number) => (a && b ? r1(((b - a) / a) * 100) : null);
  const hotDays = list.filter(([, d]) => d.w.tempMax >= 30).map(([, d]) => d.total);

  return {
    days: list.length,
    overallAvg: avg(list.map(([, d]) => d.total)),
    byKind,
    byWeekdayKind,
    rainEffect: { delivery: eff(sunny?.avgDelivery, rainy?.avgDelivery), hall: eff(sunny?.avgHall, rainy?.avgHall), total: eff(sunny?.avgSales, rainy?.avgSales) },
    hot: hotDays.length ? { threshold: 30, days: hotDays.length, avgSales: avg(hotDays) } : null,
  };
}

// 예보 날짜의 예상 매출: 같은 요일·같은 날씨 평균 → 없으면 같은 날씨 평균 → 없으면 전체 평균
export function expectedSales(a: WeatherAnalysis, date: string, kind: WeatherKind): { amount: number; basis: string } | null {
  if (a.days === 0) return null;
  const cell = a.byWeekdayKind[dow(date)]?.[kind];
  if (cell && cell.days >= 2) return { amount: cell.avgSales, basis: `같은 요일·${kind} ${cell.days}일 평균` };
  const k = a.byKind.find((x) => x.kind === kind);
  if (k && k.days >= 2) return { amount: k.avgSales, basis: `${kind} ${k.days}일 평균` };
  return { amount: a.overallAvg, basis: `전체 ${a.days}일 평균` };
}

// 시연용 가짜 날씨 (실제 API가 막혔을 때·과거 자료용). 결정론적.
export function sampleWeather(month: string): DailyWeather[] {
  let seed = 3;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  return daysInMonth(month).map((date) => {
    const r = rnd();
    const kind: WeatherKind = r < 0.5 ? "맑음" : r < 0.72 ? "흐림" : "비";
    const tempMax = Math.round(24 + rnd() * 8);
    return { date, kind, tempMax, tempMin: tempMax - 8, rainMm: kind === "비" ? Math.round(rnd() * 30) : 0, source: "sample" };
  });
}

export function lastNDays(n: number, today = todayStr()): { from: string; to: string } {
  return { from: shiftDate(today, -n), to: shiftDate(today, -1) };
}
