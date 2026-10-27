// 복식장부 3단계 (2026-10-27) — 시작 잔액·감가상각·재무상태표
//  - 시작 잔액: 시작 달 1일의 자산·부채. 오래 가는 것(보증금·비품·대출)은 세무사님 2025년 재무상태표에서,
//    통장·외상처럼 매일 바뀌는 것은 사장님이 그날 숫자로 적는다. 자본금 = 자산 − 부채
//  - 재무상태표 = 시작 잔액 + 시작 달부터 이 달까지 분개를 모두 더한 것
import { ACCRUED, ACC_DEPRECIATION, BANK, CAPITAL, CASH, DEPOSIT, DRAW, EQUIPMENT, LOAN, PAYABLE, VAT_OUT, accountType, journalProfit, trialBalance, type JournalEntry, type JournalLine } from "./journal";
import type { Month } from "./types";

export const BOOKS_OPENING_KEY = "books_opening_v1";
export const RECEIVABLE = "미수금";

export interface BooksOpening {
  start: Month; // 이 달 1일 잔액에서 시작
  balances: Record<string, number>; // 계정 → 금액 (자산·부채 모두 양수로 적는다)
  monthlyDepreciation: number; // 비품 감가상각 한 달 몫
}

// 비품 11,980,000원을 5년 정액으로 — 세무사님 상각 방법은 확인 필요 (2025년 상각 1,874,870원)
export const DEFAULT_MONTHLY_DEPRECIATION = Math.round(11_980_000 / 5 / 12);

// 2025-12-31 재무상태표 + 2026년 1~8월 감가상각(어림 8달)
export const DEFAULT_OPENING: BooksOpening = {
  start: "2026-09",
  balances: { [DEPOSIT]: 40_000_000, [EQUIPMENT]: 11_980_000, [ACC_DEPRECIATION]: 1_874_870 + DEFAULT_MONTHLY_DEPRECIATION * 8, [LOAN]: 17_964_541 },
  monthlyDepreciation: DEFAULT_MONTHLY_DEPRECIATION,
};

export const OPENING_FIELDS: { account: string; label: string; hint: string }[] = [
  { account: BANK, label: "통장 (보통예금)", hint: "시작 달 1일 아침 통장 앱 잔액" },
  { account: CASH, label: "현금 (금고)", hint: "그날 금고 현금" },
  { account: RECEIVABLE, label: "들어올 카드·배달 매출 (미수금)", hint: "지난달 말 매출 중 시작 달에 입금된 돈" },
  { account: DEPOSIT, label: "임차보증금", hint: "2025년 재무상태표 40,000,000" },
  { account: EQUIPMENT, label: "비품", hint: "2025년 재무상태표 11,980,000" },
  { account: ACC_DEPRECIATION, label: "감가상각누계액", hint: "2025년 말 1,874,870 + 올해 1~8월 몫 (확인 필요)" },
  { account: PAYABLE, label: "외상매입금 (재료 외상)", hint: "시작 달 1일에 남은 재료 외상" },
  { account: ACCRUED, label: "미지급비용", hint: "지난달 급여·고지서 중 시작 달에 나간 돈" },
  { account: VAT_OUT, label: "부가세예수금", hint: "아직 안 낸 부가세 (지난 신고 뒤 쌓인 몫)" },
  { account: LOAN, label: "장기차입금 (대출)", hint: "2025년 말 17,964,541 — 올해 갚은 원금만큼 빼기 (확인 필요)" },
];

/** 시작 잔액을 분개 한 건으로 — 자산은 차변, 부채·감가상각누계액은 대변, 차이는 자본금 */
export function openingEntry(o: BooksOpening): JournalEntry {
  const lines: JournalLine[] = [];
  let net = 0;
  for (const [account, raw] of Object.entries(o.balances)) {
    const n = Math.round(raw);
    if (!n) continue;
    const credit = account === ACC_DEPRECIATION || accountType(account) === "부채";
    lines.push(credit ? { account, debit: 0, credit: n } : { account, debit: n, credit: 0 });
    net += credit ? -n : n;
  }
  lines.push(net >= 0 ? { account: CAPITAL, debit: 0, credit: net } : { account: CAPITAL, debit: -net, credit: 0 });
  return { date: `${o.start}-01`, memo: "시작 잔액", source: "시작", lines };
}

export interface SheetRow {
  account: string;
  amount: number;
}

export interface BalanceSheet {
  assets: SheetRow[];
  liabilities: SheetRow[];
  equity: SheetRow[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
}

/** 재무상태표 — 시작 잔액 분개 + 그 뒤 분개 전부. 카드사·배달앱별 미수금은 "미수금" 한 줄로 */
export function balanceSheet(entries: JournalEntry[]): BalanceSheet {
  const { rows } = trialBalance(entries);
  const group = (type: "자산" | "부채") => {
    const m = new Map<string, number>();
    for (const r of rows.filter((x) => x.type === type)) {
      const key = r.account.startsWith(`${RECEIVABLE}-`) ? RECEIVABLE : r.account;
      m.set(key, (m.get(key) ?? 0) + r.balance);
    }
    return [...m].filter(([, n]) => n !== 0).map(([account, amount]) => ({ account, amount }));
  };
  const assets = group("자산");
  const liabilities = group("부채");
  const bal = (a: string) => rows.find((r) => r.account === a)?.balance ?? 0;
  const equity = [
    { account: CAPITAL, amount: bal(CAPITAL) },
    { account: "이익 (시작 달부터 누적)", amount: journalProfit(rows) },
    { account: `${DRAW} (가져간 돈)`, amount: bal(DRAW) },
  ].filter((r) => r.amount !== 0);
  const sum = (xs: SheetRow[]) => xs.reduce((a, r) => a + r.amount, 0);
  return { assets, liabilities, equity, totalAssets: sum(assets), totalLiabilities: sum(liabilities), totalEquity: sum(equity) };
}
