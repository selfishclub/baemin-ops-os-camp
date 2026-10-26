// 가스 사용량 기록 — 평화가스(LPG) 요금안내 문자를 붙여 넣으면 사용량·단가·매출 대비를 계산한다 (2026-10-26 사장님 요청)
//  가스비는 달 금액만 보면 매출과 따로 노는 것처럼 보인다: 검침 기간이 25~35일로 들쭉날쭉하고, 단가가 자주 바뀌기 때문.
//  그래서 "하루 사용량", "홀 매출 100만 원당 ㎥", "계산한 테이블 100팀당 ㎥", "㎥당 단가"로 나눠 본다.

import { dayTotal, ledgerMonths, type HistoryDay } from "@/lib/history";

export const GAS_BILLS_KEY = "gas_bills_v1";

export interface GasBill {
  month: string; // 청구월 "2026-10" (문자 제목의 "2026년 10월 요금안내")
  from: string; // 사용기간 시작 "2026-09-22"
  to: string; // 사용기간 끝 "2026-10-26"
  meterPrev: number | null; // 전월지침 ㎥
  meterNow: number | null; // 당월지침 ㎥
  m3: number; // 사용량 ㎥
  fee: number; // 사용요금 (단가 계산용)
  amount: number; // 청구금액 (10원 단위로 끊겨 사용요금과 몇 원 다를 수 있음)
  priceNote: string | null; // "kg당 80원 인상" · "동결" · "KG당 30원 인하"
  due: string | null; // 납부마감일
}

