import type { BankRow } from "../types";
import type { BankDetail } from "./types";

// 팝빌 계좌조회 결과를 장부의 통장 줄(BankRow)로 바꾼다.
//  - 은행 엑셀을 올렸을 때와 똑같은 모양으로 만들어야 그 뒤(자동 분류·중복 막기·정산 짝 맞추기)가 그대로 돈다.
//  - 농협 통장 엑셀은 "거래내용"(NH체크)과 "거래기록사항"(쿠팡(주))을 붙여 거래처로 쓴다.
//    팝빌은 그 둘이 remark 몇 번으로 오는지 은행마다 다를 수 있어서, 비어 있지 않은 remark를 순서대로 붙인다.
//    실제 줄을 한 번 받아 보고 순서가 다르면 REMARK_ORDER만 고치면 된다.

/** 거래처 이름을 만들 때 쓸 remark 순서 (앞에 오는 것이 먼저) */
export const REMARK_ORDER: (keyof Pick<BankDetail, "remark1" | "remark2" | "remark3" | "remark4">)[] = ["remark3", "remark1", "remark2"];

const num = (s: string | undefined): number => {
  if (!s) return 0;
  const n = Number(String(s).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : 0;
};

/** yyyyMMdd → yyyy-MM-dd */
export function toDate(trdate: string): string {
  const s = String(trdate ?? "").replace(/\D/g, "");
  if (s.length < 8) return "";
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/** 거래처(적요). 같은 글이 두 번 들어가지 않게 하고, 너무 길면 자른다 */
export function toPayee(d: BankDetail): string {
  const parts: string[] = [];
  for (const k of REMARK_ORDER) {
    const v = String(d[k] ?? "").trim();
    if (!v) continue;
    if (parts.some((p) => p === v || p.includes(v))) continue;
    parts.push(v);
  }
  return parts.join(" ").slice(0, 100);
}

export interface PopbillBankRow extends BankRow {
  tid: string; // 팝빌 거래내역 아이디
  balance: number; // 거래후잔액 (대조용)
}

/** 수집한 거래내역 → 통장 줄. 날짜가 없거나 입·출금이 둘 다 0인 줄은 버린다 */
export function toBankRows(list: BankDetail[]): PopbillBankRow[] {
  const out: PopbillBankRow[] = [];
  for (const d of list) {
    const date = toDate(d.trdate || d.trdt);
    if (!date) continue;
    const inAmt = num(d.accIn);
    const outAmt = num(d.accOut);
    if (inAmt === 0 && outAmt === 0) continue;
    out.push({ date, payee: toPayee(d), in: inAmt, out: outAmt, tid: d.tid, balance: num(d.balance) });
  }
  // 은행 엑셀과 같게 날짜 오름차순
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** 팝빌은 한 번에 1개월까지만 수집된다. 긴 기간을 달별로 쪼갠다 */
export function splitPeriods(from: string, to: string): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  let cur = from;
  while (cur <= to) {
    const [y, m] = cur.split("-").map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const monthEnd = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const end = monthEnd < to ? monthEnd : to;
    out.push({ from: cur, to: end });
    const next = new Date(Date.UTC(y, m - 1, lastDay));
    next.setUTCDate(next.getUTCDate() + 1);
    cur = next.toISOString().slice(0, 10);
  }
  return out;
}

/** yyyy-MM-dd → yyyyMMdd (팝빌에 보낼 때) */
export const toPopbillDate = (d: string) => d.replace(/-/g, "");

/** 조회일로부터 3개월 이전까지만 된다 */
export function earliestAllowed(today: string): string {
  const d = new Date(today + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() - 3);
  return d.toISOString().slice(0, 10);
}
