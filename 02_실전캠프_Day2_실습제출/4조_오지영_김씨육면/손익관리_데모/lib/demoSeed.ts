"use client";

import { classify } from "./classify";
import { UNCLASSIFIED, behaviorOf } from "./accounts";
import { mergeTransactions } from "./dedupe";
import { DEMO_FILE_NAME, demoCardCsv, demoDeposits, demoSales } from "./demo";
import { emptyLearned, saveLearned } from "./learned";
import { parseCardCsv, toTransactions } from "./parseCard";
import type { MapRule } from "./rules";
import { newMonthState, saveMonth, type MonthState } from "./store";
import type { Transaction } from "./types";

/**
 * 데모판 — 처음 열면 7·8·9월 가짜 자료가 채워져 있게 한다.
 *
 * 가짜 카드 파일을 진짜 파서·분류기에 그대로 흘려보낸다. 지름길을 내지 않는다.
 * 금액·거래처는 전부 지어낸 것이다. 실제 자료는 한 줄도 들어 있지 않다.
 */

export const DEMO_FLAG = "kimssi-demo-seeded";

/** 사장님이 "가르쳐 둔" 규칙인 척. 일부러 몇 곳은 비워 둬서 9월에 분류할 거리가 남게 한다 */
const RULES: MapRule[] = [
  { keyword: "또와마트", account: "식자재비", sub: "마트/또와", origin: "learned" },
  { keyword: "성수동정육점", account: "식자재비", sub: "고기", origin: "learned" },
  { keyword: "새우유통", account: "식자재비", sub: "새우", origin: "learned" },
  { keyword: "김치공장", account: "식자재비", sub: "김치", origin: "learned" },
  { keyword: "면사랑유통", account: "식자재비", sub: "기타", origin: "learned" },
  { keyword: "생수주문", account: "식자재비", sub: "음료/물", origin: "learned" },
  { keyword: "네이버 검색광고", account: "마케팅비", sub: "검색광고", origin: "learned" },
  { keyword: "한국전력", account: "공과금", sub: "전기료", origin: "learned" },
  { keyword: "세무법인", account: "고정운영비", sub: "세무사", origin: "learned" },
  { keyword: "면포장용기", account: "일회용품", sub: "면포장용기", origin: "learned" },
  { keyword: "다이소", account: "매장운영비", sub: "다이소", origin: "learned" },
  { keyword: "제빙기", account: "설비/비품비", sub: "설비", origin: "learned" },
  { keyword: "우지커피", account: "개인", origin: "learned" },
];

/** 달마다 조금씩 다르게 — 똑같은 숫자가 석 달 이어지면 연간 화면이 쓸모를 못 보인다 */
const MONTHS: { month: string; scale: number; confirmed: boolean }[] = [
  { month: "2026-07", scale: 0.93, confirmed: true },
  { month: "2026-08", scale: 1, confirmed: true },
  { month: "2026-09", scale: 1.06, confirmed: false },
];

function manual(month: string, n: number, date: string, account: string, sub: string, merchant: string, amount: number): Transaction {
  return {
    id: `demo-manual:${month}:${n}`,
    date,
    month,
    account,
    sub,
    merchant,
    amount,
    source: "manual",
    group: "expense",
    behavior: behaviorOf(account, sub),
    needsReview: false,
    reviewReason: null,
    autoMapped: false,
  };
}

function buildMonth(month: string, scale: number, confirmed: boolean): MonthState {
  const r = parseCardCsv(demoCardCsv(month, scale), { card: "현대카드" });
  const rows = toTransactions(r, month, "현대카드").map((t) => {
    const c = classify({ merchant: t.merchant, rawAccount: null, rawSub: null }, RULES);
    const known = c.account !== UNCLASSIFIED;
    return {
      ...t,
      account: c.account,
      sub: c.sub,
      group: c.group,
      behavior: c.behavior,
      needsReview: c.needsReview,
      reviewReason: c.reviewReason,
      autoMapped: c.autoMapped,
      normalizedNote: c.normalizedNote,
      // 7·8월은 사장님이 이미 확인을 마친 달, 9월은 아직 손대기 전인 달
      confirmed: confirmed && known ? true : undefined,
    };
  });
  const { merged } = mergeTransactions([], rows);
  const k = (n: number) => Math.round((n * scale) / 10000) * 10000;
  const fixed: Transaction[] = [
    manual(month, 1, `${month}-01`, "임대료", "월세", "상가 월세 (가짜)", 2_200_000),
    manual(month, 2, `${month}-10`, "인건비", "직원", "직원 급여 (가짜)", 2_600_000),
    manual(month, 3, `${month}-10`, "인건비", "알바", "알바 급여 (가짜)", k(1_850_000)),
    manual(month, 4, `${month}-10`, "인건비", "4대보험", "4대보험 (가짜)", 280_000),
  ];
  return {
    ...newMonthState(month),
    transactions: [...fixed, ...merged],
    bankDeposits: demoDeposits(month, scale),
    dailySales: demoSales(month, scale),
    imports: [
      {
        name: DEMO_FILE_NAME,
        kind: `현대카드 · 거래 ${r.rows.length}건`,
        encoding: "UTF-8",
        added: merged.length,
        skipped: 0,
        at: `${month}-28T12:00:00.000Z`,
        recon: r.recon ?? undefined,
        headerRow: r.headerRow,
      },
    ],
  };
}

/** 데모 자료를 지우고 처음 상태로 다시 채운다 */
export function seedDemo() {
  for (let i = window.localStorage.length - 1; i >= 0; i--) {
    const key = window.localStorage.key(i);
    if (key?.startsWith("kimssi-") && key !== "kimssi-theme") window.localStorage.removeItem(key);
  }
  saveLearned({ ...emptyLearned(), rules: RULES });
  for (const m of MONTHS) saveMonth(buildMonth(m.month, m.scale, m.confirmed));
  // 예전 버전 데이터를 위한 '한 번 되돌리기'가 데모 확정을 풀지 않게
  window.localStorage.setItem("kimssi-unconfirmed-once", "demo");
  window.localStorage.setItem(DEMO_FLAG, new Date().toISOString().slice(0, 10));
}

/** 처음 연 사람에게만 채운다. 둘러보다 고친 것은 덮어쓰지 않는다 */
export function seedDemoIfNeeded() {
  if (typeof window === "undefined") return;
  try {
    if (!window.localStorage.getItem(DEMO_FLAG)) seedDemo();
  } catch {
    /* 저장소를 못 쓰는 브라우저 — 빈 화면으로 둔다 */
  }
}
