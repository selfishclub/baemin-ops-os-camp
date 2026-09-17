// 배달의민족 사장님 사이트(self.baemin.com) 리뷰 수집
// 사용: node scripts/crawl-baemin.mjs [--ingest http://127.0.0.1:3400/api/reviews/ingest] [--url 리뷰페이지주소] [--quick]
import { AUTO_SCROLL_SNIPPET, clickReviewMenu, deliver, fetchKnownIds, log, openBrowser, parseArgs, sleep, waitForPage } from "./lib/common.mjs";

const args = parseArgs();
const START_URL = args.url || "https://self.baemin.com/";

/* 페이지 컨텍스트에서 실행되는 수집 함수 (답변 완료·미답변 리뷰 모두 수집) */
const SCRAPE = `
  async (opts) => {
    ${AUTO_SCROLL_SNIPPET}
    const collected = new Map();

    function climbToCard(node) {
      let best = null;
      for (let d = 0; node && d < 20; d++, node = node.parentElement) {
        const t = node.innerText || "";
        const ids = t.match(/리뷰번호\\s*\\d{6,}/g);
        if (!ids) continue;
        if (ids.length > 1) break;
        if (/\\d{4}년\\s*\\d{1,2}월\\s*\\d{1,2}일/.test(t)) best = node;
      }
      return best;
    }

    function findCards() {
      const byId = new Map();
      for (const el of document.querySelectorAll("span, p, div, strong, em, li")) {
        if (el.children.length > 2) continue;
        const t = el.textContent || "";
        if (t.length > 40 || !/리뷰번호\\s*\\d{6,}/.test(t)) continue;
        const card = climbToCard(el);
        if (!card) continue;
        const m = (card.innerText || "").match(/리뷰번호\\s*(\\d{6,})/);
        if (m && !byId.has(m[1])) byId.set(m[1], card);
      }
      return byId;
    }

    function normalizeDate(v) {
      const m = String(v || "").match(/(\\d{4})년\\s*(\\d{1,2})월\\s*(\\d{1,2})일/);
      return m ? m[1] + "-" + String(m[2]).padStart(2, "0") + "-" + String(m[3]).padStart(2, "0") : "";
    }

    function detectRating(card) {
      // 별 아이콘(노란색 계열 채움) 개수로 추정. 확실치 않으면 null
      let n = 0;
      for (const p of card.querySelectorAll("svg path, svg polygon")) {
        const fill = (p.getAttribute("fill") || "").toLowerCase();
        if (/^#(ffc|ffb|fdb|fec|f9c|ffd|fb0|fa0|f5a|ffa)/.test(fill)) n++;
      }
      if (n >= 1 && n <= 5) return n;
      const aria = card.querySelector("[aria-label*='별점'], [aria-label*='점']");
      if (aria) {
        const m = (aria.getAttribute("aria-label") || "").match(/(\\d)/);
        if (m) return Number(m[1]);
      }
      return null;
    }

    function parseCard(card) {
      const text = card.innerText || "";
      const idMatch = text.match(/리뷰번호\\s*(\\d{6,})/);
      if (!idMatch) return null;
      const lines = text.split("\\n").map(s => s.trim()).filter(Boolean);
      const dateIdx = lines.findIndex(l => /\\d{4}년\\s*\\d{1,2}월\\s*\\d{1,2}일/.test(l));
      const review_date = normalizeDate(dateIdx >= 0 ? lines[dateIdx] : "");
      const customer_name = dateIdx > 0 ? lines[dateIdx - 1] : "";
      const ocMatch = text.match(/(\\d+)\\s*회\\s*주문\\s*고객/);
      const idxAfterOrder = lines.findIndex(l => /최근\\s*6개월\\s*누적\\s*주문/.test(l));
      const idxMenu = lines.findIndex(l => /^주문메뉴$/.test(l));
      const idxDelivery = lines.findIndex(l => /^배달리뷰$/.test(l));
      const idxOwner = lines.findIndex((l, i) => l === "사장님" && i > (dateIdx >= 0 ? dateIdx : 0));
      const idxBtn = lines.findIndex(l => /사장님 댓글 (등록|추가)하기/.test(l));
      const stops = [idxMenu, idxDelivery, idxOwner, idxBtn].filter(i => i >= 0);
      const end = (from) => { const s = stops.filter(i => i > from); return s.length ? Math.min(...s) : lines.length; };

      let review_text = "";
      if (idxAfterOrder >= 0) {
        review_text = lines.slice(idxAfterOrder + 1, end(idxAfterOrder)).filter(l => !/파트너님에게만 보이는 리뷰입니다/.test(l)).join("\\n").trim();
      } else if (dateIdx >= 0) {
        review_text = lines.slice(dateIdx + 1, end(dateIdx)).filter(l => !/파트너님에게만|리뷰번호/.test(l)).join("\\n").trim();
      }

      let order_menu = "";
      if (idxMenu >= 0) {
        const menus = [], comments = [];
        for (const l of lines.slice(idxMenu + 1, end(idxMenu))) { if (/^\\[/.test(l)) menus.push(l); else comments.push(l); }
        order_menu = menus.join(" / ");
        const c = comments.join(" ").trim();
        if (c) review_text = (review_text ? review_text + "\\n" : "") + c;
      }

      let delivery_review = "";
      if (idxDelivery >= 0 && idxDelivery + 1 < lines.length && /^(좋아요|아쉬워요)/.test(lines[idxDelivery + 1])) delivery_review = lines[idxDelivery + 1];

      let owner_reply = "";
      if (idxOwner >= 0) {
        const start = idxOwner + 1;
        const stop = lines.findIndex((l, i) => i >= start && (l === "삭제" || l === "수정" || /사장님 댓글 (등록|추가)하기/.test(l) || /리뷰번호/.test(l)));
        owner_reply = lines.slice(start, stop > 0 ? stop : Math.min(start + 10, lines.length))
          .filter(l => !/\\d{4}년\\s*\\d{1,2}월\\s*\\d{1,2}일/.test(l)).join(" ").trim();
      }

      return {
        external_review_id: "baemin_" + idMatch[1],
        customer_name, rating: detectRating(card), order_count: ocMatch ? Number(ocMatch[1]) : null,
        review_date, review_text, order_menu, delivery_review,
        owner_only: /파트너님에게만 보이는 리뷰입니다/.test(text),
        has_photo: /ReviewImages-module/.test(card.innerHTML || "") || card.querySelectorAll("img[src*='review']").length > 0,
        owner_reply,
        raw_payload: { source: "baemin_self", platform: "baemin", crawler: "playwright" },
      };
    }

    // 이미 저장된 리뷰(known)만 계속 나오면 멈춥니다: 새 리뷰 없는 스크롤이 4번 연속이고, 저장된 리뷰를 본 뒤
    const known = new Set(opts.knownIds || []);
    let seenKnown = 0, staleRounds = 0, newInRound = 0;
    function collectOnce() {
      newInRound = 0;
      for (const card of findCards().values()) {
        const r = parseCard(card);
        if (!r || collected.has(r.external_review_id)) continue;
        collected.set(r.external_review_id, r);
        if (known.has(r.external_review_id)) seenKnown++; else newInRound++;
      }
      staleRounds = newInRound === 0 ? staleRounds + 1 : 0;
    }
    const shouldStop = () => !opts.all && known.size > 0 && seenKnown >= 3 && staleRounds >= 4;

    let rounds = 0;
    if (opts.quick) collectOnce(); else rounds = await autoScroll(collectOnce, 900, shouldStop);
    const reviews = [...collected.values()];
    return { url: location.href, reviews, rounds, stoppedEarly: shouldStop(), knownSeen: seenKnown };
  }
`;

