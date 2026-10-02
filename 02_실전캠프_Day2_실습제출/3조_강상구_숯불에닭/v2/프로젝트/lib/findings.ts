import type { ChannelSettlementSummary } from "./settlement";
import type { Month } from "./types";

// 손익 탭 맨 위 "이번 달 확인할 것" — 탭마다 흩어진 경고를 한곳에 모은다.
// 마감을 막지는 않는다. 알려 주고, 누르면 고칠 탭으로 보낸다. (김씨육면 경고 목록·떡기리 체크리스트에서 따옴)

export type FindingLevel = "danger" | "warn" | "info";

export interface Finding {
  level: FindingLevel;
  text: string;
  href: string;
  action: string; // 버튼 글자 ("정산 탭에서 보기")
}

// 한 달 손익에 필요한 자료가 다 들어왔나
export interface SourceCheck {
  label: string;
  done: boolean;
  detail: string;
  href: string;
}

export interface FindingsInput {
  month: Month;
  today: string; // "2026-10-03"
  lastBankDate: string; // 올린 통장의 마지막 날짜 ("" = 아직 없음)
  needsReview: number;
  unclassified: number;
  revenueBasis: "실매출" | "입금액";
  missingDays: string[]; // 오늘까지 중 매출을 안 넣은 날
  enteredDays: number;
  settlements: ChannelSettlementSummary[];
  nameOf: (channel: string) => string;
  purchaseCount: number; // 그 달 매입 영수증 수
  laborEstimated: boolean; // 급여가 아직 통장에서 안 나가 어림값으로 채웠나
  extra?: Finding[]; // 다른 곳에서 만든 경고 (고정비 빠짐 등)
}

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const wonText = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;

export function monthEnd(month: Month): string {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

// 이 달 자료를 어디까지 기대하나: 지난달이면 말일, 이번 달이면 어제 (오늘 통장은 아직 덜 찍혔을 수 있다)
function expectedUntil(month: Month, today: string): string {
  const end = monthEnd(month);
  if (today > end) return end;
  const d = new Date(today + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function monthSources(i: FindingsInput): SourceCheck[] {
  const until = expectedUntil(i.month, i.today);
  const future = i.month + "-01" > i.today; // 아직 안 온 달
  const bankDone = !!i.lastBankDate && i.lastBankDate >= until;
  return [
    {
      label: "통장",
      done: bankDone,
      detail: !i.lastBankDate ? "아직 안 올림" : bankDone ? `${md(i.lastBankDate)}까지 올림` : `${md(i.lastBankDate)}까지만 올림`,
      href: "/upload",
    },
    {
      label: "일별 매출",
      done: !future && i.missingDays.length === 0 && i.enteredDays > 0,
      detail: i.enteredDays === 0 ? "아직 안 넣음" : i.missingDays.length ? `빈 날 ${i.missingDays.length}일` : `${i.enteredDays}일 다 넣음`,
      href: "/today",
    },
    {
      label: "매입 영수증",
      done: i.purchaseCount > 0,
      detail: i.purchaseCount > 0 ? `${i.purchaseCount}장` : "아직 안 넣음",
      href: "/costing",
    },
    {
      label: "급여",
      done: !i.laborEstimated,
      detail: i.laborEstimated ? "아직 안 나감 (어림값)" : "통장 금액",
      href: "/upload",
    },
  ];
}

const ORDER: Record<FindingLevel, number> = { danger: 0, warn: 1, info: 2 };

export function monthFindings(i: FindingsInput): Finding[] {
  const out: Finding[] = [];

  // 입금일이 지났는데 안 들어온 정산 — 돈이 걸린 일이라 맨 위
  const missing = i.settlements.filter((r) => r.missing > 0);
  if (missing.length) {
    const batches = missing.reduce((a, r) => a + r.settlements.filter((s) => s.status === "미입금").length, 0);
    const sum = missing.reduce((a, r) => a + r.missing, 0);
    out.push({
      level: "danger",
      text: `입금일이 지났는데 안 들어온 정산 ${batches}건 · 매출 ${wonText(sum)} (${missing.map((r) => i.nameOf(r.channel)).join(", ")})`,
      href: "/channels",
      action: "정산 탭",
    });
  }

  if (i.needsReview > 0)
    out.push({
      level: "warn",
      text: `확인이 필요한 통장 줄 ${i.needsReview}줄${i.unclassified > 0 ? ` — 그중 ${i.unclassified}줄은 아직 손익에 안 들어갔어요` : ""}`,
      href: "/upload",
      action: "올리기 탭",
    });

  if (i.revenueBasis === "입금액")
    out.push({ level: "warn", text: "일별 매출을 안 넣어서 지금 매출은 통장 입금액 기준이에요 (배달앱 수수료가 안 보여요)", href: "/today", action: "오늘 탭" });
  else if (i.missingDays.length > 0) {
    const shown = i.missingDays.slice(0, 5).map(md).join(", ");
    out.push({
      level: "warn",
      text: `매출을 안 넣은 날 ${i.missingDays.length}일 (${shown}${i.missingDays.length > 5 ? " …" : ""}) — 쉬는 날이었으면 괜찮아요`,
      href: "/today",
      action: "오늘 탭",
    });
  }

  // 통장을 어디까지 올렸는지는 위 자료 체크리스트(monthSources)에서 보여 주니 여기선 안 띄운다 (같은 말 두 번 하지 않기)

  const diff = i.settlements.reduce((a, r) => a + r.settlements.filter((s) => s.status === "차이").length, 0);
  if (diff > 0) out.push({ level: "info", text: `입금액이 평소 수수료와 다르게 들어온 정산 ${diff}건`, href: "/channels", action: "정산 탭" });

  out.push(...(i.extra ?? []));
  return out.sort((a, b) => ORDER[a.level] - ORDER[b.level]);
}
