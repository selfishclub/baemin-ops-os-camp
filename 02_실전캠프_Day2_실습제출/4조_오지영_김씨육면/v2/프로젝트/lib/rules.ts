/** 거래처 → 계정 자동 매핑 (PRD §5). 학습으로 추가되는 규칙은 userRules로 얹는다. */

export interface MapRule {
  /** 거래처명에 이 문자열이 들어있으면 매칭 */
  keyword: string;
  account: string;
  sub?: string;
  /** prd = PRD §5-1 확정 매핑 / derived = 2026.7 실데이터에서 도출 / learned = 사용자가 고친 것 */
  origin: "prd" | "derived" | "learned";
}

/** §5-1 확정 매핑 — 바로 적용 */
export const PRD_RULES: MapRule[] = [
  { keyword: "투웰브", account: "식자재비", sub: "투웰브", origin: "prd" },
  { keyword: "모노마트", account: "식자재비", sub: "모노마트", origin: "prd" },
  { keyword: "식봄", account: "식자재비", sub: "식봄", origin: "prd" },
  { keyword: "또와", account: "식자재비", sub: "마트/또와", origin: "prd" },
  { keyword: "와마트", account: "식자재비", sub: "마트/또와", origin: "prd" },
  { keyword: "네이버 검색광고", account: "마케팅비", sub: "검색광고", origin: "prd" },
  { keyword: "메타", account: "마케팅비", sub: "메타광고", origin: "prd" },
  { keyword: "당근광고", account: "마케팅비", sub: "당근광고", origin: "prd" },
  { keyword: "구글", account: "마케팅비", sub: "구글광고", origin: "prd" },
  { keyword: "세무사", account: "고정운영비", sub: "세무사", origin: "prd" },
  { keyword: "정수기", account: "고정운영비", sub: "정수기", origin: "prd" },
  { keyword: "테이블오더", account: "고정운영비", sub: "테이블오더", origin: "prd" },
  { keyword: "방역", account: "고정운영비", sub: "방역", origin: "prd" },
  { keyword: "노란우산", account: "고정운영비", sub: "노란우산", origin: "prd" },
  { keyword: "다이소", account: "매장운영비", sub: "다이소", origin: "prd" },
];

/** 2026.7 실데이터에서 반복 확인된 거래처. 설정 탭에서 끄거나 고칠 수 있어야 한다. */
export const DERIVED_RULES: MapRule[] = [
  { keyword: "홈마트", account: "식자재비", sub: "마트/또와", origin: "derived" },
  { keyword: "월세", account: "임대료", sub: "월세", origin: "derived" },
  { keyword: "전기료", account: "공과금", sub: "전기료", origin: "derived" },
  { keyword: "도시가스", account: "공과금", sub: "도시가스", origin: "derived" },
  { keyword: "수도료", account: "공과금", sub: "수도료", origin: "derived" },
  { keyword: "인터넷", account: "공과금", sub: "인터넷비", origin: "derived" },
  { keyword: "화재보험", account: "공과금", sub: "화재보험", origin: "derived" },
  { keyword: "마이너스통장", account: "대출이자", sub: "마이너스통장", origin: "derived" },
  { keyword: "사업자대출", account: "대출이자", sub: "사업자대출", origin: "derived" },
  { keyword: "하나은행 대출", account: "대출이자", sub: "사업자대출", origin: "derived" },
  { keyword: "대출이자", account: "대출이자", sub: "사업자대출", origin: "derived" },
  { keyword: "부가세", account: "세금", sub: "부가세", origin: "derived" },
  { keyword: "종소세", account: "세금", sub: "종소세", origin: "derived" },
  { keyword: "지방세", account: "세금", sub: "지방세", origin: "derived" },
  { keyword: "월드비전", account: "기부", sub: "월드비전", origin: "derived" },
];

/**
 * §5-2 자동 분류가 불가능한 것 — 같은 가맹점에서 매장용과 집용이 동시에 나온다.
 * 이 3곳만 검수 화면 상단에 모아 [매장]/[집] 두 버튼으로 넘긴다.
 */
export const SPLIT_MERCHANTS = [
  { keyword: "쿠팡", label: "쿠팡" },
  { keyword: "세븐일레븐", label: "세븐일레븐" },
  { keyword: "배민", label: "배달의민족" },
  { keyword: "배달의민족", label: "배달의민족" },
];

/** 쿠팡이츠 정산은 매출이지 지출이 아니다 — 쿠팡 키워드보다 먼저 걸러낸다. */
const SPLIT_EXCEPTIONS = ["쿠팡이츠"];

export function splitMerchantOf(merchant: string): string | null {
  const m = merchant.trim();
  if (SPLIT_EXCEPTIONS.some((e) => m.includes(e))) return null;
  for (const s of SPLIT_MERCHANTS) if (m.includes(s.keyword)) return s.label;
  return null;
}

export interface MatchResult {
  account: string;
  sub: string | null;
  rule: MapRule;
}

/** 가장 긴 키워드가 이긴다 — "네이버 검색광고"가 "네이버"보다 우선. */
export function matchRule(merchant: string, rules: MapRule[]): MatchResult | null {
  const m = merchant.trim();
  let best: MapRule | null = null;
  for (const r of rules) {
    if (!m.includes(r.keyword)) continue;
    if (!best || r.keyword.length > best.keyword.length) best = r;
  }
  return best ? { account: best.account, sub: best.sub ?? null, rule: best } : null;
}

export const defaultRules = (): MapRule[] => [...PRD_RULES, ...DERIVED_RULES];
