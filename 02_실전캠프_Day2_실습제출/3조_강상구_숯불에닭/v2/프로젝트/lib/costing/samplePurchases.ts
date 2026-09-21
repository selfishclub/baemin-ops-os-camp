import type { Purchase, PurchaseLine } from "./purchases";

// 시연용 가짜 매입 영수증 (2026-09). 가짜 9월 통장 파일(scripts/make-sample-daily.mjs)의 체크카드 결제와 짝이 된다.
//  - 맞음 6건(할인 반영 1건, 두 장의 합 1건, 하루 차이 1건), 영수증 없음 3건, 같은 날 카드 취소 1건이 보이게 짰다
//  - 품목에는 연결하지 않는다 (가짜 품목 기준단가를 건드리지 않게)
const L = (name: string, unitPrice: number, qty: number, category: PurchaseLine["category"] = "원재료비"): PurchaseLine => ({ name, unitPrice, qty, amount: unitPrice * qty, category, itemId: null, itemQty: 0 });
const P = (id: string, date: string, vendor: string, lines: PurchaseLine[], discount = 0): Purchase => ({ id: `pu_demo_${id}`, date, vendor, lines, discount, memo: "시연용 가짜 영수증" });

export const SAMPLE_PURCHASES_MONTH = "2026-09";
export const SAMPLE_PURCHASES: Purchase[] = [
  P("0902", "2026-09-02", "가짜마트", [L("양파 15kg", 18000, 2), L("대파 1단", 2500, 3), L("상추 1봉", 5100, 1)]),
  P("0906", "2026-09-06", "가짜마트", [L("특란 30구", 7000, 3), L("주방세제 3L", 5000, 1, "소모품비"), L("단무지 2.6kg", 4700, 2)], 3000),
  P("0908", "2026-09-08", "가짜생활용품", [L("행주 5장", 2000, 5, "소모품비")]),
  P("0909a", "2026-09-09", "가짜김 (네이버)", [L("김가루 1kg", 26000, 2)]),
  P("0909b", "2026-09-09", "가짜떡 (네이버)", [L("떡 2kg", 12000, 2)]),
  P("0911", "2026-09-11", "가짜식자재마트", [L("닭가슴살 2kg", 15450, 4)]),
  P("0915", "2026-09-15", "가짜마트", [L("깻잎 1kg", 9300, 3)]),
];
