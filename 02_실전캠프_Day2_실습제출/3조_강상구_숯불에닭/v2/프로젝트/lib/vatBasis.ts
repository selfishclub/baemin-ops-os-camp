// 손익을 부가세 뺀 공급가로 보기 (2026-10-26 사장님 결정 — 세무사 장부와 같은 방식).
//  - 매출 ÷ 1.1 (음식 매출은 모두 과세)
//  - 비용: 매입세액을 돌려받는 항목만 ÷ 1.1. 인건비·카드수수료·세금처럼 부가세가 없는 것, 차량유지비·접대비처럼 공제가 안 되는 것은 그대로
//  - 재료비: 그 달 매입 영수증의 공급가 비율을 곱하고, 면세 재료(닭고기·채소 등)의 의제매입세액공제를 뺀다 (사장님: 공제 받고 있음)
//  - 통장에서 낸 부가세는 비용이 아니다 (손님에게 받아 맡아 둔 돈). 손익에서 빼고 따로 보여 준다
import { lineGrossPaid, lineSupply, type Purchase } from "@/lib/costing/purchases";

export const VAT_RATE = 0.1;

// 의제매입세액 공제율 — 개인 음식점, 과세표준 2억 원 초과(우리 가게 연 매출 기준) 8/108. 2억 이하면 9/109 (세무사 확인 필요)
export const DEEMED_RATE = 8 / 108;

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
}

const isMaterial = (category: string) => category === "원재료비" || category === "기타재료비";

/** 그 달 매입 영수증으로 재료비 공급가 비율과 의제매입세액을 구한다 */
export function vatBasisFrom(purchases: Purchase[], deemedRate = DEEMED_RATE): VatBasis {
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
      if (l.taxFree || p.vat === 0) taxFree += g;
    }
  return {
    materialSupplyRatio: gross > 0 ? supply / gross : 1,
    deemedInput: Math.round(taxFree * deemedRate),
    taxFreeMaterial: taxFree,
  };
}
