// 홈택스 매입 자료 — 홈택스 "전자(세금)계산서 목록조회(월·분기별)"에서 매입으로 조회해 [엑셀내려받기] 한 파일을 올린다 (2026-10-26).
//  - 전자세금계산서(부가세 있음)와 전자계산서(면세, 으뜸 닭고기 등) 둘 다 받는다. 같은 승인번호는 한 번만
//  - 쓰는 곳: ① 부가세 칸의 "비용에 든 부가세"를 어림 대신 실제 세액으로 ② 거래처마다 세금계산서와 매입 영수증 합계 대조
//  - 홈택스에 로그인·조회·내려받기는 사장님이 한다 (장부는 파일만 읽는다)
import { purchaseSupply, type Purchase } from "@/lib/costing/purchases";

export const HOMETAX_KEY = "hometax_purchases_v1";

export interface HometaxRow {
  approval: string; // 승인번호
  date: string; // 작성일자
  bizNo: string; // 공급자 사업자등록번호
  vendor: string; // 상호 (비어 있으면 대표자명 — 개인 임대인 등)
  supply: number;
  vat: number; // 계산서(면세)는 0
  total: number;
  item: string; // 대표 품목
  free: boolean; // 전자계산서(면세)
  goods?: number; // 물건값 공급가 — 품목 시트에서 로열티·배송비·사용료 같은 줄을 뺀 것 (영수증과 견줄 때)
}

// 물건값이 아닌 품목 (본사 세금계산서에 소스와 같이 들어오는 로열티·배송비 등)
// 배달앱(쿠팡이츠 등) 세금계산서는 수수료·광고라 같은 이름의 쿠팡 쇼핑 영수증과 견주면 안 된다
const NOT_GOODS = /로열티|프로그램|사용료|배송비|택배비|수수료|이용료|기장료|광고|ad|coupangeats|coueats|영중소|정산|중개/i;

export interface HometaxStore {
  rows: HometaxRow[];
}

export interface HometaxParse {
  rows: HometaxRow[];
  kind: "세금계산서" | "계산서" | null;
  error: string | null;
}

const num = (s: unknown) => Number(String(s ?? "").replace(/[^\d.-]/g, "")) || 0;
const cell = (s: unknown) => String(s ?? "").trim();

/** 홈택스 목록 엑셀(첫 시트, 둘째 "품목" 시트) → 매입 줄. 매출 파일·다른 파일은 거절한다 */
export function parseHometaxSheet(rows: unknown[][], itemRows: unknown[][] = []): HometaxParse {
  const hi = rows.findIndex((r) => r.some((c) => cell(c) === "작성일자") && r.some((c) => cell(c) === "공급가액") && r.some((c) => cell(c) === "승인번호"));
  if (hi < 0) return { rows: [], kind: null, error: "홈택스 전자(세금)계산서 목록 엑셀이 아니에요. 홈택스 목록조회 화면의 [엑셀내려받기] 파일을 올려 주세요." };
  const title = rows.slice(0, hi).flat().map(cell).join(" ");
  if (/매출/.test(title) && !/매입/.test(title)) return { rows: [], kind: null, error: "매출 자료예요. 홈택스에서 '매입'으로 조회해서 내려받아 주세요." };
  const head = rows[hi].map(cell);
  const col = (name: string) => head.indexOf(name);
  const free = !head.includes("세액") || (/계산서 목록/.test(title) && !/세금계산서/.test(title));
  // 공급자 정보는 앞쪽(첫 번째) 사업자등록번호·상호·대표자명 칸
  const iBiz = head.findIndex((h) => /공급자.*등록번호/.test(h));
  const iName = col("상호");
  const iRep = col("대표자명");
  const iItem = head.indexOf("품목명");
  const out: HometaxRow[] = [];
  for (const r of rows.slice(hi + 1)) {
    const date = cell(r[col("작성일자")]);
    const approval = cell(r[col("승인번호")]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !approval) continue;
    const supply = num(r[col("공급가액")]);
    const vat = col("세액") >= 0 ? num(r[col("세액")]) : 0;
    const total = col("합계금액") >= 0 ? num(r[col("합계금액")]) : supply + vat;
    out.push({
      approval,
      date,
      bizNo: cell(r[iBiz]),
      vendor: cell(r[iName]) || cell(r[iRep]) || "(이름 없음)",
      supply,
      vat,
      total,
      item: iItem >= 0 ? cell(r[iItem]) : "",
      free,
    });
  }
  if (!out.length) return { rows: [], kind: free ? "계산서" : "세금계산서", error: "목록에 줄이 없어요." };
  // 품목 시트: 승인번호마다 물건값만 더한다
  const ih = itemRows.findIndex((r) => r.some((c) => cell(c) === "승인번호") && r.some((c) => cell(c) === "품목명"));
  if (ih >= 0) {
    const h = itemRows[ih].map(cell);
    const [iAp, iNm, iSup] = [h.indexOf("승인번호"), h.indexOf("품목명"), h.indexOf("공급가액")];
    const goods = new Map<string, number>();
    for (const r of itemRows.slice(ih + 1)) {
      const ap = cell(r[iAp]);
      if (!ap) continue;
      goods.set(ap, (goods.get(ap) ?? 0) + (NOT_GOODS.test(cell(r[iNm])) ? 0 : num(r[iSup])));
    }
    for (const r of out) if (goods.has(r.approval)) r.goods = goods.get(r.approval);
  }
  // 품목 시트가 없으면 대표 품목으로 판단 (수수료·광고뿐이면 물건값 0)
  for (const r of out) if (r.goods === undefined && NOT_GOODS.test(r.item)) r.goods = 0;
  return { rows: out, kind: free ? "계산서" : "세금계산서", error: null };
}

