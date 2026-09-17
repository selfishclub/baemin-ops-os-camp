// 메뉴 조건 판정 — 화면과 분리된 순수 함수 (PRD_원본 7.3, 11장)
// filters = { avoid: ["pork", ...], maxSpice: null | 0..3, foodType: "all" | categoryId }

function isPublic(menu) {
  return menu.publicationStatus === "approved" && menu.availability !== "inactive";
}

function hasAnyFilter(filters) {
  return filters.avoid.length > 0 || filters.maxSpice !== null || filters.foodType !== "all";
}

// 반환: "match" | "excluded" | "unverified"
// unverified = 고른 조건에 대해 값이 unknown/null이라 판정할 수 없어 빠진 경우
function judge(menu, filters) {
  let unverified = false;

  for (const key of filters.avoid) {
    const state = menu.ingredients?.[key] ?? "unknown";
    if (state === "contains") return "excluded";
    if (state === "unknown") unverified = true;
  }

  if (filters.maxSpice !== null) {
    if (menu.spiceLevel === null || menu.spiceLevel === undefined) unverified = true;
    else if (menu.spiceLevel > filters.maxSpice) return "excluded";
  }

  if (filters.foodType !== "all" && menu.categoryId !== filters.foodType) return "excluded";

  return unverified ? "unverified" : "match";
}

function applyFilters(menus, filters) {
  const publicMenus = menus.filter(isPublic);
  if (!hasAnyFilter(filters)) {
    return { results: publicMenus, excludedUnverified: 0, filtered: false };
  }
  const results = [];
  let excludedUnverified = 0;
  for (const m of publicMenus) {
    const r = judge(m, filters);
    if (r === "match") results.push(m);
    else if (r === "unverified") excludedUnverified++;
  }
  return { results, excludedUnverified, filtered: true };
}

// 상세 화면의 "충족한 조건" 근거 — 필터에 쓴 같은 데이터에서 생성 (7.4)
function matchedReasons(menu, filters) {
  const reasons = [];
  for (const key of filters.avoid) {
    if (menu.ingredients?.[key] === "absent_verified") reasons.push({ type: "avoid", key });
  }
  if (filters.maxSpice !== null && menu.spiceLevel !== null && menu.spiceLevel <= filters.maxSpice) {
    reasons.push({ type: "spice", level: menu.spiceLevel });
  }
  if (filters.foodType !== "all" && menu.categoryId === filters.foodType) {
    reasons.push({ type: "foodType", id: menu.categoryId });
  }
  return reasons;
}

function hasUnverifiedIngredient(menu) {
  return Object.values(menu.ingredients ?? {}).some((s) => s === "unknown") || menu.spiceLevel === null;
}

// 추천 = 승인된 추천 ∩ 조건 결과 (S06). 품절·비공개는 제외.
function recommendedMenus(recs, menus, filters, type) {
  const byId = new Map(menus.map((m) => [m.id, m]));
  return recs
    .filter((r) => r.type === type && r.status === "approved")
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((r) => ({ rec: r, menu: byId.get(r.menuId) }))
    .filter(({ menu }) => menu && isPublic(menu) && menu.availability !== "sold_out")
    .filter(({ menu }) => !hasAnyFilter(filters) || judge(menu, filters) === "match");
}

window.Filter = { isPublic, hasAnyFilter, judge, applyFilters, matchedReasons, hasUnverifiedIngredient, recommendedMenus };
