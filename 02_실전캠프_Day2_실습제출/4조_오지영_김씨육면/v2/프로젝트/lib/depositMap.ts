import { REVENUE_CHANNELS } from "./accounts";
import type { BankDeposit } from "./store";
import type { RevenueLine } from "./types";

/**
 * 통장 입금 → 매출 채널 짐작.
 *
 * 카드사 가맹점 정산은 전부 홀 결제가 돌아온 것이고,
 * 배달앱은 앱 이름이나 정산 명의로 들어온다.
 * 어디까지나 제안이다 — 사장님이 보고 고친다.
 */
const GUESS: { test: RegExp; channel: string }[] = [
  { test: /음식배달|배달의민족|우아한형제/, channel: "배달의민족" },
  { test: /쿠팡페이|쿠팡이츠|쿠페이/, channel: "쿠팡이츠" },
  { test: /요기요|위대한상상|딜리버리히어로/, channel: "요기요" },
  // 카드사 정산 — 가맹점에서 긁힌 돈이 돌아온 것이라 홀로 본다
  { test: /^(KB|국민)\d|가맹입금|하나\d|신한\d|삼성\d|롯데카드\d|^우\d|NH\d|현\d|^\d{9,}[A-Z]?$/, channel: "홀" },
  { test: /카카오페이|네이버페이|제로페이/, channel: "홀" },
];

export const guessChannel = (who: string): string | null =>
  GUESS.find((g) => g.test.test(who.trim()))?.channel ?? null;

export interface DepositGroup {
  who: string;
  count: number;
  amount: number;
  /** 짐작한 채널. null 이면 매출이 아닐 수 있다 */
  channel: string | null;
}

/** 보낸분별로 묶는다. 한 달에 같은 곳에서 열몇 번씩 들어오니 묶어야 읽힌다. */
export function groupDeposits(deposits: BankDeposit[]): DepositGroup[] {
  const by = new Map<string, { count: number; amount: number }>();
  for (const d of deposits) {
    const k = d.who.trim() || "(보낸분 없음)";
    const cur = by.get(k) ?? { count: 0, amount: 0 };
    cur.count += 1;
    cur.amount += d.amount;
    by.set(k, cur);
  }
  return [...by.entries()]
    .map(([who, v]) => ({ who, ...v, channel: guessChannel(who) }))
    .sort((a, b) => b.amount - a.amount);
}

/** 채널별 입금액 합계 — 매출 단계의 입금액 칸에 그대로 들어간다 */
export function depositTotals(groups: DepositGroup[], override: Record<string, string>): Map<string, number> {
  const out = new Map<string, number>();
  for (const g of groups) {
    const ch = override[g.who] ?? g.channel;
    if (!ch || !REVENUE_CHANNELS.some((c) => c.channel === ch)) continue;
    out.set(ch, (out.get(ch) ?? 0) + g.amount);
  }
  return out;
}

/**
 * 입금 내역에서 매출 줄을 만든다.
 * 매출액(gross)은 아직 넣지 않기로 했으므로 0이고, 입금액만 채운다.
 * 수수료는 매출액이 있어야 뜻이 있어서 여기서는 계산하지 않는다.
 */
export function revenueFromDeposits(deposits: BankDeposit[]): RevenueLine[] {
  const by = new Map<string, number>();
  for (const d of deposits) {
    if ((d.kind ?? "매출") !== "매출" || !d.channel) continue;
    by.set(d.channel, (by.get(d.channel) ?? 0) + d.amount);
  }
  return [...by.entries()].map(([channel, deposit]) => ({
    account: REVENUE_CHANNELS.find((c) => c.channel === channel)?.account ?? "매출-기타",
    channel,
    gross: 0,
    deposit,
  }));
}
