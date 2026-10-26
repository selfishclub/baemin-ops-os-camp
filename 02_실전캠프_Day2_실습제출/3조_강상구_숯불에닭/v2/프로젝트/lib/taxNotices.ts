// 세금 고지서 보관 — 부가세 예정고지·종합소득세 중간예납 같은 고지서를 금액·납부기한과 함께 두고,
// 통장에서 그 돈이 나갔는지 짝을 맞춰 "냈어요 / 며칠 남았어요 / 기한 지났어요"를 보여 준다 (2026-10-26 사장님 요청).
// PDF·사진은 매입 영수증과 같은 사진 보관함(lib/photos.ts)에 고지서 id로 붙인다.
import type { Transaction } from "@/lib/types";

export const TAX_NOTICES_KEY = "tax_notices_v1";

export const TAX_KINDS = ["부가세", "종합소득세", "원천세", "지방소득세", "재산세·자동차세", "기타"] as const;
export type TaxKind = (typeof TAX_KINDS)[number];

export interface TaxNotice {
  id: string;
  kind: TaxKind;
  title: string; // "2026년 2기 부가세 예정고지"
  amount: number; // 낼 돈 (원)
  due: string; // 납부기한 "2026-11-02"
  memo?: string;
  addedAt: string;
}

export type TaxStatus =
  | { state: "paid"; date: string; payee: string }
  | { state: "open"; daysLeft: number } // 0 = 오늘까지
  | { state: "late"; daysLate: number };

const DAY = 86_400_000;
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);

/** 통장에서 고지서 금액과 똑같이 나간 줄 — 기한 60일 전 ~ 30일 뒤 사이, 세금과공과로 분류된 줄을 먼저 */
export function findPayment(n: TaxNotice, txs: Transaction[]): Transaction | null {
  const hits = txs
    .filter((t) => t.out === n.amount && n.amount > 0)
    .filter((t) => {
      const d = days(n.due, t.date);
      return d >= -60 && d <= 30;
    })
    .sort((a, b) => Number(b.major === "세금과공과") - Number(a.major === "세금과공과") || Math.abs(days(n.due, a.date)) - Math.abs(days(n.due, b.date)));
  return hits[0] ?? null;
}

export function taxStatus(n: TaxNotice, txs: Transaction[], today: string): TaxStatus {
  const paid = findPayment(n, txs);
  if (paid) return { state: "paid", date: paid.date, payee: paid.payee };
  const left = days(today, n.due);
  return left >= 0 ? { state: "open", daysLeft: left } : { state: "late", daysLate: -left };
}

/** 고지서를 읽을 때 쓸 통장 달: 기한 두 달 전 ~ 한 달 뒤 ("2026-11-02" → 2026-09·10·11·12) */
export function paymentMonths(due: string): string[] {
  const [y, m] = due.split("-").map(Number);
  return [-2, -1, 0, 1].map((k) => {
    const d = new Date(Date.UTC(y, m - 1 + k, 1));
    return d.toISOString().slice(0, 7);
  });
}

/** 안 낸 것 먼저(기한 가까운 순), 낸 것은 뒤로(최근 순) */
export function sortNotices(list: TaxNotice[], status: (n: TaxNotice) => TaxStatus): TaxNotice[] {
  const rank = (n: TaxNotice) => (status(n).state === "paid" ? 1 : 0);
  return [...list].sort((a, b) => rank(a) - rank(b) || (rank(a) ? b.due.localeCompare(a.due) : a.due.localeCompare(b.due)));
}
