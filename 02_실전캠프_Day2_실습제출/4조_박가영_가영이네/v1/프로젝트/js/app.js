// 조건 판정은 js/filter.js (window.Filter)

// ── 상태: 현재 방문 중에만 유지 (저장하지 않음 — 다음 손님이 앞사람 조건을 보면 안 됨)
const state = {
  lang: "en",
  filters: { avoid: [], maxSpice: null, foodType: "all" },
  recTab: "owner",
  scrollY: 0,
};
let DATA = null;

const $ = (sel, root = document) => root.querySelector(sel);
const main = $("#main");
const live = $("#live");

// ── 문구: 선택 언어 → 없으면 영어 → 없으면 키 이름 대신 빈 문자열이 아닌 영어 키 표시 방지
function t(key, vars = {}) {
  const strings = DATA.ui.strings;
  let s = strings[state.lang]?.[key] ?? strings.en[key] ?? key;
  for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
  return s;
}
function menuName(menu) {
  return menu.translations?.[state.lang]?.name || menu.translations?.en?.name || menu.nameKo;
}
function menuField(menu, field) {
  return menu.translations?.[state.lang]?.[field] || menu.translations?.en?.[field] || "";
}
function recReason(rec) {
  return rec.reasonTranslations?.[state.lang] || rec.reasonTranslations?.en || rec.reasonKo;
}
function spiceLabel(level) {
  return t(`spiceLabel.${level === null || level === undefined ? "null" : level}`);
}
function categoryLabel(id) {
  return t(`foodType.${id}`);
}
function photoHTML(menu, large) {
  const cls = large ? "photo large" : "photo";
  if (menu.imageAsset) return `<div class="${cls} has-img"><img src="content/images/${esc(menu.imageAsset)}" alt="${esc(menuName(menu))}" loading="lazy" onerror="this.parentNode.classList.remove('has-img'); this.remove();"><span class="photo-fallback">${t("card.photoMissing")}</span></div>`;
  return `<div class="${cls}" aria-hidden="true">${t("card.photoMissing")}</div>`;
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ── 데이터 읽기
function loadData() {
  const d = window.GAYOUNGENE_DATA;
  if (!d || !d.menus || !d.recommendations || !d.store || !d.ui) throw new Error("content/*.js 파일이 빠졌거나 문법 오류가 있어요");
  return { menus: d.menus.menus, categories: d.menus.categories, ingredientKeys: d.menus.ingredientKeys, recs: d.recommendations.recommendations, store: d.store, ui: d.ui };
}

// ── 공통 상단 문구·언어
function applyStaticText() {
  document.querySelectorAll("[data-t]").forEach((el) => (el.textContent = t(el.dataset.t)));
  document.documentElement.lang = state.lang;
  const info = DATA.ui.languages.find((l) => l.code === state.lang);
  $("#draft-bar").hidden = !info || info.reviewed;
}
function setupLang() {
  const sel = $("#lang");
  sel.innerHTML = DATA.ui.languages.map((l) => `<option value="${l.code}">${esc(l.label)}</option>`).join("");
  sel.value = state.lang;
  sel.addEventListener("change", () => {
    state.lang = sel.value; // 언어를 바꿔도 조건은 유지
    applyStaticText();
    render();
  });
}
function setActiveNav(name) {
  document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === name));
}

