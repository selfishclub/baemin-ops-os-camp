import type { BankRow } from "../types";

// 은행마다 머리줄 이름이 달라서, 흔한 이름을 모아 두고 자동으로 찾는다.
const DATE_NAMES = ["거래일시", "거래일자", "거래일", "날짜", "일자"];
const PAYEE_NAMES = ["기재내용", "거래내용", "내용", "받는분", "보낸분", "상대", "적요", "메모"];
const OUT_NAMES = ["출금액", "출금금액", "출금", "찾으신금액", "지급금액", "지급"];
const IN_NAMES = ["입금액", "입금금액", "입금", "맡기신금액"];

export class BankParseError extends Error {}

export interface ParsedBank {
  rows: BankRow[];
  from: string;
  to: string;
}

type Cell = string | number | Date | null | undefined;

const norm = (c: Cell) => String(c ?? "").replace(/\s/g, "");

function findCol(header: Cell[], names: string[]): number {
  for (const name of names) {
    const i = header.findIndex((h) => norm(h).includes(name));
    if (i >= 0) return i;
  }
  return -1;
}

export function parseAmount(c: Cell): number {
  if (typeof c === "number") return Math.round(c);
  const s = String(c ?? "").replace(/[,원\s]/g, "");
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export function parseDate(c: Cell): string | null {
  if (c instanceof Date && !isNaN(c.getTime())) {
    return `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, "0")}-${String(c.getDate()).padStart(2, "0")}`;
  }
  if (typeof c === "number" && c > 20000 && c < 80000) {
    // 엑셀 날짜 일련번호
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(c) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(c ?? "").trim();
  const m = s.match(/(\d{4})[-./]?\s?(\d{1,2})[-./]?\s?(\d{1,2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31) return null;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

// 시트를 2차원 배열로 받아 거래 줄로 바꾼다. 머리줄은 위에서 30줄 안에서 찾는다.
export function parseBankSheet(grid: Cell[][]): ParsedBank {
  let headerIdx = -1;
  let cols = { date: -1, payee: -1, out: -1, in: -1 };
  for (let i = 0; i < Math.min(grid.length, 30); i++) {
    const h = grid[i] ?? [];
    const c = {
      date: findCol(h, DATE_NAMES),
      payee: findCol(h, PAYEE_NAMES),
      out: findCol(h, OUT_NAMES),
      in: findCol(h, IN_NAMES),
    };
    if (c.date >= 0 && c.payee >= 0 && c.out >= 0 && c.in >= 0) {
      headerIdx = i;
      cols = c;
      break;
    }
  }
  if (headerIdx < 0) {
    throw new BankParseError("은행 거래내역 파일이 아닌 것 같아요. 날짜·내용·금액(출금/입금) 열을 찾지 못했어요.");
  }

  // "내용"이 비어 있으면 "적요"로 대신한다
  const fallbackPayee = findCol(grid[headerIdx], ["적요"]);

  const rows: BankRow[] = [];
  for (const r of grid.slice(headerIdx + 1)) {
    const date = parseDate(r?.[cols.date]);
    if (!date) continue; // 합계 줄·빈 줄
    const out = parseAmount(r[cols.out]);
    const inn = parseAmount(r[cols.in]);
    if (out === 0 && inn === 0) continue;
    let payee = String(r[cols.payee] ?? "").trim();
    if (!payee && fallbackPayee >= 0) payee = String(r[fallbackPayee] ?? "").trim();
    rows.push({ date, payee: payee || "(내용 없음)", out, in: inn });
  }
  if (rows.length === 0) {
    throw new BankParseError("거래 줄을 하나도 찾지 못했어요. 파일 안에 거래내역이 있는지 확인해 주세요.");
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return { rows, from: rows[0].date, to: rows[rows.length - 1].date };
}
