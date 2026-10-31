import type { Major } from "./categories";
import type { FixedCost } from "./fixedCosts";
import type { Rule, Transaction } from "./types";

// "지난달엔 나갔는데 이번 달엔 아직 안 나간 고정비" 찾기 (김씨육면 경고 목록에서 따옴).
// 월세·통신비·가스비처럼 매달 나가는 돈이 빠지면 이번 달 이익이 실제보다 많아 보인다.
//  - 매달 나가는 항목만 본다 (임대료·가맹수수료·영업비 중 정기 항목)
//  - 지난달 낸 날짜 + 한 달 + 3일까지 통장을 올렸는데도 없을 때만 알린다 (아직 날이 안 됐으면 조용히)
//  - 규칙 탭 "매달 나가는 고정비"에 적어 둔 거래처는 이미 미리 채우고 있으니 뺀다

const RECURRING_MAJORS: Major[] = ["임대료", "가맹수수료"];
const RECURRING_MINORS: Record<string, string[]> = { 영업비: ["지급수수료", "통신비", "수도광열비", "충당금", "카드수수료"] };
const GRACE_DAYS = 3;

export interface MissingFixed {
  key: string; // 거래처를 알아보는 글자 (숫자·공백을 뗀 것 — 이름에 달이 박혀도 같은 거래처로 본다)
  label: string; // 화면에 보일 이름 (지난달 통장에 찍힌 그대로)
  prevAmount: number;
  prevDate: string;
  expectedBy: string; // 이 날까지 통장을 올렸는데 없으면 알린다
}

const isRecurring = (t: Transaction) =>
  !!t.major && (RECURRING_MAJORS.includes(t.major) || (RECURRING_MINORS[t.major]?.includes(t.minor ?? "") ?? false));

// 거래처를 맞출 때 쓰는 글자 — 숫자·공백·괄호를 뗀다.
// 통장에 "전기료 전기요금09월", "통신료 KT0213399709"처럼 달이 박혀 찍히는 곳이 있어서,
// 글자 그대로 맞추면 매달 다른 거래처로 보여 "안 나갔다"고 잘못 알린다.
// 규칙 탭에도 달마다 따로 만들어진 키워드("…09월", "…10월")가 남아 있어서 규칙 쪽도 같이 뗀다.
// (2026-11-01 10월 손익에서 전기요금·KT가 나갔는데도 빠졌다고 떴다.)
const normalize = (s: string) => s.replace(/[\s\d\-_.()/]+/g, "");

function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// 한 달 뒤 같은 날 (31일 → 다음 달 말일)
function nextMonthSameDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d, last))).toISOString().slice(0, 10);
}

export function missingFixedCosts(prevTxs: Transaction[], txs: Transaction[], rules: Rule[], lastBankDate: string, fixedCosts: FixedCost[] = []): MissingFixed[] {
  const nameOf = (t: Transaction) => rules.find((r) => r.direction === "out" && t.payee.includes(r.keyword))?.keyword ?? t.payee;
  const keyOf = (t: Transaction) => normalize(nameOf(t));
  const covered = (key: string) =>
    fixedCosts.some((c) => {
      const k = normalize(c.payeeKeyword.trim());
      return c.active && !!k && (key.includes(k) || k.includes(key));
    });

  const prev = new Map<string, { amount: number; date: string; label: string }>();
  for (const t of prevTxs) {
    if (t.out <= 0 || !isRecurring(t)) continue;
    const key = keyOf(t);
    if (!key) continue;
    const p = prev.get(key);
    prev.set(key, { amount: (p?.amount ?? 0) + t.out - t.in, date: p && p.date > t.date ? p.date : t.date, label: p?.label ?? nameOf(t) });
  }
  const nowKeys = new Set(txs.filter((t) => t.out > 0).map(keyOf));

  const out: MissingFixed[] = [];
  for (const [key, p] of prev) {
    if (p.amount <= 0 || nowKeys.has(key) || covered(key)) continue;
    const expectedBy = addDays(nextMonthSameDay(p.date), GRACE_DAYS);
    if (!lastBankDate || lastBankDate < expectedBy) continue;
    out.push({ key, label: p.label, prevAmount: p.amount, prevDate: p.date, expectedBy });
  }
  return out.sort((a, b) => b.prevAmount - a.prevAmount);
}
