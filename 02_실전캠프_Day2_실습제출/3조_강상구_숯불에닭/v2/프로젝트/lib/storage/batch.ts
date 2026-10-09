import type { DailySale, Shift, Transaction, UploadRecord } from "../types";
import type { LocalData } from "./local";

// 여러 항목을 "한 번에" 저장하기 위한 작업 목록.
// 오늘 마감(매출+근무), 올리기(거래+올린 기록), 영수증(영수증 목록+품목 단가+통장 분류)처럼
// 저장을 연달아 부르던 흐름이 두 번째에서 실패하면 반쪽만 남았다 (B~F단계 미해결).
// 내 PC 모드는 이 목록을 장부 한 덩어리에 적용해 setItem 한 번으로 쓴다 → 전부 되거나 전부 안 된다.

export type BatchOp =
  | { kind: "transactions"; txs: Transaction[] } // id 같으면 바꿈, 없으면 추가
  | { kind: "upload"; record: UploadRecord }
  | { kind: "dailySales"; date: string; sales: DailySale[] } // 그날 것을 통째로 바꿈
  | { kind: "shifts"; date: string; shifts: Shift[] } // 그날 것을 통째로 바꿈
  | { kind: "setting"; key: string; value: unknown };

const upsert = <T>(list: T[], item: T, same: (a: T, b: T) => boolean) =>
  list.some((x) => same(x, item)) ? list.map((x) => (same(x, item) ? item : x)) : [...list, item];

// 순수 함수 — LocalStore 의 낱개 저장 함수도 이걸 쓴다. 그래서 "한 번에"와 "낱개"의 결과가 항상 같다.
export function applyOp(d: LocalData, op: BatchOp): LocalData {
  switch (op.kind) {
    case "transactions":
      return { ...d, transactions: op.txs.reduce((acc, t) => upsert(acc, t, (a, b) => a.id === b.id), d.transactions) };
    case "upload":
      return { ...d, uploads: [...d.uploads, op.record] };
    case "dailySales":
      return { ...d, dailySales: [...d.dailySales.filter((s) => s.date !== op.date), ...op.sales.filter((s) => s.date === op.date)] };
    case "shifts":
      return { ...d, shifts: [...d.shifts.filter((s) => s.date !== op.date), ...op.shifts.filter((s) => s.date === op.date)] };
    case "setting":
      return { ...d, settings: upsert(d.settings, { key: op.key, value: op.value }, (a, b) => a.key === b.key) };
  }
}

export function applyOps(d: LocalData, ops: BatchOp[]): LocalData {
  return ops.reduce(applyOp, d);
}