async function main() {
  const ctx = await openBrowser("baemin");
  try {
    const page = ctx.pages()[0] || (await ctx.newPage());
    log(`이동: ${START_URL}`);
    await page.goto(START_URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => log("페이지 로딩 지연:", e.message.split("\n")[0]));

    const isReviewPage = () => /리뷰번호\s*\d{6,}/.test(document.body?.innerText || "") || /사장님 댓글 (등록|추가)하기/.test(document.body?.innerText || "");
    const ready = await waitForPage(page, isReviewPage, {
      message: "▶ 리뷰 화면을 기다리는 중… 로그인이 필요하면 열린 크롬 창에서 로그인해주세요. 로그인 뒤에는 리뷰 메뉴를 자동으로 찾아갑니다. (최대 10분 대기)",
      assist: clickReviewMenu,
    });
    if (!ready) throw new Error("리뷰 화면을 확인하지 못했습니다. 로그인 후 다시 시도해주세요.");
    console.log(`REVIEW_URL ${page.url()}`); // 다음부터 바로 이 주소로 이동

    const known = args.all ? new Set() : await fetchKnownIds(args.ingest, args.token, "baemin");
    log(known.size ? `이미 저장된 리뷰 ${known.size}개 — 새 리뷰만 수집하고 멈춥니다` : "저장된 리뷰 없음 — 끝까지 수집합니다");
    log("리뷰 화면 감지 — 스크롤하며 수집합니다…");
    await sleep(1000);
    const scrapeFn = new Function("return (" + SCRAPE + ")")();
    const result = await page.evaluate(scrapeFn, { quick: args.quick, all: args.all, knownIds: [...known] });
    if (!result || !Array.isArray(result.reviews)) throw new Error("리뷰 파싱 결과가 비어 있습니다 (페이지 구조 변경 가능).");
    const fresh = result.reviews.filter((r) => !known.has(r.external_review_id));
    log(`읽은 리뷰 ${result.reviews.length}개 중 새 리뷰 ${fresh.length}개 (스크롤 ${result.rounds}회${result.stoppedEarly ? ", 저장된 리뷰가 이어져 중단" : ""})`);
    await deliver(fresh, { platform: "baemin", ingest: args.ingest, token: args.token, sourceUrl: result.url });
  } finally {
    await ctx.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error("오류:", e.message);
  process.exit(1);
});
