/** 계정과목 마스터 — PRD §4. 자유입력 금지, 이 목록이 드롭다운의 유일한 출처다. */

export type AccountGroup = "revenue" | "expense" | "personal" | "excluded" | "unclassified";

/** 계정을 확정하지 못한 건. 손익에 넣지 않고 검수 큐에 남긴다(§2 "막지 말고 표시한다"). */
export const UNCLASSIFIED = "미분류";
export type Behavior = "fixed" | "variable";

/**
 * 손익계산서에서 이 계정이 들어가는 단.
 *   원가   — 매출에서 바로 빼서 매출총이익을 만든다 (식자재비)
 *   판관비 — 매출총이익에서 빼서 영업이익을 만든다
 *   영업외 — 영업이익 아래에서 뺀다. 장사를 잘했나와 무관한 돈 (대출이자·세금)
 * 코드에 박지 않고 설정에서 바꾼다.
 */
export type Tier = "원가" | "판관비" | "영업외";

export interface AccountDef {
  name: string;
  group: AccountGroup;
  /** 손익계산서 단. 비용 계정에만 뜻이 있다. 비우면 판관비로 본다 */
  tier?: Tier;
  /** 기본 고정/변동 플래그. 인건비처럼 소분류별로 다르면 null. */
  behavior: Behavior | null;
  subs: string[];
  note?: string;
}

/** §4-1 매출 */
export const REVENUE_ACCOUNTS: AccountDef[] = [
  { name: "매출-홀", group: "revenue", behavior: null, subs: [], note: "t'order / POS 연동 대상" },
  { name: "매출-배달", group: "revenue", behavior: null, subs: ["배달의민족", "쿠팡이츠", "요기요"] },
  { name: "매출-기타", group: "revenue", behavior: null, subs: ["계좌이체", "당근 판매"] },
  { name: "기타수입", group: "excluded", behavior: null, subs: [], note: "손익에서 제외, 별도 표시" },
];

/** 매출 채널 — 시트 항목명과 계정의 대응 */
export const REVENUE_CHANNELS: { channel: string; account: string; sheetLabel: string }[] = [
  { channel: "홀", account: "매출-홀", sheetLabel: "매장매출" },
  { channel: "배달의민족", account: "매출-배달", sheetLabel: "배달의민족" },
  { channel: "쿠팡이츠", account: "매출-배달", sheetLabel: "쿠팡이츠" },
  { channel: "요기요", account: "매출-배달", sheetLabel: "요기요" },
  { channel: "계좌이체", account: "매출-기타", sheetLabel: "계좌이체" },
];

/** §4-3 인건비 소분류 — 각각 고정/변동 플래그를 따로 가진다 */
export const LABOR_SUBS: { sub: string; behavior: Behavior }[] = [
  { sub: "직원", behavior: "fixed" },
  { sub: "알바", behavior: "variable" },
  { sub: "4대보험", behavior: "fixed" },
  { sub: "복리후생", behavior: "variable" },
];

/** §4-2 사업 지출 13 */
export const EXPENSE_ACCOUNTS: AccountDef[] = [
  { name: "식자재비", group: "expense", tier: "원가", behavior: "variable", subs: ["고기", "투웰브", "모노마트", "마트/또와", "김치", "식봄", "새우", "쌀", "음료/물", "올리브/튀김유", "고춧가루", "스리라차마요/마요", "육수재료", "기타"] },
  { name: "인건비", group: "expense", behavior: null, subs: LABOR_SUBS.map((s) => s.sub), note: "소분류별로 고정/변동이 다름" },
  { name: "임대료", group: "expense", behavior: "fixed", subs: ["월세"] },
  { name: "수수료", group: "expense", behavior: "variable", subs: ["홀", "배달의민족", "쿠팡이츠", "요기요"], note: "매출액−입금액 자동 계산" },
  { name: "마케팅비", group: "expense", behavior: "fixed", subs: ["검색광고", "메타광고", "당근광고", "구글광고"], note: "준고정" },
  { name: "공과금", group: "expense", behavior: "variable", subs: ["전기료", "도시가스", "수도료", "인터넷비", "화재보험"], note: "전기·수도·가스 변동 / 인터넷·화재보험 고정" },
  { name: "고정운영비", group: "expense", behavior: "fixed", subs: ["세무사", "정수기", "테이블오더", "방역", "노란우산"] },
  { name: "일회용품", group: "expense", behavior: "variable", subs: ["면포장용기", "포장봉투", "포장/소스용기", "스탠드지퍼백", "수저", "종이컵", "기타비용"] },
  { name: "매장운영비", group: "expense", behavior: "variable", subs: ["소모품", "다이소"] },
  { name: "설비/비품비", group: "expense", behavior: "variable", subs: ["설비", "비품", "디자인/인테리어"], note: "비정기" },
  { name: "대출이자", group: "expense", tier: "영업외", behavior: "fixed", subs: ["사업자대출", "마이너스통장"], note: "안분 대상" },
  { name: "세금", group: "expense", tier: "영업외", behavior: "fixed", subs: ["부가세", "종소세", "지방세"], note: "안분 대상" },
  { name: "기부", group: "expense", behavior: "fixed", subs: ["월드비전"] },
];

/** §4-4 개인 — 손익 제외, 합계만 표시 */
export const PERSONAL = "개인";

/**
 * 개인은 대분류 하나로 둔다.
 *
 * 전에는 우리집·개인보험·집관리비…가 전부 대분류였다.
 * 지출을 훑을 때는 "이건 가게 돈이 아니다"만 가리면 되고,
 * 무슨 개인 지출인지는 따로 모아 놓고 정하는 게 빠르다.
 */