/** 같은 승인번호는 새 파일 것으로 바꾼다 */
export function mergeHometax(store: HometaxStore | null, add: HometaxRow[]): { store: HometaxStore; added: number } {
  const by = new Map((store?.rows ?? []).map((r) => [r.approval, r]));
  let added = 0;
  for (const r of add) {
    if (!by.has(r.approval)) added++;
    by.set(r.approval, r);
  }
  return { store: { rows: [...by.values()].sort((a, b) => a.date.localeCompare(b.date)) }, added };
}

/** 거래처 이름 맞추기: (주)·주식회사·(유)·유한회사·띄어쓰기 떼고, 한쪽이 다른 쪽에 들어 있으면 같은 곳 (본사(그루온) ↔ 주식회사 그루온, 주류 ↔ (유)청주주류) */
const squash = (s: string) => s.replace(/\(주\)|\(유\)|주식회사|유한회사|[\s()（）㈜]/g, "").toLowerCase();
export function sameVendor(a: string, b: string): boolean {
  const x = squash(a);
  const y = squash(b);
  return x.length >= 2 && y.length >= 2 && (x.includes(y) || y.includes(x));
}

export interface HometaxVendorRow {
  vendor: string;
  count: number;
  free: boolean;
  supply: number;
  goods: number; // 물건값 공급가 (로열티·배송비 뺀 것) — 영수증과 견주는 값
  vat: number;
  total: number;
  receipts: number | null; // 같은 거래처 매입 영수증 공급가 합 (영수증이 없으면 null)
  receiptCount: number;
}

export interface HometaxMonth {
  month: string;
  taxCount: number;
  freeCount: number;
  supply: number;
  vat: number; // 세금계산서 세액 합 = 돌려받는 부가세 (세금계산서 분)
  freeSupply: number; // 계산서(면세) 공급가 합 — 의제매입세액 기준
  vendors: HometaxVendorRow[];
}

/** 그 달(작성일자) 홈택스 자료를 거래처별로 묶고, 같은 거래처 매입 영수증과 견준다 */
export function hometaxMonth(store: HometaxStore | null, month: string, purchases: Purchase[]): HometaxMonth | null {
  const rows = (store?.rows ?? []).filter((r) => r.date.startsWith(month));
  if (!rows.length) return null;
  const groups = new Map<string, HometaxVendorRow>();
  for (const r of rows) {
    const key = `${r.bizNo}|${r.free ? "f" : "t"}`;
    const g = groups.get(key) ?? { vendor: r.vendor, count: 0, free: r.free, supply: 0, goods: 0, vat: 0, total: 0, receipts: null, receiptCount: 0 };
    g.count++;
    g.supply += r.supply;
    g.goods += r.goods ?? r.supply;
    g.vat += r.vat;
    g.total += r.total;
    groups.set(key, g);
  }
  const monthPurchases = purchases.filter((p) => p.date.startsWith(month));
  for (const g of groups.values()) {
    if (g.goods <= 0) continue; // 수수료·광고만 있는 곳(배달앱 등)은 영수증과 견주지 않는다
    const mine = monthPurchases.filter((p) => sameVendor(p.vendor, g.vendor));
    if (mine.length) {
      g.receipts = mine.reduce((a, p) => a + purchaseSupply(p), 0);
      g.receiptCount = mine.length;
    }
  }
  const vendors = [...groups.values()].sort((a, b) => b.total - a.total);
  return {
    month,
    taxCount: rows.filter((r) => !r.free).length,
    freeCount: rows.filter((r) => r.free).length,
    supply: rows.reduce((a, r) => a + r.supply, 0),
    vat: rows.reduce((a, r) => a + r.vat, 0),
    freeSupply: rows.filter((r) => r.free).reduce((a, r) => a + r.supply, 0),
    vendors,
  };
}

/** 세금계산서를 안 끊는 곳(마트·쿠팡 등 카드 결제)의 영수증 부가세 — 홈택스 세액에 더해 "비용에 든 부가세"를 만든다 */
export function cardReceiptVat(purchases: Purchase[], hm: HometaxMonth): number {
  return purchases
    .filter((p) => p.date.startsWith(hm.month) && !hm.vendors.some((v) => v.goods > 0 && sameVendor(p.vendor, v.vendor)))
    .reduce((a, p) => a + (p.vat ?? 0), 0);
}
