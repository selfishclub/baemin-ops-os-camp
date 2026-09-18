import type { Channel } from "./categories";
import { monthChannelTotals } from "./daily";
import type { ChannelSettlementSummary } from "./settlement";
import type { ChannelSale, DailySale, Month } from "./types";

// 손익·수수료 계산에 쓸 "이 달 채널 실매출"을 정한다.
//  1) 정산 탭에 직접 저장한 월 합계가 있으면 그것
//  2) 없으면 오늘 탭의 일별 합계 + 정산 규칙으로 짝 맞춘 입금
//     - 정산금액 = 확인된 입금 + (아직 안 들어온 매출 × (1 − 확인된 수수료율))  ← 예정분은 같은 수수료율로 어림
//     - 월말 미입금액 = 아직 안 들어온 매출 × (1 − 수수료율)
export function effectiveChannelSales(
  month: Month,
  saved: ChannelSale[],
  daily: DailySale[],
  channels: Channel[],
  settlements: ChannelSettlementSummary[],
): ChannelSale[] {
  const totals = monthChannelTotals(month, daily, channels);
  const out: ChannelSale[] = [];
  for (const c of channels.filter((x) => x.active)) {
    const s = saved.find((x) => x.channel === c.id);
    if (s && s.orders > 0) {
      out.push({ ...s, unsettled: s.unsettled ?? null });
      continue;
    }
    const orders = totals[c.id] ?? 0;
    if (orders <= 0) continue;
    const st = settlements.find((x) => x.channel === c.id);
    if (c.kind === "cash" || !st) {
      out.push({ month, channel: c.id, name: c.name, orders, deposit: 0, count: 0, unsettled: c.kind === "cash" ? 0 : null });
      continue;
    }
    const rate = st.feeRate === null ? 0 : st.feeRate / 100;
    const pendingDeposit = Math.round(st.pending * (1 - rate));
    out.push({ month, channel: c.id, name: c.name, orders, deposit: st.deposited + pendingDeposit, count: 0, unsettled: pendingDeposit });
  }
  // 저장돼 있지만 채널 설정에서 꺼진(또는 v1 이름인) 줄도 손익에는 넣는다
  for (const s of saved) if (s.orders > 0 && !out.some((x) => x.channel === s.channel)) out.push({ ...s, unsettled: s.unsettled ?? null });
  return out;
}