const num = (s: string | undefined) => (s ? Number(s.replace(/[^\d]/g, "")) : NaN);
const ymd = (y: string, m: string, d: string) => `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;

export interface GasParse {
  bills: GasBill[];
  errors: string[];
}

/** 문자 하나 또는 여러 개를 한꺼번에 붙여 넣어도 된다 ("요금안내" 마다 나눠 읽는다) */
export function parseGasSms(text: string): GasParse {
  const parts = text.split(/(?=\d{4}\s*년\s*\d{1,2}\s*월\s*요금안내)/).filter((p) => /요금안내/.test(p));
  const bills: GasBill[] = [];
  const errors: string[] = [];
  for (const p of parts) {
    const mm = p.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*요금안내/);
    const period = p.match(/사용기간\s*:\s*(\d{4})\.(\d{1,2})\.(\d{1,2})\s*~\s*(\d{4})\.(\d{1,2})\.(\d{1,2})/);
    const m3 = num(p.match(/사\s*용\s*량\s*:\s*([\d,]+)/)?.[1]);
    const fee = num(p.match(/사용요금\s*:\s*([\d,]+)/)?.[1]);
    const amount = num(p.match(/청구금액\s*:\s*([\d,]+)/)?.[1]);
    if (!mm || !period || !Number.isFinite(m3) || !Number.isFinite(fee)) {
      errors.push(`${mm ? `${mm[1]}년 ${mm[2]}월` : "한"} 문자에서 사용기간·사용량·사용요금을 못 읽었어요.`);
      continue;
    }
    if (m3 <= 0) {
      errors.push(`${mm[1]}년 ${mm[2]}월: 사용량이 0이에요.`);
      continue;
    }
    const prev = num(p.match(/전월지침\s*:\s*([\d,]+)/)?.[1]);
    const now = num(p.match(/당월지침\s*:\s*([\d,]+)/)?.[1]);
    const note = p.match(/\d{1,2}\s*월\s*단가\s*([^\n.~]*?)\s*입니다/)?.[1]?.trim() ?? null;
    const due = p.match(/납부마감일\s*:\s*(\d{4})\.(\d{1,2})\.(\d{1,2})/);
    if (Number.isFinite(prev) && Number.isFinite(now) && now - prev !== m3) errors.push(`${mm[1]}년 ${mm[2]}월: 지침 차이(${now - prev}㎥)와 사용량(${m3}㎥)이 달라요 — 문자 숫자를 확인해 주세요.`);
    bills.push({
      month: `${mm[1]}-${mm[2].padStart(2, "0")}`,
      from: ymd(period[1], period[2], period[3]),
      to: ymd(period[4], period[5], period[6]),
      meterPrev: Number.isFinite(prev) ? prev : null,
      meterNow: Number.isFinite(now) ? now : null,
      m3,
      fee,
      amount: Number.isFinite(amount) ? amount : fee,
      priceNote: note,
      due: due ? ymd(due[1], due[2], due[3]) : null,
    });
  }
  if (!parts.length) errors.push("가스 요금안내 문자가 아니에요 (\"○○○○년 ○○월 요금안내\"가 있어야 해요).");
  return { bills, errors };
}

/** 같은 청구월은 새 문자로 바꾼다 (두 번 붙여도 한 번만) */
export function upsertGasBills(list: GasBill[], add: GasBill[]): { list: GasBill[]; added: number; replaced: number } {
  const by = new Map(list.map((b) => [b.month, b]));
  let added = 0, replaced = 0;
  for (const b of add) {
    if (by.has(b.month)) replaced++;
    else added++;
    by.set(b.month, b);
  }
  return { list: [...by.values()].sort((a, b) => a.month.localeCompare(b.month)), added, replaced };
}

/** 그날 매출 — hall: 홀(포스·카드·현금 등 배달 아닌 것), all: 배달 포함 전체, receipts: 포스 영수 건수(있을 때만) */
export interface DayBiz {
  hall: number;
  all: number;
  receipts: number | null;
}

/** 날마다 홀·전체 매출 — 장부가 15일 이상 들어간 달은 장부, 아닌 달은 지난 매출(포스 홀+배달). 영수 건수는 지난 매출에 있을 때만 */
export function gasBizDays(sales: { date: string; amount: number; hall: boolean }[], history: HistoryDay[]): Map<string, DayBiz> {
  const led = new Map<string, { hall: number; all: number }>();
  for (const s of sales) {
    const d = led.get(s.date) ?? { hall: 0, all: 0 };
    d.all += s.amount;
    if (s.hall) d.hall += s.amount;
    led.set(s.date, d);
  }
  const full = ledgerMonths(led.keys());
  const hist = new Map(history.map((h) => [h.date, h]));
  const out = new Map<string, DayBiz>();
  for (const h of history) {
    if (full.has(h.date.slice(0, 7)) && led.has(h.date)) continue;
    out.set(h.date, { hall: h.hall, all: dayTotal(h), receipts: h.receipts });
  }
  for (const [date, d] of led) {
    if (out.has(date)) continue;
    out.set(date, { ...d, receipts: hist.get(date)?.receipts ?? null });
  }
  return out;
}

export interface GasRow {
  bill: GasBill;
  days: number; // 사용기간 날 수
  unitPrice: number; // ㎥당 단가 (사용요금 ÷ 사용량)
  perDay: number; // 하루 사용량 ㎥
  hallSales: number | null; // 그 기간 홀 매출 (원)
  allSales: number | null;
  missingDays: number; // 매출 기록이 없는 날 (가게 쉰 날 포함)
  perHall: number | null; // 홀 매출 100만 원당 ㎥
  per100Teams: number | null; // 계산한 테이블 100팀당 ㎥ (영수 건수가 그 기간 전부 있을 때만)
  costPct: number | null; // 전체 매출 대비 가스비 %
  meterGap: boolean; // 바로 앞 문자의 당월지침과 이번 전월지침이 다르면 (빠진 달·검침 밀림)
}

const shift = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;

export function gasRows(bills: GasBill[], biz: Map<string, DayBiz>): GasRow[] {
  const sorted = [...bills].sort((a, b) => a.month.localeCompare(b.month));
  return sorted.map((bill, i) => {
    let days = 0, hall = 0, all = 0, rec = 0, recDays = 0, open = 0;
    for (let t = bill.from; t <= bill.to; t = shift(t, 1)) {
      days++;
      const b = biz.get(t);
      if (!b || b.all <= 0) continue;
      open++;
      hall += b.hall;
      all += b.all;
      if (b.receipts !== null) {
        rec += b.receipts;
        recDays++;
      }
    }
    const prev = sorted[i - 1];
    return {
      bill,
      days,
      unitPrice: Math.round(bill.fee / bill.m3),
      perDay: r2(bill.m3 / days),
      hallSales: open ? hall : null,
      allSales: open ? all : null,
      missingDays: days - open,
      perHall: hall > 0 ? r2(bill.m3 / (hall / 1_000_000)) : null,
      per100Teams: recDays === open && rec > 0 ? Math.round((bill.m3 / rec) * 1000) / 10 : null,
      costPct: all > 0 ? r2((bill.amount / all) * 100) : null,
      meterGap: !!prev && prev.meterNow !== null && bill.meterPrev !== null && prev.meterNow !== bill.meterPrev,
    };
  });
}

/** 작년 같은 청구월과 견준 % (없으면 null) */
export function yearAgo(rows: GasRow[], month: string, pick: (r: GasRow) => number | null): number | null {
  const ago = `${Number(month.slice(0, 4)) - 1}${month.slice(4)}`;
  const a = rows.find((r) => r.bill.month === ago);
  const b = rows.find((r) => r.bill.month === month);
  const va = a ? pick(a) : null, vb = b ? pick(b) : null;
  return va && vb ? Math.round(((vb - va) / va) * 1000) / 10 : null;
}
