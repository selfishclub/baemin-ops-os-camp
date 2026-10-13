import { parseAmount, parseCsv } from "./csv";
import type { Transaction } from "./types";
import { UNCLASSIFIED } from "./accounts";

/**
 * 통장(입출금) 거래내역 해석기.
 *
 * 카드 내역서와 열 구조가 아예 다르다 —
 *   카드 : 승인일 · 가맹점명 · 승인금액 · 할부 · 승인번호
 *   통장 : 거래일시 · 적요 · 보낸분/받는분 · 송금메모 · 출금액 · 입금액
 *
 * 특히 '적요'는 거래처가 아니라 돈이 오간 방식(전자금융·스마트출금·지로출금)이다.
 * 적요를 가맹점명으로 읽으면 절반 이상이 "전자금융"으로만 보인다.
 * 거래처는 '보낸분/받는분'에 있고, '송금메모'에 사장님이 적어둔 단서가 있다.
 */

export type BankField = "datetime" | "memo" | "counterparty" | "note" | "out" | "in" | "balance";

const ALIASES: Record<BankField, string[]> = {
  datetime: ["거래일시", "거래일자", "거래일", "일자", "날짜"],
  memo: ["적요", "거래구분", "구분", "내용"],
  counterparty: ["보낸분/받는분", "보낸분", "받는분", "거래처", "상대방", "입금자", "의뢰인"],
  note: ["송금메모", "메모", "비고", "적요내용"],
  out: ["출금액", "출금", "지급액", "출금금액", "맡기신금액"],
  in: ["입금액", "입금", "입금금액", "찾으신금액"],
  balance: ["잔액", "거래후잔액"],
};

const norm = (s: string) => s.replace(/\s|[()[\]/]/g, "").toLowerCase();

export type BankMap = Partial<Record<BankField, number>>;

/** 머리글 이름으로 찾는다. 열 위치를 고정하지 않는다 — 은행마다 순서가 다르다. */
export function findBankHeader(rows: string[][]): { row: number; map: BankMap } | null {
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const cells = rows[r].map(norm);
    const map: BankMap = {};
    const taken = new Set<number>();
    for (const [field, list] of Object.entries(ALIASES) as [BankField, string[]][]) {
      let best = -1;
      let score = 0;
      for (let c = 0; c < cells.length; c++) {
        if (taken.has(c) || !cells[c]) continue;
        for (let i = 0; i < list.length; i++) {
          const a = norm(list[i]);
          const s = cells[c] === a ? 1000 - i : cells[c].includes(a) ? 500 - i : 0;
          if (s > score) {
            score = s;
            best = c;
          }
        }
      }
      if (best >= 0) {
        map[field] = best;
        taken.add(best);
      }
    }
    // 통장이라면 날짜와 출금/입금 두 칸이 반드시 있다
    if (map.datetime !== undefined && map.out !== undefined && map.in !== undefined) {
      return { row: r, map };
    }
  }
  return null;
}

export interface BankRow {
  id: string;
  /** YYYY-MM-DD */
  date: string | null;
  /** HH:MM:SS — 같은 날 순서를 지킬 때 쓴다 */
  time: string | null;
  /** 적요 — 돈이 오간 방식 */
  memo: string;
  /** 거래처 원문. 어떤 경우에도 가공하지 않는다 */
  counterparty: string;
  /** 송금메모 — 사장님이 직접 적어둔 단서 */
  note: string;
  /** 출금이면 양수 */
  out: number;
  /** 입금이면 양수 */
  in: number;
}

export interface BankParseResult {
  rows: BankRow[];
  month: string | null;
  account: string | null;
  headerRow: number;
  map: BankMap;
  /** 파일이 스스로 적어둔 합계 — 우리 집계와 맞춰 본다 */
  stated: { out: number | null; in: number | null };
  sum: { out: number; in: number };
  recon: { outGap: number; inGap: number } | null;
  /** 거래가 한 건도 없는 날 — 받다 만 파일인지 알려 준다 */
  missingDays: string[];
  warnings: string[];
}

