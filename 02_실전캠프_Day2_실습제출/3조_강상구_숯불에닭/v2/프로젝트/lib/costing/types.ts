// 원가율 — 품목·메뉴·레시피. ai-store-manager의 도메인 모델과 같은 모양이라 나중에 재고 원장(B안)으로 그대로 넓힐 수 있다.
export type BaseUnit = "kg" | "g" | "L" | "ml" | "ea";

export interface Item {
  id: string;
  name: string; // 예: 닭갈비 원육
  baseUnit: BaseUnit; // 재고·단가 기준 단위 (kg, L, ea)
  standardCost: number; // 기준단가 (baseUnit 1개당 원). 대략값이면 된다
  category: "meat" | "produce" | "sauce" | "drink" | "packaging" | "etc";
  active: boolean;
}

export interface Menu {
  id: string;
  name: string;
  posCode: string | null; // 포스 상품코드. 이름은 흔들려도 코드는 안 흔들린다
  price: number;
  active: boolean;
}

export interface RecipeLine {
  itemId: string;
  unit: BaseUnit; // 레시피에서 쓰는 단위 (g, ml, ea)
  quantity: number;
}

export interface Recipe {
  menuId: string;
  lines: RecipeLine[];
  effectiveFrom: string; // 이 날부터 적용 (레시피가 바뀌면 새 줄 추가)
}

// 포스 "상품ABC분석" 한 달치 판매
export interface PosSalesLine {
  code: string;
  name: string;
  amount: number; // 실매출액
  quantity: number;
}

export interface PosSalesReport {
  month: string; // "2026-09"
  periodStart: string;
  periodEnd: string;
  lines: PosSalesLine[];
  totalAmount: number;
  totalQuantity: number;
}

export const ITEMS_KEY = "costing_items";
export const MENUS_KEY = "costing_menus";
export const RECIPES_KEY = "costing_recipes";
export const POS_KEY_PREFIX = "pos_sales_"; // + month
