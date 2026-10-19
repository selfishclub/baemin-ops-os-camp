import type { MarketInflow } from "../export/types";
import { INFLOW_EVENTS, type InflowEvent } from "./inflowEvents";
type Entry = { start: string; end: string; items: { keyword: string; pv: number }[] };
const sum = (items: Entry["items"]) => items.reduce((total, item) => total + item.pv, 0);
const normalize = (word: string) => word.replace(/\s+/g, "");
const dayShift = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const dayCount = (start: string, end: string) => Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
export function matchingInflow(entry: Entry, pattern: string) {
  const matcher = new RegExp(pattern);
  const items = entry.items.filter(item => matcher.test(normalize(item.keyword)));
  return { count: sum(items), items: [...items].sort((a, b) => b.pv - a.pv) };
}
export function inflowDailyEntries(inflow: MarketInflow) {
  // 겹치는 주간·월간 자료를 합산하지 않고 날짜별 자료만 사용한다.
  const days = new Map<string, Entry>();
  for (const entry of Object.values(inflow.periods ?? {})) if (entry.start === entry.end) days.set(entry.start, entry);
  return [...days.values()].sort((a, b) => a.start.localeCompare(b.start));
}
export function eventEvidence(inflow: MarketInflow, event: InflowEvent) {
  const allDays = inflowDailyEntries(inflow);
  const days = allDays.filter(day => day.start >= event.start && day.end <= event.end).map(day => ({ date: day.start, ...matchingInflow(day, event.pattern) }));
  const peak = [...days].sort((a, b) => b.count - a.count || a.date.localeCompare(b.date))[0] ?? null;
  const comparison = peak ? allDays.find(day => day.start === dayShift(peak.date, -7)) : undefined;
  const baseline = comparison ? { date: comparison.start, ...matchingInflow(comparison, event.pattern) } : null;
  const months = Object.entries(inflow.months ?? {}).filter(([, month]) => month.start <= event.end && month.end >= event.start && month.items.length > 0).map(([month, entry]) => ({ month, ...matchingInflow(entry, event.pattern) }));
  const observed = days.reduce((n, day) => n + day.count, 0);
  const label = peak && baseline ? peak.count > baseline.count ? "비교일보다 증가" : "증가 확인 안 됨" : days.length ? observed > 0 ? "행사일 유입 대조" : "확인한 날 유입 없음" : "월별 후보 · 일간 미확인";
  return { event, days, peak, baseline, months, observed, expectedDays: dayCount(event.start, event.end), label, hasSignal: observed > 0 || months.some(month => month.count > 0) };
}
export function inflowResearch(inflow: MarketInflow) {
  const monthEntries = Object.entries(inflow.months ?? {}).sort(([a], [b]) => a.localeCompare(b));
  const cases = INFLOW_EVENTS.map(event => eventEvidence(inflow, event)).filter(item => item.hasSignal).sort((a, b) => {
    const score = (item: typeof a) => item.peak && item.baseline && item.peak.count > item.baseline.count ? 2 : item.days.some(day => day.count > 0) ? 1 : 0;
    return score(b) - score(a) || b.event.start.localeCompare(a.event.start);
  });
  const changes: { month: string; keyword: string; count: number; previous: number; ratio: number | null; events: InflowEvent[] }[] = [];
  const brand = /숯불에\s?닭|숯불의\s?닭|숮불에\s?닭|숯불에닥|검색어 없음/;
  for (const [month, entry] of monthEntries) {
    if (!entry.items.length) continue;
    const date = new Date(`${month}-01T00:00:00Z`);
    const previousMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
    const previous = inflow.months?.[previousMonth];
    if (!previous?.items.length) continue; // 자료 없는 달을 0으로 취급하지 않는다.
    const counts = new Map<string, number>();
    const before = new Map<string, number>();
    for (const row of entry.items) counts.set(normalize(row.keyword), (counts.get(normalize(row.keyword)) ?? 0) + row.pv);
    for (const row of previous.items) before.set(normalize(row.keyword), (before.get(normalize(row.keyword)) ?? 0) + row.pv);
    for (const [keyword, count] of counts) {
      if (count < 5 || brand.test(keyword)) continue;
      const previousCount = before.get(keyword) ?? 0;
      const ratio = previousCount ? (count / dayCount(entry.start, entry.end)) / (previousCount / dayCount(previous.start, previous.end)) : null;
      if (ratio !== null && ratio < 2) continue;
      changes.push({ month, keyword, count, previous: previousCount, ratio, events: INFLOW_EVENTS.filter(event => entry.start <= event.end && entry.end >= event.start && new RegExp(event.pattern).test(keyword)) });
    }
  }
  changes.sort((a, b) => b.month.localeCompare(a.month) || b.count - a.count);
  return { cases, changes, months: monthEntries.map(([month, entry]) => ({ month, start: entry.start, end: entry.end, count: sum(entry.items), hasData: entry.items.length > 0, keywords: entry.items.length })), dailyCount: inflowDailyEntries(inflow).length };
}
