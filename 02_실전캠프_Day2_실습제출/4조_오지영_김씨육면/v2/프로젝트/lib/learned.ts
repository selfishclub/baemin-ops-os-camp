"use client";

import { BASE_MAPPINGS, mergeMappings, type Mappings, type SubMemo, type SubRename } from "./mappings";
import { defaultRules, type MapRule } from "./rules";
import { loose, type Alias } from "./alias";

/**
 * 검수하며 배운 것은 달에 매이면 안 된다.
 * 7월에 "또와 → 식자재비/마트"를 배웠으면 8월에도 알아야 한다.
 * 그래서 월 데이터가 아니라 여기(전역)에 쌓는다.
 */
export interface Learned {
  version: 1;
  updatedAt: string;
  rules: MapRule[];
  subRenames: SubRename[];
  subMemos: SubMemo[];
  /** 가맹점 표시 이름. 원문은 그대로 두고 화면에만 입힌다 */
  aliases: Alias[];
}

const KEY = "kimssi-learned";

export const emptyLearned = (): Learned => ({
  version: 1,
  updatedAt: "",
  rules: [],
  subRenames: [],
  subMemos: [],
  aliases: [],
});

export function loadLearned(): Learned {
  if (typeof window === "undefined") return emptyLearned();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return emptyLearned();
    return { ...emptyLearned(), ...(JSON.parse(raw) as Learned) };
  } catch {
    return emptyLearned();
  }
}

export function saveLearned(l: Learned) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...l, updatedAt: new Date().toISOString().slice(0, 10) }));
  } catch {
    /* 저장 실패가 작업을 막지 않는다 */
  }
}

/**
 * 지금은 사장님이 가르친 것만 쓴다.
 *
 * 분류 체계를 다시 세우는 중이라, 코드에 박아 둔 기본 규칙이 끼어들면
 * "내가 결정하고 쌓인 뒤에 자동화한다"가 안 된다.
 * 서너 달 쌓아 체계가 잡히면 base 를 다시 켠다.
 */
export function activeRules(l: Learned = loadLearned()): MapRule[] {
  return l.rules;
}

/** 내보내기·되불러오기용 — 코드 기본값까지 합친 전체 */
export function allRules(l: Learned = loadLearned()): MapRule[] {
  return [...l.rules, ...BASE_MAPPINGS.rules, ...defaultRules()];
}

export const exportable = (l: Learned): Mappings =>
  mergeMappings(BASE_MAPPINGS, { rules: l.rules, subRenames: l.subRenames, subMemos: l.subMemos });

/* ── 쓰기 ─────────────────────────────────────────────── */

export function rememberRules(l: Learned, add: MapRule[]): Learned {
  const rules = [...l.rules];
  for (const r of add) {
    const k = r.keyword.trim();
    if (!k) continue;
    const i = rules.findIndex((x) => x.keyword === k);
    if (i >= 0) rules[i] = { ...r, keyword: k };
    else rules.unshift({ ...r, keyword: k });
  }
  return { ...l, rules };
}

export function forgetRule(l: Learned, keyword: string): Learned {
  return { ...l, rules: l.rules.filter((r) => r.keyword !== keyword) };
}

/** 소분류 이름 바꾸기 — 이력을 남기고 딸린 메모도 따라 옮긴다 */
export function rememberRename(l: Learned, account: string, from: string, to: string): Learned {
  const at = new Date().toISOString().slice(0, 10);
  return {
    ...l,
    subRenames: [...l.subRenames, { account, from, to, at }],
    subMemos: l.subMemos.map((m) => (m.account === account && m.sub === from ? { ...m, sub: to } : m)),
    rules: l.rules.map((r) => (r.account === account && r.sub === from ? { ...r, sub: to } : r)),
  };
}

/** 표시 이름을 기억한다. 같은 말에 두 번 붙이면 덮어쓴다 */
export function rememberAlias(l: Learned, a: Alias): Learned {
  const match = a.match.trim();
  const display = a.display.trim();
  if (!match || !display) return l;
  const rest = (l.aliases ?? []).filter((x) => loose(x.match) !== loose(match));
  return { ...l, aliases: [{ match, display }, ...rest] };
}

export function forgetAlias(l: Learned, match: string): Learned {
  return { ...l, aliases: (l.aliases ?? []).filter((x) => loose(x.match) !== loose(match)) };
}

export const aliasesOf = (l: Learned): Alias[] => l.aliases ?? [];

export function rememberMemo(l: Learned, m: SubMemo): Learned {
  const rest = l.subMemos.filter((x) => !(x.account === m.account && x.sub === m.sub));
  return { ...l, subMemos: m.memo.trim() ? [...rest, m] : rest };
}

export const memoOf = (l: Learned, account: string, sub: string): string =>
  l.subMemos.find((m) => m.account === account && m.sub === sub)?.memo ?? "";

/**
 * 달 안에 갇혀 있던 옛 학습 결과를 한 번만 전역으로 끌어올린다.
 * 이미 옮긴 달은 건드리지 않는다.
 */
export function migrateFromMonths(
  l: Learned,
  months: { month: string; learned?: MapRule[]; subRenames?: SubRename[]; subMemos?: SubMemo[] }[]
): { next: Learned; moved: number } {
  let next = l;
  let moved = 0;
  for (const m of months) {
    if (m.learned?.length) {
      next = rememberRules(next, m.learned);
      moved += m.learned.length;
    }
    for (const r of m.subRenames ?? []) {
      next = { ...next, subRenames: [...next.subRenames, r] };
      moved++;
    }
    for (const mm of m.subMemos ?? []) {
      next = rememberMemo(next, mm);
      moved++;
    }
  }
  return { next, moved };
}
