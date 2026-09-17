import {
  DEPRECATED_LABELS,
  UNCLASSIFIED,
  behaviorOf,
  getAccount,
  isKnownAccount,
  type AccountGroup,
  type BehaviorConfig,
  type Behavior,
} from "./accounts";
import { matchRule, splitMerchantOf, type MapRule } from "./rules";

export interface ClassifyInput {
  merchant: string;
  /** 가계부 시트처럼 사람이 이미 적어둔 계정. 카드 파일이면 없음. */
  rawAccount?: string | null;
  rawSub?: string | null;
}

export interface ClassifyResult {
  account: string;
  sub: string | null;
  group: AccountGroup;
  behavior: Behavior | null;
  autoMapped: boolean;
  needsReview: boolean;
  reviewReason: string | null;
  normalizedNote?: string;
}

/**
 * 계정 확정 순서
 *  1) 원본에 계정이 적혀 있으면 폐기표기(§4-5)를 정규화해서 쓴다
 *  2) 없으면 거래처 키워드 매핑(§5-1)
 *  3) 쿠팡·세븐일레븐·배민(§5-2)과 신규 거래처는 계정을 채우되 검수 큐로 보낸다
 */
export function classify(
  input: ClassifyInput,
  rules: MapRule[],
  cfg?: BehaviorConfig
): ClassifyResult {
  const merchant = input.merchant.trim();
  const raw = (input.rawAccount ?? "").trim();
  const split = splitMerchantOf(merchant);

  let account: string | null = null;
  let sub: string | null = (input.rawSub ?? "").trim() || null;
  let autoMapped = false;
  let normalizedNote: string | undefined;
  let needsReview = false;
  let reviewReason: string | null = null;

  if (raw) {
    const dep = DEPRECATED_LABELS[raw];
    if (dep) {
      if (dep.to === null) {
        account = UNCLASSIFIED;
        needsReview = true;
        reviewReason = `'${raw}' — ${dep.reason}`;
        normalizedNote = `폐기 표기 '${raw}'`;
      } else {
        account = dep.to;
        normalizedNote = `'${raw}' → '${dep.to}' (${dep.reason})`;
        if (raw === "다이소" && !sub) sub = "다이소";
      }
    } else if (isKnownAccount(raw)) {
      account = raw;
    } else {
      account = UNCLASSIFIED;
      needsReview = true;
      reviewReason = `계정과목에 없는 표기 '${raw}'`;
    }
  }

  if (!account) {
    const hit = matchRule(merchant, rules);
    if (hit) {
      account = hit.account;
      sub = sub ?? hit.sub;
      autoMapped = true;
    } else {
      account = UNCLASSIFIED;
      needsReview = true;
      reviewReason = `신규 거래처 '${merchant || "(이름 없음)"}'`;
    }
  }

  // §5-2 — 이 3곳은 계정이 채워져 있어도 매장/집을 사람이 확인한다.
  // 카드 파일에서는 어차피 키워드가 안 맞아 '신규 거래처'로도 걸리는데,
  // 사람이 할 일은 매장/집 판단이므로 그쪽이 이긴다.
  if (split) {
    needsReview = true;
    reviewReason = `${split} — 매장/집 확인`;
  }

  const def = getAccount(account);
  return {
    account,
    sub,
    group: def?.group ?? "unclassified",
    behavior: behaviorOf(account, sub, cfg),
    autoMapped,
    needsReview,
    reviewReason,
    normalizedNote,
  };
}
