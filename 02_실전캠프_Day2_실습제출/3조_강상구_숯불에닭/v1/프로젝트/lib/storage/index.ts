import type { ChannelSale, Month, MonthClosing, Rule, Transaction, UploadRecord } from "../types";
import { LocalStore } from "./local";
import { SupabaseStore } from "./supabase";

// 저장 방식이 둘이라 화면은 이 인터페이스만 본다.
//  - 내 PC 모드(local): 이 컴퓨터 브라우저에만 저장. 실제 숫자는 여기서만.
//  - 시연 모드(supabase): 인터넷 데이터 창고. 로그인이 없으니 가짜 데이터만.
export interface Store {
  mode: "local" | "supabase";
  listTransactions(month: Month): Promise<Transaction[]>;
  saveTransactions(txs: Transaction[]): Promise<void>;
  deleteTransaction(id: string): Promise<void>;
  listRules(): Promise<Rule[]>;
  saveRule(rule: Rule): Promise<void>;
  deleteRule(id: string): Promise<void>;
  listChannelSales(month: Month): Promise<ChannelSale[]>;
  saveChannelSales(sales: ChannelSale[]): Promise<void>;
  getClosing(month: Month): Promise<MonthClosing | null>;
  saveClosing(c: MonthClosing): Promise<void>;
  listUploads(): Promise<UploadRecord[]>;
  saveUpload(u: UploadRecord): Promise<void>;
  deleteMonth(month: Month): Promise<void>;
}

// 열쇠가 있어도 NEXT_PUBLIC_STORAGE=supabase 가 아니면 절대 Supabase로 보내지 않는다.
export function storageMode(): "local" | "supabase" {
  const wantsSupabase = process.env.NEXT_PUBLIC_STORAGE === "supabase";
  const hasKeys = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return wantsSupabase && hasKeys ? "supabase" : "local";
}

let store: Store | null = null;
export function getStore(): Store {
  if (!store) store = storageMode() === "supabase" ? new SupabaseStore() : new LocalStore();
  return store;
}
