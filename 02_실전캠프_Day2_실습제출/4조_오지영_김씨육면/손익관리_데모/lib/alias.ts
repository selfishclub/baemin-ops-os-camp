/**
 * 가맹점 표시 이름.
 *
 * 카드 내역의 가맹점명은 결제대행사(PG) 이름이 앞에 붙어 길고, 같은 가게가
 * 띄어쓰기만 달라 둘로 갈리기도 한다 —
 *   CJ올리브네트웍스PG인증 - 우지커피 의정부송산점
 *   우지커피의정부송산점
 *
 * 그렇다고 원문을 고치면 안 된다. 중복 거르기·쿠팡 전표 대조·카드사 내역서 대조가
 * 전부 원문을 열쇠로 쓴다. 그래서 원문은 그대로 두고 보이는 이름만 입힌다.
 */

export interface Alias {
  /** 가맹점명에 이 말이 들어 있으면 걸린다 */
  match: string;
  /** 대신 보여줄 이름 */
  display: string;
}

/** 띄어쓰기·기호를 지운 비교용 형태. '우지커피 의정부송산점'과 '우지커피의정부송산점'을 같게 본다 */
export const loose = (s: string) => s.replace(/[\s_·\-–—]/g, "").toLowerCase();

/**
 * 보일 이름을 고른다. 걸리는 게 여럿이면 match 가 긴 쪽이 이긴다 —
 * 좁게 적은 규칙이 넓게 적은 규칙을 덮어야 뜻대로 움직인다.
 */
export function displayOf(merchant: string, aliases: Alias[]): string {
  const hay = loose(merchant);
  let best: Alias | null = null;
  for (const a of aliases) {
    const needle = loose(a.match);
    if (!needle || !hay.includes(needle)) continue;
    if (!best || needle.length > loose(best.match).length) best = a;
  }
  return best ? best.display : merchant;
}

/** 이 가맹점에 걸리는 별칭이 있는가 */
export const hasAlias = (merchant: string, aliases: Alias[]) =>
  displayOf(merchant, aliases) !== merchant;

/* ── PG사 접두어 ─────────────────────────────────────────
   조용히 떼지 않는다. 제안만 하고 사장님이 누르면 들어간다. */

/**
 * 떼어낼 결제대행사 이름.
 *
 * 네이버페이·카카오페이·페이코 같은 '지갑'은 넣지 않는다.
 * 그쪽은 뒤에 남는 게 '충전'처럼 가게 이름이 아닌 경우가 많아,
 * 떼면 오히려 무슨 거래인지 알 수 없게 된다.
 */
const PG = [
  "CJ올리브네트웍스", "올리브네트웍스", "KG이니시스", "이니시스", "토스페이먼츠",
  "나이스페이먼츠", "나이스페이", "NHN KCP", "NHNKCP", "KCP", "다날", "헥토파이낸셜",
  "세틀뱅크", "페이레터", "올더게이트", "스마트로", "KSNET", "케이에스넷", "이지페이",
  "갤럭시아머니트리", "갤럭시아", "코다페이먼츠코리아", "코다페이먼츠",
];

/** PG 이름 뒤에 남는 거래 종류 꼬리표 — '자동과금_4 - ', 'N_게임_4 - ' 같은 것 */
const JUNK = /^(?:[A-Za-z가-힣]{0,8}_)*[A-Za-z가-힣]{0,8}_?\d*\s*[-–—]\s*/;

/** 떼고 나서 이것만 남으면 가게 이름이 아니다 */
const NOT_A_NAME = new Set([
  "충전", "결제", "자동과금", "정기결제", "선불충전", "환불", "취소", "승인", "인증", "게임",
]);

/**
 * 앞에 붙은 PG사 이름을 떼어낸 꼴을 돌려준다. 뗄 게 없으면 null.
 * 뒤에 남는 게 너무 짧으면(2글자 미만) 가게 이름이 아니라고 보고 제안하지 않는다.
 */
export function suggestAlias(merchant: string): string | null {
  const s = merchant.trim();
  for (const p of PG) {
    const i = s.toLowerCase().indexOf(p.toLowerCase());
    if (i !== 0) continue;
    let rest = s
      .slice(p.length)
      // PG인증 / PG결제 / _PG_ 같은 꼬리표와 구분 기호를 걷어낸다
      .replace(/^\s*(pg\s*(인증|결제|승인)?|결제)\s*/i, "")
      .replace(/^[\s_·\-–—:]+/, "")
      .trim();
    // '자동과금_4 - 주식회사 타임앤코'처럼 거래 종류가 한 번 더 붙어 오는 경우
    const trimmed = rest.replace(JUNK, "").trim();
    if (trimmed.length >= 3) rest = trimmed;

    // 너무 짧거나 거래 종류만 남았으면 가게 이름이 아니다 — 제안하지 않는다
    if (rest.length < 3 || NOT_A_NAME.has(rest.replace(/[\s_]/g, ""))) return null;
    if (loose(rest) === loose(s)) return null;
    return rest;
  }
  return null;
}

/** 목록에서 제안할 만한 것만 추린다 — 같은 제안은 한 번만 */
export interface AliasSuggestion {
  /** 걸리게 할 말 */
  match: string;
  /** 보일 이름 — 사장님이 고칠 수 있다 */
  display: string;
  count: number;
  /** 원문 보기 한 줄. 무엇을 줄이는지 알아야 고칠지 판단할 수 있다 */
  sample: string;
}

export function collectSuggestions(merchants: string[], aliases: Alias[]): AliasSuggestion[] {
  const by = new Map<string, AliasSuggestion>();
  for (const m of merchants) {
    if (hasAlias(m, aliases)) continue;
    const d = suggestAlias(m);
    if (!d) continue;
    const key = loose(d);
    const cur = by.get(key);
    if (cur) cur.count += 1;
    else by.set(key, { match: d, display: d, count: 1, sample: m });
  }
  return [...by.values()].sort((a, b) => b.count - a.count);
}

/**
 * 줄에 보일 '내역'.
 *
 * 카드 내역의 가맹점명이 '쿠팡(쿠페이)'처럼 결제 방식만 알려주는 경우가 있다.
 * 전표에서 상품명을 받아왔으면 그쪽이 진짜 내역이므로 앞세운다.
 * 원문은 어디서도 바뀌지 않는다 — 대조할 때 쓰는 열쇠다.
 */
export function contentOf(
  t: { merchant: string; product?: string | null },
  aliases: Alias[]
): { text: string; via: string | null } {
  const name = displayOf(t.merchant, aliases);
  const p = (t.product ?? "").trim();
  if (!p) return { text: name, via: null };
  return { text: p, via: name };
}
