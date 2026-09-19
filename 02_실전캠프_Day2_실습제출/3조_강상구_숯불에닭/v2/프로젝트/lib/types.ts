import type { ChannelId, Major } from "./categories";
export type { Channel, ChannelKind } from "./categories";

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
  prev_month?: boolean; // 급여·거래처 대금처럼 다음 달 10일에 내는 돈: 통장에서 나간 달이 아니라 지난달 비용으로 잡는다 (Supabase 열 이름과 같게 snake_case)
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

// ── v2: 오늘 마감 입력 ──────────────────────────────────────────
// 일별 채널 매출 (주문일 기준). 같은 날·같은 채널은 한 줄.
export interface DailySale {
  date: string; // "2026-09-17"
  channel: ChannelId;
  amount: number;
  source?: "pos_easy"; // 포스 간편결제승인현황에서 온 줄(토스페이카드 → 카드사). 그 파일을 다시 올리면 이것만 바꾼다
}

// 시급제 직원. 실명 대신 별칭(화덕A·홀A)만 쓴다.
export interface Staff {
  id: string;
  alias: string;
  wage: number; // 시급
  active: boolean;
}

// 그날 한 사람의 근무시간
export interface Shift {
  date: string;
  staffId: string;
  hours: number; // 근무시간 (start·end가 있으면 거기서 계산)
  start?: string; // "18:00"
  end?: string; // "22:30" (자정을 넘기면 다음날 시각, 예: "01:00")
}

// 화면 설정 (채널 목록 등). key별로 JSON 하나.
export interface Setting<T = unknown> {
  key: string;
  value: T;
}

// 일별 날씨 (Open-Meteo 또는 시연용 가짜)
export type { DailyWeather } from "./weather";
