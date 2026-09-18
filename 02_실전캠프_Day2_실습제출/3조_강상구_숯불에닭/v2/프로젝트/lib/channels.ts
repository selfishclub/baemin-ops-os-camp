import { isHall, type ChannelId } from "./categories";
import type { ChannelSale, Transaction } from "./types";

// 기준: 매출·수수료는 "주문이 발생한 달"로 본다.
//  - orders  = 이 달에 주문된 금액
//  - deposit = 그 주문분의 정산금액(수수료를 빼고 받을/받은 돈). 통장에 들어온 날과는 상관없다.
// 통장 입금은 며칠 늦게 들어오므로 확인용으로만 쓴다:
//  이 달 통장에 들어와야 할 돈 = 지난달 말 미입금액 + 이 달 정산금액 − 이 달 말 미입금액
export interface ChannelFee {
  channel: ChannelId;
  name: string;
  orders: number;
  deposit: number;
  count: number;
  fee: number; // 주문금액 − 정산금액 (배달앱만. 정산금액을 안 넣었으면 0)
  feeRate: number | null; // fee ÷ 주문금액 (%)
  perOrder: number | null; // 건당 주문금액
  carriedIn: number; // 지난달 말 미입금액 (이 달에 들어옴)
  unsettled: number | null; // 이 달 말 미입금액 (다음 달에 들어옴). null = 안 넣음
  expectedBank: number; // 이 달 통장에 들어와야 할 돈
  bankDeposit: number; // 통장에 실제로 찍힌 이 채널 입금 합계
  gap: number; // expectedBank − bankDeposit (0이면 일치)
  // 확정: 월말 미입금액을 넣어서 차이가 진짜 차이다 / 시차 포함: 안 넣어서 정산 시차가 섞여 있다
  gapKind: "확정" | "시차 포함" | "없음";
}

// 통장 입금 줄 중 채널이 붙은 것의 합계
export function bankDepositsByChannel(txs: Transaction[]): Partial<Record<ChannelId, number>> {
  const out: Partial<Record<ChannelId, number>> = {};
  for (const t of txs) {
    if (t.channel && t.in > 0) out[t.channel] = (out[t.channel] ?? 0) + t.in;
  }
  return out;
}

// 수수료는 배달앱만 계산한다. 홀의 카드수수료는 통장 출금(영업비 > 카드수수료)으로 잡힌다.
// 정산금액을 아직 안 넣은 채널은 수수료를 0으로 둔다(주문금액 전체가 수수료로 잡히는 걸 막음).
export function feeOf(s: Pick<ChannelSale, "channel" | "orders" | "deposit">): number {
  if (isHall(s.channel) || s.deposit <= 0) return 0;
  return s.orders - s.deposit;
}

export function channelFees(sales: ChannelSale[], txs: Transaction[], prevSales: ChannelSale[] = []): ChannelFee[] {
  const bank = bankDepositsByChannel(txs);
  return sales.map((s) => {
    const fee = feeOf(s);
    const hasFee = !isHall(s.channel) && s.deposit > 0 && s.orders > 0;
    const bankDeposit = bank[s.channel] ?? 0;
    const carriedIn = prevSales.find((p) => p.channel === s.channel)?.unsettled ?? 0;
    const unsettled = s.unsettled ?? null;
    const expectedBank = carriedIn + s.deposit - (unsettled ?? 0);
    return {
      channel: s.channel,
      name: s.name,
      orders: s.orders,
      deposit: s.deposit,
      count: s.count,
      fee,
      feeRate: hasFee ? round1((fee / s.orders) * 100) : null,
      perOrder: s.count > 0 ? Math.round(s.orders / s.count) : null,
      carriedIn,
      unsettled,
      expectedBank,
      bankDeposit,
      gap: s.deposit > 0 ? expectedBank - bankDeposit : 0,
      gapKind: s.deposit <= 0 ? "없음" : unsettled === null ? "시차 포함" : "확정",
    };
  });
}

export const round1 = (n: number) => Math.round(n * 10) / 10;
