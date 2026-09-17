import { REVENUE_CHANNELS } from "./accounts";
import { parseAmount, parseCsv, parseDate } from "./csv";
import { classify } from "./classify";
import { assignIds } from "./dedupe";
import { defaultRules, type MapRule } from "./rules";
import { parseSplit } from "./split";
import type { RevenueLine, Transaction, TxSource } from "./types";

/**
 * 기존 구글시트 가계부(월별 탭) CSV 파서.
 * 시트는 한 장에 블록 여러 개가 좌우로 흩어져 있으므로 열 위치를 고정하지 않고
 * '날짜 / 대분류 / 소분류' 머리글을 찾아 블록을 잡는다.
 */

export interface SheetTotal {
  label: string;
  amount: number;
  /** 시트 원본 행번호 (1-based) — 중복 라벨을 구분하기 위해 남긴다 */
  row: number;
}

export interface LedgerParseResult {
  month: string;
  transactions: Transaction[];
  revenue: RevenueLine[];
  /** 시트가 스스로 적어둔 소계·합계 — 대조용 */
  sheetTotals: SheetTotal[];
  warnings: string[];
  blocks: { kind: string; headerRow: number; col: number; rows: number }[];
}

const CHANNELS: Record<string, { account: string; channel: string }> = Object.fromEntries(
  REVENUE_CHANNELS.map((c) => [c.sheetLabel, { account: c.account, channel: c.channel }])
);

const cell = (rows: string[][], r: number, c: number) => (rows[r]?.[c] ?? "").trim();

/** "2026.7", "2026년 7월", "2026-07" → "2026-07" */
export function detectMonth(rows: string[][]): string | null {
  for (let r = 0; r < Math.min(rows.length, 5); r++) {
    for (const raw of rows[r] ?? []) {
      const s = String(raw).trim();
      const m = s.match(/^(\d{4})\s*[.\-년]\s*(\d{1,2})\s*월?\.?$/);
      if (m) return `${m[1]}-${String(+m[2]).padStart(2, "0")}`;
    }
  }
  return null;
}

interface Block {
  kind: "fixed" | "variable" | "income";
  headerRow: number;
  col: number;
  label: string;
}

/** '날짜/대분류/소분류' 머리글을 전수 탐색해 블록 위치를 찾는다. */
function findBlocks(rows: string[][]): Block[] {
  const found: Block[] = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      if (
        (row[c] ?? "").trim() !== "날짜" ||
        (row[c + 1] ?? "").trim() !== "대분류" ||
        (row[c + 2] ?? "").trim() !== "소분류"
      )
        continue;
      const amountHeader = (row[c + 4] ?? "").trim();
      // 머리글 바로 위에 블록 이름이 있다 (고정비내역 / 변동지출내역 / 수입내역)
      const label = (rows[r - 1]?.[c] ?? "").trim() || (rows[r]?.[0] ?? "").trim();
      let kind: Block["kind"];
      if (amountHeader === "입금액" || label.includes("수입")) kind = "income";
      else if (label.includes("고정")) kind = "fixed";
      else kind = "variable";
      found.push({ kind, headerRow: r, col: c, label: label || kind });
    }
  }
  return found;
}

interface RawRow {
  date: string;
  major: string;
  minor: string;
  desc: string;
  amount: number | null;
}

/** 머리글 아래로 읽어내려가다 빈 줄이 2번 연속되면 블록이 끝난 것으로 본다. */
function readBlock(rows: string[][], b: Block): RawRow[] {
  const out: RawRow[] = [];
  let blanks = 0;
  for (let r = b.headerRow + 1; r < rows.length; r++) {
    const date = cell(rows, r, b.col);
    const major = cell(rows, r, b.col + 1);
    const minor = cell(rows, r, b.col + 2);
    const desc = cell(rows, r, b.col + 3);
    const amount = parseAmount(cell(rows, r, b.col + 4));
    const hasData = amount !== null || major || minor || desc;
    if (!hasData) {
      if (++blanks >= 2) break;
      continue;
    }
    blanks = 0;
    out.push({ date, major, minor, desc, amount });
  }
  return out;
}

