import type { AccountGroup, Behavior } from "./accounts";
import type { Split } from "./split";

export type TxSource =
  | "ledger-variable"   // 가계부 시트 · 변동지출내역
  | "ledger-fixed"      // 가계부 시트 · 고정비내역
  | "ledger-income"     // 가계부 시트 · 수입내역
  | "card"              // 카드 명세 파일
  | "fixed-copy"        // 고정비 전월 복사
  | "manual";           // 수기 입력

export interface Transaction {
  id: string;
  /** 거래일(승인일). 없으면 null — 월 귀속은 month가 책임진다(§7). */
  date: string | null;
  /** 귀속월 YYYY-MM */
  month: string;
  account: string;
  sub: string | null;
  /** 거래처 / 지출내용 원문 */
  merchant: string;
  /** 원. 음수는 환불·취소(§7) */
  amount: number;
  source: TxSource;
  group: AccountGroup;
  behavior: Behavior | null;
  /** 사람이 봐야 하는 건 */
  needsReview: boolean;
  reviewReason: string | null;
  /** 자동 매핑으로 계정이 정해졌는가 */
  autoMapped: boolean;
  /** 사람이 검수해 확정한 건 — 재분류가 덮어쓰지 않는다 */
  confirmed?: boolean;
  /** 원본에 적혀 있던 계정 표기(정규화 전) */
  rawAccount?: string;
  /** 할부·안분 회차 (§7). 지출내용의 "( 2/12 )"를 읽어 옮긴다 */
  split?: Split | null;
  /** 자유 메모 */
  note?: string | null;
  /** 나중에 다시 볼 것 — 시트의 물음표를 옮긴 것 */
  flagged?: boolean;
  /** 카드 파일이 붙여준 표시 — 일시불 / 할부 / 취소 등 */
  tags?: string[];
  /** 정규화하며 고친 내용 */
  normalizedNote?: string;
}

export interface RevenueLine {
  account: string;      // 매출-홀 / 매출-배달 / 매출-기타
  channel: string;      // 홀, 배달의민족, 쿠팡이츠, 요기요, 계좌이체
  gross: number;        // 매출액
  deposit: number;      // 입금액
}

export interface MonthData {
  month: string;              // YYYY-MM
  transactions: Transaction[];
  revenue: RevenueLine[];
  closed: boolean;
}

export const emptyMonth = (month: string): MonthData => ({
  month,
  transactions: [],
  revenue: [],
  closed: false,
});
