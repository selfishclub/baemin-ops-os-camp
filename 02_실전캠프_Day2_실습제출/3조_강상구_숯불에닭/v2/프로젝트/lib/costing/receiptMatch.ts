import type { Transaction } from "../types";
import { purchaseTotal, type Purchase } from "./purchases";

// 영수증 없는 체크카드 결제 찾기 — 사장님 규칙: 가게 통장의 체크카드 결제는 모두 영수증(매입 영수증·주문내역)과 맞아야 한다.
//  1) 같은 날 카드 취소(출금 음수)는 원래 결제와 짝지어 둘 다 뺀다
//  2) "손익에 안 넣음"(개인 결제), 청구서로 대신하는 것(통신비·지급수수료), 사장님이 "필요 없음"으로 둔 결제·거래처는 뺀다
//  3) 남은 결제는 금액이 같은 매입 영수증과 짝짓는다 (날짜 ±3일). 한 번에 여러 곳을 결제한 경우(네이버페이 등)는 영수증 2~3장의 합으로도 찾는다
//  4) 그래도 짝이 없는 결제 = 영수증이 필요한 결제
export const RECEIPT_EXEMPT_KEY = "receipt_exempt";
export interface ReceiptExempt {
  txIds: string[]; // 이 결제만 필요 없음
  payees: string[]; // 이 거래처는 늘 필요 없음 (통장 표시에서 "NH체크 " 뗀 이름)
}
export const emptyExempt = (): ReceiptExempt => ({ txIds: [], payees: [] });

const BILL_MINORS = ["통신비", "지급수수료"];
const WINDOW_DAYS = 3;

/** 체크카드 결제인지 (농협: "NH체크 ○○") */
export const isCardTx = (t: Transaction) => t.source === "bank" && /체크/.test(t.payee) && t.out !== 0;

/** 통장 표시에서 앞의 "NH체크 " 같은 말을 뗀 가게 이름 */
export const cardPayee = (payee: string) => payee.replace(/^\S*체크\S*\s*/, "").trim() || payee;

const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
const squash = (s: string) => s.replace(/[\s()（）㈜]|주식회사|\(주\)/g, "").toLowerCase();

/** 가게 이름이 비슷한지 (짝 후보가 여럿일 때 고르는 데만 쓴다) */
function nameScore(payee: string, vendor: string): number {
  const a = squash(cardPayee(payee));
  const b = squash(vendor);
  if (!a || !b) return 0;
  if (a.includes(b) || b.includes(a)) return 2;
  for (let n = Math.min(a.length, b.length); n >= 2; n--) for (let i = 0; i + n <= b.length; i++) if (a.includes(b.slice(i, i + n))) return 1;
  return 0;
}

export interface CardMatch {
  matched: { tx: Transaction; purchases: Purchase[] }[];
  cancelled: { tx: Transaction; cancel: Transaction }[];
  exempt: { tx: Transaction; reason: string; manual: boolean }[];
  missing: Transaction[];
  cardCount: number; // 살펴본 체크카드 결제 수 (취소 줄 제외)
}

export function matchCardReceipts(txs: Transaction[], purchases: Purchase[], exempt: ReceiptExempt = emptyExempt()): CardMatch {
  const cards = txs.filter(isCardTx).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const out: CardMatch = { matched: [], cancelled: [], exempt: [], missing: [], cardCount: 0 };

  // 1) 카드 취소 짝
  const used = new Set<string>();
  for (const c of cards.filter((t) => t.out < 0)) {
    const orig = cards.find((t) => !used.has(t.id) && t.out === -c.out && t.payee === c.payee && Math.abs(dayDiff(c.date, t.date)) <= WINDOW_DAYS);
    if (orig) {
      used.add(orig.id);
      used.add(c.id);
      out.cancelled.push({ tx: orig, cancel: c });
    }
  }
  const pays = cards.filter((t) => t.out > 0 && !used.has(t.id));
  out.cardCount = pays.length + out.cancelled.length;

  // 2) 영수증이 필요 없는 결제
  const need: Transaction[] = [];
  for (const t of pays) {
    if (exempt.txIds.includes(t.id)) out.exempt.push({ tx: t, reason: "이 결제는 필요 없음", manual: true });
    else if (exempt.payees.includes(cardPayee(t.payee))) out.exempt.push({ tx: t, reason: "늘 필요 없는 거래처", manual: true });
    else if (t.major === "제외") out.exempt.push({ tx: t, reason: "손익에 안 넣음 (개인 등)", manual: false });
    else if (t.minor && BILL_MINORS.includes(t.minor)) out.exempt.push({ tx: t, reason: "청구서로 대신", manual: false });
    else need.push(t);
  }

  // 3) 매입 영수증과 짝 — 한 장 → 두 장 합 → 세 장 합 순서
  const pool = purchases.map((p) => ({ p, total: purchaseTotal(p), taken: false }));
  const cands = (t: Transaction) =>
    pool
      .filter((x) => !x.taken && Math.abs(dayDiff(x.p.date, t.date)) <= WINDOW_DAYS)
      .sort((a, b) => Math.abs(dayDiff(a.p.date, t.date)) - Math.abs(dayDiff(b.p.date, t.date)) || nameScore(t.payee, b.p.vendor) - nameScore(t.payee, a.p.vendor));
  const left: Transaction[] = [];
  for (const t of need) {
    const one = cands(t).find((x) => x.total === t.out);
    if (one) {
      one.taken = true;
      out.matched.push({ tx: t, purchases: [one.p] });
    } else left.push(t);
  }
  for (const t of left) {
    const c = cands(t).slice(0, 12);
    let found: typeof c | null = null;
    for (let i = 0; i < c.length && !found; i++)
      for (let j = i + 1; j < c.length && !found; j++) {
        if (c[i].total + c[j].total === t.out) found = [c[i], c[j]];
        for (let k = j + 1; k < c.length && !found; k++) if (c[i].total + c[j].total + c[k].total === t.out) found = [c[i], c[j], c[k]];
      }
    if (found) {
      found.forEach((x) => (x.taken = true));
      out.matched.push({ tx: t, purchases: found.map((x) => x.p) });
    } else out.missing.push(t);
  }
  out.matched.sort((a, b) => (a.tx.date < b.tx.date ? -1 : 1));
  return out;
}
