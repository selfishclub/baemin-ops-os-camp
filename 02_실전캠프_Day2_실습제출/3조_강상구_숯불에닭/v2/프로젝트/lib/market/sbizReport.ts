// 소상공인365 상세분석 보고서 — 화면 글자(전체 선택 → 복사)를 읽어 숫자만 꺼낸다.
// 보고서는 지도에 영역을 그려야 만들어져서 자동으로 못 받는다. 달에 한 번 사장님이 「분석하기」를 누르고
// 보고서 화면 글자를 붙여 넣으면 여기서 읽는다. 표 모양이 바뀌면 못 읽은 칸은 null 로 남긴다.

export const MARKET_REPORT_KEY = "market_report_v1";

export interface ReportMonth {
  month: string; // "2026-07"
  sales: number | null; // 업소당 월평균 매출 (원) — 행정동 기준
  count: number | null; // 업소당 월평균 매출 건수
  stores: number | null; // 같은 업종 업소 수 — 행정동 기준
  footTraffic: number | null; // 일평균 유동인구 — 선택 영역
}

export interface Share {
  label: string;
  pct: number;
}

export interface SbizReport {
  savedAt: string; // 장부에 넣은 날 "2026-10-19"
  asOf: string; // 보고서 마지막 달 "2026-07"
  region: string; // "율량.사천동"
  industry: string; // "닭/오리고기 구이/찜"
  months: ReportMonth[];
  salesWeekday: number[] | null; // 요일별 매출 비율 %, 월~일 차례 (7개)
  footWeekday: number[] | null; // 요일별 일평균 유동인구 (선택 영역), 월~일
  salesHours: Share[] | null; // 시간대별 매출 비율
  salesAge: Share[] | null; // 연령대별 매출 비율 (10대~60대이상)
  malePct: number | null; // 매출 중 남성 비율
  regularPct: number | null; // 단골(월 3회 이상) 비율
}

const HOUR_LABELS = ["05~09시", "09~12시", "12~14시", "14~18시", "18~23시", "23~05시"];
const AGE_LABELS = ["10대", "20대", "30대", "40대", "50대", "60대이상"];

/** "2,471" → 2471. 숫자가 아니면 null */
function toNum(s: string): number | null {
  const n = Number(s.replace(/,/g, ""));
  return s.trim() !== "" && Number.isFinite(n) ? n : null;
}

/** 줄에서 첫 숫자 앞까지를 이름, 나머지를 숫자로 */
function rowNums(line: string, prefix: string): number[] | null {
  if (!line.startsWith(prefix)) return null;
  const parts = line.slice(prefix.length).trim().split(/\s+/);
  const out = parts.map(toNum);
  return out.every((n) => n !== null) ? (out as number[]) : null;
}

/** 표 제목(anchor) 뒤에서 prefix 로 시작하는 줄의 숫자. nth 번째(0부터) */
function findRow(lines: string[], anchor: string, prefix: string, len: number, nth = 0): number[] | null {
  const start = lines.findIndex((l) => l.includes(anchor));
  if (start < 0) return null;
  let seen = 0;
  for (let i = start; i < lines.length; i++) {
    const r = rowNums(lines[i], prefix);
    if (r && r.length === len) {
      if (seen === nth) return r;
      seen++;
    }
  }
  return null;
}

/** 그래프 글자는 "83.783.7" 처럼 같은 숫자가 두 번 붙어 나온다 → 앞 반쪽 */
function halfNum(line: string): number | null {
  const t = line.trim();
  if (t.length % 2 === 0 && t.slice(0, t.length / 2) === t.slice(t.length / 2)) return toNum(t.slice(0, t.length / 2));
  return null;
}

/** "25.07" → "2025-07" */
const fullMonth = (yymm: string) => `20${yymm.slice(0, 2)}-${yymm.slice(3, 5)}`;

export function parseSbizReport(text: string, today: string): SbizReport | null {
  // 표를 복사하면 칸 사이가 탭으로 온다 → 빈칸 하나로
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const head = lines.find((l) => l.includes("분석지역") && l.includes("업종"));
  if (!head) return null;
  const regionPath = head.match(/분석지역\s+(.+?)\s+업종/)?.[1] ?? "";
  const region = regionPath.split(">").pop()?.trim() ?? "";
  const industry = head.split("업종")[1]?.split(">").pop()?.trim() ?? "";

  // 13개월 머리줄 "지역 구분 25.07 25.08 …"
  const monthLine = lines.find((l) => /^지역 구분( \d{2}\.\d{2})+$/.test(l));
  if (!region || !monthLine) return null;
  const yymm = monthLine.replace("지역 구분", "").trim().split(/\s+/);
  const n = yymm.length;

  const stores = findRow(lines, "업소수 추이", `${region} 업소수`, n);
  const sales = findRow(lines, "업소당 월평균 매출액 추이", `${region} 매출`, n);
  const count = findRow(lines, "업소당 월평균 매출건수 추이", `${region} 매출`, n);
  const foot = findRow(lines, "월별 일평균 유동인구 추이", "선택 영역 인구", n);

  const months: ReportMonth[] = yymm.map((m, i) => ({
    month: fullMonth(m),
    sales: sales ? sales[i] * 10000 : null,
    count: count ? count[i] : null,
    stores: stores ? stores[i] : null,
    footTraffic: foot ? foot[i] : null,
  }));

  // 요일별 매출 비율: "비율 주중 주말 월 화 수 목 금 토 일" (9개) → 월~일 7개
  const wk = findRow(lines, "주중/주말, 요일별 월평균 매출액", "비율", 9);
  const footWk = findRow(lines, "주중/주말, 요일별 일평균 유동인구", "선택 영역 인구", 9);
  const hours = findRow(lines, "시간대별 월평균 매출액", "비율", 6);
  // 성별·연령: "비율 남 여 10대 20대 30대 40대 50대 60대이상" (8개)
  const age = findRow(lines, "성별/연령대별 월평균 매출액", "비율", 8);

  let regularPct: number | null = null;
  const ri = lines.findIndex((l) => l.includes("상권 내 신규/단골 고객"));
  if (ri >= 0) {
    const nums = lines.slice(ri, ri + 15).map(halfNum).filter((x): x is number => x !== null);
    if (nums.length >= 2 && Math.abs(nums[0] + nums[1] - 100) < 1) regularPct = nums[1];
  }

  return {
    savedAt: today,
    asOf: months[n - 1]?.month ?? "",
    region,
    industry,
    months,
    salesWeekday: wk ? wk.slice(2) : null,
    footWeekday: footWk ? footWk.slice(2) : null,
    salesHours: hours ? hours.map((pct, i) => ({ label: HOUR_LABELS[i], pct })) : null,
    salesAge: age ? age.slice(2).map((pct, i) => ({ label: AGE_LABELS[i], pct })) : null,
    malePct: age ? age[0] : null,
    regularPct,
  };
}
