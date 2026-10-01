import type { DailySale } from "./dailySales";
import type { BankDeposit } from "./store";

/**
 * 둘러보기용 가짜 자료.
 *
 * 다른 사장님이 주소를 열면 자료가 각자 브라우저에 있어 빈 화면이 뜬다.
 * 그러면 "단계를 따라갈 수 있나 · 표가 읽히나"를 물어볼 수가 없다.
 *
 * 그래서 가짜 카드 파일을 글자로 들고 있다가 **진짜 파서에 그대로 흘려보낸다.**
 * 시연이 실제 동작과 다르면 받은 피드백이 쓸모없어진다 — 그래서 지름길을 내지 않는다.
 *
 * 금액·거래처는 전부 지어낸 것이다. 실제 자료는 한 줄도 들어 있지 않다.
 */

/** 그 달에 실제로 있는 날로 맞춘다. 2월에 30일을 적으면 파서가 버린다. */
function day(month: string, d: number): string {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${y}.${String(m).padStart(2, "0")}.${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** 이용일, 이용가맹점, 업종, 이용금액, 할부 */
const ROWS: [number, string, string, number, string][] = [
  [2, "또와마트", "유통", 18400, "일시불"],
  [2, "성수동정육점", "정육", 1180000, "일시불"],
  [3, "새우유통", "수산물", 286400, "일시불"],
  [3, "우지커피", "카페", 4500, "일시불"],
  [4, "토스페이", "간편결제", 32000, "일시불"],
  [5, "네이버 검색광고", "광고", 150000, "일시불"],
  [6, "쿠팡(쿠페이)", "전자상거래", 48200, "일시불"],
  [7, "세븐일레븐 성수점", "편의점", 7900, "일시불"],
  [8, "면포장용기", "포장재", 76700, "일시불"],
  [9, "김치공장", "식품", 200000, "일시불"],
  [10, "성수약국", "의약", 12800, "일시불"],
  [11, "토스페이", "간편결제", 15500, "일시불"],
  [12, "제빙기 교체", "주방기기", 1560000, "12개월"],
  [14, "생수주문", "음료", 16100, "일시불"],
  [15, "한국전력", "공과금", 384200, "일시불"],
  [16, "쿠팡(쿠페이)", "전자상거래", 23900, "일시불"],
  [18, "또와마트", "유통", 9600, "일시불"],
  [19, "성수동서점", "도서", 18000, "일시불"],
  [21, "세무법인 성수", "세무", 77000, "일시불"],
  [23, "성수동정육점", "정육", 940000, "일시불"],
  [25, "다이소 성수", "생활용품", 11200, "일시불"],
  [27, "면사랑유통", "식자재유통", 612000, "일시불"],
];

/** 현대카드가 내려주는 모양 그대로. 머리글 이름으로 열을 찾으므로 순서는 바뀌어도 된다. */
export function demoCardCsv(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const head = [
    "현대카드 이용내역",
    `조회기간,${y}.${String(m).padStart(2, "0")}.01 ~ ${y}.${String(m).padStart(2, "0")}.${last}`,
    ",,,,,",
    "이용일,이용가맹점,업종,이용금액,할부,카드번호",
  ];
  const body = ROWS.map(([d, 가맹점, 업종, 금액, 할부]) =>
    [day(month, d), 가맹점, 업종, String(금액), 할부, "0000"].join(",")
  );
  return [...head, ...body].join("\n") + "\n";
}

/** 통장에 찍히는 입금. 매출 정산분과 그렇지 않은 것이 섞여 있어야 4단계가 할 일이 생긴다. */
export function demoDeposits(month: string): BankDeposit[] {
  const d = (n: number) => `${month}-${String(n).padStart(2, "0")}`;
  return [
    { id: "demo-d1", date: d(10), who: "카드매출정산", amount: 9_480_000, kind: "매출", channel: "홀" },
    { id: "demo-d2", date: d(15), who: "우아한형제들", amount: 3_820_000, kind: "매출", channel: "배달의민족" },
    { id: "demo-d3", date: d(20), who: "쿠팡이츠서비스", amount: 1_240_000, kind: "매출", channel: "쿠팡이츠" },
    { id: "demo-d4", date: d(22), who: "본인", amount: 500_000, kind: "제외", channel: null },
  ];
}

/** 매출 캘린더. 주마다 하루는 쉬는 가게로 둔다 — 빈 날이 보여야 캘린더가 쓸모를 보인다. */
export function demoSales(month: string): DailySale[] {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const out: DailySale[] = [];
  for (let d = 1; d <= last; d++) {
    if (d % 7 === 1) continue; // 쉬는 날
    const date = `${month}-${String(d).padStart(2, "0")}`;
    out.push({ date, channel: "홀", amount: 320_000 + ((d * 41) % 190_000) });
    out.push({ date, channel: "배달의민족", amount: 120_000 + ((d * 59) % 130_000) });
    if (d % 3 === 0) out.push({ date, channel: "쿠팡이츠", amount: 50_000 + ((d * 31) % 60_000) });
  }
  return out;
}

export const DEMO_FILE_NAME = "(시연용 가짜 자료)";
