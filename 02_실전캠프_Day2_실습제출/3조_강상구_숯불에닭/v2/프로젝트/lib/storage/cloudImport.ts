import { isUpgradeSetting } from "../edition";
import type { Store } from "./index";
import type { LocalData } from "./local";

// 내 PC 백업 파일(JSON)을 인터넷 저장소(로그인한 가게)로 옮긴다.
//  - 백업은 lib/storage/backup.ts 의 inspectBackup 으로 먼저 검사한 것만 받는다.
//  - 저장소의 낱개 저장 함수를 차례로 부른다. 거래는 id 가 같으면 바꾸고, 그날 매출·근무는 파일 것으로 통째로 바꾼다.
//  - 기본판(폰·공유용)에 없는 기능의 설정(리뷰 수집 자료·키워드·광고)은 빼고 넣는다 — 크기만 차지하고 쓸 화면이 없다.
//  - 한 번에 다 되거나 다 안 되는 것이 아니다 (인터넷 저장소는 표마다 따로 쓴다). 중간에 끊기면 다시 돌리면 된다 — 같은 것은 덮어쓴다.

const CHUNK = 200;

export interface ImportSummary {
  transactions: number;
  rules: number;
  channelSales: number;
  closings: number;
  uploads: number;
  saleDates: number; // 일별 매출이 있는 날 수
  shiftDates: number; // 근무가 있는 날 수
  staff: number;
  settings: number;
  skippedSettings: string[]; // 빼고 간 설정 키
  weather: number;
  steps: number; // 저장 요청 횟수 (진행률 분모)
}

const chunks = <T>(list: T[]) => Math.ceil(list.length / CHUNK);
const byDate = <T extends { date: string }>(list: T[]) => {
  const m = new Map<string, T[]>();
  for (const x of list) m.set(x.date, [...(m.get(x.date) ?? []), x]);
  return m;
};

export function planImport(d: LocalData, skipUpgradeSettings: boolean): ImportSummary {
  const settings = d.settings.filter((s) => !(skipUpgradeSettings && isUpgradeSetting(s.key)));
  const skipped = d.settings.filter((s) => skipUpgradeSettings && isUpgradeSetting(s.key)).map((s) => s.key);
  const saleDates = byDate(d.dailySales).size;
  const shiftDates = byDate(d.shifts).size;
  const steps = chunks(d.transactions) + d.rules.length + (d.channelSales.length ? 1 : 0) + d.closings.length + d.uploads.length + saleDates + shiftDates + d.staff.length + settings.length + chunks(d.weather);
  return {
    transactions: d.transactions.length,
    rules: d.rules.length,
    channelSales: d.channelSales.length,
    closings: d.closings.length,
    uploads: d.uploads.length,
    saleDates,
    shiftDates,
    staff: d.staff.length,
    settings: settings.length,
    skippedSettings: skipped,
    weather: d.weather.length,
    steps,
  };
}

/** 백업을 저장소에 넣는다. onProgress(끝난 요청 수, 전체 요청 수) */
export async function importToStore(store: Store, d: LocalData, skipUpgradeSettings: boolean, onProgress?: (done: number, total: number) => void): Promise<ImportSummary> {
  const plan = planImport(d, skipUpgradeSettings);
  let done = 0;
  const tick = () => onProgress?.(++done, plan.steps);

  // 규칙·직원·설정을 먼저 — 거래·근무가 이것들을 가리킨다
  for (const r of d.rules) {
    await store.saveRule(r);
    tick();
  }
  for (const s of d.staff) {
    await store.saveStaff(s);
    tick();
  }
  for (const s of d.settings) {
    if (skipUpgradeSettings && isUpgradeSetting(s.key)) continue;
    await store.saveSetting(s.key, s.value);
    tick();
  }
  for (let i = 0; i < d.transactions.length; i += CHUNK) {
    await store.saveTransactions(d.transactions.slice(i, i + CHUNK));
    tick();
  }
  if (d.channelSales.length) {
    await store.saveChannelSales(d.channelSales);
    tick();
  }
  for (const c of d.closings) {
    await store.saveClosing(c);
    tick();
  }
  for (const u of d.uploads) {
    await store.saveUpload(u);
    tick();
  }
  for (const [date, sales] of byDate(d.dailySales)) {
    await store.saveDailySales(date, sales);
    tick();
  }
  for (const [date, shifts] of byDate(d.shifts)) {
    await store.saveShifts(date, shifts);
    tick();
  }
  for (let i = 0; i < d.weather.length; i += CHUNK) {
    await store.saveWeather(d.weather.slice(i, i + CHUNK));
    tick();
  }
  return plan;
}