export const PERSONAL_SUBS = [
  "우리집", "개인보험", "집관리비", "전세자금대출", "구독료",
  "강의료", "개인식비", "개인커피", "유류교통비", "개인기타",
];

export const PERSONAL_ACCOUNTS: AccountDef[] = [
  { name: PERSONAL, group: "personal", behavior: null, subs: PERSONAL_SUBS },
];

/**
 * 옛 자료는 우리집·개인보험 같은 것을 대분류로 적어 두었다.
 * 이제 그것들은 '개인' 아래 소분류다 — 그대로 두면 레지스트리에 없는 계정이 되어
 * 미분류로 떨어지고, 미분류는 비용에 들어가므로 개인 지출이 손익에 섞인다.
 */
export function foldPersonal(account: string, sub: string | null): { account: string; sub: string | null } {
  if (account !== PERSONAL && PERSONAL_SUBS.includes(account)) {
    return { account: PERSONAL, sub: sub ?? account };
  }
  return { account, sub };
}

export const ALL_ACCOUNTS: AccountDef[] = [
  ...REVENUE_ACCOUNTS,
  ...EXPENSE_ACCOUNTS,
  ...PERSONAL_ACCOUNTS,
];

export const UNCLASSIFIED_DEF: AccountDef = {
  name: UNCLASSIFIED,
  group: "unclassified",
  behavior: null,
  subs: [],
  note: "계정 미확정 — 손익 제외",
};

/**
 * 계정과목은 설정 화면에서 고칠 수 있어야 하므로 상수가 아니라 레지스트리로 둔다.
 * 서버·스크립트에서는 기본값 그대로 쓰인다.
 */
let registry: AccountDef[] = [...ALL_ACCOUNTS];
let byName = new Map([...registry, UNCLASSIFIED_DEF].map((a) => [a.name, a]));

export function configureAccounts(accounts: AccountDef[]) {
  registry = [...accounts];
  byName = new Map([...registry, UNCLASSIFIED_DEF].map((a) => [a.name, a]));
}

export const accountsOf = (group: AccountGroup): AccountDef[] => registry.filter((a) => a.group === group);
export const currentAccounts = (): AccountDef[] => [...registry];
export const getAccount = (name: string): AccountDef | undefined => byName.get(name);

/**
 * 이 계정이 손익계산서 어느 단에 들어가나.
 * 미분류는 판관비로 본다 — 어디로 갈지 아직 모를 뿐, 나간 돈은 사실이다.
 * 빼면 분류를 안 할수록 영업이익이 좋아 보인다.
 */
export const tierOf = (name: string): Tier => getAccount(name)?.tier ?? "판관비";
export const isKnownAccount = (name: string): boolean => byName.has(name);

/**
 * §4-5 폐기할 표기 — 오타·중복을 정규 계정으로 흡수한다.
 * to가 null이면 사람이 판단해야 하는 모호한 표기(→ 검수 큐로 보낸다).
 */
export const DEPRECATED_LABELS: Record<string, { to: string | null; reason: string }> = {
  "삭자재비": { to: "식자재비", reason: "오타" },
  "매자운영비": { to: "매장운영비", reason: "오타" },
  "다이소": { to: "매장운영비", reason: "거래처명이 계정으로 쓰임" },
  "설비/비품": { to: "설비/비품비", reason: "표기 누락" },
  "일회용기": { to: "일회용품", reason: "표기 흔들림" },
  "판관비": { to: null, reason: "마케팅비 / 인건비-복리후생으로 갈라져야 함" },
  "변동지출": { to: "개인기타", reason: "대분류가 아님" },
  // §4-4 주석: 2월까지 개인지출 대분류 + 우리집 소분류 → 3월부터 우리집이 대분류
  "개인지출": { to: "우리집", reason: "3월부터 우리집이 대분류로 승격" },
};

/** 인건비 소분류의 고정/변동 플래그를 포함한 런타임 설정값. 코드에 하드코딩하지 않는다(§7). */
export interface BehaviorConfig {
  accounts: Record<string, Behavior>;
  laborSubs: Record<string, Behavior>;
}

export const DEFAULT_BEHAVIOR: BehaviorConfig = {
  accounts: Object.fromEntries(
    EXPENSE_ACCOUNTS.filter((a) => a.behavior).map((a) => [a.name, a.behavior as Behavior])
  ),
  laborSubs: Object.fromEntries(LABOR_SUBS.map((s) => [s.sub, s.behavior])),
};

let behaviorRegistry: BehaviorConfig = DEFAULT_BEHAVIOR;

export function configureBehavior(cfg: BehaviorConfig) {
  behaviorRegistry = cfg;
}

export const currentBehavior = (): BehaviorConfig => behaviorRegistry;

export function behaviorOf(
  account: string,
  sub: string | null,
  cfg: BehaviorConfig = behaviorRegistry
): Behavior | null {
  if (account === "인건비") return (sub && cfg.laborSubs[sub]) || null;
  return cfg.accounts[account] ?? null;
}

/**
 * 이 달에 실제로 쓰인 소분류를 계정별로 모은다.
 *
 * 계정을 가리지 않고 모으면 마케팅비 드롭다운에 투웰브·알바·생활비가 같이 뜬다.
 * 고르는 자리에 엉뚱한 게 섞이면 잘못 누르기 쉽다.
 */
export function usedSubsByAccount(
  rows: { account: string; sub: string | null }[]
): Map<string, string[]> {
  const by = new Map<string, Set<string>>();
  for (const t of rows) {
    if (!t.sub) continue;
    const set = by.get(t.account);
    if (set) set.add(t.sub);
    else by.set(t.account, new Set([t.sub]));
  }
  return new Map([...by].map(([a, set]) => [a, [...set].sort()]));
}
