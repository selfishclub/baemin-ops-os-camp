// 포스 시간대별 주문 — 오케이포스 「매출현황 > 일기간 > 상품시간대별」 엑셀, 시간구분 "최초주문시각" (2026-10-22 사장님: 이걸로 매장 혼잡도 판단)
//  최초주문시각 = 손님이 들어와 처음 주문한 때. 결제시각보다 "그 시간에 손님이 들어왔나"에 가깝다.
//  하루 한 파일(하루씩 받는다 — 기간을 넣으면 포스가 시간대별로 합쳐 버린다). 합계 줄의 시간마다 수량·매출을 쓴다.
//  평소와 견줄 때는 같은 요일의 지난 날들(있는 만큼, 최대 4번)의 같은 시간 평균. 기록이 적으면 견주지 않는다.

export const POS_HOURLY_KEY = "pos_hourly_v1";

/** [시(0~23), 주문 수량, 매출(원)] */
export type HourRow = [number, number, number];
export interface PosHourlyStore {
  days: Record<string, HourRow[]>; // "2026-10-21" → 시간 차례
}

export interface PosHourlyParse {
  date: string | null;
  hours: HourRow[];
  error: string | null;
}

const toNum = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** 엑셀 첫 시트를 header:1 로 읽은 줄들 → 그날 시간마다 수량·매출 */
export function parsePosHourly(rows: unknown[][]): PosHourlyParse {
  const cell = (r: unknown[] | undefined, i: number) => String(r?.[i] ?? "").trim();
  const flat = rows.slice(0, 6).map((r) => r.map((c) => String(c ?? "")).join(" ")).join(" ");
  if (!/상품시간대별/.test(flat)) return { date: null, hours: [], error: "포스 「상품시간대별」 엑셀이 아니에요." };
  if (!/최초주문시각/.test(flat)) return { date: null, hours: [], error: "시간구분이 최초주문시각이 아니에요 (결제시각 파일은 손님이 나간 시각이라 쓰지 않아요)." };
  const m = flat.match(/조회일자\s*:\s*(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/);
  if (!m) return { date: null, hours: [], error: "조회일자를 못 읽었어요." };
  if (m[1] !== m[2]) return { date: null, hours: [], error: "하루치 파일이 아니에요 (여러 날이 시간대별로 합쳐져 있어요)." };
  const h = rows.findIndex((r) => cell(r, 0) === "상품코드");
  if (h < 0) return { date: m[1], hours: [], error: "머리줄(상품코드)을 못 찾았어요." };
  const head = rows[h];
  const hourCols: { hour: number; col: number }[] = [];
  for (let c = 2; c < head.length; c += 2) {
    const hm = cell(head, c).match(/^(\d{1,2})시$/);
    if (hm) hourCols.push({ hour: Number(hm[1]), col: c });
  }
  if (!hourCols.length) return { date: m[1], hours: [], error: "시간 칸을 못 찾았어요." };
  const total = rows.find((r) => cell(r, 0) === "합계");
  let hours: HourRow[];
  if (total) hours = hourCols.map(({ hour, col }) => [hour, toNum(total[col]), toNum(total[col + 1])]);
  else {
    // 합계 줄이 없으면 상품 줄을 더한다
    const sum = new Map<number, [number, number]>();
    for (const r of rows.slice(h + 2)) {
      if (!/^\d+$/.test(cell(r, 0))) continue;
      for (const { hour, col } of hourCols) {
        const s = sum.get(hour) ?? [0, 0];
        sum.set(hour, [s[0] + toNum(r[col]), s[1] + toNum(r[col + 1])]);
      }
    }
    hours = hourCols.map(({ hour }) => [hour, ...(sum.get(hour) ?? [0, 0])] as HourRow);
  }
  // 영업은 오후에 시작해 자정을 넘긴다 — 0~5시는 그날 밤 늦은 시간이라 뒤로 보낸다
  const order = (x: number) => (x < 6 ? x + 24 : x);
  return { date: m[1], hours: hours.sort((a, b) => order(a[0]) - order(b[0])), error: null };
}

const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();

export interface HourCompare {
  hour: number;
  qty: number;
  sales: number;
  usual: number | null; // 같은 요일 지난 날들의 그 시간 평균 매출 (기록 없으면 null)
  basis: number; // 평균에 쓴 날 수
  pct: number | null; // 평소 대비 % (100 = 평소와 같음)
}

/** 그날 시간마다 매출과 같은 요일 평소(지난 최대 4번, 최소 2번) 평균 */
export function compareHours(store: PosHourlyStore | null, date: string, maxWeeks = 4, minBasis = 2): HourCompare[] {
  const today = store?.days[date];
  if (!today) return [];
  const past = Object.keys(store!.days)
    .filter((d) => d < date && dow(d) === dow(date))
    .sort()
    .slice(-maxWeeks);
  return today.map(([hour, qty, sales]) => {
    const vals = past.map((d) => store!.days[d].find((r) => r[0] === hour)?.[2] ?? 0);
    const usual = vals.length >= minBasis ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    return { hour, qty, sales, usual, basis: vals.length, pct: usual ? Math.round((sales / usual) * 100) : null };
  });
}

/** 이미 있는 날은 새 파일 값으로 바꾼다 (두 번 넣어도 두 번 더해지지 않음) */
export function mergePosHourly(prev: PosHourlyStore | null, date: string, hours: HourRow[]): PosHourlyStore {
  return { days: { ...(prev?.days ?? {}), [date]: hours } };
}
