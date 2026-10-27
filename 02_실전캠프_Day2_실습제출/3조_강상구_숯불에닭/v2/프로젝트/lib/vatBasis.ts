// 손익을 부가세 뺀 공급가로 보기 (2026-10-26 사장님 결정 — 세무사 장부와 같은 방식).
//  - 매출 ÷ 1.1 (음식 매출은 모두 과세)
//  - 비용: 매입세액을 돌려받는 항목만 ÷ 1.1. 인건비·카드수수료·세금처럼 부가세가 없는 것, 차량유지비·접대비처럼 공제가 안 되는 것은 그대로
//  - 재료비: 그 달 매입 영수증의 공급가 비율을 곱하고, 면세 재료(닭고기·채소 등)의 의제매입세액공제를 뺀다 (사장님: 공제 받고 있음)
//  - 통장에서 낸 부가세는 비용이 아니다 (손님에게 받아 맡아 둔 돈). 손익에서 빼고 따로 보여 준다
import { lineGrossPaid, lineSupply, type Purchase } from "@/lib/costing/purchases";
import { cardReceiptVat, sameVendor, type HometaxMonth } from "@/lib/hometax";
import type { Transaction } from "@/lib/types";

export const VAT_RATE = 0.1;

// 의제매입세액 공제율 — 개인 음식점, 과세표준 2억 원 초과(우리 가게 연 매출 기준) 8/108. 2억 이하면 9/109 (세무사 확인 필요)
export const DEEMED_RATE = 8 / 108;

// 신용카드 매출전표 등 발행세액공제 — 개인사업자(직전 연도 공급가액 10억 이하), 카드·현금영수증·배달앱 결제 매출의 1.3%, 1년 한도 1,000만 원
export const CARD_CREDIT_RATE = 0.013;
export const CARD_CREDIT_YEAR_CAP = 10_000_000;

/** 카드 매출 세액공제 대상 채널: 카드, 현금영수증, 배달앱(앱 결제). 영수증 없는 현금·계좌이체는 아니다 */
export const cardCreditEligible = (channelId: string, kind: string) => kind === "card" || kind === "delivery" || channelId === "hall_cash_receipt";

/** 이 비용 줄에 공제받는 부가세가 들어 있나 (들어 있으면 ÷1.1) */
export function hasInputVat(major: string, minor: string): boolean {
  if (major === "가맹수수료" || major === "임대료") return true;
  if (major === "영업비") return ["지급수수료", "배달대행비", "수도광열비", "통신비", "소모품비", "수선비", "광고비", "배달앱 수수료"].includes(minor);
  if (major === "노무관리비") return minor === "복리후생비";
  return false; // 매출원가는 영수증 비율로 따로, 세금과공과·급여·기타·차량유지관리비·접대비·카드수수료는 그대로
}

/** 통장에서 낸 부가세 (세금과공과 › 부가세) — 비용이 아니라 맡아 둔 돈을 낸 것 */
export const isVatPayment = (major: string, minor: string) => major === "세금과공과" && minor === "부가세";

export interface VatBasis {
  materialSupplyRatio: number; // 재료비(부가세 포함) × 이 비율 = 공급가
  deemedInput: number; // 의제매입세액공제 (면세 재료 × 8/108)
  taxFreeMaterial: number; // 면세 재료 매입액
  inputActual?: number; // 홈택스 세금계산서 세액 + 카드로 산 것의 부가세 (홈택스 자료를 올린 달만)
  inputCard?: number; // 그중 카드로 산 것의 부가세 (영수증·체크카드 결제)
}

const isMaterial = (category: string) => category === "원재료비" || category === "기타재료비";

/** 그 달 매입 영수증으로 재료비 공급가 비율과 의제매입세액을 구한다.
 *  홈택스 자료(hm)가 있으면 비용에 든 부가세는 실제 세액 + 카드로 산 것(txs: 그 달 통장 줄)의 부가세로, 의제매입은 전자계산서 공급가 + 카드로 산 면세 재료로 */
export function vatBasisFrom(purchases: Purchase[], deemedRate = DEEMED_RATE, hm: HometaxMonth | null = null, txs: Transaction[] = []): VatBasis {
  let gross = 0;
  let supply = 0;
  let taxFree = 0;
  for (const p of purchases)
    for (const l of p.lines ?? []) {
      if (!isMaterial(l.category)) continue;
      const g = lineGrossPaid(p, l);
      gross += g;
      supply += lineSupply(p, l);
      // 면세 재료: 줄에 면세 표시, 또는 부가세 0원인 영수증(으뜸 닭고기처럼 계산서로 받는 곳)
      // 홈택스 계산서가 있으면 계산서 받는 거래처 몫은 계산서 금액으로 센다 (아래)
      if ((l.taxFree || p.vat === 0) && !(hm?.freeCount && hm.vendors.some((v) => v.free && sameVendor(p.vendor, v.vendor)))) taxFree += g;
    }
  if (hm?.freeCount) taxFree += hm.freeGoods;
  const card = hm && hm.taxCount ? cardReceiptVat(purchases, hm, txs) : 0;
  return {
    materialSupplyRatio: gross > 0 ? supply / gross : 1,
    deemedInput: Math.round(taxFree * deemedRate),
    taxFreeMaterial: taxFree,
    ...(hm && hm.taxCount ? { inputActual: hm.vat + card, inputCard: card } : {}),
  };
}