// ── 라우팅 (#/ · #/menu/001 · #/find/001 · #/recommendations · #/how-to-order · #/visit)
function route() {
  const hash = location.hash || "#/";
  const parts = hash.replace(/^#\/?/, "").split("/");
  if (parts[0] === "menu" && parts[1]) return { view: "detail", id: parts[1] };
  if (parts[0] === "find" && parts[1]) return { view: "find", id: parts[1] };
  if (parts[0] === "recommendations") return { view: "recommendations" };
  if (parts[0] === "how-to-order") return { view: "how" };
  if (parts[0] === "visit") return { view: "visit" };
  return { view: "home" };
}
function findMenu(id) {
  return DATA.menus.find((m) => (m.menuNumber === id || m.id === id) && Filter.isPublic(m));
}

function render() {
  const r = route();
  switch (r.view) {
    case "detail": return renderDetail(r.id);
    case "find": return renderFind(r.id);
    case "recommendations": return renderRecommendations();
    case "how": return renderHow();
    case "visit": return renderVisit();
    default: return renderHome();
  }
}

// ── 카드
function cardHTML(menu, extra = "") {
  const spiceUnknown = menu.spiceLevel === null || menu.spiceLevel === undefined;
  const ingUnknown = Object.values(menu.ingredients ?? {}).some((s) => s === "unknown");
  const check = ingUnknown && !spiceUnknown ? `<span class="badge check">${t("card.needsCheck")}</span>` : "";
  const sold = menu.availability === "sold_out" ? `<span class="badge sold">${t("card.soldOut")}</span>` : "";
  return `
    <a class="card" href="#/menu/${esc(menu.menuNumber)}">
      ${photoHTML(menu, false)}
      <div class="card-body">
        <span class="num">${menu.sample ? t("card.sample") + " · " : ""}${esc(menu.menuNumber)}</span>
        <span class="name">${esc(menuName(menu))}</span>
        <span class="name-ko" lang="ko">${esc(menu.nameKo)}</span>
        <div class="badges"><span class="badge ${spiceUnknown && ingUnknown ? "check" : "spice"}">${spiceUnknown && ingUnknown ? t("card.detailsUnverified") : spiceLabel(menu.spiceLevel)}</span>${sold}${check}</div>
        <span class="meta">${menu.priceKrw === null ? t("card.pricePending") : `${menu.priceKrw.toLocaleString()} KRW`}</span>
        ${extra}
      </div>
    </a>`;
}

function filterSummaryHTML() {
  const f = state.filters;
  if (!Filter.hasAnyFilter(f)) return `<p class="summary">${t("results.noFilters")}</p>`;
  const parts = [];
  if (f.avoid.length) parts.push(t("results.summaryAvoid", { list: f.avoid.map((k) => t(`ingredient.${k}`)).join(", ") }));
  if (f.maxSpice !== null) parts.push(t("results.summarySpice", { level: t(`spice.${f.maxSpice}`) }));
  if (f.foodType !== "all") parts.push(t("results.summaryType", { type: categoryLabel(f.foodType) }));
  return `<p class="summary">${parts.map(esc).join(" · ")}</p>`;
}

// ── S01 첫 화면
function renderHome() {
  setActiveNav("menu");
  const f = state.filters;
  const chips = DATA.ingredientKeys.map((k) => {
    const on = f.avoid.includes(k);
    return `<button type="button" class="chip" role="checkbox" aria-checked="${on}" data-avoid="${k}"><span class="mark" aria-hidden="true">${on ? "✓" : "+"}</span>${t(`ingredient.${k}`)}</button>`;
  }).join("");
  const spiceOpts = ["any", 0, 1, 2, 3].map((v) => `<option value="${v}" ${String(f.maxSpice ?? "any") === String(v) ? "selected" : ""}>${t(`spice.${v}`)}</option>`).join("");
  const types = [{ id: "all" }, ...DATA.categories].map((c) => `<button type="button" class="chip" role="radio" aria-checked="${f.foodType === c.id}" data-type="${c.id}">${categoryLabel(c.id)}</button>`).join("");

  main.innerHTML = `
    <p class="kicker">${t("finder.kicker")}</p>
    <h1>${t("finder.title")}</h1>
    <p class="lead">${t("finder.description")}</p>
    <section class="finder" aria-labelledby="pref-h">
      <h2 id="pref-h">⚙ ${t("finder.preferences")}</h2>
      <div class="field"><span class="label" id="avoid-l">${t("finder.avoid")}</span><div class="chips" role="group" aria-labelledby="avoid-l">${chips}</div></div>
      <div class="field"><label class="label" for="spice">${t("finder.spice")}</label><select id="spice">${spiceOpts}</select></div>
      <div class="field"><span class="label" id="type-l">${t("finder.foodType")}</span><div class="chips" role="radiogroup" aria-labelledby="type-l">${types}</div></div>
      <button type="button" class="link-btn" id="clear">${t("finder.clear")}</button>
      <p class="sample-warning">${t("finder.sampleWarning")}</p>
    </section>
    <div id="results"></div>`;

  main.querySelectorAll("[data-avoid]").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.avoid;
    f.avoid = f.avoid.includes(k) ? f.avoid.filter((x) => x !== k) : [...f.avoid, k];
    renderHome();
  }));
  $("#spice").addEventListener("change", (e) => { f.maxSpice = e.target.value === "any" ? null : Number(e.target.value); renderResults(); });
  main.querySelectorAll("[data-type]").forEach((b) => b.addEventListener("click", () => { f.foodType = b.dataset.type; renderHome(); }));
  $("#clear").addEventListener("click", () => { state.filters = { avoid: [], maxSpice: null, foodType: "all" }; renderHome(); });

  renderResults();
  if (state.scrollY) { window.scrollTo(0, state.scrollY); state.scrollY = 0; }
}

