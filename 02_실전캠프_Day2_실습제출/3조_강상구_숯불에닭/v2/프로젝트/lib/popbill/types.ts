// 팝빌(링크허브) 응답 모양. 공식 문서 기준 — developers.popbill.com
//  계좌조회(EasyFinBank): 수집 요청(requestJob) → 상태 확인(getJobState) → 내역 조회(search)
//  홈택스 세금계산서(HTTaxinvoice): 같은 순서

/** 계좌조회 거래 한 줄 */
export interface BankDetail {
  tid: string; // 거래내역 아이디 (중복 막기에 쓴다)
  trdate: string; // 거래일자 yyyyMMdd
  trdt: string; // 거래일시 yyyyMMddHHmmss
  accIn: string; // 입금액
  accOut: string; // 출금액
  balance: string; // 잔액
  remark1: string; // 비고1
  remark2: string; // 거래구분·거래종류
  remark3: string; // 거래내용·적요
  remark4: string; // 거래점·취급점
  memo?: string;
}

export interface BankSearchResult {
  code: number; // 1이면 성공
  message: string;
  total: number;
  perPage: number;
  pageNum: number;
  pageCount: number;
  lastScrapDT: string;
  balance: string;
  list: BankDetail[];
}

/** 수집 상태. jobState 3(완료) + errorCode 1(성공)이어야 내역을 읽을 수 있다 */
export interface JobState {
  jobID: string;
  jobState: number; // 0 접수 · 1 대기 · 2 진행 · 3 완료
  errorCode: number; // 1 성공, 음수면 실패
  errorReason?: string;
  jobStartDT?: string;
  jobEndDT?: string;
}

/** 홈택스 전자세금계산서 한 장 */
export interface TaxinvoiceDetail {
  ntsconfirmNum: string; // 국세청 승인번호
  writeDate: string; // 작성일자 yyyyMMdd
  issueDate?: string;
  invoicerCorpNum: string; // 공급자 사업자번호
  invoicerCorpName?: string; // 공급자 상호 (문서 오타로 invoicerCornName으로 오기도 한다)
  invoicerCornName?: string;
  invoiceeCorpNum?: string;
  invoiceeCorpName?: string;
  supplyCostTotal: string; // 공급가액
  taxTotal: string; // 세액
  totalAmount: string; // 합계금액
  taxType?: string; // 과세형태
  purposeType?: string; // 영수·청구
  itemName?: string; // 품목명
  remark?: string;
}

export interface TaxinvoiceSearchResult {
  code: number;
  message: string;
  total: number;
  perPage: number;
  pageNum: number;
  pageCount: number;
  list: TaxinvoiceDetail[];
}

/** 팝빌 설정이 다 들어왔는지 (서버에서만 본다) */
export interface PopbillConfig {
  linkID: string;
  secretKey: string;
  corpNum: string; // 숫자만 10자리
  userID: string;
  isTest: boolean;
  bankCode: string; // 기관코드 (농협은행 0011)
  accountNumber: string; // 숫자만
}
