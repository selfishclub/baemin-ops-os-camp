// 지난 매출 (참고용) — 장부를 쓰기 전(2024-09 ~) 포스 매출을 따로 보관한다.
// 손익·정산·오늘 탭에는 넣지 않는다(비용 없는 달이 흑자로 찍히니까). 상권 읽어 주기·해마다 견줘 보기·예측에만 쓴다.
// 포스에는 배달이 안 찍혀서 여기 숫자는 "홀 매출"이다.

export const HISTORY_KEY = "history_sales_v1";

export interface HistoryDay {
  date: string; // "2025-01-15"
  hall: number; // 포스 실매출 (원)
  receipts: number | null; // 영수 건수
  customers: number | null; // 고객 수
}

/** 엑셀 날짜 일련번호(46311) → "2026-10-16" */
function serialToDate(n: number): string {
  return new Date(Date.UTC(1899, 11, 30) + n * 86_400_000).toISOString().slice(0, 10);
}

function cellDate(v: unknown): string | null {
  if (typeof v === "number" && v > 30000 && v < 80000) return serialToDate(v);
  if (typeof v === "string") {
    const m = v.trim().match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }
  return null;
}

const toNum = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/** 오케이포스 「일별종합」 엑셀(첫 시트, header:1 로 읽은 줄들) → 하루치 목록. 모양이 아니면 null */
export function parseOkposDaily(rows: unknown[][]): HistoryDay[] | null {
  const head = rows.findIndex((r) => r.includes("실매출") && r.includes("영수건수"));
  if (head < 0) return null;
  const h = rows[head].map((c) => String(c).trim());
  const col = { date: h.indexOf("일자"), hall: h.indexOf("실매출"), receipts: h.indexOf("영수건수"), customers: h.indexOf("고객수") };
  if (col.date < 0 || col.hall < 0) return null;
  const out: HistoryDay[] = [];
  for (const r of rows.slice(head + 1)) {
    const date = cellDate(r[col.date]);
    const hall = toNum(r[col.hall]);
    if (!date || hall === null) continue; // "합계" 줄 등
    out.push({ date, hall: Math.round(hall), receipts: col.receipts >= 0 ? toNum(r[col.receipts]) : null, customers: col.customers >= 0 ? toNum(r[col.customers]) : null });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** 같은 날은 새 것으로 바꾼다 */
export function mergeHistory(old: HistoryDay[], add: HistoryDay[]): HistoryDay[] {
  const by = new Map(old.map((d) => [d.date, d]));
  for (const d of add) by.set(d.date, d);
  return [...by.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** 달마다 합계·영업일 */
export function historyByMonth(days: HistoryDay[]): Map<string, { hall: number; days: number }> {
  const m = new Map<string, { hall: number; days: number }>();
  for (const d of days) {
    if (d.hall <= 0) continue;
    const k = d.date.slice(0, 7);
    const cur = m.get(k) ?? { hall: 0, days: 0 };
    m.set(k, { hall: cur.hall + d.hall, days: cur.days + 1 });
  }
  return m;
}
