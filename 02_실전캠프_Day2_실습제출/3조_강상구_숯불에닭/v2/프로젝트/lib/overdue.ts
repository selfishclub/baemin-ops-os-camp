import { channelKind } from "./categories";
import type { ChannelSettlementSummary, SettlementRule } from "./settlement";

// "입금일 지났는데 없음"(빨간 숫자)을 눌렀을 때 보여 줄 설명.
// 한 묶음(매출 기간)마다: 언제 들어왔어야 했는지, 며칠 지났는지, 왜 그럴 수 있는지, 근처에 짝 없이 들어온 입금이 있는지.
export interface OverdueDetail {
  channel: string;
  from: string;
  to: string;
  payout: string; // 들어왔어야 할 날
  sales: number;
  daysLate: number; // 통장 마지막 날 기준 며칠 지났나
  rule: string; // "매출일 + 2영업일" 같은 설명
  nearby: { date: string; amount: number; channel: string; sameChannel: boolean }[];
  hints: string[];
}

const DOW = ["월", "화", "수", "목", "금", "토", "일"];
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

export function ruleText(rule: SettlementRule | undefined): string {
  if (!rule) return "정산 규칙 없음";
  const base = rule.mode === "weekly" ? `매주 ${DOW[rule.weekday]}요일` : rule.mode === "calendar" ? `매출일 + ${rule.days}일(쉬는 날이면 다음 영업일)` : `매출일 + ${rule.days}영업일`;
  return rule.manual ? `${base} (직접 출금 신청)` : base;
}

export function explainOverdue(results: ChannelSettlementSummary[], rules: SettlementRule[], lastBankDate: string, nameOf: (id: string) => string = (id) => id): OverdueDetail[] {
  const unmatched = results.flatMap((r) => r.unmatchedDeposits.map((d) => ({ ...d, channel: r.channel })));
  const out: OverdueDetail[] = [];
  for (const r of results)
    for (const s of r.settlements) {
      if (s.status !== "미입금") continue;
      const rule = rules.find((x) => x.channel === s.channel);
      // 들어왔어야 할 날 2일 전 ~ 7일 뒤, 금액이 매출의 50%~105%인 짝 없는 입금
      const nearby = unmatched
        .filter((d) => days(s.payout, d.date) >= -2 && days(s.payout, d.date) <= 7 && d.amount >= s.sales * 0.5 && d.amount <= s.sales * 1.05)
        .map((d) => ({ ...d, sameChannel: d.channel === s.channel }))
        .sort((a, b) => Number(b.sameChannel) - Number(a.sameChannel) || Math.abs(days(s.payout, a.date)) - Math.abs(days(s.payout, b.date)));
      const late = Math.max(0, days(s.payout, lastBankDate));
      const kind = channelKind(s.channel);
      const hints: string[] = [];
      if (rule?.manual) hints.push("직접 출금 신청하는 앱이에요. 사장님 사이트에서 이 기간 출금 신청을 했는지 확인해 보세요. 신청하면 며칠 뒤 한꺼번에 들어와요.");
      const same = nearby.filter((n) => n.sameChannel);
      const other = nearby.filter((n) => !n.sameChannel && channelKind(n.channel) === kind);
      if (same.length) {
        const early = same.some((n) => n.date < s.payout);
        const lateIn = same.some((n) => n.date > s.payout);
        const when = early && !lateIn ? "규칙보다 일찍 들어왔거나(규칙의 영업일 수를 줄여 보세요)" : lateIn && !early ? "규칙보다 늦게 들어왔거나(규칙의 영업일 수를 늘려 보세요)" : "입금일이 규칙과 다르거나";
        hints.push(`${same.map((n) => `${md(n.date)} ${won(n.amount)}`).join(", ")}이(가) 짝 없이 들어와 있어요. ${when}, 여러 날 매출이 섞여 금액이 달라 못 맞췄을 수 있어요.`);
      }
      if (other.length)
        hints.push(`비슷한 금액이 ${other.map((n) => `${nameOf(n.channel)} ${md(n.date)} ${won(n.amount)}`).join(", ")}(으)로 들어왔어요. 오늘 탭에서 이 날 매출을 다른 ${kind === "card" ? "카드사" : "채널"}로 넣었는지 확인해 보세요.`);
      if (late <= 1 && !rule?.manual) hints.push("입금일이 막 지났어요. 하루 이틀 늦게 들어오기도 하니 다음 통장을 올린 뒤 다시 보세요.");
      if (!same.length && !other.length && !rule?.manual)
        hints.push(
          s.channel === "card_zeropay"
            ? "근처에 비슷한 입금이 없어요. 제로페이 가맹점 포털(zeropay.or.kr)의 정산 내역에서 이 날 매출의 입금일을 확인해 보세요."
            : s.channel === "card_easy"
              ? "근처에 비슷한 입금이 없어요. 간편결제사(토스·카카오페이 등) 가맹점 정산 내역에서 이 날 매출의 입금일을 확인해 보세요."
              : kind === "card"
            ? "근처에 비슷한 입금이 없어요. 카드사 가맹점 사이트나 여신금융협회 카드매출 조회(cardsales.or.kr)에서 이 날 매출의 지급 예정일을 확인해 보세요. 정말 안 들어왔으면 카드사에 문의하세요."
            : "근처에 비슷한 입금이 없어요. 앱 사장님 사이트의 정산 내역에서 이 기간 지급일·지급액을 확인해 보세요.",
        );
      out.push({ channel: s.channel, from: s.from, to: s.to, payout: s.payout, sales: s.sales, daysLate: late, rule: ruleText(rule), nearby, hints });
    }
  return out.sort((a, b) => (a.payout < b.payout ? -1 : a.payout > b.payout ? 1 : 0));
}
