import "server-only";
import type { BankSearchResult, JobState, PopbillConfig, TaxinvoiceSearchResult } from "./types";

// 팝빌 SDK 감싸기 — 서버에서만 돈다. 열쇠(LinkID·SecretKey)는 브라우저로 절대 안 나간다.
//  SDK가 콜백 방식이라 Promise로 바꿔 쓴다.

export class PopbillError extends Error {
  constructor(message: string, readonly code?: number) { super(message); }
}

/** 환경변수가 다 들어왔는지 본다. 하나라도 없으면 무엇이 없는지 알려 준다 */
export function readConfig(): { ok: true; config: PopbillConfig } | { ok: false; missing: string[] } {
  const need = {
    POPBILL_LINK_ID: process.env.POPBILL_LINK_ID,
    POPBILL_SECRET_KEY: process.env.POPBILL_SECRET_KEY,
    POPBILL_CORP_NUM: process.env.POPBILL_CORP_NUM,
    POPBILL_BANK_CODE: process.env.POPBILL_BANK_CODE,
    POPBILL_ACCOUNT_NUMBER: process.env.POPBILL_ACCOUNT_NUMBER,
  };
  const missing = Object.entries(need).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) return { ok: false, missing };
  return {
    ok: true,
    config: {
      linkID: need.POPBILL_LINK_ID!,
      secretKey: need.POPBILL_SECRET_KEY!,
      corpNum: need.POPBILL_CORP_NUM!.replace(/\D/g, ""),
      userID: process.env.POPBILL_USER_ID ?? "",
      isTest: process.env.POPBILL_IS_TEST !== "false", // 기본은 테스트 서버
      bankCode: need.POPBILL_BANK_CODE!,
      accountNumber: need.POPBILL_ACCOUNT_NUMBER!.replace(/\D/g, ""),
    },
  };
}

type Svc = Record<string, (...args: unknown[]) => void>;
let configured = false;

async function services(c: PopbillConfig): Promise<{ bank: Svc; tax: Svc }> {
  const popbill = (await import("popbill")) as unknown as {
    config: (o: Record<string, unknown>) => void;
    EasyFinBankService: () => Svc;
    HTTaxinvoiceService: () => Svc;
  };
  if (!configured) {
    popbill.config({
      LinkID: c.linkID,
      SecretKey: c.secretKey,
      IsTest: c.isTest,
      IPRestrictOnUse: true,
      UseStaticIP: false,
      UseLocalTimeYN: true,
      defaultErrorHandler: () => {},
    });
    configured = true;
  }
  return { bank: popbill.EasyFinBankService(), tax: popbill.HTTaxinvoiceService() };
}

/** 콜백 두 개(success, error)를 받는 SDK 함수를 Promise로 */
function call<T>(svc: Svc, method: string, args: unknown[]): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const fn = svc[method];
    if (typeof fn !== "function") return reject(new PopbillError(`팝빌 SDK에 ${method}가 없어요`));
    fn.call(svc, ...args, (r: T) => resolve(r), (e: { code?: number; message?: string }) =>
      reject(new PopbillError(e?.message ?? "팝빌 호출이 실패했어요", e?.code)));
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 수집이 끝날 때까지 기다린다 (jobState 3 + errorCode 1) */
async function waitJob(svc: Svc, corpNum: string, jobID: string, userID: string, timeoutMs = 60_000): Promise<void> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const st = await call<JobState>(svc, "getJobState", [corpNum, jobID, userID]);
    if (st.jobState === 3) {
      if (Number(st.errorCode) === 1) return;
      throw new PopbillError(st.errorReason || `수집에 실패했어요 (코드 ${st.errorCode})`, Number(st.errorCode));
    }
    if (Date.now() > until) throw new PopbillError("수집이 너무 오래 걸려요. 잠시 뒤 다시 눌러 주세요");
    await sleep(1500);
  }
}

/** 통장 거래내역 가져오기 (한 번에 1개월까지) */
export async function fetchBank(c: PopbillConfig, sdate: string, edate: string): Promise<BankSearchResult["list"]> {
  const { bank } = await services(c);
  const jobID = await call<string>(bank, "requestJob", [c.corpNum, c.bankCode, c.accountNumber, sdate, edate, c.userID]);
  await waitJob(bank, c.corpNum, jobID, c.userID);
  const all: BankSearchResult["list"] = [];
  for (let page = 1; ; page += 1) {
    const r = await call<BankSearchResult>(bank, "search", [c.corpNum, jobID, "", "", page, 500, "A", c.userID]);
    all.push(...(r.list ?? []));
    if (!r.pageCount || page >= r.pageCount) break;
  }
  return all;
}

/** 매입 전자세금계산서 가져오기 (작성일자 기준) */
export async function fetchTaxinvoices(c: PopbillConfig, sdate: string, edate: string): Promise<TaxinvoiceSearchResult["list"]> {
  const { tax } = await services(c);
  const jobID = await call<string>(tax, "requestJob", [c.corpNum, "BUY", "W", sdate, edate, c.userID]);
  await waitJob(tax, c.corpNum, jobID, c.userID);
  const all: TaxinvoiceSearchResult["list"] = [];
  for (let page = 1; ; page += 1) {
    const r = await call<TaxinvoiceSearchResult>(tax, "search", [c.corpNum, jobID, [], [], [], "", "", "", page, 500, "A", c.userID, ""]);
    all.push(...(r.list ?? []));
    if (!r.pageCount || page >= r.pageCount) break;
  }
  return all;
}
