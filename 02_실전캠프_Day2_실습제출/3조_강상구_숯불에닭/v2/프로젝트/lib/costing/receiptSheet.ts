import type { Item } from "./types";
import { guessItemQty, type Purchase, type PurchaseCategory, type PurchaseLine } from "./purchases";
import { matchItem, parseDate, toNumber } from "./receiptText";

// 영수증 정리 엑셀 읽기 — 폰 AI로 영수증 사진을 표로 정리한 파일(예: 영수증_손익관리_입력용_2026-09.xlsx)
//  - "품목별내역" 시트: 구매일시 | 거래처 | 비용분류 | 품목 | 단가 | 수량 | 품목금액 | 결제수단 | 검토상태
//  - "영수증요약" 시트(있으면): 날짜 | 거래처 | 영수증결제액 | 할인액 … → 결제액을 기준으로 할인을 맞춘다 (카드·통장에 찍히는 금액)
//  - 같은 구매일시·거래처 줄을 영수증 한 건으로 묶는다
export class ReceiptSheetError extends Error {}

type Cell = string | number | Date | null | undefined;
const text = (v: Cell) => (v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v).trim());
const key = (v: Cell) => text(v).replace(/\s+/g, "");
const n = (v: Cell) => (typeof v === "number" ? v : toNumber(text(v)) ?? 0);

// 정리 파일의 비용분류 → 매입 영수증 분류
export function toPurchaseCategory(raw: string): PurchaseCategory {
  const s = raw.replace(/\s/g, "");
  if (/식재료|원재료|음료|주류|육류|채소|양념|소스/.test(s)) return "원재료비";
  if (/포장|용기/.test(s)) return "기타재료비";
  if (/소모품|세제|위생|주방|비품|청소/.test(s)) return "소모품비";
  return "기타";
}

// 원가율 품목(레시피 재료)에 연결할 만한 줄: 재료비만. 소모품·기타는 연결하지 않는다 (스테라스 리필 → 테라 같은 헛연결 방지)
export const linkableCategory = (c: PurchaseCategory) => c === "원재료비" || c === "기타재료비";

// 가게 비용이 아닐 가능성이 큰 분류 (식사·간식·개인 물품) — 미리보기에서 기본으로 빼 둔다
export const isPersonalCategory = (raw: string) => /식비|기타/.test(raw.replace(/\s/g, "")) && !/재료/.test(raw);

export interface SheetLine {
  name: string;
  rawCategory: string;
  unitPrice: number;
  qty: number;
  amount: number;
}

export interface SheetReceipt {
  key: string; // 구매일시 + 거래처
  date: string;
  time: string;
  vendor: string;
  payMethod: string;
  lines: SheetLine[];
  itemSum: number;
  paid: number | null; // 영수증요약의 결제액
  shownDiscount: number; // 영수증요약의 할인액 (표시만)
  memo: string;
  needsReview: boolean; // 검토상태가 "확인"이 아닌 줄이 있음
  personal: boolean; // 모든 줄이 식비·기타
}

function findHeader(grid: Cell[][], must: string[][]): number {
  return grid.findIndex((r) => must.every((alts) => (r ?? []).some((c) => alts.includes(key(c)))));
}
const col = (header: Cell[], alts: string[]) => header.findIndex((c) => alts.includes(key(c)));

function splitDateTime(v: Cell): { date: string; time: string } {
  if (v instanceof Date) return { date: v.toISOString().slice(0, 10), time: v.toISOString().slice(11, 16) };
  if (typeof v === "number" && v > 30000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000)).toISOString();
    return { date: d.slice(0, 10), time: d.slice(11, 16) === "00:00" ? "" : d.slice(11, 16) };
  }
  const s = text(v);
  const t = s.match(/(\d{1,2}):(\d{2})/);
  return { date: parseDate(s), time: t ? `${t[1].padStart(2, "0")}:${t[2]}` : "" };
}

