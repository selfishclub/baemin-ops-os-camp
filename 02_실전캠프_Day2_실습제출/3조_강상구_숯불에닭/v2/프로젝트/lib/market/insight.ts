import type { DailyWeather } from "@/lib/weather";
import { dayTotal, type HistoryDay } from "@/lib/history";
import type { Shift } from "@/lib/types";
import type { SbizReport } from "./sbizReport";

// 상권 읽어 주기 — 소상공인365 보고서(동네)와 장부(우리 가게)를 맞대서 "해 볼 것"까지 문장으로 만든다.
// AI 없이 정해 둔 규칙만 쓴다. 우리 가게 숫자는 장부가 쌓일수록, 동네 숫자는 보고서를 새로 넣을 때마다 바뀐다.

export interface DaySales {
  date: string;
  total: number;
}

export interface Insight {
  id: string;
  tone: "warn" | "good" | "info";
  title: string;
  detail: string;
  todo?: string;
}

const MON_FIRST = ["월", "화", "수", "목", "금", "토", "일"];
const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
/** 0=월 … 6=일 */
const monIndex = (date: string) => (new Date(`${date}T00:00:00`).getDay() + 6) % 7;
const daysIn = (month: string) => new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
const addMonths = (month: string, k: number) => {
  const d = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + k, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/** 영업한 날만 (오늘은 아직 덜 들어왔으니 뺀다).
 *  보통 날의 5분의 1도 안 되는 날은 덜 들어온 날로 보고 뺀다 — 장부 첫 며칠은 배달 매출만 들어가 있다 */
export function openDays(days: DaySales[], today: string): DaySales[] {
  const open = days.filter((d) => d.date < today && d.total > 0);
  const sorted = open.map((d) => d.total).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  return open.filter((d) => d.total >= median * 0.2);
}

export interface WeekdayRow {
  label: string;
  ours: number; // 우리 가게 요일 비율 %
  area: number; // 동네 요일 비율 %
  gap: number; // 우리 - 동네 (%p)
}

/** 요일별 매출 비율을 동네와 견준다. 3주가 안 쌓였으면 null */
export function weekdayCompare(report: SbizReport, days: DaySales[]): WeekdayRow[] | null {
  if (!report.salesWeekday || days.length < 21) return null;
  const by: number[][] = Array.from({ length: 7 }, () => []);
  for (const d of days) by[monIndex(d.date)].push(d.total);
  const avgs = by.map(avg);
  const sum = avgs.reduce((a, b) => a + b, 0);
  if (sum === 0) return null;
  return MON_FIRST.map((label, i) => {
    const ours = round1((avgs[i] / sum) * 100);
    const area = report.salesWeekday![i];
    return { label, ours, area, gap: round1(ours - area) };
  });
}

export interface RainGap {
  rainDays: number;
  dryDays: number;
  rainAvg: number;
  dryAvg: number;
  pct: number; // 비·눈 온 날이 안 온 날보다 몇 % 다른가
}

/** 비·눈 온 날과 아닌 날의 하루 평균 매출. 이슬비(1mm 미만)는 안 온 날로 본다. 비 온 날 3일, 안 온 날 7일이 안 되면 null */
export function rainGap(days: DaySales[], weather: DailyWeather[]): RainGap | null {
  const w = new Map(weather.map((x) => [x.date, x]));
  const rain: number[] = [];
  const dry: number[] = [];
  for (const d of days) {
    const x = w.get(d.date);
    if (!x) continue;
    (x.rainMm >= 1 || x.kind === "눈" ? rain : dry).push(d.total);
  }
  if (rain.length < 3 || dry.length < 7) return null;
  const rainAvg = avg(rain);
  const dryAvg = avg(dry);
  return { rainDays: rain.length, dryDays: dry.length, rainAvg, dryAvg, pct: round1(((rainAvg - dryAvg) / dryAvg) * 100) };
}

/** 가게 일 시작 시(時) — 세 번 이상 나온 근무 시작 중 가장 이른 것 (한두 번 일찍 온 날은 뺀다) */
export function usualStartHour(shifts: Shift[]): number | null {
  const count = new Map<number, number>();
  for (const s of shifts) {
    const h = Number(s.start?.slice(0, 2));
    if (s.start && Number.isFinite(h)) count.set(h, (count.get(h) ?? 0) + 1);
  }
  const often = [...count].filter(([, c]) => c >= 3).map(([h]) => h);
  return often.length ? Math.min(...often) : null;
}

export interface SeasonMonth {
  month: number; // 1~12
  perDay: number; // 동네 한 곳 하루 평균 매출 (원)
  vsAvg: number; // 1년 평균 대비 %
  tax: string | null;
}

// 부가세 — 개인 일반과세자 기준. 법인·간이과세자는 다르다(확인 필요)
const TAX: Record<number, string> = {
  1: "1월 25일 부가세 확정 납부 (지난해 7~12월분)",
  4: "4월 25일 부가세 예정 고지 (확인 필요)",
  7: "7월 25일 부가세 확정 납부 (1~6월분)",
  10: "10월 25일 부가세 예정 고지 (확인 필요)",
};

/** 달마다 하루 평균 — 달 길이가 달라서(2월 28일) 한 달 합계로 견주면 틀린다 */
export function seasonByMonth(report: SbizReport): Map<number, number> {
  const by = new Map<number, number[]>();
  for (const m of report.months) {
    if (m.sales === null) continue;
    const mo = Number(m.month.slice(5, 7));
    by.set(mo, [...(by.get(mo) ?? []), m.sales / daysIn(m.month)]);
  }
  return new Map([...by].map(([k, v]) => [k, avg(v)]));
}

/** 이번 달 다음부터 석 달 */
export function seasonOutlook(report: SbizReport, today: string, ahead = 3): SeasonMonth[] {
  const per = seasonByMonth(report);
  if (per.size < 6) return [];
  const mean = avg([...per.values()]);
  const out: SeasonMonth[] = [];
  for (let k = 1; k <= ahead; k++) {
    const mo = Number(addMonths(today.slice(0, 7), k).slice(5, 7));
    const perDay = per.get(mo);
    if (perDay === undefined) continue;
    out.push({ month: mo, perDay, vsAvg: round1(((perDay - mean) / mean) * 100), tax: TAX[mo] ?? null });
  }
  return out;
}

export interface Pace {
  thisPerDay: number;
  lastPerDay: number;
  ours: number; // 우리 지난달 대비 %
  area: number | null; // 동네의 같은 때 지난달 대비 % (작년 보고서)
  days: number;
}

/** 이번 달 하루 평균이 지난달보다 어떤가 + 동네는 보통 그때 어땠나. 이번 달 7일이 안 됐으면 null */
export function monthPace(report: SbizReport | null, days: DaySales[], today: string): Pace | null {
  const thisM = today.slice(0, 7);
  const lastM = addMonths(thisM, -1);
  const cur = days.filter((d) => d.date.startsWith(thisM)).map((d) => d.total);
  const prev = days.filter((d) => d.date.startsWith(lastM)).map((d) => d.total);
  if (cur.length < 7 || prev.length < 14) return null;
  const thisPerDay = avg(cur);
  const lastPerDay = avg(prev);
  let area: number | null = null;
  if (report) {
    const per = seasonByMonth(report);
    const a = per.get(Number(thisM.slice(5, 7)));
    const b = per.get(Number(lastM.slice(5, 7)));
    if (a !== undefined && b !== undefined) area = round1(((a - b) / b) * 100);
  }
  return { thisPerDay, lastPerDay, ours: round1(((thisPerDay - lastPerDay) / lastPerDay) * 100), area, days: cur.length };
}

/** 장부 매출 + 장부 쓰기 전 지난 매출(포스 홀 + 받아 둔 배달). 같은 날은 장부가 먼저 */
export function withHistory(days: DaySales[], history: HistoryDay[]): DaySales[] {
  const have = new Set(days.map((d) => d.date));
  return [...days, ...history.filter((h) => !have.has(h.date)).map((h) => ({ date: h.date, total: dayTotal(h) }))].sort((a, b) => a.date.localeCompare(b.date));
}

export interface OwnMonth {
  month: number; // 1~12
  year: number; // 어느 해 기록인가
  perDay: number; // 영업일 하루 평균 (원)
  vsAvg: number; // 우리 1년 평균 대비 %
}

/** 우리 가게 지난 기록으로 앞으로 석 달 — 같은 달의 가장 최근 해(영업일 15일 이상), 1년 평균은 최근 12개월 */
export function ownOutlook(days: DaySales[], today: string, ahead = 3): OwnMonth[] {
  const by = new Map<string, number[]>();
  for (const d of days) {
    const k = d.date.slice(0, 7);
    if (k >= today.slice(0, 7)) continue; // 이번 달은 아직 덜 찼다
    by.set(k, [...(by.get(k) ?? []), d.total]);
  }
  const full = [...by].filter(([, v]) => v.length >= 15).map(([k, v]) => ({ k, perDay: avg(v) })).sort((a, b) => a.k.localeCompare(b.k));
  if (full.length < 6) return [];
  const mean = avg(full.slice(-12).map((x) => x.perDay));
  const out: OwnMonth[] = [];
  for (let i = 1; i <= ahead; i++) {
    const mo = addMonths(today.slice(0, 7), i).slice(5, 7);
    const hit = [...full].reverse().find((x) => x.k.slice(5, 7) === mo);
    if (hit) out.push({ month: Number(mo), year: Number(hit.k.slice(0, 4)), perDay: hit.perDay, vsAvg: round1(((hit.perDay - mean) / mean) * 100) });
  }
  return out;
}

/** 보고서가 몇 달 지났나 (장부에 넣은 날 기준) */
export function reportAgeDays(report: SbizReport, today: string): number {
  return Math.floor((Date.parse(today) - Date.parse(report.savedAt)) / 86_400_000);
}

const man = (won: number) => `${Math.round(won / 10000).toLocaleString("ko-KR")}만원`;

export function buildInsights(report: SbizReport | null, allDays: DaySales[], weather: DailyWeather[], shifts: Shift[], today: string, history: HistoryDay[] = []): Insight[] {
  const days = openDays(allDays, today);
  // 요일·날씨·계절은 지난 매출까지 넣어 길게 본다 (이번 달 흐름·크기 비교는 장부만)
  const longDays = openDays(withHistory(allDays, history), today);
  const out: Insight[] = [];

  // 1. 이번 달 흐름 — 가장 먼저 봐야 할 경고
  const pace = monthPace(report, days, today);
  if (pace) {
    const behind = pace.area !== null ? pace.ours - pace.area : pace.ours;
    if (behind <= -10) {
      out.push({
        id: "pace",
        tone: "warn",
        title: `이번 달 하루 평균이 지난달보다 ${Math.abs(pace.ours)}% ${pace.ours < 0 ? "낮아요" : "높지만 동네 흐름보다 느려요"}`,
        detail: `이번 달 ${pace.days}일 하루 평균 ${man(pace.thisPerDay)} · 지난달 ${man(pace.lastPerDay)}.${pace.area !== null ? ` 동네는 작년 이맘때 지난달보다 ${pace.area > 0 ? "+" : ""}${pace.area}%였어요.` : ""}`,
        todo: "카드 매출이 다 들어왔는지 먼저 보고, 그래도 낮으면 약한 요일·날씨·순위 변화를 같이 보세요.",
      });
    } else {
      out.push({
        id: "pace",
        tone: "good",
        title: `이번 달 흐름은 괜찮아요 (지난달보다 ${pace.ours > 0 ? "+" : ""}${pace.ours}%)`,
        detail: `이번 달 ${pace.days}일 하루 평균 ${man(pace.thisPerDay)} · 지난달 ${man(pace.lastPerDay)}.${pace.area !== null ? ` 동네는 작년 이맘때 ${pace.area > 0 ? "+" : ""}${pace.area}%.` : ""}`,
      });
    }
  }

  // 우리 가게 지난 기록으로 본 앞으로 석 달 — 지난 매출이 있어야 나온다
  const own = ownOutlook(longDays, today);
  if (own.length) {
    const weak = own.filter((o) => o.vsAvg <= -5);
    const taxes = own.map((o) => TAX[o.month]).filter(Boolean);
    out.push({
      id: "ownSeason",
      tone: weak.length ? "warn" : "info",
      title: weak.length ? `우리 가게는 ${weak.map((o) => `${o.month}월`).join("·")}에 약했어요` : "앞으로 석 달은 우리 가게 평소만큼 나왔어요",
      detail: `${own.map((o) => `${o.year % 100}년 ${o.month}월 하루 ${man(o.perDay)} (${o.vsAvg > 0 ? "+" : ""}${o.vsAvg}%)`).join(" · ")} — 우리 1년 평균 대비. 장부 전 달은 지난 매출(포스 홀${history.some((h) => h.baemin !== undefined || h.coupang !== undefined) ? " + 배달" : "만, 배달 빠짐"}).${taxes.length ? ` 그리고 ${taxes.join(", ")}.` : ""}`,
      todo: weak.length ? "약한 달에 맞춰 일할 사람·재료 주문을 줄이고, 한 달 전부터 예약·행사를 미리 알리세요." : undefined,
    });
  }

  if (!report) return out;

  // 2. 동네와 견준 우리 크기
  const latest = [...report.months].reverse().find((m) => m.sales !== null);
  const lastMonth = addMonths(today.slice(0, 7), -1);
  const ourLast = days.filter((d) => d.date.startsWith(lastMonth));
  if (latest?.sales && ourLast.length >= 20) {
    const ourPerDay = avg(ourLast.map((d) => d.total));
    const areaPerDay = latest.sales / daysIn(latest.month);
    const times = Math.round((ourPerDay / areaPerDay) * 10) / 10;
    if (times >= 1.5) {
      out.push({
        id: "size",
        tone: "info",
        title: `우리는 동네 같은 업종 평균의 ${times}배를 팔아요`,
        detail: `지난달 하루 평균 ${man(ourPerDay)} · ${report.region} ${report.industry} 한 곳 평균 ${man(areaPerDay)} (${Number(latest.month.slice(5))}월 기준).`,
        todo: "동네 손님을 더 뺏어 오기보다, 비는 요일·시간을 채우고 한 번 온 손님을 다시 오게 하는 쪽이 커요.",
      });
    }
  }

  // 3. 요일
  const wk = weekdayCompare(report, longDays);
  if (wk) {
    const weak = [...wk].sort((a, b) => a.gap - b.gap)[0];
    const strong = [...wk].sort((a, b) => b.gap - a.gap)[0];
    if (weak.gap <= -2) {
      const weekdayWeak = MON_FIRST.indexOf(weak.label) <= 3;
      const fw = report.footWeekday;
      const busyWeekdays = fw ? avg(fw.slice(0, 5)) > avg(fw.slice(5)) : false;
      out.push({
        id: "weekday",
        tone: "warn",
        title: `${weak.label}요일이 동네보다 약해요`,
        detail: `${weak.label}요일 매출 비율 우리 ${weak.ours}% · 동네 ${weak.area}% (${weak.gap}%p).${strong.gap >= 2 ? ` 대신 ${strong.label}요일은 동네보다 ${strong.gap}%p 강해요.` : ""}${weekdayWeak && busyWeekdays ? " 이 근처는 평일에 사람이 더 많이 다녀요." : ""}`,
        todo: weekdayWeak ? `${weak.label}요일 저녁 회식·퇴근 손님용 구성(인원수 세트 등)을 플레이스 소식과 예약 안내에 올려 보세요.` : `${weak.label}요일에 맞춘 가족 손님 혜택을 플레이스 소식에 올려 보세요.`,
      });
    }
  }

  // 4. 비 오는 날
  const rg = rainGap(longDays, weather);
  if (rg && rg.pct <= -10) {
    out.push({
      id: "rain",
      tone: "warn",
      title: `비·눈 오는 날 매출이 ${Math.abs(rg.pct)}% 줄어요`,
      detail: `비·눈 온 날 ${rg.rainDays}일 평균 ${man(rg.rainAvg)} · 안 온 날 ${rg.dryDays}일 평균 ${man(rg.dryAvg)}.`,
      todo: "비 예보가 있는 날은 오후에 배달 쪽 알림(배달 앱 할인·Threads 날씨 글)을 미리 올려 보세요. 돈이 드는 광고는 정하고 켜세요.",
    });
  }

  // 5. 점심
  const lunch = report.salesHours?.find((h) => h.label === "12~14시");
  const open = usualStartHour(shifts);
  if (lunch && lunch.pct >= 15 && open !== null && open >= 15) {
    out.push({
      id: "lunch",
      tone: "info",
      title: `동네 매출의 ${lunch.pct}%가 점심(12~14시)에 나와요`,
      detail: `근무 기록상 우리는 ${open}시부터 일해요. 저녁(18~23시)은 동네 매출의 ${report.salesHours?.find((h) => h.label === "18~23시")?.pct ?? "–"}%예요.`,
      todo: "점심은 사람을 더 써야 해서 사장님이 정할 일이에요. 한다면 2주만 주말 점심으로 시험해서 인건비를 넘는지 장부로 보세요.",
    });
  }

  // 6. 손님
  if (report.salesAge) {
    const top = [...report.salesAge].sort((a, b) => b.pct - a.pct).slice(0, 2);
    const both = round1(top[0].pct + top[1].pct);
    out.push({
      id: "customers",
      tone: "info",
      title: `동네 손님은 ${top.map((t) => t.label).join("·")}가 ${both}%예요`,
      detail: `${report.malePct !== null ? `남성 ${report.malePct}%. ` : ""}${report.regularPct !== null ? `한 달 3번 이상 오는 단골은 ${report.regularPct}%뿐이에요.` : ""}`,
      todo: top.some((t) => t.label === "50대" || t.label === "60대이상")
        ? "50~60대는 네이버 리뷰와 카카오톡을 봐요. '부모님 모시고 가기 좋은 집'으로 알리고, 카카오톡 채널 친구에게 다음 방문 쿠폰을 주세요."
        : "이 나이대가 많이 쓰는 곳(인스타·Threads 등)에 맞춰 알리세요.",
    });
  }

  // 7. 앞으로 석 달
  const season = seasonOutlook(report, today);
  if (season.length) {
    const weak = season.filter((s) => s.vsAvg <= -5);
    const taxes = season.filter((s) => s.tax).map((s) => s.tax);
    out.push({
      id: "season",
      tone: weak.length ? "warn" : "info",
      title: weak.length ? `${weak.map((s) => `${s.month}월`).join("·")}은 동네가 약한 달이에요` : "앞으로 석 달은 동네가 평소만큼 팔아요",
      detail: `${season.map((s) => `${s.month}월 ${s.vsAvg > 0 ? "+" : ""}${s.vsAvg}%`).join(" · ")} (1년 평균 대비, 하루 평균으로 견줌).${taxes.length ? ` 그리고 ${taxes.join(", ")}.` : ""}`,
      todo: weak.length ? "약한 달 전 달에 행사·예약(연말 회식 등)을 미리 받아 두고, 세금 나가는 달은 돈을 따로 떼어 두세요." : undefined,
    });
  }

  return out;
}
