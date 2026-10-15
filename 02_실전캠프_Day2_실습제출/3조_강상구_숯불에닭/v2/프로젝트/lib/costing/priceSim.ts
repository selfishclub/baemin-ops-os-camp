// 가격 실험 — "이 메뉴 값을 올리면 얼마나 더 남나, 손님이 몇 % 줄어도 괜찮나".
// 유승균 사장님 배달이익노트(baemin-profit-note)의 가격 시뮬레이션 계산식을 우리 자료 모양(포스 메뉴별 판매·레시피 원가)에 맞춰 옮겼다.
//  - 가격만 올렸다고 같은 음식의 재료 원가가 오르지는 않는다 → 원가는 그대로, 인상분에서 수수료 몫만 뺀다
//  - 모르는 값은 0으로 치지 않는다. 레시피가 없어 원가를 모르면 "더 들어오는 돈"까지만 내고 마진 비교는 비운다
//  - 손님이 줄어드는 가정(0·5·10·20%)마다 한 달 이익이 어떻게 달라지는지 같이 보여 준다
import type { ChannelSale, Transaction } from "../types";
import { feeOf } from "../channels";

export interface PriceSimMenu {
  code: string;
  name: string;
  quantity: number; // 이 달 판매량
  amount: number; // 이 달 실매출
  unitCost: number | null; // 1개 이론 원가. 레시피 없으면 null
}

export interface PriceSimInput {
  menu: PriceSimMenu;
  priceDelta: number; // 1개당 올리는 금액 (음수면 내리기)
  feeRatePct: number; // 인상분에 붙는 수수료 가정 (%) — 배달앱 수수료·카드수수료
  declinesPct: number[]; // 판매 감소 가정 (%)
}

export interface PriceSimScenario {
  declinePct: number;
  quantity: number; // 그만큼 줄었을 때 판매량
  revenue: number; // 그때 한 달 매출 (수수료 빼기 전)
  profit: number | null; // 그때 한 달 마진 (원가·수수료 뺀 뒤). 원가 모르면 null
  diff: number | null; // 지금 마진과의 차이
}

export type PriceSim =
  | { status: "empty"; reason: string }
  | {
      status: "ok";
      unitPrice: number; // 지금 평균 단가 (실매출 ÷ 판매량)
      newPrice: number;
      addedPerUnit: number; // 1개당 더 남는 돈 = 인상분 − 수수료
      marginBefore: number | null; // 1개 마진 (단가 − 원가)
      marginAfter: number | null;
      costRateBefore: number | null; // %
      costRateAfter: number | null;
      gainSameQty: number; // 판매량이 그대로일 때 한 달에 더 남는 돈
      baseProfit: number | null; // 지금 한 달 마진
      scenarios: PriceSimScenario[];
      maxDeclinePct: number | null; // 판매가 이만큼 넘게 줄면 오히려 손해 (원가·마진 알 때만)
      minQuantity: number | null; // 지금 마진을 지키는 최소 판매량
    };

const r1 = (n: number) => Math.round(n * 10) / 10;
const pct = (a: number, b: number) => (b > 0 ? r1((a / b) * 100) : null);

export function simulatePrice(i: PriceSimInput): PriceSim {
  const m = i.menu;
  if (m.quantity <= 0 || m.amount <= 0) return { status: "empty", reason: "이 달 판매가 없어 계산할 수 없어요." };
  if (!Number.isFinite(i.priceDelta) || i.priceDelta === 0) return { status: "empty", reason: "올릴 금액을 정해 주세요." };

  const unitPrice = Math.round(m.amount / m.quantity);
  const newPrice = unitPrice + i.priceDelta;
  if (newPrice <= 0) return { status: "empty", reason: "그만큼 내리면 값이 0원 아래가 돼요." };

  const fee = Math.min(Math.max(i.feeRatePct, 0), 100) / 100;
  const addedPerUnit = Math.round(i.priceDelta * (1 - fee));

  const hasCost = m.unitCost !== null && m.unitCost >= 0;
  const marginBefore = hasCost ? unitPrice - m.unitCost! : null;
  const marginAfter = hasCost ? marginBefore! + addedPerUnit : null;
  const baseProfit = hasCost ? marginBefore! * m.quantity : null;

  const scenarios: PriceSimScenario[] = i.declinesPct.map((d) => {
    const quantity = Math.round(m.quantity * (1 - d / 100));
    const revenue = newPrice * quantity;
    const profit = hasCost ? marginAfter! * quantity : null;
    return { declinePct: d, quantity, revenue, profit, diff: profit === null ? null : profit - baseProfit! };
  });

  const positive = hasCost && marginBefore! > 0 && marginAfter! > 0;
  return {
    status: "ok",
    unitPrice,
    newPrice,
    addedPerUnit,
    marginBefore,
    marginAfter,
    costRateBefore: hasCost ? pct(m.unitCost!, unitPrice) : null,
    costRateAfter: hasCost ? pct(m.unitCost!, newPrice) : null,
    gainSameQty: addedPerUnit * m.quantity,
    baseProfit,
    scenarios,
    maxDeclinePct: positive ? r1((1 - marginBefore! / marginAfter!) * 100) : null,
    minQuantity: hasCost && marginAfter! > 0 ? Math.ceil(baseProfit! / marginAfter!) : null,
  };
}

// 수수료 가정의 기본값 — 이 달 장부에서 "주문금액 대비 수수료"를 어림한다.
//  분자: 배달앱 수수료(주문금액 − 정산금액) + 통장에서 나간 카드수수료 / 분모: 모든 채널 주문금액
//  자료가 없으면 null (화면에서 기본 3%를 쓰고 "어림"이라고 알린다)
export function defaultFeeRatePct(sales: ChannelSale[], txs: Transaction[]): number | null {
  const orders = sales.reduce((a, s) => a + s.orders, 0);
  if (orders <= 0) return null;
  const deliveryFee = sales.reduce((a, s) => a + feeOf(s), 0);
  const cardFee = txs.filter((t) => t.minor === "카드수수료").reduce((a, t) => a + t.out - t.in, 0);
  return r1(((deliveryFee + Math.max(0, cardFee)) / orders) * 100);
}
