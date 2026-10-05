import type { Purchase } from "../costing/purchases";
import type { TaxinvoiceDetail } from "./types";

// 홈택스에서 받은 매입 전자세금계산서 → 매입 영수증 초안.
//  - 세금계산서에는 품목이 한 줄로만 오는 때가 많아서(예: "닭갈비 외"), 품목을 쪼개지는 못한다.
//    그래서 "거래처 · 날짜 · 금액"만 채운 초안을 만들고, 품목은 사장님이 영수증 보고 채운다.
//  - 이미 손으로 넣은 영수증과 겹치지 않게 국세청 승인번호를 들고 다닌다.

const num = (s: string | undefined): number => {
  if (!s) return 0;
  const n = Number(String(s).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : 0;
};

export const toDate = (yyyymmdd: string): string => {
  const s = String(yyyymmdd ?? "").replace(/\D/g, "");
  return s.length < 8 ? "" : `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
};

/** 공급자 상호. 팝빌 문서에 invoicerCornName 오타가 있어 둘 다 본다 */
export const vendorOf = (t: TaxinvoiceDetail): string =>
  (t.invoicerCorpName || t.invoicerCornName || "").trim() || `사업자 ${t.invoicerCorpNum ?? ""}`.trim();

export interface TaxinvoiceDraft extends Purchase {
  ntsconfirmNum: string; // 국세청 승인번호 — 같은 계산서를 두 번 넣지 않으려고
  supplyCost: number;
  tax: number;
}

/** 세금계산서 한 장 → 매입 영수증 초안 한 건 (합계금액 한 줄) */
export function toDraft(t: TaxinvoiceDetail, id: string): TaxinvoiceDraft | null {
  const date = toDate(t.writeDate || t.issueDate || "");
  const total = num(t.totalAmount);
  if (!date || total === 0) return null;
  const supply = num(t.supplyCostTotal);
  const tax = num(t.taxTotal);
  const item = (t.itemName || "").trim();
  return {
    id,
    date,
    vendor: vendorOf(t),
    discount: 0,
    ntsconfirmNum: t.ntsconfirmNum,
    supplyCost: supply,
    tax,
    memo: `전자세금계산서 자동 가져오기 · 승인번호 ${t.ntsconfirmNum} · 공급가 ${supply.toLocaleString()} + 세액 ${tax.toLocaleString()}`,
    lines: [
      { name: item || "세금계산서 합계 (품목은 영수증 보고 채우세요)", unitPrice: total, qty: 1, amount: total, category: "원재료비", itemId: null, itemQty: 0 },
    ],
  };
}

/** 여러 장 → 초안 목록. 이미 있는 승인번호는 거른다 */
export function toDrafts(list: TaxinvoiceDetail[], already: string[], newId: () => string): { drafts: TaxinvoiceDraft[]; skipped: number } {
  const seen = new Set(already);
  const drafts: TaxinvoiceDraft[] = [];
  let skipped = 0;
  for (const t of list) {
    if (seen.has(t.ntsconfirmNum)) { skipped += 1; continue; }
    const d = toDraft(t, newId());
    if (!d) { skipped += 1; continue; }
    seen.add(t.ntsconfirmNum);
    drafts.push(d);
  }
  return { drafts, skipped };
}

/** 영수증 목록에서 이미 가져온 승인번호 모으기 */
export function usedConfirmNums(purchases: Purchase[]): string[] {
  const out: string[] = [];
  for (const p of purchases) {
    const m = /승인번호 ([0-9A-Za-z-]+)/.exec(p.memo ?? "");
    if (m) out.push(m[1]);
  }
  return out;
}
