// 세무사 장부 계정과목에 맞춰 보기 (2026-10-27, 복식장부 3단계)
//  - 기준: 세무사님이 보낸 2025년 손익계산서(제2기)의 계정 이름
//  - 우리 장부 항목(통장 소분류 = 분개 계정)을 세무사 계정으로 묶는다. 확실한 것과 "확인 필요"를 나눠 두고,
//    확인 필요한 짝은 사장님이 세무사님께 물어 화면에서 바꾼다 (설정 TAX_ACCOUNT_MAP_KEY)
import type { TrialRow } from "./journal";

export const TAX_ACCOUNT_MAP_KEY = "tax_account_map_v1";

// 2025년 손익계산서 금액 (원) — 이 달 금액과 견줄 "작년 한 달 평균"을 낸다
export const TAX_PNL_2025: Record<string, number> = {
  식음료매출: 418_902_114,
  상품매출원가: 194_246_380,
  여비교통비: 6_339_266,
  "접대비(기업업무추진비)": 5_429_200,
  통신비: 2_319_346,
  수도광열비: 4_256_671,
  전력비: 7_091_942,
  세금과공과금: 275_630,
  감가상각비: 1_874_870,
  지급임차료: 28_800_000,
  수선비: 3_899_091,
  보험료: 5_082_000,
  운반비: 7_339_900,
  소모품비: 24_022_987,
  지급수수료: 25_836_420,
  광고선전비: 7_250_366,
  건물관리비: 3_056_061,
  판매수수료: 21_591_017,
  잡비: 7_215_210,
  수수료비용: 31_715_340,
  잡이익: 5_900_551,
  이자비용: 1_434_293,
  기부금: 140_000,
};

// 세무 장부에 없거나 비용이 아닌 것
export const NOT_IN_TAX_BOOKS = "세무 장부에 없음";
export const OWNER_PERSONAL = "인출금 (비용 아님)";

export const TAX_ACCOUNT_CHOICES = [...Object.keys(TAX_PNL_2025), "복리후생비", NOT_IN_TAX_BOOKS, OWNER_PERSONAL];

export interface TaxMapRule {
  tax: string;
  sure: boolean; // false = 확인 필요 (세무사님께 물어볼 것)
  note?: string;
}

// 우리 장부 계정 → 세무사 계정. 금액 근거가 맞는 것만 sure
export const DEFAULT_TAX_MAP: Record<string, TaxMapRule> = {
  매출: { tax: "식음료매출", sure: true },
  기타수입: { tax: "잡이익", sure: false },
  원재료비: { tax: "상품매출원가", sure: true, note: "의제매입세액공제를 뺀 공급가" },
  기타재료비: { tax: "상품매출원가", sure: true },
  임대료: { tax: "지급임차료", sure: true, note: "월 240만 × 12 = 2025년 2,880만과 같음" },
  관리비: { tax: "건물관리비", sure: true },
  수선비: { tax: "수선비", sure: true },
  소모품비: { tax: "소모품비", sure: true },
  통신비: { tax: "통신비", sure: true },
  잡비: { tax: "잡비", sure: true },
  지급수수료: { tax: "지급수수료", sure: true },
  광고비: { tax: "광고선전비", sure: true },
  접대비: { tax: "접대비(기업업무추진비)", sure: true },
  감가상각비: { tax: "감가상각비", sure: true },
  "카드 매출 세액공제": { tax: "잡이익", sure: true, note: "신용카드 매출전표 발행 세액공제" },
  주민세: { tax: "세금과공과금", sure: true },
  공과금: { tax: "세금과공과금", sure: true },
  면허세: { tax: "세금과공과금", sure: true },
  노무관리비급여: { tax: NOT_IN_TAX_BOOKS, sure: true, note: "급여는 신고 안 함 (사장님 10/27)" },
  소득세: { tax: OWNER_PERSONAL, sure: true, note: "종합소득세는 사장님 개인 세금" },
  수도광열비: { tax: "수도광열비", sure: false, note: "세무 장부는 전기를 전력비로 따로 봐요" },
  "배달앱 수수료": { tax: "판매수수료", sure: false },
  배달대행비: { tax: "운반비", sure: false },
  가맹수수료: { tax: "지급수수료", sure: false, note: "로열티가 수수료비용일 수도 있어요" },
  카드수수료: { tax: "수수료비용", sure: false, note: "카드 매출 × 0.89% 어림 (여신협회 실측)" },
  차량유지관리비: { tax: "여비교통비", sure: false, note: "세무 장부에 차량유지비 계정이 없어요" },
  복리후생비: { tax: "복리후생비", sure: false, note: "2025 세무 장부엔 없는 계정 (직원 신고가 없어서)" },
  "노무관리비 기타": { tax: "보험료", sure: false },
  원천세: { tax: "세금과공과금", sure: false },
  기타: { tax: "잡비", sure: false },
  충당금: { tax: "잡비", sure: false },
};

/** 이 계정의 세무사 계정 (사장님이 바꾼 것이 먼저) */
export function taxAccountOf(account: string, overrides: Record<string, string> = {}): TaxMapRule {
  if (overrides[account]) return { tax: overrides[account], sure: true, note: "사장님이 고름" };
  return DEFAULT_TAX_MAP[account] ?? { tax: "잡비", sure: false, note: "짝을 정하지 않은 항목" };
}

export interface TaxViewRow {
  tax: string;
  kind: "수익" | "비용";
  amount: number;
  avg2025: number | null; // 2025년 한 달 평균
  sources: { account: string; amount: number; rule: TaxMapRule }[];
}

/** 시산표의 수익·비용 줄을 세무사 계정으로 묶는다 (같은 계정끼리 합친다) */
export function taxView(rows: TrialRow[], overrides: Record<string, string> = {}): TaxViewRow[] {
  const by = new Map<string, TaxViewRow>();
  for (const r of rows) {
    if (r.type !== "수익" && r.type !== "비용") continue;
    if (!r.balance) continue;
    const rule = taxAccountOf(r.account, overrides);
    const row = by.get(rule.tax) ?? { tax: rule.tax, kind: r.type, amount: 0, avg2025: TAX_PNL_2025[rule.tax] !== undefined ? Math.round(TAX_PNL_2025[rule.tax] / 12) : null, sources: [] };
    row.amount += r.balance;
    row.sources.push({ account: r.account, amount: r.balance, rule });
    by.set(rule.tax, row);
  }
  const order = Object.keys(TAX_PNL_2025);
  const rank = (t: string) => (order.includes(t) ? order.indexOf(t) : order.length + TAX_ACCOUNT_CHOICES.indexOf(t));
  return [...by.values()].sort((a, b) => (a.kind === b.kind ? rank(a.tax) - rank(b.tax) : a.kind === "수익" ? -1 : 1));
}

/** 세무사 장부 기준 이익 — 세무 장부에 없는 것(급여)·개인 세금은 빼고 본다 */
export function taxProfit(view: TaxViewRow[]): number {
  return view.reduce((a, r) => (r.tax === NOT_IN_TAX_BOOKS || r.tax === OWNER_PERSONAL ? a : r.kind === "수익" ? a + r.amount : a - r.amount), 0);
}
