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

// 주문 채널. 종류(kind)에 따라 정산 방식이 다르다:
//  - card: 홀 카드. 카드사가 며칠 뒤에 수수료를 떼고 입금 (정산 규칙 대상)
//  - cash: 홀 현금. 통장 입금 없음, 수수료 없음
//  - delivery: 배달앱. 앱이 수수료를 떼고 정산 주기대로 입금 (정산 규칙 대상)
export type ChannelKind = "card" | "cash" | "delivery";
export type ChannelId = string;

export interface Channel {
  id: ChannelId;
  name: string;
  kind: ChannelKind;
  active: boolean;
}

export const DEFAULT_CHANNELS: Channel[] = [
  { id: "hall_card", name: "홀 카드", kind: "card", active: true },
  { id: "hall_cash", name: "홀 현금", kind: "cash", active: true },
  { id: "baemin", name: "배달의민족", kind: "delivery", active: true },
  { id: "coupang", name: "쿠팡이츠", kind: "delivery", active: true },
  { id: "yogiyo", name: "요기요", kind: "delivery", active: true },
  { id: "etc", name: "땡겨요·기타", kind: "delivery", active: true },
];

// v1에서 쓰던 "hall"(홀 전체)은 카드로 본다
export function channelKind(id: ChannelId, channels: Channel[] = DEFAULT_CHANNELS): ChannelKind {
  if (id === "hall") return "card";
  return channels.find((c) => c.id === id)?.kind ?? "delivery";
}

export const isHall = (id: ChannelId, channels: Channel[] = DEFAULT_CHANNELS) => id === "hall" || channelKind(id, channels) !== "delivery";
