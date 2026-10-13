/**
 * 메뉴별 판매.
 *
 * 페이히어 '결제 내역 조회(상세)'는 결제 한 건 아래에 상품 줄을 딸려 보낸다.
 * 그 줄에는 구분·영업일이 비어 있어서, 바로 위 결제 줄의 값을 끌고 내려와야 한다.
 *
 * 같은 메뉴가 채널마다 다른 이름으로 찍힌다 — 배달앱 이름에는 마케팅 문구가 붙는다.
 *   직화우삼겹쌀국수                                 ← 홀
 *   [의정부 국수맛집 1위 대표메뉴] 직화우삼겹쌀국수 (1)   ← 배달
 * 가맹점명 때와 같은 방식으로 간다 — **원문은 어떤 경우에도 고치지 않고**,
 * 보이는 이름만 입혀 묶는다. 잘못 묶인 건 사장님이 화면에서 바로잡는다.
 */

/** 한 달치 메뉴 집계 한 줄. 원문 이름 그대로 저장한다 */
export interface MenuTotal {
  /** 페이히어가 적어 보낸 상품명 원문 */
  item: string;
  /** 페이히어 카테고리. 배달앱 메뉴는 비어 있다 */
  category: string;
  qty: number;
  amount: number;
}

/** 묶은 뒤의 한 줄 */
export interface MenuGroup {
  /** 화면에 보일 이름 */
  name: string;
  category: string;
  qty: number;
  amount: number;
  /** 이 이름으로 묶인 원문들. 두 개 이상이면 화면에 알려준다 */
  from: string[];
}

/**
 * 마케팅 문구를 걷어낸다.
 *  - 앞에 붙는 대괄호: `[의정부 국수맛집 1위] 직화우삼겹쌀국수`
 *  - 뒤에 붙는 수량 꼬리표: `… (1)`
 * 걷어낸 뒤 **글자가 같을 때만** 묶는다. 비슷하다고 묶지 않는다 —
 * 직화 / 청직화 / 홍직화는 한 글자 차이지만 다른 메뉴다.
 */
export function cleanName(raw: string): string {
  let s = raw.trim();
  // 앞쪽 대괄호는 여러 개 붙어 오기도 한다
  while (/^\s*\[[^\]]*\]\s*/.test(s)) s = s.replace(/^\s*\[[^\]]*\]\s*/, "");
  s = s.replace(/\s*\(\s*\d+\s*\)\s*$/, "");
  return s.replace(/\s+/g, " ").trim() || raw.trim();
}

/**
 * 묶는다. `overrides`는 사장님이 고친 것 — 원문 → 보일 이름.
 * 사람이 고친 것이 항상 이긴다.
 */
export function groupMenu(rows: MenuTotal[], overrides: Record<string, string> = {}): MenuGroup[] {
  const out = new Map<string, MenuGroup>();
  for (const r of rows) {
    const name = overrides[r.item]?.trim() || cleanName(r.item);
    const g = out.get(name);
    if (g) {
      g.qty += r.qty;
      g.amount += r.amount;
      // 카테고리는 비어 있는 쪽(배달)보다 적혀 있는 쪽(홀)을 쓴다
      if (!g.category && r.category) g.category = r.category;
      if (!g.from.includes(r.item)) g.from.push(r.item);
    } else {
      out.set(name, { name, category: r.category, qty: r.qty, amount: r.amount, from: [r.item] });
    }
  }
  // 순위는 수량 — "어떤 메뉴가 많이 팔렸나"가 묻는 것이다. 금액은 할인 전이라 기준이 못 된다.
  return [...out.values()].sort((a, b) => b.qty - a.qty || b.amount - a.amount);
}

/** 카테고리별 묶음. 비어 있는 것은 '분류 없음'으로 보여주되 버리지 않는다 */
export function byCategory(groups: MenuGroup[]): { category: string; qty: number; amount: number }[] {
  const m = new Map<string, { category: string; qty: number; amount: number }>();
  for (const g of groups) {
    const c = g.category || "분류 없음";
    const cur = m.get(c) ?? { category: c, qty: 0, amount: 0 };
    cur.qty += g.qty;
    cur.amount += g.amount;
    m.set(c, cur);
  }
  return [...m.values()].sort((a, b) => b.amount - a.amount);
}

/** 여러 달을 합친다 */
export function mergeTotals(lists: MenuTotal[][]): MenuTotal[] {
  const m = new Map<string, MenuTotal>();
  for (const list of lists)
    for (const r of list) {
      const cur = m.get(r.item);
      if (cur) {
        cur.qty += r.qty;
        cur.amount += r.amount;
        if (!cur.category && r.category) cur.category = r.category;
      } else m.set(r.item, { ...r });
    }
  return [...m.values()];
}

/** 매출이 0인 줄 — 영수증 리뷰·스토리 같은 것. 집계에 넣되 순위에서는 뺀다 */
export const isSellable = (g: { amount: number }) => g.amount !== 0;
