import { UNCLASSIFIED } from "./accounts";
import { parseCsv } from "./csv";
import type { Transaction } from "./types";

/**
 * 카드사 이용내역 CSV 파서.
 * 카드사마다 머리글 이름과 열 순서가 다르므로 위치를 고정하지 않고 이름으로 찾는다.
 * 필요한 건 날짜 / 가맹점명 / 금액 / 취소일 / 할부개월 / 승인번호 정도다.
 */

export type FieldKey =
  | "date"
  | "merchant"
  | "amount"
  | "cancelDate"
  | "months"
  | "approvalNo"
  | "usage"
  | "status"
  | "card";

/** 카드사별 머리글 표기. 왼쪽일수록 정확한 이름이다. */
const ALIASES: Record<FieldKey, string[]> = {
  date: ["승인일", "이용일", "이용일자", "거래일자", "거래일", "매출일자", "사용일자", "이용일시", "거래일시", "날짜"],
  merchant: ["가맹점명", "이용가맹점", "가맹점상호", "가맹점", "이용하신곳", "상호", "내용", "적요"],
  // 국내/해외 열이 같이 오는 카드사가 있어 국내를 먼저 둔다
  amount: ["국내이용금액", "승인금액", "이용금액", "이용하신금액", "거래금액", "청구금액", "결제금액", "합계금액", "금액"],
  cancelDate: ["취소일자", "취소일시", "취소일"],
  months: ["할부개월", "할부개월수", "할부기간", "개월", "할부"],
  approvalNo: ["승인번호", "거래번호", "승인no"],
  usage: ["결제방법", "이용구분", "할부구분", "거래구분", "결제구분"],
  status: ["승인구분", "거래상태", "승인상태", "매출구분", "상태"],
  card: ["카드번호", "카드종류", "카드명"],
};

/** 필수 3개가 없으면 카드 내역서로 보지 않는다 */
const REQUIRED: FieldKey[] = ["date", "merchant", "amount"];

export type FieldMap = Partial<Record<FieldKey, number>>;

const norm = (s: unknown) => String(s ?? "").replace(/[\s_()[\]]/g, "").toLowerCase();

/** 정확히 같으면 높은 점수, 포함이면 낮은 점수. 열 하나에 필드 하나만 붙인다. */
function scoreHeader(cellText: string, key: FieldKey): number {
  const v = norm(cellText);
  if (!v) return 0;
  const list = ALIASES[key];
  for (let i = 0; i < list.length; i++) {
    const alias = norm(list[i]);
    if (v === alias) return 1000 - i;
    if (v.includes(alias)) return 500 - i - (v.length - alias.length);
  }
  return 0;
}

export function mapHeader(row: string[]): FieldMap {
  const pairs: { key: FieldKey; col: number; score: number }[] = [];
  row.forEach((cellText, col) => {
    (Object.keys(ALIASES) as FieldKey[]).forEach((key) => {
      const score = scoreHeader(cellText, key);
      if (score > 0) pairs.push({ key, col, score });
    });
  });
  pairs.sort((a, b) => b.score - a.score);

  const map: FieldMap = {};
  const usedCols = new Set<number>();
  for (const p of pairs) {
    if (map[p.key] !== undefined || usedCols.has(p.col)) continue;
    map[p.key] = p.col;
    usedCols.add(p.col);
  }
  return map;
}

/** 안내문이 위에 몇 줄 붙는 카드사가 많아 앞부분을 훑어 머리글 줄을 찾는다. */
export function findHeader(rows: string[][]): { row: number; map: FieldMap } | null {
  for (let r = 0; r < Math.min(rows.length, 25); r++) {
    const map = mapHeader(rows[r] ?? []);
    if (REQUIRED.every((k) => map[k] !== undefined)) return { row: r, map };
  }
  return null;
}

/** "2026년 07월 31일", "2026.7.3", "20260703", "07/31" → YYYY-MM-DD */
export function cardDate(raw: string, fallbackYear?: number): string | null {
  const s = String(raw ?? "").trim();
  if (!s || s === "-") return null;

  let m = s.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!m) {
    const packed = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (packed) m = packed as RegExpMatchArray;
  }
  if (!m && fallbackYear) {
    const md = s.match(/^(\d{1,2})\D+(\d{1,2})$/);
    if (md) m = [s, String(fallbackYear), md[1], md[2]] as unknown as RegExpMatchArray;
  }
  if (!m) return null;

  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${m[1]}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** 엑셀이 열 너비 때문에 숫자를 ###### 로 내보낸 칸 */
