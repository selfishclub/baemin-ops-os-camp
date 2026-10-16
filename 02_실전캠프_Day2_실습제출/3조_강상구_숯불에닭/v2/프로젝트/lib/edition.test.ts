import { describe, expect, it } from "vitest";
import { isUpgradeSetting, pickEdition } from "./edition";

describe("판 고르기", () => {
  it("환경변수가 없으면 인터넷 모드는 기본판, 내 PC 모드는 전체판", () => {
    expect(pickEdition(undefined, "supabase")).toBe("basic");
    expect(pickEdition(undefined, "local")).toBe("full");
    expect(pickEdition("", "supabase")).toBe("basic");
  });
  it("환경변수로 바꿀 수 있다", () => {
    expect(pickEdition("full", "supabase")).toBe("full");
    expect(pickEdition("basic", "local")).toBe("basic");
    expect(pickEdition("뭔가", "local")).toBe("full");
  });
});

describe("업그레이드 설정 키", () => {
  it("리뷰·상권·키워드·광고 자료는 업그레이드", () => {
    for (const k of ["export_reviews_v1", "export_meta_v1", "keyword_nav_v1", "keyword_volumes_v1", "ad_plan_v1", "ad_bids_v1", "place_keywords_v1", "review_reply_marks_v1", "market_manual_v1"]) {
      expect(isUpgradeSetting(k)).toBe(true);
    }
  });
  it("캠프 때 있던 설정은 기본", () => {
    for (const k of ["store_profile", "channels", "fixed_costs", "fixed_labor", "pay_days", "holidays", "settlement_rules", "costing_items", "costing_menus", "costing_recipes", "liquor_balance", "ratio_limits", "receipt_exempt", "breakeven_v1", "purchases_2026-09"]) {
      expect(isUpgradeSetting(k)).toBe(false);
    }
  });
});
