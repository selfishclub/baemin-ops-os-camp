import { lineSupply, type Purchase, type PurchaseLine } from "./purchases";
import type { Item } from "./types";

// 매입 영수증 넣을 때 자주 나는 실수를 장부가 먼저 잡는다 (2026-11-14 사장님: 입력은 GPT가 하기도 한다).
// 실제로 났던 일만 검사한다 — 지어낸 규칙은 넣지 않는다.
//  ① 부가세 칸이 비었다 → 그 품목 기준단가가 10% 부풀려진다 (영수증 59장이 이랬다)
//  ② 박스 수와 낱개 수를 바꿔 넣었다 → 코카콜라 한 병이 22,200원이 됐다 (11/11)
//  ③ 품목에 연결을 안 했다 → 단가가 옛날 값에 멈춘다 (11/11 코크제로)
//  ④ 단가가 평소와 크게 다르다 → 수량·용량을 잘못 봤을 수 있다

export type PurchaseIssueKind = "vat-empty" | "qty-swapped" | "item-unlinked" | "item-qty-zero" | "cost-outlier";

export interface PurchaseIssue {
  kind: PurchaseIssueKind;
  purchaseId: string;
  date: string;
  vendor: string;
  lineName?: string;
  message: string;
  /** 고치면 될 값 (있을 때만) */
  suggest?: number;
}

/** 이 영수증에서 부가세를 매겨야 하는 줄의 금액 합 */
export const taxableAmount = (p: Purchase) => p.lines.filter((l) => !l.taxFree).reduce((a, l) => a + l.amount, 0);

/** 품목에 연결된 줄의 개당 단가 (영수증에 찍힌 금액 기준) */
const perUnit = (l: PurchaseLine) => (l.itemQty > 0 ? l.amount / l.itemQty : null);

// 견줄 자료가 한 건뿐이면 둘 중 어느 쪽이 잘못된 건지 알 수가 없다.
// (실제로 멀쩡한 925원 영수증이 잘못된 22,200원 영수증과 견주다 같이 걸렸다 — 테스트가 잡아냄)
const MIN_SAMPLES = 2;

/** 그 품목의 평소 개당 단가 — 과거 매입의 가운뎃값. 견줄 자료가 MIN_SAMPLES 미만이면 null */
export function usualUnitCost(itemId: string, purchases: Purchase[], exceptId?: string): number | null {
  const v: number[] = [];
  for (const p of purchases) {
    if (p.id === exceptId) continue;
    for (const l of p.lines) if (l.itemId === itemId) {
      const u = perUnit(l);
      if (u !== null) v.push(u);
    }
  }
  if (v.length < MIN_SAMPLES) return null;
  v.sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)];
}

const OUTLIER = 2; // 평소의 2배 위 또는 절반 아래면 묻는다

/**
 * 영수증 한 장을 검사한다. `others`는 견줄 대상이 되는 지난 매입(이 영수증은 빼고 넘겨도 된다).
 */
export function checkPurchase(p: Purchase, items: Item[], others: Purchase[] = []): PurchaseIssue[] {
  const out: PurchaseIssue[] = [];
  const at = { purchaseId: p.id, date: p.date, vendor: p.vendor };
  const name = (id: string) => items.find((i) => i.id === id)?.name ?? id;

  // ① 과세 줄이 있는데 부가세가 비었다
  const taxable = taxableAmount(p);
  if (taxable > 0 && !p.vat)
    out.push({
      ...at,
      kind: "vat-empty",
      message: `부가세가 비어 있어요. 과세 ${Math.round(taxable).toLocaleString("ko-KR")}원이면 보통 ${Math.round(taxable / 11).toLocaleString("ko-KR")}원이에요 — 비워 두면 그 품목 단가가 10% 비싸게 잡혀요.`,
      suggest: Math.round(taxable / 11),
    });

  for (const l of p.lines) {
    if (!l.itemId) {
      // ③ 금액이 큰데 품목에 연결을 안 했다 (작은 잡화까지 묻지는 않는다)
      if (l.amount >= 10_000 && items.some((i) => i.active !== false && l.name.includes(i.name)))
        out.push({ ...at, kind: "item-unlinked", lineName: l.name, message: `“${l.name}”이 품목에 연결 안 됐어요. 연결해야 그 품목 단가가 이 영수증으로 갱신돼요.` });
      continue;
    }
    // ④ 연결은 했는데 품목 수량이 0
    if (l.itemQty <= 0) {
      out.push({ ...at, kind: "item-qty-zero", lineName: l.name, message: `“${l.name}”에 품목 단위 수량이 비었어요. 몇 ${items.find((i) => i.id === l.itemId)?.baseUnit ?? "개"}인지 넣어야 단가가 나와요.` });
      continue;
    }
    // ② 박스 수(qty)가 품목 수량(itemQty)보다 크다 — 두 칸을 바꿔 넣은 모양
    if (l.qty > l.itemQty)
      out.push({ ...at, kind: "qty-swapped", lineName: l.name, message: `“${l.name}”은 ${l.qty}묶음인데 품목 수량이 ${l.itemQty}밖에 안 돼요. 두 칸을 바꿔 넣지 않았나요?`, suggest: l.qty });

    // ⑤ 단가가 평소와 크게 다르다
    const u = perUnit(l);
    const usual = usualUnitCost(l.itemId, others);
    if (u !== null && usual !== null && usual > 0 && (u > usual * OUTLIER || u < usual / OUTLIER))
      out.push({
        ...at,
        kind: "cost-outlier",
        lineName: l.name,
        message: `“${name(l.itemId)}” 개당 ${Math.round(u).toLocaleString("ko-KR")}원인데 평소는 ${Math.round(usual).toLocaleString("ko-KR")}원이에요. 수량이나 용량을 다시 봐 주세요.`,
        suggest: Math.round(usual),
      });
  }
  return out;
}

/** 그 달 영수증을 한꺼번에 검사. others에는 견줄 지난 달 매입까지 넣어 준다 */
export function checkPurchases(purchases: Purchase[], items: Item[], others: Purchase[] = []): PurchaseIssue[] {
  const pool = [...purchases, ...others];
  return purchases.flatMap((p) => checkPurchase(p, items, pool.filter((x) => x.id !== p.id)));
}
