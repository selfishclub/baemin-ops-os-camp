import type { ChannelId, Major } from "./categories";

export type Month = string; // "2026-08"

// 은행 엑셀에서 읽은 한 줄 (분류 전)
export interface BankRow {
  date: string; // "2026-08-03"
  payee: string; // 거래처·적요
  out: number; // 출금
  in: number; // 입금
}

export type ReviewReason = "처음 보는 거래처" | "금액이 큼" | "재료비/생활비 애매";

export interface Transaction extends BankRow {
  id: string;
  month: Month;
  source: "bank" | "manual";
  major: Major | null;
  minor: string | null;
  channel: ChannelId | null; // 입금 줄이 어느 채널 정산인지 (대조용)
  review: ReviewReason | null; // null이면 확인 끝
  payMethod?: "현금" | "카드"; // 직접 추가한 지출만
}

// 거래처 이름에 keyword가 들어 있으면 이 항목으로 분류
export interface Rule {
  id: string;
  keyword: string;
  direction: "in" | "out";
  major: Major;
  minor: string;
  channel: ChannelId | null;
  ambiguous?: boolean; // 마트처럼 매번 확인이 필요한 거래처
}

export interface ChannelSale {
  month: Month;
  channel: ChannelId;
  name: string;
  orders: number; // 주문금액 — 이 달에 주문된 금액 (주문일 기준)
  deposit: number; // 정산금액 — 이 달 주문분에서 수수료를 빼고 받을(받은) 돈. 통장에 들어온 날과 상관없음
  count: number; // 건수
  unsettled?: number | null; // 월말 미입금액 — 이 달 주문분 중 다음 달에 들어올 돈. null/없음 = 안 넣음
}

export interface EditLog {
  at: string; // ISO 시각
  what: string;
}

export interface MonthClosing {
  month: Month;
  closedAt: string | null;
  edits: EditLog[]; // 마감 뒤 고친 기록
}

export interface UploadRecord {
  id: string;
  month: Month;
  from: string;
  to: string;
  rowCount: number;
  uploadedAt: string;
}