function readRevenue(rows: string[][]): { lines: RevenueLine[]; warnings: string[] } {
  const lines: RevenueLine[] = [];
  const warnings: string[] = [];
  let start = -1;
  for (let r = 0; r < rows.length && start < 0; r++) {
    if ((rows[r] ?? []).some((v) => (v ?? "").trim().startsWith("매출(A)"))) start = r;
  }
  if (start < 0) {
    warnings.push("매출 블록('매출(A)')을 찾지 못했습니다.");
    return { lines, warnings };
  }
  for (let r = start; r < Math.min(rows.length, start + 20); r++) {
    const item = cell(rows, r, 2);
    if (!item) continue;
    if (item.includes("합계") || item.includes("소계")) break;
    const ch = CHANNELS[item];
    if (!ch) continue;
    const deposit = parseAmount(cell(rows, r, 4)) ?? 0;
    const gross = parseAmount(cell(rows, r, 5)) ?? 0;
    if (gross === 0 && deposit === 0) continue;
    lines.push({ account: ch.account, channel: ch.channel, gross, deposit });
    if (deposit > gross) {
      warnings.push(`${ch.channel}: 입금액(${deposit.toLocaleString()})이 매출액(${gross.toLocaleString()})보다 큽니다.`);
    }
  }
  return { lines, warnings };
}

function readSheetTotals(rows: string[][]): SheetTotal[] {
  const out: SheetTotal[] = [];
  const wanted = /(소계|합계|영업이익|총매출액)/;
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c <= 3; c++) {
      const label = cell(rows, r, c);
      if (!label || !wanted.test(label)) continue;
      const amount = parseAmount(cell(rows, r, 4));
      if (amount === null) continue;
      out.push({ label, amount, row: r + 1 });
      break;
    }
  }
  return out;
}

export function parseLedgerCsv(
  text: string,
  opts: { rules?: MapRule[]; month?: string } = {}
): LedgerParseResult {
  const rows = parseCsv(text);
  const rules = opts.rules ?? defaultRules();
  const month = opts.month ?? detectMonth(rows);
  const warnings: string[] = [];
  if (!month) throw new Error("시트에서 귀속월을 찾지 못했습니다. (예: A1 셀 '2026.7')");

  const blocks = findBlocks(rows);
  if (!blocks.length) warnings.push("'날짜/대분류/소분류' 머리글을 찾지 못했습니다.");

  const staged: Omit<Transaction, "id">[] = [];
  const blockInfo: LedgerParseResult["blocks"] = [];

  for (const b of blocks) {
    const raw = readBlock(rows, b);
    let used = 0;

    for (const row of raw) {
      if (row.amount === null || row.amount === 0) continue;

      if (b.kind === "income") {
        // 수입내역 = 환급금·보험금 등 기타수입(§4-1, 손익 제외).
        // 계좌이체는 매출-기타로 이미 잡히므로 여기서 빼 중복을 막는다.
        const desc = row.desc || row.minor || row.major;
        if (desc.includes("계좌이체")) continue;
        staged.push({
          date: parseDate(row.date, month),
          month,
          account: "기타수입",
          sub: null,
          merchant: desc,
          amount: row.amount,
          source: "ledger-income" as TxSource,
          group: "excluded",
          behavior: null,
          needsReview: false,
          reviewReason: null,
          autoMapped: false,
        });
        used++;
        continue;
      }

      const rawMerchant = row.desc || row.minor || row.major;
      // 지출내용에 손으로 적어둔 "( 2/12 )"와 물음표를 필드로 옮긴다
      const sp = parseSplit(rawMerchant, row.major, row.minor);
      const merchant = sp.cleaned;
      const c = classify({ merchant, rawAccount: row.major, rawSub: row.minor }, rules);
      staged.push({
        date: parseDate(row.date, month),
        month,
        account: c.account,
        sub: c.sub,
        merchant,
        amount: row.amount,
        source: (b.kind === "fixed" ? "ledger-fixed" : "ledger-variable") as TxSource,
        group: c.group,
        behavior: c.behavior,
        needsReview: c.needsReview,
        reviewReason: c.reviewReason,
        autoMapped: c.autoMapped,
        rawAccount: row.major || undefined,
        normalizedNote: c.normalizedNote,
        split: sp.split,
        note: sp.note,
        flagged: sp.flagged,
      });
      used++;
    }
    blockInfo.push({ kind: b.label || b.kind, headerRow: b.headerRow + 1, col: b.col, rows: used });
  }

  const rev = readRevenue(rows);
  warnings.push(...rev.warnings);

  const dated = staged.filter((t) => t.date).length;
  if (staged.length && dated / staged.length < 0.5) {
    warnings.push(
      `날짜가 있는 건이 ${staged.length}건 중 ${dated}건뿐입니다. 월 귀속은 시트 기준(${month})으로 처리했습니다.`
    );
  }

  return {
    month,
    transactions: assignIds(staged) as Transaction[],
    revenue: rev.lines,
    sheetTotals: readSheetTotals(rows),
    warnings,
    blocks: blockInfo,
  };
}