const DATE_RE = /(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/;
const TIME_RE = /(\d{1,2}):(\d{2})(?::(\d{2}))?/;

const daysIn = (y: number, m: number) => new Date(y, m, 0).getDate();

export function parseBankCsv(text: string, opts: { source?: string } = {}): BankParseResult {
  const all = parseCsv(text);
  const found = findBankHeader(all);
  const warnings: string[] = [];
  if (!found) {
    return {
      rows: [], month: null, account: null, headerRow: -1, map: {},
      stated: { out: null, in: null }, sum: { out: 0, in: 0 }, recon: null,
      missingDays: [], warnings: ["통장 거래내역의 머리글(거래일시·출금액·입금액)을 찾지 못했습니다."],
    };
  }
  const { row: headerRow, map } = found;
  const at = (r: string[], f: BankField) => (map[f] !== undefined ? (r[map[f]!] ?? "").trim() : "");

  // 머리글 위쪽에서 계좌번호를 찾아 둔다 — 화면에는 끝 4자리만 쓴다
  let account: string | null = null;
  for (let r = 0; r < headerRow; r++) {
    const line = all[r].join(" ");
    const m = line.match(/(\d{4,6}-\d{2}-\d{4,6}|\d{10,16})/);
    if (m && /계좌/.test(line)) account = m[1];
  }

  const rows: BankRow[] = [];
  let stOut: number | null = null;
  let stIn: number | null = null;
  let seq = 0;

  for (let r = headerRow + 1; r < all.length; r++) {
    const raw = all[r];
    if (!raw || raw.every((c) => !c.trim())) continue;
    const dRaw = at(raw, "datetime");
    const out = parseAmount(at(raw, "out")) ?? 0;
    const inn = parseAmount(at(raw, "in")) ?? 0;

    // 날짜 칸이 비어 있으면 거래가 아니라 합계 행이다. 버리지 않고 대조에 쓴다.
    if (!DATE_RE.test(dRaw)) {
      const label = raw.join(" ");
      if (/합계|총계|소계/.test(label) && (out || inn)) {
        stOut = out || stOut;
        stIn = inn || stIn;
      }
      continue;
    }

    const dm = dRaw.match(DATE_RE)!;
    const date = `${dm[1]}-${dm[2].padStart(2, "0")}-${dm[3].padStart(2, "0")}`;
    const tm = dRaw.match(TIME_RE);
    const time = tm ? `${tm[1].padStart(2, "0")}:${tm[2]}:${tm[3] ?? "00"}` : null;

    if (out === 0 && inn === 0) {
      warnings.push(`${date} ${at(raw, "counterparty") || at(raw, "memo")} — 출금·입금이 모두 비어 있어 건너뜁니다.`);
      continue;
    }

    rows.push({
      id: `bank:${opts.source ?? "통장"}:${date}:${time ?? seq}:${out || inn}:${seq++}`,
      date,
      time,
      memo: at(raw, "memo"),
      counterparty: at(raw, "counterparty"),
      note: at(raw, "note"),
      out,
      in: inn,
    });
  }

  const sum = {
    out: rows.reduce((a, b) => a + b.out, 0),
    in: rows.reduce((a, b) => a + b.in, 0),
  };
  const recon =
    stOut !== null || stIn !== null
      ? { outGap: (stOut ?? sum.out) - sum.out, inGap: (stIn ?? sum.in) - sum.in }
      : null;

  // 귀속월 — 가장 많이 나온 달
  const tally = new Map<string, number>();
  for (const r of rows) {
    const k = r.date!.slice(0, 7);
    tally.set(k, (tally.get(k) ?? 0) + 1);
  }
  const month = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // 받다 만 파일인지 — 거래가 한 건도 없는 날을 알려 준다
  const missingDays: string[] = [];
  if (month) {
    const [y, mo] = month.split("-").map(Number);
    const have = new Set(rows.map((r) => r.date));
    for (let d = 1; d <= daysIn(y, mo); d++) {
      const k = `${month}-${String(d).padStart(2, "0")}`;
      if (!have.has(k)) missingDays.push(k);
    }
  }

  if (recon && recon.inGap !== 0) {
    warnings.push(
      `입금 합계가 파일에 적힌 값과 ${Math.abs(recon.inGap).toLocaleString("ko-KR")}원 다릅니다. 거래가 빠졌을 수 있습니다.`
    );
  }
  if (recon && recon.outGap !== 0) {
    warnings.push(
      `출금 합계가 파일에 적힌 값과 ${Math.abs(recon.outGap).toLocaleString("ko-KR")}원 다릅니다.`
    );
  }

  return { rows, month, account, headerRow, map, stated: { out: stOut, in: stIn }, sum, recon, missingDays, warnings };
}

/** 통장인지 카드인지 가린다 — 출금/입금 두 칸이 있으면 통장이다 */
export function looksLikeBank(text: string): boolean {
  try {
    return !!findBankHeader(parseCsv(text.slice(0, 20000)));
  } catch {
    return false;
  }
}

/* ── 손익이 아닌 돈 ───────────────────────────────────────
   통장에는 '돈이 움직였지만 손익은 아닌' 거래가 섞여 있다.
   그대로 비용으로 잡으면 손익이 통째로 망가진다. */

/** 카드 결제대금 — 카드 내역서에서 이미 건별로 잡은 것의 결제다. 또 세면 두 번 센다. */
const CARD_BILL = /(카드대금|카드출금|카드결제|카드\s*청구)/;

export const isCardBill = (r: BankRow) => CARD_BILL.test(`${r.counterparty} ${r.memo} ${r.note}`);

/**
 * 같은 날 금액이 거의 같은 입금↔출금 쌍 — 대출 받아 바로 옮긴 것 같은 이동.
 *
 * 기준을 헐겁게 잡으면 상관없는 거래가 짝으로 묶인다.
 * 실제로 1,000원 차이까지 허용했더니 보험료 33,341원과 쿠팡 정산 32,886원이 묶였다.
 * 그래서 두 가지를 모두 만족할 때만 쌍으로 본다 —
 *   (1) 금액이 충분히 클 것 (잔돈끼리 우연히 맞는 일을 막는다)
 *   (2) 차이가 금액에 비해 아주 작을 것
 */
const PAIR_MIN = 1_000_000;

export function findTransferPairs(rows: BankRow[]): Set<string> {
  const paired = new Set<string>();
  const byDate = new Map<string, BankRow[]>();
  for (const r of rows) {
    const k = r.date ?? "";
    const list = byDate.get(k);
    if (list) list.push(r);
    else byDate.set(k, [r]);
  }
  for (const list of byDate.values()) {
    const ins = list.filter((r) => r.in > 0);
    const outs = list.filter((r) => r.out > 0);
    for (const i of ins) {
      if (paired.has(i.id) || i.in < PAIR_MIN) continue;
      const tol = Math.max(1000, i.in * 0.001);
      const m = outs.find(
        (o) => !paired.has(o.id) && o.out >= PAIR_MIN && Math.abs(o.out - i.in) <= tol
      );
      if (m) {
        paired.add(i.id);
        paired.add(m.id);
      }
    }
  }
  return paired;
}

export interface BankToTxOptions {
  month: string;
  source: string;
  /** 카드 결제대금을 손익에서 빼는가 */
  excludeCardBills?: boolean;
  /** 같은 날 맞물린 입출금 쌍을 손익에서 빼는가 */
  excludeTransfers?: boolean;
}

export interface BankSplit {
  /** 지출로 볼 거래 */
  expenses: Transaction[];
  /** 매출 입금으로 볼 거래 */
  deposits: BankRow[];
  /** 손익에서 뺀 것 — 목록에는 남긴다 */
  excluded: { row: BankRow; why: string }[];
}

export function splitBankRows(rows: BankRow[], opts: BankToTxOptions): BankSplit {
  const pairs = opts.excludeTransfers === false ? new Set<string>() : findTransferPairs(rows);
  const expenses: Transaction[] = [];
  const deposits: BankRow[] = [];
  const excluded: { row: BankRow; why: string }[] = [];

  for (const r of rows) {
    if (opts.excludeCardBills !== false && isCardBill(r)) {
      excluded.push({ row: r, why: "카드 결제대금 — 카드 내역서에서 이미 잡힌 건입니다" });
      continue;
    }
    if (pairs.has(r.id)) {
      excluded.push({ row: r, why: "같은 날 맞물린 입출금 — 계좌 사이 이동으로 보입니다" });
      continue;
    }
    if (r.in > 0) {
      deposits.push(r);
      continue;
    }
    expenses.push({
      id: r.id,
      date: r.date,
      month: opts.month,
      account: UNCLASSIFIED,
      sub: null,
      // 거래처 원문이 먼저. 비어 있을 때만 적요로 떨어진다.
      merchant: r.counterparty || r.memo || "(내용 없음)",
      amount: r.out,
      source: "card" as const,
      group: "unclassified" as const,
      behavior: null,
      needsReview: false,
      reviewReason: null,
      autoMapped: false,
      split: null,
      note: r.note || null,
      flagged: false,
      tags: [opts.source, r.memo].filter(Boolean),
    });
  }
  return { expenses, deposits, excluded };
}
