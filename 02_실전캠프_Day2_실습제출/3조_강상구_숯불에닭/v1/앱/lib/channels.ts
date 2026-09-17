import type { ChannelId } from "./categories";
import type { ChannelSale, Transaction } from "./types";

export interface ChannelFee {
  channel: ChannelId;
  name: string;
  orders: number;
  deposit: number;
  count: number;
  fee: number; // 주문금액 − 입금액 (배달앱만. 입금액을 안 넣었으면 0)
  feeRate: number | null; // fee ÷ 주문금액 (%)
  perOrder: number | null; // 건당 주문금액
  bankDeposit: number; // 통장에 실제로 찍힌 이 채널 입금 합계
  gap: number; // 입력한 입금액 − 통장 입금 합계 (0이면 일치)
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
// 입금액을 아직 안 넣은 채널은 수수료를 0으로 둔다(주문금액 전체가 수수료로 잡히는 걸 막음).
export function feeOf(s: Pick<ChannelSale, "channel" | "orders" | "deposit">): number {
  if (s.channel === "hall" || s.deposit <= 0) return 0;
  return s.orders - s.deposit;
}

export function channelFees(sales: ChannelSale[], txs: Transaction[]): ChannelFee[] {
  const bank = bankDepositsByChannel(txs);
  return sales.map((s) => {
    const fee = feeOf(s);
    const hasFee = s.channel !== "hall" && s.deposit > 0 && s.orders > 0;
    const bankDeposit = bank[s.channel] ?? 0;
    return {
      channel: s.channel,
      name: s.name,
      orders: s.orders,
      deposit: s.deposit,
      count: s.count,
      fee,
      feeRate: hasFee ? round1((fee / s.orders) * 100) : null,
      perOrder: s.count > 0 ? Math.round(s.orders / s.count) : null,
      bankDeposit,
      gap: s.deposit > 0 ? s.deposit - bankDeposit : 0,
    };
  });
}

export const round1 = (n: number) => Math.round(n * 10) / 10;