export const isUnreadableAmount = (raw: string): boolean => /^#+$/.test(String(raw ?? "").trim());

/** "116,000", "₩1,234", "(1,234)" → 정수 */
export function cardAmount(raw: string): number {
  let s = String(raw ?? "").trim();
  if (!s || s === "-") return 0;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (s.trim().startsWith("-")) neg = true;
  const digits = s.replace(/[^\d]/g, "");
  if (!digits) return 0;
  const n = Number(digits);
  return neg ? -n : n;
}

export interface CardRow {
  id: string;
  date: string | null;
  merchant: string;
  amount: number;
  cancelDate: string | null;
  months: number;
  approvalNo: string;
  cancelled: boolean;
  installment: boolean;
  /** 엑셀이 열 너비 때문에 ###### 로 내보낸 칸 — 금액을 읽지 못했다 */
  unreadableAmount: boolean;
  tags: string[];
}

/** 파일 맨 아래 카드사가 붙인 집계 줄 */
export interface SummaryRow {
  label: string;
  count: number | null;
  amount: number;
}

export interface Reconciliation {
  fileCount: number | null;
  fileAmount: number | null;
  /** 취소 포함 — 파일 건수와 같은 기준 */
  approvedCount: number;
  /** 취소 제외 */
  parsedCount: number;
  parsedAmount: number;
  diffCount: number | null;
  diffAmount: number | null;
  matched: boolean;
  partsAmount: number | null;
  cancelledAmount: number;
}

export interface CardParseResult {
  headerRow: number;
  map: FieldMap;
  month: string | null;
  rows: CardRow[];
  valid: CardRow[];
  cancelled: CardRow[];
  installments: CardRow[];
  summaries: SummaryRow[];
  /** 파일 위쪽 요약 블록 */
  fileSummary: FileSummary[];
  recon: Reconciliation | null;
  undated: number;
  /** 금액을 읽지 못한 건 (###### 등) */
  unreadable: CardRow[];
  warnings: string[];
}

export class NoHeaderError extends Error {
  head: string[][];
  constructor(head: string[][]) {
    super("머리글을 찾지 못했습니다.");
    this.name = "NoHeaderError";
    this.head = head;
  }
}

/** 앞부분을 보여줘 열을 직접 고르게 한다 */
export const previewCsv = (text: string, rows = 10): string[][] => parseCsv(text).slice(0, rows);

const SUMMARY_WORD = /(소계|합계|총계|누계)/;
const PAIR = /^([\d,]+(?:\.\d+)?)\s*\/\s*([\d,]+(?:\.\d+)?)$/;
const num = (s: string) => Number(String(s).replace(/,/g, "")) || 0;

export interface FileSummary {
  /** '건' 또는 '금액' */
  kind: "건" | "금액";
  /** 국내 / 해외 */
  region: string;
  normal: number;
  cancelled: number;
}

/**
 * 카드사가 파일 위쪽에 붙이는 요약 블록.
 * 국민카드는 '정상/취소 (건) | 국내 | 50 / 0' 꼴로 내려준다.
 * 라벨 칸의 열 위치를 기억해 아래 줄의 값에도 이어 붙인다.
 */
export function readFileSummary(rows: string[][], headerRow: number): FileSummary[] {
  const kindByCol = new Map<number, "건" | "금액">();
  const out: FileSummary[] = [];

  for (let r = 0; r < headerRow; r++) {
    const row = rows[r] ?? [];
    row.forEach((raw, col) => {
      const v = String(raw ?? "").replace(/\s/g, "");
      if (!v) return;
      if (/정상.?\/.?취소/.test(v) || SUMMARY_WORD.test(v)) {
        if (v.includes("건")) kindByCol.set(col, "건");
        else if (v.includes("금액") || v.includes("원")) kindByCol.set(col, "금액");
      }
    });
  }
  if (!kindByCol.size) return out;

  const labelCols = [...kindByCol.keys()].sort((a, b) => a - b);
  const kindFor = (col: number) => {
    let best: "건" | "금액" | null = null;
    for (const c of labelCols) if (c <= col) best = kindByCol.get(c)!;
    return best;
  };

  for (let r = 0; r < headerRow; r++) {
    const row = rows[r] ?? [];
    row.forEach((raw, col) => {
      const v = String(raw ?? "").trim();
      const m = v.match(PAIR);
      if (!m) return;
      const kind = kindFor(col);
      if (!kind) return;
      out.push({
        kind,
        region: String(row[col - 1] ?? "").trim() || "전체",
        normal: num(m[1]),
        cancelled: num(m[2]),
      });
    });
  }
  return out;
}

