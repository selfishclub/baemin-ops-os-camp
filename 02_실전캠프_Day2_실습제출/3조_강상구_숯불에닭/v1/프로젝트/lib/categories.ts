// 항목 체계 — 사장님이 지금 쓰는 정리용 엑셀의 `항목` 시트 그대로.
export const MAJORS = [
  "수입",
  "가맹수수료",
  "매출원가",
  "영업비",
  "임대료",
  "세금과공과",
  "노무관리비",
  "기타",
] as const;

export type Major = (typeof MAJORS)[number];

export const MINORS: Record<Major, string[]> = {
  수입: ["매출액", "기타매출"],
  가맹수수료: ["가맹수수료"],
  매출원가: ["원재료비", "기타재료비"],
  영업비: [
    "지급수수료",
    "수도광열비",
    "통신비",
    "카드수수료",
    "충당금",
    "차량유지관리비",
    "소모품비",
    "광고비",
    "잡비",
  ],
  임대료: ["임대료", "관리비"],
  세금과공과: ["소득세", "부가세", "공과금", "면허세"],
  노무관리비: ["노무관리비급여", "노무관리비 기타"],
  기타: ["생활비", "기타"],
};

// 손익에 비용으로 잡히는 대분류 (수입 제외)
export const EXPENSE_MAJORS = MAJORS.filter((m) => m !== "수입") as Exclude<Major, "수입">[];

// 가게 비용이 아니라 "내가 가져간 돈"으로 따로 보여 주는 소분류
export const OWNER_DRAW = { major: "기타" as Major, minor: "생활비" };

export function isValidCategory(major: string, minor: string): boolean {
  return (MAJORS as readonly string[]).includes(major) && MINORS[major as Major].includes(minor);
}

// 주문 채널. 이름은 화면에서 고칠 수 있고, id는 고정.
export const DEFAULT_CHANNELS = [
  { id: "hall", name: "홀(포스)", isDelivery: false },
  { id: "baemin", name: "배달의민족", isDelivery: true },
  { id: "coupang", name: "쿠팡이츠", isDelivery: true },
  { id: "yogiyo", name: "요기요", isDelivery: true },
  { id: "etc", name: "땡겨요·기타", isDelivery: true },
] as const;

export type ChannelId = (typeof DEFAULT_CHANNELS)[number]["id"];
