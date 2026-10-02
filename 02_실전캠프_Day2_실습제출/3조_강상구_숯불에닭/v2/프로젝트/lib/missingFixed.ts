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
  key: string; // 거래처를 알아보는 글자 (규칙 키워드, 없으면 거래처 이름)
  label: string; // 화면에 보일 이름
  prevAmount: number;
  prevDate: string;
  expectedBy: string; // 이 날까지 통장을 올렸는데 없으면 알린다
}

const isRecurring = (t: Transaction) =>
  !!t.major && (RECURRING_MAJORS.includes(t.major) || (RECURRING_MINORS[t.major]?.includes(t.minor ?? "") ?? false));

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
  const keyOf = (t: Transaction) => rules.find((r) => r.direction === "out" && t.payee.includes(r.keyword))?.keyword ?? normalize(t.payee);
  const covered = (key: string) => fixedCosts.some((c) => c.active && c.payeeKeyword.trim() && (key.includes(c.payeeKeyword.trim()) || c.payeeKeyword.includes(key)));

  const prev = new Map<string, { amount: number; date: string }>();
  for (const t of prevTxs) {
    if (t.out <= 0 || !isRecurring(t)) continue;
    const key = keyOf(t);
    if (!key) continue;
    const p = prev.get(key);
    prev.set(key, { amount: (p?.amount ?? 0) + t.out - t.in, date: p && p.date > t.date ? p.date : t.date });
  }
  const nowKeys = new Set(txs.filter((t) => t.out > 0).map(keyOf));

  const out: MissingFixed[] = [];
  for (const [key, p] of prev) {
    if (p.amount <= 0 || nowKeys.has(key) || covered(key)) continue;
    const expectedBy = addDays(nextMonthSameDay(p.date), GRACE_DAYS);
    if (!lastBankDate || lastBankDate < expectedBy) continue;
    out.push({ key, label: key, prevAmount: p.amount, prevDate: p.date, expectedBy });
  }
  return out.sort((a, b) => b.prevAmount - a.prevAmount);
}
