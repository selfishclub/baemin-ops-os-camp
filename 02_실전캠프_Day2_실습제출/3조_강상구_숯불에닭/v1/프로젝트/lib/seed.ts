import type { ChannelId, Major } from "./categories";
import type { ChannelSale, Rule } from "./types";

// 처음 열었을 때 들어 있는 분류 규칙. 거래처 이름은 전부 시연용 가짜 이름이다.
// 실제로 쓸 때는 "확인 필요" 줄을 고르면서 진짜 거래처 규칙이 쌓인다.
type Seed = [keyword: string, direction: "in" | "out", major: Major, minor: string, channel?: ChannelId | null, ambiguous?: boolean];

const SEEDS: Seed[] = [
  ["숯닭본사", "out", "가맹수수료", "가맹수수료"],
  ["가나식품", "out", "매출원가", "원재료비"],
  ["다라유통", "out", "매출원가", "원재료비"],
  ["한빛주류", "out", "매출원가", "원재료비"],
  ["참숯나라", "out", "매출원가", "원재료비"],
  ["새벽채소", "out", "매출원가", "원재료비"],
  ["포장나라", "out", "매출원가", "기타재료비"],
  ["우리동네마트", "out", "매출원가", "기타재료비", null, true],
  ["배민비즈머니", "out", "영업비", "지급수수료"],
  ["바로고", "out", "영업비", "지급수수료"],
  ["세무회계", "out", "영업비", "지급수수료"],
  ["방역", "out", "영업비", "지급수수료"],
  ["안심보안", "out", "영업비", "지급수수료"],
  ["렌탈", "out", "영업비", "지급수수료"],
  ["한국전력", "out", "영업비", "수도광열비"],
  ["도시가스", "out", "영업비", "수도광열비"],
  ["통신요금", "out", "영업비", "통신비"],
  ["카드단말기", "out", "영업비", "카드수수료"],
  ["노란우산", "out", "영업비", "충당금"],
  ["주유소", "out", "영업비", "차량유지관리비"],
  ["월세", "out", "임대료", "임대료"],
  ["관리비", "out", "임대료", "관리비"],
  ["지방소득세", "out", "세금과공과", "소득세"],
  ["부가세", "out", "세금과공과", "부가세"],
  ["급여", "out", "노무관리비", "노무관리비급여"],
  ["생활비", "out", "기타", "생활비"],
  // 입금 — 어느 채널 정산인지 연결해 두면 입력한 입금액과 대조할 수 있다
  ["우아한형제들", "in", "수입", "매출액", "baemin"],
  ["쿠팡이츠", "in", "수입", "매출액", "coupang"],
  ["요기요", "in", "수입", "매출액", "yogiyo"],
  ["땡겨요", "in", "수입", "매출액", "etc"],
  ["카드매출", "in", "수입", "매출액", "hall"],
];

export function seedRules(): Rule[] {
  return SEEDS.map(([keyword, direction, major, minor, channel = null, ambiguous = false], i) => ({
    id: `seed-${i}`,
    keyword,
    direction,
    major,
    minor,
    channel,
    ambiguous,
  }));
}

// 시연용 채널 실매출 (가짜). 가짜 은행 엑셀의 입금 합계와 맞춰 두었고,
// 쿠팡이츠만 일부러 5만 원 다르게 해서 "입금 대조 차이"가 보이게 했다.
export function sampleChannelSales(month: string): ChannelSale[] {
  return [
    { month, channel: "hall", name: "홀(포스)", orders: 14_000_000, deposit: 12_880_000, count: 520 },
    { month, channel: "baemin", name: "배달의민족", orders: 9_000_000, deposit: 7_650_000, count: 300 },
    { month, channel: "coupang", name: "쿠팡이츠", orders: 5_000_000, deposit: 4_100_000, count: 170 },
    { month, channel: "yogiyo", name: "요기요", orders: 2_000_000, deposit: 1_720_000, count: 70 },
    { month, channel: "etc", name: "땡겨요·기타", orders: 1_000_000, deposit: 930_000, count: 35 },
  ];
}
