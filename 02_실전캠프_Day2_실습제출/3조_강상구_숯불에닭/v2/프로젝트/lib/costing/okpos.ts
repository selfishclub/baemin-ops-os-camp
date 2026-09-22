import type { PosSalesLine, PosSalesReport } from "./types";

// 오케이포스 ASP "상품ABC분석" 엑셀 읽기. ai-store-manager의 파서를 손익 장부용으로 옮긴 것.
//  - 행 번호를 박지 않고 "상품코드" 머리줄을 찾는다
//  - 합계 행으로 검산한다 (수량은 1개도 틀리면 안 된다)
//  - 조회일자를 파일에서 읽는다 (사람에게 다시 묻지 않는다)
export class PosParseError extends Error {}

type Cell = string | number | null | undefined;
const text = (v: Cell) => (v === null || v === undefined ? "" : String(v).trim());
const num = (v: Cell) => {
  if (typeof v === "number") return v;
  const n = Number(text(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const COLS = {
  grade: ["등급"],
  code: ["상품코드"],
  name: ["상품명"],
  amount: ["실매출액", "매출액"],
  quantity: ["판매수량", "수량"],
} as const;

export function parsePosAbcGrid(grid: Cell[][]): PosSalesReport {
  const headerIdx = grid.findIndex((r) => (r ?? []).some((c) => text(c) === "상품코드"));
  if (headerIdx < 0) throw new PosParseError("포스 '상품ABC분석' 엑셀이 아닌 것 같아요. '상품코드' 머리줄을 찾지 못했어요.");
  const header = grid[headerIdx];
  const find = (keys: readonly string[]) => header.findIndex((c) => keys.some((k) => text(c).replace(/\s+/g, "").startsWith(k)));
  const col = { grade: find(COLS.grade), code: find(COLS.code), name: find(COLS.name), amount: find(COLS.amount), quantity: find(COLS.quantity) };
  if (col.quantity < 0) throw new PosParseError("'판매수량' 열이 없어요.");
  if (col.amount < 0) throw new PosParseError("'실매출액' 열이 없어요.");

  // 조회일자
  const pat = /(\d{4})[-./](\d{2})[-./](\d{2})\s*~\s*(\d{4})[-./](\d{2})[-./](\d{2})/;
  let period: { start: string; end: string } | null = null;
  for (const r of grid.slice(0, headerIdx)) for (const c of r ?? []) {
    const m = text(c).match(pat);
    if (m) period = { start: `${m[1]}-${m[2]}-${m[3]}`, end: `${m[4]}-${m[5]}-${m[6]}` };
  }
  if (!period) throw new PosParseError("조회일자를 찾지 못했어요. 안내 문구가 있는 원본 엑셀을 그대로 올려 주세요.");
  if (period.start.slice(0, 7) !== period.end.slice(0, 7)) throw new PosParseError(`조회 기간이 두 달에 걸쳐 있어요 (${period.start} ~ ${period.end}). 한 달 단위로 조회해서 올려 주세요.`);

  const lines: PosSalesLine[] = [];
  let total: { amount: number; quantity: number } | null = null;
  for (const r of grid.slice(headerIdx + 1)) {
    if (!r) continue;
    const grade = col.grade >= 0 ? text(r[col.grade]) : "";
    const code = text(r[col.code]);
    const name = col.name >= 0 ? text(r[col.name]) : "";
    if (grade === "합계" || grade === "총계" || code === "합계" || name === "합계") {
      total = { amount: num(r[col.amount]), quantity: num(r[col.quantity]) };
      continue;
    }
    if (!code && !name) continue;
    lines.push({ code, name, amount: num(r[col.amount]), quantity: num(r[col.quantity]) });
  }
  if (lines.length === 0) throw new PosParseError("메뉴 줄이 하나도 없어요.");

  const totalAmount = lines.reduce((a, l) => a + l.amount, 0);
  const totalQuantity = lines.reduce((a, l) => a + l.quantity, 0);
  if (total && (Math.abs(totalAmount - total.amount) > 1 || totalQuantity !== total.quantity)) {
    throw new PosParseError(`파일의 합계 행과 읽은 값이 달라요 (금액 차이 ${totalAmount - total.amount}, 수량 차이 ${totalQuantity - total.quantity}). 파일이 잘렸거나 모양이 바뀐 것 같아요.`);
  }
  return { month: period.start.slice(0, 7), periodStart: period.start, periodEnd: period.end, lines, totalAmount, totalQuantity };
}

// 같은 달 상품ABC 자료를 이어 붙인다 — 매일 "오늘 판매"만 받아 올려도 한 달치가 쌓이게
//  - 기존 기간 뒤 날짜만 담긴 파일 → 메뉴(상품코드)별로 더해 이어 붙임 (중간에 빈 날이 있으면 알려 줌)
//  - 기존 기간을 다 덮는 파일 → 통째로 바꿈
//  - 일부만 겹치면 두 번 세게 되므로 막는다
export type PosMerge =
  | { mode: "new" | "replace" | "append"; report: PosSalesReport; gapDays: number }
  | { mode: "conflict"; message: string };

const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

export function mergePosReports(prev: PosSalesReport | null, next: PosSalesReport): PosMerge {
  if (!prev || prev.month !== next.month) return { mode: "new", report: next, gapDays: 0 };
  if (next.periodStart <= prev.periodStart && next.periodEnd >= prev.periodEnd) return { mode: "replace", report: next, gapDays: 0 };
  if (next.periodStart > prev.periodEnd) {
    const byCode = new Map(prev.lines.map((l) => [l.code, { ...l }]));
    for (const l of next.lines) {
      const e = byCode.get(l.code);
      if (e) {
        e.amount += l.amount;
        e.quantity += l.quantity;
        e.name = l.name;
      } else byCode.set(l.code, { ...l });
    }
    const lines = [...byCode.values()].sort((a, b) => b.amount - a.amount);
    return {
      mode: "append",
      report: { month: prev.month, periodStart: prev.periodStart, periodEnd: next.periodEnd, lines, totalAmount: prev.totalAmount + next.totalAmount, totalQuantity: prev.totalQuantity + next.totalQuantity },
      gapDays: Math.max(0, daysBetween(nextDay(prev.periodEnd), next.periodStart)),
    };
  }
  return {
    mode: "conflict",
    message: `이미 ${prev.periodStart} ~ ${prev.periodEnd} 자료가 있는데, 올린 파일(${next.periodStart} ~ ${next.periodEnd})과 날짜가 겹쳐요. 같은 판매를 두 번 세지 않게 막았어요. ${prev.periodEnd} 다음 날부터 받거나, 1일부터 한 번에 받아 올려 주세요.`,
  };
}
