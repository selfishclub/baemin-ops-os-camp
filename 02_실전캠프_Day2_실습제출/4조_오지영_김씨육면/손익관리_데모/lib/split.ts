/**
 * 분할 — 할부와 안분을 한 구조로 다룬다.
 *  할부: 카드사가 나눠 청구. 실지출월 = 귀속월
 *  안분: 한 번에 나갔지만 나눠서 본다. 실지출월 1개 ≠ 귀속월 N개 (PRD §7)
 * 시트에는 지출내용에 "종소세 ( 2/12 )"처럼 손으로 적혀 있어, 읽어서 필드로 옮긴다.
 */
export type SplitKind = "할부" | "안분";

export interface Split {
  kind: SplitKind;
  /** 현재 회차 */
  current: number;
  /** 총 회차 */
  total: number;
}

/** 안분으로 다루는 계정 — 연/분기분을 월로 나눠 본다 */
const PRORATE_ACCOUNTS = new Set(["세금", "대출이자"]);
const PRORATE_SUBS = new Set(["4대보험"]);

export interface SplitParse {
  split: Split | null;
  /** 괄호를 걷어낸 거래처명 */
  cleaned: string;
  /** 회차가 아닌 괄호 내용 (메모 후보) */
  note: string | null;
  /** 사용자가 물음표를 붙여둔 건 = 나중에 다시 볼 것 */
  flagged: boolean;
}

const RATIO = /[(（]\s*(\d{1,3})\s*\/\s*(\d{1,3})\s*[)）]/;
const ANY_PAREN = /[(（]([^)）]*)[)）]/g;

export function parseSplit(raw: string, account?: string, sub?: string | null): SplitParse {
  const text = String(raw ?? "");
  let split: Split | null = null;
  let cleaned = text;
  const notes: string[] = [];

  const m = text.match(RATIO);
  if (m) {
    const current = Number(m[1]);
    const total = Number(m[2]);
    if (total > 1 && current >= 1 && current <= total) {
      const prorate =
        (account && PRORATE_ACCOUNTS.has(account)) || (sub && PRORATE_SUBS.has(sub));
      split = { kind: prorate ? "안분" : "할부", current, total };
      cleaned = cleaned.replace(RATIO, " ");
    }
  }

  for (const p of text.matchAll(ANY_PAREN)) {
    const inner = p[1].trim();
    if (!inner || RATIO.test(p[0])) continue;
    notes.push(inner);
    cleaned = cleaned.replace(p[0], " ");
  }

  const flagged = /\?/.test(text);
  cleaned = cleaned.replace(/\?/g, " ").replace(/\s+/g, " ").trim();

  return {
    split,
    cleaned: cleaned || text.trim(),
    note: notes.length ? notes.join(" · ") : null,
    flagged,
  };
}

export const splitLabel = (s: Split) => `${s.kind} ${s.current}/${s.total}`;

/** 이번 회차가 마지막인가 — 다음 달엔 빠진다 */
export const isLastRound = (s: Split) => s.current >= s.total;

/** 다음 달 회차. 끝났으면 null */
export const nextRound = (s: Split): Split | null =>
  s.current < s.total ? { ...s, current: s.current + 1 } : null;