function renderResults() {
  const { results, excludedUnverified, filtered } = Filter.applyFilters(DATA.menus, state.filters);
  const count = results.length === 1 ? t("results.countOne") : t("results.count", { n: results.length });
  let body;
  if (results.length === 0) {
    body = `<div class="empty"><p><strong>${t("results.empty")}</strong></p><p>${t("results.emptyHint")}</p><button type="button" class="link-btn" id="clear2">${t("finder.clear")}</button></div>`;
  } else {
    body = `<div class="grid">${results.map((m) => cardHTML(m)).join("")}</div>`;
  }
  $("#results").innerHTML = `
    <div class="results-head"><h2>${filtered ? t("results.matching") : t("results.all")}</h2><span class="count">${count}</span></div>
    ${filterSummaryHTML()}
    ${body}
    ${excludedUnverified > 0 ? `<p class="notice warn">${t("results.excludedUnverified")}</p>` : ""}`;
  $("#clear2")?.addEventListener("click", () => { state.filters = { avoid: [], maxSpice: null, foodType: "all" }; renderHome(); });
  live.textContent = `${filtered ? t("results.matching") : t("results.all")}: ${count}`;
}

// ── S02 상세
function renderDetail(id) {
  setActiveNav("menu");
  const menu = findMenu(id);
  if (!menu) {
    main.innerHTML = `<div class="empty"><p>${t("detail.notFound")}</p><a class="btn secondary" href="#/">${t("detail.back")}</a></div>`;
    return;
  }
  const ing = DATA.ingredientKeys.map((k) => {
    const s = menu.ingredients?.[k] ?? "unknown";
    return `<li><span>${t(`ingredient.${k}`)}</span><span class="status ${s}">${t(`detail.status.${s}`)}</span></li>`;
  }).join("");
  const reasons = Filter.matchedReasons(menu, state.filters);
  const matched = Filter.hasAnyFilter(state.filters)
    ? (reasons.length ? `<ul class="matched">${reasons.map((r) => `<li>${r.type === "avoid" ? `${t("detail.status.absent_verified")}: ${t(`ingredient.${r.key}`)}` : r.type === "spice" ? spiceLabel(r.level) : categoryLabel(r.id)}</li>`).join("")}</ul>` : "")
    : `<p class="small">${t("detail.noFilters")}</p>`;
  const sold = menu.availability === "sold_out" ? `<span class="badge sold">${t("card.soldOut")}</span>` : "";

  main.innerHTML = `
    <a class="back" href="#/" id="back">‹ ${t("detail.back")}</a>
    ${photoHTML(menu, true)}
    <div class="detail-head">
      <span class="num">${menu.sample ? t("card.sample") + " · " : ""}${t("card.menuNo")} ${esc(menu.menuNumber)} ${sold}</span>
      <h1>${esc(menuName(menu))}</h1>
      <div class="name-ko" lang="ko">${esc(menu.nameKo)}</div>
      <div class="price">${menu.priceKrw === null ? t("card.pricePending") : `${menu.priceKrw.toLocaleString()} KRW`}${menu.servingKo ? ` · <span lang="ko">${esc(menu.servingKo)}</span>` : ""}</div>
    </div>
    ${menuField(menu, "description") ? `<p class="lead">${esc(menuField(menu, "description"))}</p>` : ""}
    ${menu.salesNoteKo ? `<p class="notice info"><strong>${t("detail.salesNote")}:</strong> <span lang="ko">${esc(menu.salesNoteKo)}</span></p>` : ""}
    ${menu.translations?.[state.lang]?.status === "draft" || (!menu.translations?.[state.lang] && menu.translations?.en?.status === "draft") ? `<p class="small">${t("detail.draftTranslation")}</p>` : ""}
    <section class="panel"><h2>${t("detail.ingredients")}</h2><ul class="ing-list">${ing}</ul>
      ${menuField(menu, "ingredientNote") ? `<p class="small">${esc(menuField(menu, "ingredientNote"))}</p>` : ""}
      <p class="small">${t("detail.statusNote")}</p></section>
    <section class="panel"><h2>${t("detail.spice")}</h2><span class="badge spice">${spiceLabel(menu.spiceLevel)}</span></section>
    <section class="panel"><h2>${t("detail.matched")}</h2>${matched}</section>
    <p class="notice warn">${t("allergy.note")} ${t("allergy.notVegan")}</p>
    <a class="btn" href="#/find/${esc(menu.menuNumber)}">${t("detail.findInStore")}</a>
    <a class="btn secondary" href="#/how-to-order">${t("detail.howToOrder")}</a>`;
  window.scrollTo(0, 0);
}

