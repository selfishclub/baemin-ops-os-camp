// 쿠팡이츠 사장님 포털(store.coupangeats.com) 리뷰 수집 (2단계)
// 사용: node scripts/crawl-coupang.mjs [--ingest ...] [--url 리뷰페이지주소] [--quick]
import { clickReviewMenu, deliver, fetchKnownIds, log, openBrowser, parseArgs, sleep, waitForPage } from "./lib/common.mjs";

const args = parseArgs();
const START_URL = args.url || "https://store.coupangeats.com/merchant/management/reviews";

const SCRAPE = `
  () => {
    const collected = new Map();
    function climb(el) {
      let node = el, card = null;
      for (let d = 0; node && d < 14; d++, node = node.parentElement) {
        const c = ((node.innerText || "").match(/주문번호/g) || []).length;
        if (c === 1) card = node;
        if (c > 1) break;
      }
      return card;
    }
    function parseCard(card) {
      const text = card.innerText || "";
      const om = text.match(/주문번호\\s*([A-Z0-9]{4,})/);
      if (!om) return null;
      const bs = card.querySelectorAll("b");
      const customer_name = bs[0] ? (bs[0].innerText || "").trim() : "";
      const ocm = text.match(/(\\d+)\\s*회\\s*주문/);
      let rating = 0;
      for (const p of card.querySelectorAll("svg path")) if (((p.getAttribute("fill") || "").toUpperCase()) === "#FFC400") rating++;
      if (rating > 5) rating = 5;
      let review_date = "";
      const dre = /(\\d{4}-\\d{2}-\\d{2})(\\(주문일\\))?/g; let mm;
      while ((mm = dre.exec(text))) { if (!mm[2]) { review_date = mm[1]; break; } }
      let review_text = "";
      if (review_date) {
        const a = text.indexOf(review_date) + review_date.length;
        let b = text.indexOf("주문메뉴"); if (b < 0) b = text.indexOf("주문번호");
        if (b > a) review_text = text.slice(a, b).trim();
      }
      let order_menu = "";
      const mi = text.indexOf("주문메뉴"), oi = text.indexOf("주문번호");
      if (mi >= 0 && oi > mi) order_menu = text.slice(mi + 4, oi).replace(/\\s*ㆍ\\s*/g, " / ").trim();
      let owner_reply = "";
      const lines = text.split("\\n").map(s => s.trim()).filter(Boolean);
      const oi2 = lines.findIndex(l => /^사장님$|사장님 댓글$/.test(l));
      if (oi2 >= 0) owner_reply = lines.slice(oi2 + 1, oi2 + 6).filter(l => !/수정|삭제|등록하기/.test(l)).join(" ").trim();
      return {
        external_review_id: "coupangeats_" + om[1], customer_name, rating: rating || null,
        order_count: ocm ? Number(ocm[1]) : null, review_date, review_text, order_menu,
        has_photo: card.querySelectorAll("img").length > 1, owner_reply,
        raw_payload: { source: "coupangeats_portal", platform: "coupangeats", crawler: "playwright" },
      };
    }
    for (const el of document.querySelectorAll("span, div, p, b, strong")) {
      if (el.children.length > 2) continue;
      const t = el.textContent || "";
      if (t.length > 40 || !/주문번호/.test(t)) continue;
      const card = climb(el); if (!card) continue;
      const r = parseCard(card); if (r) collected.set(r.external_review_id, r);
    }
    return [...collected.values()];
  }
`;

async function main() {
  const ctx = await openBrowser("coupangeats");
  try {
    const page = ctx.pages()[0] || (await ctx.newPage());
    log(`이동: ${START_URL}`);
    await page.goto(START_URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => log("페이지 로딩 지연:", e.message.split("\n")[0]));
    const ready = await waitForPage(page, () => /주문번호/.test(document.body?.innerText || ""), {
      message: "▶ 리뷰 화면을 기다리는 중… 로그인이 필요하면 열린 크롬 창에서 로그인해주세요. 로그인 뒤에는 리뷰 메뉴를 자동으로 찾아갑니다. (최대 10분 대기)",
      assist: clickReviewMenu,
    });
    if (!ready) throw new Error("리뷰 화면을 확인하지 못했습니다.");
    console.log(`REVIEW_URL ${page.url()}`);

    const all = new Map();
    const known = args.all ? new Set() : await fetchKnownIds(args.ingest, args.token, "coupangeats");
    if (known.size) log(`이미 저장된 리뷰 ${known.size}개 — 새 리뷰만 수집합니다`);
    const maxPages = args.quick ? 1 : 30;
    const scrapeFn = new Function("return (" + SCRAPE + ")")();
    for (let p = 1; p <= maxPages; p++) {
      await sleep(800);
      const items = (await page.evaluate(scrapeFn)) || [];
      let fresh = 0, alreadySaved = 0;
      for (const r of items) {
        if (all.has(r.external_review_id)) continue;
        if (known.has(r.external_review_id)) { alreadySaved++; continue; }
        all.set(r.external_review_id, r); fresh++;
      }
      log(`${p}페이지: ${items.length}개 (새로 ${fresh}개, 이미 저장됨 ${alreadySaved}개, 누적 ${all.size}개)`);
      if (p === maxPages || (p > 1 && fresh === 0)) break;
      if (!args.all && alreadySaved > 0 && fresh === 0) { log("저장된 리뷰만 나와 중단"); break; }
      const next = page.locator('button:has-text("다음"), a:has-text("다음"), [aria-label*="다음"], [aria-label*="next" i], button:has-text(">")').first();
      if (!(await next.count()) || !(await next.isEnabled().catch(() => false))) { log("다음 페이지 버튼이 없어 종료"); break; }
      await next.click().catch(() => {});
      await sleep(1500);
    }
    await deliver([...all.values()], { platform: "coupangeats", ingest: args.ingest, token: args.token, sourceUrl: page.url() });
  } finally {
    await ctx.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error("오류:", e.message);
  process.exit(1);
});
