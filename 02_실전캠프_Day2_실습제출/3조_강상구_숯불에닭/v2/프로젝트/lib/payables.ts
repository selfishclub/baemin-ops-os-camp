// 미지급금 — 거래처에 아직 안 낸 돈 (부가세 포함, 앞으로 통장에서 나갈 돈). 2026-10-26 사장님 요청.
//  - 매입 영수증 중 체크카드로 바로 낸 것(receiptMatch)은 빼고, 남은 영수증을 거래처별로 더한다 (부가세 포함 + 보증금 순액)
//  - 같은 거래처 이름이 들어간 통장 이체(카드 아닌 출금, 재료비로 분류된 것)를 낸 돈으로 뺀다 — 본사 가맹수수료 같은 건 빼고
//  - 거래처마다 "여기까지 다 냈어요" 날짜를 두면 그날까지의 영수증·이체는 끝난 것으로 본다 (현금으로 낸 것, 기준 잡기)
//  - 거래처가 알려 준 잔액(으뜸 명세서 총미수, 주류 채권잔액)을 적어 두면 맞는지 견준다
import { isCardTx, matchCardReceipts } from "@/lib/costing/receiptMatch";
import { purchasePayable, type Purchase } from "@/lib/costing/purchases";
import type { Transaction } from "@/lib/types";

export const PAYABLES_KEY = "payables_v1";

export interface PayablesSetting {
  since: string; // 이 날부터 센다 (그 전 잔액은 0으로 본다)
  settled: Record<string, string>; // 거래처 key → 이 날까지는 다 냈음
  opening?: Record<string, number>; // 거래처 key → 시작일에 이미 있던 외상 (지난달 분)
  statements: Record<string, { amount: number; date: string }>; // 거래처 key → 거래처가 알려 준 잔액
}

export interface PayableRow {
  key: string;
  vendor: string; // 가장 최근 영수증의 거래처 이름
  opening: number; // 시작일에 이미 있던 외상
  billed: number; // 외상으로 받은 것 (부가세 포함 + 보증금)
  paid: number; // 통장 이체로 낸 것
  due: number; // 남은 돈 (음수 = 미리 낸 돈)
  receipts: number;
  lastDate: string;
  vatUnknown: number; // 부가세를 모르는 영수증 수
  statement: { amount: number; date: string } | null;
}

/** 거래처 이름 맞추기용: 띄어쓰기·(주)·주식회사·(유)·유한회사 뗀 이름 */
export const vendorKey = (s: string) => s.replace(/\(주\)|\(유\)|주식회사|유한회사|[\s()（）㈜]/g, "").toLowerCase();

const squashPayee = (payee: string) => vendorKey(payee.replace(/^NH\S*\s*/, ""));

export function computePayables(purchases: Purchase[], txs: Transaction[], setting: PayablesSetting): { rows: PayableRow[]; total: number } {
  const inWindow = (date: string, key: string) => date >= setting.since && date > (setting.settled[key] ?? "");
  const windowTxs = txs.filter((t) => t.date >= setting.since);
  const windowPurchases = purchases.filter((p) => p.date >= setting.since);
  // 체크카드로 바로 낸 영수증은 외상이 아니다
  const cardPaid = new Set(matchCardReceipts(windowTxs, windowPurchases).matched.flatMap((m) => m.purchases.map((p) => p.id)));

  const rows = new Map<string, PayableRow>();
  const blank = (key: string, vendor: string): PayableRow => ({ key, vendor, opening: 0, billed: 0, paid: 0, due: 0, receipts: 0, lastDate: "", vatUnknown: 0, statement: setting.statements[key] ?? null });
  for (const p of windowPurchases) {
    const key = vendorKey(p.vendor);
    if (!key || cardPaid.has(p.id) || !inWindow(p.date, key)) continue;
    const r = rows.get(key) ?? blank(key, p.vendor);
    r.billed += purchasePayable(p);
    r.receipts += 1;
    if (p.vat === undefined) r.vatUnknown += 1;
    if (p.date >= r.lastDate) {
      r.lastDate = p.date;
      r.vendor = p.vendor;
    }
    rows.set(key, r);
  }
  // 시작일에 이미 있던 외상 ("여기까지 다 냈어요"를 누른 거래처는 그 뒤로 0부터)
  for (const [key, amount] of Object.entries(setting.opening ?? {})) {
    if (!amount || setting.settled[key]) continue;
    const r = rows.get(key) ?? blank(key, key);
    r.opening = amount;
    rows.set(key, r);
  }
  // 통장 이체 → 이름이 가장 길게 겹치는 거래처의 낸 돈
  const keys = [...rows.keys()].filter((k) => k.length >= 2).sort((a, b) => b.length - a.length);
  for (const t of windowTxs) {
    if (t.source !== "bank" || isCardTx(t) || t.out <= 0) continue;
    if (t.major && t.major !== "매출원가") continue; // 본사 가맹수수료·배달대행비 등은 재료 대금이 아니다
    const payee = squashPayee(t.payee);
    const key = keys.find((k) => payee.includes(k) || (payee.length >= 3 && k.includes(payee)));
    if (!key || !inWindow(t.date, key)) continue;
    rows.get(key)!.paid += t.out;
  }
  const list = [...rows.values()].map((r) => ({ ...r, due: r.opening + r.billed - r.paid }));
  list.sort((a, b) => b.due - a.due);
  return { rows: list, total: list.reduce((a, r) => a + Math.max(0, r.due), 0) };
}