// ── S03 매장에서 찾기
function renderFind(id) {
  setActiveNav("menu");
  const menu = findMenu(id);
  if (!menu) { location.hash = "#/"; return; }
  main.innerHTML = `
    <div class="find">
      <p class="kicker">${menu.sample ? t("find.kicker") : t("card.menuNo")}</p>
      <div class="big-num">${esc(menu.menuNumber)}</div>
      <p class="big-ko" lang="ko">${esc(menu.nameKo)}</p>
      <p class="sub">${esc(menuName(menu))}</p>
      ${photoHTML(menu, true)}
      <p class="instruction">${t("find.instruction")}</p>
      <p class="notice info">${t("order.note")}</p>
      ${menu.sample ? `<p class="small">${t("find.demoNumber")}</p>` : ""}
      <a class="btn secondary" href="#/menu/${esc(menu.menuNumber)}">${t("find.back")}</a>
    </div>`;
  window.scrollTo(0, 0);
}

// ── S06 추천
function renderRecommendations() {
  setActiveNav("recommendations");
  const list = Filter.recommendedMenus(DATA.recs, DATA.menus, state.filters, "owner");
  let body;
  if (state.recTab === "country") {
    body = `<p class="notice info">${t("rec.countryPending")}</p>`;
  } else if (list.length === 0) {
    body = `<div class="empty"><p><strong>${t("rec.empty")}</strong></p><a class="link-btn" href="#/">${t("rec.viewAll")}</a></div>`;
  } else {
    body = `<div class="grid">${list.map(({ rec, menu }) => cardHTML(menu, `<p class="reason">${esc(recReason(rec))}</p>`)).join("")}</div>
      <p class="small">${t("rec.sampleNote")}</p>`;
  }
  main.innerHTML = `
    <p class="kicker">${t("finder.kicker")}</p>
    <h1>${t("rec.title")}</h1>
    <p class="lead">${t("rec.filtersApply")}</p>
    ${filterSummaryHTML()}
    <div class="tabs" role="tablist">
      <button type="button" role="tab" aria-selected="${state.recTab === "owner"}" data-tab="owner">${t("rec.owner")}</button>
      <button type="button" role="tab" aria-selected="${state.recTab === "country"}" data-tab="country">${t("rec.country")}</button>
    </div>
    ${body}`;
  main.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { state.recTab = b.dataset.tab; renderRecommendations(); }));
}

// ── S04 주문 방법
function renderHow() {
  setActiveNav("how");
  const s = DATA.store.howToOrder;
  const steps = s.steps.map((st, i) => {
    const title = state.lang === "ko" ? st.titleKo : (st.titleEn || st.titleKo);
    const body = (state.lang === "ko" ? st.bodyKo : st.bodyEn) || t("toBeConfirmed");
    return `<li><span class="n">${i + 1}</span><div><div class="t">${esc(title)}</div><div class="b">${esc(body)}</div></div></li>`;
  }).join("");
  main.innerHTML = `
    <p class="kicker">${t("how.kicker")}</p>
    <h1>${t("how.title")}</h1>
    <p class="lead">${t("how.intro")}</p>
    ${s.confirmed ? "" : `<p class="notice warn">${t("how.pending")}</p>`}
    <section class="panel"><ol class="steps">${steps}</ol></section>
    <a class="btn secondary" href="#/">${t("nav.menu")}</a>`;
}

// ── S05 방문 안내
function renderVisit() {
  setActiveNav("visit");
  const v = DATA.store.visit;
  const val = (x) => (x && String(x).trim() ? esc(x) : `<span class="small">${t("toBeConfirmed")}</span>`);
  main.innerHTML = `
    <p class="kicker">${t("visit.kicker")}</p>
    <h1>${t("visit.title")}</h1>
    <p class="lead" lang="ko">${esc(DATA.store.nameKo)} · ${esc(DATA.store.taglineKo)}</p>
    ${v.confirmed ? "" : `<p class="notice warn">${t("visit.pending")}</p>`}
    <section class="panel"><dl class="kv">
      <dt>${t("visit.address")}</dt><dd>${val(v.addressEn || v.addressKo)}</dd>
      <dt>${t("visit.hours")}</dt><dd>${v.hours?.length ? v.hours.map(esc).join("<br>") : `<span class="small">${t("toBeConfirmed")}</span>`}</dd>
    </dl>
    ${v.mapUrl ? `<a class="btn secondary" href="${esc(v.mapUrl)}" target="_blank" rel="noopener">${t("visit.map")}</a>` : ""}</section>
    <a class="btn secondary" href="#/">${t("nav.menu")}</a>`;
}

// ── 시작
(function init() {
  try {
    DATA = loadData();
  } catch (e) {
    main.innerHTML = `<div class="empty"><p>데이터 파일을 읽지 못했어요. content 폴더의 .js 파일을 확인해 주세요.</p><p class="small">${esc(e.message)}</p></div>`;
    return;
  }
  setupLang();
  applyStaticText();
  // 상세로 갈 때 목록 위치를 기억해 두었다가 돌아오면 복원
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a.card");
    if (a) state.scrollY = window.scrollY;
  });
  window.addEventListener("hashchange", render);
  render();
})();