export function parseCardCsv(
  text: string,
  opts: { manual?: { headerRow: number; map: FieldMap } } = {}
): CardParseResult {
  const all = parseCsv(text);
  const header = opts.manual
    ? { row: opts.manual.headerRow, map: opts.manual.map }
    : findHeader(all);
  if (!header) throw new NoHeaderError(all.slice(0, 10));

  const { map } = header;
  const at = (r: string[], k: FieldKey) => (map[k] !== undefined ? (r[map[k]!] ?? "").trim() : "");

  const rows: CardRow[] = [];
  const summaries: SummaryRow[] = [];
  const warnings: string[] = [];
  const seen = new Map<string, number>();
  let skipped = 0;

  for (const r of all.slice(header.row + 1)) {
    if (!r || r.every((c) => !String(c).trim())) continue;

    const merchant = at(r, "merchant");
    const rawAmount = at(r, "amount");
    const unreadableAmount = isUnreadableAmount(rawAmount);
    const amount = unreadableAmount ? 0 : cardAmount(rawAmount);
    const date = cardDate(at(r, "date"));

    // 카드사가 붙인 집계 줄은 거래가 아니다. 버리지 않고 대조에 쓴다.
    if (!date && SUMMARY_WORD.test(merchant)) {
      const m = merchant.match(/(\d+)\s*건/);
      summaries.push({ label: merchant, count: m ? Number(m[1]) : null, amount });
      continue;
    }
    if (!merchant && !amount && !unreadableAmount) {
      skipped++;
      continue;
    }

    const cancelRaw = at(r, "cancelDate");
    const cancelDate = cardDate(cancelRaw);
    const status = at(r, "status");
    const usage = at(r, "usage");
    // 할부 개월은 전용 열에 오기도 하고 "부분무이자10"처럼 결제방법에 묻어 오기도 한다
    const monthsCol = Number(at(r, "months").replace(/[^\d]/g, "")) || 0;
    const monthsInUsage = Number(usage.match(/(\d+)\s*(?:개월)?\s*$/)?.[1] ?? 0) || 0;
    const installmentWord = /할부|무이자/.test(usage);
    const months = monthsCol || (installmentWord ? monthsInUsage : 0);
    const approvalNo = at(r, "approvalNo");

    // 취소는 승인구분에 적히거나 취소일이 채워지거나 금액이 음수로 온다
    const cancelled = /취소/.test(status) || cancelDate !== null || amount < 0;
    const installment = months > 1 || installmentWord;

    const tags: string[] = [installment ? "할부" : usage || "일시불"];
    if (cancelled) tags.push("취소");

    const base = approvalNo
      ? `card:${date ?? "?"}:${approvalNo}`
      : `card:${date ?? "?"}:${amount}:${merchant}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);

    rows.push({
      id: n === 0 ? base : `${base}#${n}`,
      date,
      merchant,
      amount,
      cancelDate,
      months,
      approvalNo,
      cancelled,
      installment,
      unreadableAmount,
      tags,
    });
  }

  if (skipped) warnings.push(`가맹점·금액이 비어 있는 ${skipped}행은 건너뛰었습니다.`);

  const unreadable = rows.filter((r) => r.unreadableAmount);
  if (unreadable.length) {
    warnings.push(
      `금액이 ###### 로 깨져 있는 건이 ${unreadable.length}건 있습니다. 엑셀에서 열 너비를 넓혀 다시 내보내 주세요.`
    );
  }

  const undated = rows.filter((r) => !r.date).length;
  if (undated) warnings.push(`날짜를 읽지 못한 건이 ${undated}건 있습니다. 열 지정을 확인해 주세요.`);

  const valid = rows.filter((r) => !r.cancelled);
  const cancelled = rows.filter((r) => r.cancelled);
  const installments = valid.filter((r) => r.installment);

  const monthCount = new Map<string, number>();
  for (const r of rows) {
    if (!r.date) continue;
    const k = r.date.slice(0, 7);
    monthCount.set(k, (monthCount.get(k) ?? 0) + 1);
  }
  const month = [...monthCount].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  if (monthCount.size > 1) {
    warnings.push(`여러 달이 섞여 있습니다 (${[...monthCount.keys()].sort().join(", ")}).`);
  }

  // 파일이 스스로 검산하게 한다. 정답을 코드에 박지 않는다.
  const fileSummary = readFileSummary(all, header.row);
  const parsedAmount = valid.reduce((a, b) => a + b.amount, 0);
  let recon: Reconciliation | null = null;

  if (summaries.length) {
    // 파일 아래쪽 소계 — 현대카드 꼴
    const total = summaries.find((s) => /(총|전체)/.test(s.label)) ?? summaries[summaries.length - 1];
    const parts = summaries.filter((s) => s !== total);
    recon = {
      fileCount: total.count,
      fileAmount: total.amount,
      approvedCount: rows.length,
      parsedCount: valid.length,
      parsedAmount,
      diffCount: total.count != null ? rows.length - total.count : null,
      diffAmount: parsedAmount - total.amount,
      matched: parsedAmount === total.amount && (total.count == null || rows.length === total.count),
      partsAmount: parts.length ? parts.reduce((a, b) => a + b.amount, 0) : null,
      cancelledAmount: cancelled.reduce((a, b) => a + b.amount, 0),
    };
  } else if (fileSummary.length) {
    // 파일 위쪽 요약 — 국민카드 꼴. 해외는 통화가 달라 금액에 더하지 않는다
    const counts = fileSummary.filter((f) => f.kind === "건");
    const amounts = fileSummary.filter((f) => f.kind === "금액" && !/해외/.test(f.region));
    const fileCount = counts.length ? counts.reduce((a, b) => a + b.normal + b.cancelled, 0) : null;
    const fileAmount = amounts.length ? amounts.reduce((a, b) => a + b.normal, 0) : null;
    const foreign = fileSummary.find((f) => f.kind === "금액" && /해외/.test(f.region));
    if (foreign && foreign.normal > 0) {
      warnings.push(`해외 이용분 ${foreign.normal}(외화)은 대조에서 뺐습니다.`);
    }
    if (fileAmount != null) {
      recon = {
        fileCount,
        fileAmount,
        approvedCount: rows.length,
        parsedCount: valid.length,
        parsedAmount,
        diffCount: fileCount != null ? rows.length - fileCount : null,
        diffAmount: parsedAmount - fileAmount,
        matched: parsedAmount === fileAmount && (fileCount == null || rows.length === fileCount),
        partsAmount: null,
        cancelledAmount: cancelled.reduce((a, b) => a + b.amount, 0),
      };
    }
  }

  return {
    headerRow: header.row + 1,
    map,
    month,
    rows,
    valid,
    cancelled,
    installments,
    summaries,
    fileSummary,
    recon,
    undated,
    unreadable,
    warnings,
  };
}

/**
 * 거래로 옮긴다. 계정 분류는 다음 단계이므로 전부 미분류로 둔다.
 * 취소 건은 지출 집계에서 빠지므로 넣지 않는다.
 */
export function toTransactions(result: CardParseResult, month: string, card: string): Transaction[] {
  return result.valid.map((r) => ({
    id: r.id,
    date: r.date,
    month,
    account: UNCLASSIFIED,
    sub: null,
    merchant: r.merchant,
    amount: r.amount,
    source: "card" as const,
    group: "unclassified" as const,
    behavior: null,
    needsReview: false,
    reviewReason: null,
    autoMapped: false,
    split: null,
    note: null,
    flagged: false,
    tags: [card, ...r.tags],
  }));
}

export type FileFormat = "card" | "ledger" | "unknown";

export function detectFormat(text: string): FileFormat {
  const head = text.slice(0, 20000);
  if (head.includes("변동지출내역") || /날짜,대분류,소분류/.test(head)) return "ledger";
  try {
    return findHeader(parseCsv(text)) ? "card" : "unknown";
  } catch {
    return "unknown";
  }
}
