import sample from "./sampleDaily.json";
import { getStore } from "./storage";
import type { DailySale, Shift, Staff } from "./types";

// 가짜 예시 자료 넣기 — 오늘 탭과 손익 탭의 빈 화면이 같이 쓴다.
//  전에는 오늘 탭 안에만 있어서, 빈 화면에도 넣으려면 같은 코드를 베껴야 했다.
export const SAMPLE_MONTH: string = sample.month;
export const SAMPLE_LABEL = "9/1~9/17, 직원 3명";

/** 가짜 직원·매출·근무를 넣고, 자료가 들어간 달을 돌려준다 */
export async function loadSampleData(): Promise<string> {
  const store = getStore();
  for (const p of sample.staff as Staff[]) await store.saveStaff(p);

  const byDate = new Map<string, DailySale[]>();
  for (const s of sample.sales as DailySale[]) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);
  for (const [d, list] of byDate) await store.saveDailySales(d, list);

  const shiftsByDate = new Map<string, Shift[]>();
  for (const s of sample.shifts as Shift[]) shiftsByDate.set(s.date, [...(shiftsByDate.get(s.date) ?? []), s]);
  for (const [d, list] of shiftsByDate) await store.saveShifts(d, list);

  return SAMPLE_MONTH;
}

// 빈 화면에 "둘러보기"를 띄울지.
//  장부가 **통째로** 비었을 때만 띄운다. 자료가 있는 사장님이 다음 달을 미리 열었을 때도 띄우면,
//  잘못 눌러서 진짜 장부에 가짜 숫자가 들어간다.
export function canOfferTour(dailySalesCount: number, uploadCount: number): boolean {
  return dailySalesCount === 0 && uploadCount === 0;
}

/** 장부에 자료가 하나라도 있는지 (일별 매출이나 올린 통장 파일) */
export async function ledgerIsEmpty(): Promise<boolean> {
  const store = getStore();
  const [sales, uploads] = await Promise.all([store.listAllDailySales(), store.listUploads()]);
  return canOfferTour(sales.length, uploads.length);
}