export function parseReceiptSheets(sheets: { name: string; grid: Cell[][] }[]): { receipts: SheetReceipt[]; notes: string[] } {
  const notes: string[] = [];
  // 품목별 시트
  let items: { grid: Cell[][]; hi: number } | null = null;
  for (const s of sheets) {
    const hi = findHeader(s.grid, [["품목", "품목명", "상품명"], ["거래처", "상호", "매장"], ["품목금액", "금액"]]);
    if (hi >= 0) {
      items = { grid: s.grid, hi };
      break;
    }
  }
  if (!items) throw new ReceiptSheetError("영수증 정리 파일이 아닌 것 같아요. ‘거래처·품목·금액’ 머리줄이 있는 시트를 찾지 못했어요.");
  const h = items.grid[items.hi];
  const c = {
    when: col(h, ["구매일시", "날짜", "일자", "구매일", "거래일시"]),
    vendor: col(h, ["거래처", "상호", "매장"]),
    category: col(h, ["비용분류", "분류", "구분"]),
    name: col(h, ["품목", "품목명", "상품명"]),
    unitPrice: col(h, ["단가"]),
    qty: col(h, ["수량"]),
    amount: col(h, ["품목금액", "금액"]),
    pay: col(h, ["결제수단"]),
    review: col(h, ["검토상태", "상태"]),
  };
  if (c.when < 0) throw new ReceiptSheetError("‘구매일시’(또는 날짜) 칸을 찾지 못했어요.");
  const at = (r: Cell[], i: number) => (i >= 0 ? r[i] : null);

  const map = new Map<string, SheetReceipt>();
  for (let i = items.hi + 1; i < items.grid.length; i++) {
    const r = items.grid[i] ?? [];
    const name = text(at(r, c.name));
    const vendor = text(at(r, c.vendor));
    if (!name || !vendor) continue;
    const { date, time } = splitDateTime(at(r, c.when));
    if (!date) {
      notes.push(`${i + 1}번째 줄 날짜를 못 읽어 뺐어요: ${name}`);
      continue;
    }
    const k = `${date} ${time}|${vendor}`;
    let rc = map.get(k);
    if (!rc) {
      rc = { key: k, date, time, vendor, payMethod: text(at(r, c.pay)), lines: [], itemSum: 0, paid: null, shownDiscount: 0, memo: "", needsReview: false, personal: false };
      map.set(k, rc);
    }
    let qty = n(at(r, c.qty)) || 1;
    let amount = n(at(r, c.amount));
    let unitPrice = n(at(r, c.unitPrice));
    if (!amount) amount = Math.round(unitPrice * qty);
    if (!unitPrice) unitPrice = Math.round(amount / qty);
    if (qty <= 0) qty = 1;
    const rawCategory = text(at(r, c.category));
    rc.lines.push({ name, rawCategory, unitPrice, qty, amount });
    rc.itemSum += amount;
    const review = text(at(r, c.review));
    if (review && !/^확인(완료)?$/.test(review.replace(/\s/g, ""))) rc.needsReview = true;
  }

  // 영수증요약 시트 — 결제액·할인·메모
  for (const s of sheets) {
    const hi = findHeader(s.grid, [["날짜", "일자"], ["거래처", "상호"], ["영수증결제액", "결제액", "결제금액"]]);
    if (hi < 0) continue;
    const sh = s.grid[hi];
    const sc = { date: col(sh, ["날짜", "일자"]), vendor: col(sh, ["거래처", "상호"]), paid: col(sh, ["영수증결제액", "결제액", "결제금액"]), disc: col(sh, ["할인액", "할인"]), memo: col(sh, ["메모", "비고"]) };
    const used = new Set<SheetReceipt>();
    for (let i = hi + 1; i < s.grid.length; i++) {
      const r = s.grid[i] ?? [];
      const date = splitDateTime(at(r, sc.date)).date;
      const vendor = text(at(r, sc.vendor));
      if (!date || !vendor) continue;
      const paid = n(at(r, sc.paid));
      // 같은 날 같은 거래처가 여러 건이면 품목 합계가 결제액에 가장 가까운 것과 짝
      const cands = [...map.values()].filter((x) => x.date === date && x.vendor === vendor && !used.has(x));
      if (!cands.length) continue;
      const best = cands.sort((a, b) => Math.abs(a.itemSum - paid) - Math.abs(b.itemSum - paid))[0];
      used.add(best);
      best.paid = paid;
      best.shownDiscount = Math.abs(n(at(r, sc.disc)));
      best.memo = text(at(r, sc.memo));
    }
    break;
  }

  const receipts = [...map.values()].sort((a, b) => (`${a.date}${a.time}` < `${b.date}${b.time}` ? -1 : 1));
  for (const rc of receipts) {
    rc.personal = rc.lines.every((l) => isPersonalCategory(l.rawCategory));
    if (rc.needsReview) notes.push(`${rc.date} ${rc.vendor}: 검토상태가 ‘확인’이 아닌 줄이 있어요.`);
    if (rc.paid !== null && rc.paid > rc.itemSum) notes.push(`${rc.date} ${rc.vendor}: 결제액(${rc.paid.toLocaleString()})이 품목 합계(${rc.itemSum.toLocaleString()})보다 커요. 빠진 품목이 있는지 봐 주세요.`);
  }
  if (receipts.length === 0) throw new ReceiptSheetError("영수증 줄을 하나도 못 읽었어요.");
  return { receipts, notes };
}

/** 결제액 기준 할인 (품목 합계 − 결제액). 요약이 없으면 0 */
export const receiptDiscount = (rc: SheetReceipt) => (rc.paid !== null ? Math.max(0, rc.itemSum - rc.paid) : 0);
export const receiptTotal = (rc: SheetReceipt) => rc.itemSum - receiptDiscount(rc);

/** 영수증 한 건 → 매입 영수증. id를 구매일시·거래처로 고정해 다시 올려도 겹치지 않는다 */
export function sheetReceiptToPurchase(rc: SheetReceipt, items: Item[], link: boolean): Purchase {
  const lines: PurchaseLine[] = rc.lines.map((l) => {
    const category = toPurchaseCategory(l.rawCategory);
    const it = link && linkableCategory(category) ? matchItem(l.name, items) : null;
    const itemQty = it ? guessItemQty(l.name, l.qty, it.baseUnit) ?? 0 : 0;
    return { name: l.name, unitPrice: l.unitPrice, qty: l.qty, amount: l.amount, category, itemId: it ? it.id : null, itemQty: it ? itemQty : 0 };
  });
  const memoParts = [rc.payMethod, rc.time ? `${rc.time} 결제` : "", rc.memo].filter(Boolean);
  return {
    id: `pu_rx_${rc.date.replace(/-/g, "")}${rc.time.replace(":", "")}_${rc.vendor.replace(/[^0-9A-Za-z가-힣]/g, "").slice(0, 16)}`,
    date: rc.date,
    vendor: rc.vendor,
    lines,
    discount: receiptDiscount(rc),
    memo: `영수증 정리 파일에서 읽음${memoParts.length ? ` · ${memoParts.join(" · ")}` : ""}`,
  };
}
