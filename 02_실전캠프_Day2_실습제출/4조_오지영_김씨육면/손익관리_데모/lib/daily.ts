import { isPending } from "./confirm";
import type { Transaction } from "./types";

/**
 * 날짜 축으로 본 한 달.
 *
 * 계정별 트리는 "어디에 얼마 썼나"를 보는 것이고, 이쪽은 "그날 무슨 일이 있었나"를 보는 것이다.
 * 분류 체계를 세우기 전에는 이쪽이 먼저다 — 우선 다 보고 나서 정리한다.
 */

export interface CardGroup {
  /** 카드 이름. 카드사마다 내역서가 따로 오니 한 줄씩 대조하려면 갈라 놔야 한다 */
  card: string;
  amount: number;
  txs: Transaction[];
}

export interface DayNode {
  /** YYYY-MM-DD */
  date: string;
  /** 1~31 */
  day: number;
  /** 0=일 … 6=토 */
  weekday: number;
  amount: number;
  count: number;
  /** 아직 확정 안 된 건 수 */
  pendingCount: number;
  cards: CardGroup[];
}

export interface DailyView {
  days: DayNode[];
  /** 날짜가 없어 어느 날인지 모르는 건 — 버리지 않고 따로 보여준다 */
  undated: Transaction[];
  amount: number;
  count: number;
}

const UNKNOWN_CARD = "카드 미상";

export const daysInMonth = (month: string): number => {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
};

/** 카드 파일이 붙여 둔 첫 태그가 카드 이름이다 (parseCard의 toTransactions) */
function cardOf(t: Transaction): string {
  if (t.source === "fixed-copy") return "고정비";
  if (t.source === "manual") return "직접 입력";
  return t.tags?.[0]?.trim() || UNKNOWN_CARD;
}

/**
 * 거래가 없는 날도 줄로 남긴다.
 * 빠진 날이 보여야 카드 내역서가 제대로 들어왔는지 알 수 있다.
 */
export function buildDaily(month: string, transactions: Transaction[]): DailyView {
  const total = daysInMonth(month);
  const [y, m] = month.split("-").map(Number);

  const byDate = new Map<string, Transaction[]>();
  const undated: Transaction[] = [];
  for (const t of transactions) {
    if (!t.date) {
      undated.push(t);
      continue;
    }
    const list = byDate.get(t.date);
    if (list) list.push(t);
    else byDate.set(t.date, [t]);
  }

  const days: DayNode[] = [];
  for (let d = 1; d <= total; d++) {
    const date = `${month}-${String(d).padStart(2, "0")}`;
    const txs = byDate.get(date) ?? [];

    const byCard = new Map<string, Transaction[]>();
    for (const t of txs) {
      const c = cardOf(t);
      const list = byCard.get(c);
      if (list) list.push(t);
      else byCard.set(c, [t]);
    }

    const cards: CardGroup[] = [...byCard.entries()]
      .map(([card, list]) => ({
        card,
        amount: list.reduce((s, t) => s + t.amount, 0),
        // 금액이 큰 건이 위로 — 분류할 때 중요한 것부터 눈에 들어와야 한다
        txs: [...list].sort((a, b) => b.amount - a.amount),
      }))
      .sort((a, b) => b.amount - a.amount);

    days.push({
      date,
      day: d,
      weekday: new Date(y, m - 1, d).getDay(),
      amount: txs.reduce((s, t) => s + t.amount, 0),
      count: txs.length,
      pendingCount: txs.filter(isPending).length,
      cards,
    });
  }

  return {
    days,
    undated,
    amount: transactions.reduce((s, t) => s + t.amount, 0),
    count: transactions.length,
  };
}

export const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
