// 네이버 플레이스 방문자 리뷰 수집 (공개 페이지, 로그인 불필요)
// 사용: node scripts/crawl-naver.mjs --url https://naver.me/xxxx [--ingest ...] [--quick]
import { deliver, log, openBrowser, parseArgs, sleep } from "./lib/common.mjs";

const args = parseArgs();
if (!args.url) {
  console.error("--url 로 네이버 플레이스 주소를 넘겨주세요 (설정 페이지에 입력하면 자동으로 전달됩니다).");
  process.exit(1);
}

/* 페이지 컨텍스트: li.place_apply_pui 한 개 = 리뷰 한 건
   줄 순서: 닉네임 / 리뷰 n사진 n / 팔로우 / (별점 / 5 / 점) / "점심에 방문…" / 본문… / (더보기) / 키워드… / 반응 남기기 / 방문일 / 25.7.4.금 / 2025년 7월 4일 금요일 / n번째 방문 / 인증 수단 / 매장주문 / (가게명 / 7.26.일 / 사장님 답글) */
const SCRAPE = `
  () => {
    const out = new Map();
    function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h).toString(36); }
    const items = Array.from(document.querySelectorAll("li[class*='place_apply_pui']"));
    for (const li of items) {
      const lines = (li.innerText || "").split("\\n").map(s => s.trim()).filter(Boolean);
      if (lines.length < 4) continue;
      const tagSet = new Set(Array.from(li.querySelectorAll("ul li")).map(x => (x.innerText || "").trim()).filter(Boolean));
      const nick = lines[0].slice(0, 30);
      const profile = li.querySelector("a[href*='/my/']");
      const profileId = profile ? ((profile.getAttribute("href") || "").match(/\\/my\\/([a-z0-9]+)/) || [])[1] || "" : "";

      let rating = null;
      const ri = lines.findIndex(l => l === "별점");
      if (ri >= 0 && /^\\d$/.test(lines[ri + 1] || "")) rating = Number(lines[ri + 1]);

      let review_date = "";
      const dl = lines.find(l => /(\\d{4})년\\s*(\\d{1,2})월\\s*(\\d{1,2})일/.test(l));
      if (dl) { const m = dl.match(/(\\d{4})년\\s*(\\d{1,2})월\\s*(\\d{1,2})일/); review_date = m[1] + "-" + m[2].padStart(2, "0") + "-" + m[3].padStart(2, "0"); }

      // 본문 시작: '팔로우' 다음. 별점 블록(별점/5/점)과 방문 상황 줄("점심에 방문…")은 건너뜀
      let start = lines.findIndex(l => l === "팔로우") + 1;
      if (start <= 0) start = 1;
      if (lines[start] === "별점") start += 3;
      if (/방문/.test(lines[start] || "") && (lines[start] || "").length < 80 && !tagSet.has(lines[start])) start++;
      const stopRe = /^(더보기|반응 남기기|방문일|접기)$|^표정을 눌러/;
      let end = lines.findIndex((l, i) => i >= start && (stopRe.test(l) || tagSet.has(l)));
      if (end < 0) end = lines.length;
      const body = lines.slice(start, end).join("\\n").trim();
      const tags = lines.filter(l => tagSet.has(l));

      let review_text = body;
      if (tags.length) review_text = (review_text ? review_text + "\\n" : "") + "키워드: " + tags.join(", ");
      if (!review_text) continue;

      let owner_reply = "";
      const ai = lines.findIndex(l => l === "인증 수단");
      if (ai >= 0 && ai + 3 < lines.length) {
        owner_reply = lines.slice(ai + 3).filter(l => !/^\\d{1,2}\\.\\d{1,2}(\\.\\d{1,2})?\\.[가-힣]$/.test(l) && !/^\\d{4}년/.test(l)).join(" ").replace(/^[“"]|[”"]$/g, "").trim();
      }

      // 리뷰 사진: 프로필(38px)·이모지(18px)·반응 아이콘(22px) 등 작은 이미지는 제외
      const has_photo = Array.from(li.querySelectorAll("img, video")).some(el => {
        if (el.tagName === "VIDEO") return true;
        if (el.closest("a[href*='/my/']")) return false;
        const src = el.getAttribute("src") || el.getAttribute("data-src") || "";
        if (/^data:/.test(src) || /\\/static\\/pup\\//.test(src)) return false;
        const w = Number(el.getAttribute("width") || 0);
        if (w && w < 100) return false;
        return /^https?:/.test(src) || Boolean(el.getAttribute("data-src"));
      });

      const id = "naver_" + hash((profileId || nick) + "|" + review_date + "|" + body.slice(0, 60));
      if (out.has(id)) continue;
      out.set(id, {
        external_review_id: id, customer_name: nick, rating, review_date, review_text, has_photo, owner_reply,
        raw_payload: { source: "naver_place", platform: "naver", crawler: "playwright", tags, profileId },
      });
    }
    return [...out.values()];
  }
`;

async function main() {
  const ctx = await openBrowser("naver");
  try {
    const page = ctx.pages()[0] || (await ctx.newPage());
    log(`이동: ${args.url}`);
    await page.goto(args.url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(2000);
    let id = null;
    for (const u of [page.url(), ...page.frames().map((f) => f.url())]) {
      const m = u.match(/(?:restaurant|place|cafe|hairshop|hospital|accommodation)\/(\d{5,})/) || u.match(/[?&]id=(\d{5,})/);
      if (m) { id = m[1]; break; }
    }
    if (!id) {
      const html = await page.content();
      const m = html.match(/"id":"?(\d{6,})"?/) || html.match(/place\/(\d{6,})/);
      if (m) id = m[1];
    }
    if (!id) throw new Error("플레이스 ID를 찾지 못했습니다. 설정에 m.place.naver.com/restaurant/숫자 형태의 주소를 넣어주세요.");

    const reviewUrl = `https://m.place.naver.com/restaurant/${id}/review/visitor?reviewSort=recent`;
    log(`리뷰 페이지: ${reviewUrl}`);
    await page.goto(reviewUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(2500);

    const countItems = () => page.evaluate(() => document.querySelectorAll("li[class*='place_apply_pui']").length);
    const maxMore = args.quick ? 0 : 30;
    let before = await countItems();
    log(`리뷰 ${before}개 표시됨`);
    for (let i = 0; i < maxMore; i++) {
      // 목록 맨 아래의 '더보기'(다음 10개 불러오기) — 리뷰 li 밖에 있는 것만
      const clicked = await page.evaluate(() => {
        const lis = document.querySelectorAll("li[class*='place_apply_pui']");
        const lastLi = lis[lis.length - 1];
        if (!lastLi) return false;
        // 마지막 리뷰 뒤(DOM 순서)에 오는 '더보기'만 — 사진 섹션·헤더의 '더보기'는 제외
        const el = Array.from(document.querySelectorAll("a, button")).find(
          (e) => (e.innerText || "").trim() === "더보기" && !e.closest("li[class*='place_apply_pui']") && lastLi.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING
        );
        if (!el) return false;
        el.scrollIntoView({ block: "center" });
        el.click();
        return true;
      });
      if (!clicked) break;
      await sleep(1500);
      const after = await countItems();
      log(`더보기 ${i + 1}회 → ${after}개`);
      if (after === 0) {
        log("페이지가 바뀐 것 같아 이전 페이지로 돌아갑니다");
        await page.goBack().catch(() => {});
        await sleep(2000);
        break;
      }
      if (after <= before) break;
      before = after;
    }
    // 접힌 본문 펼치기 (리뷰 안의 '더보기')
    await page.evaluate(() => {
      for (const el of document.querySelectorAll("li[class*='place_apply_pui'] a, li[class*='place_apply_pui'] button, li[class*='place_apply_pui'] span")) {
        if ((el.textContent || "").trim() === "더보기") { try { el.click(); } catch {} }
      }
    }).catch(() => {});
    await sleep(800);

    const scrapeFn = new Function("return (" + SCRAPE + ")")();
    const reviews = await page.evaluate(scrapeFn);
    if (!Array.isArray(reviews)) throw new Error("리뷰 파싱 결과가 비어 있습니다 (페이지 구조 변경 가능).");
    log(`수집 완료: ${reviews.length}개`);
    await deliver(reviews, { platform: "naver", ingest: args.ingest, token: args.token, sourceUrl: reviewUrl, storeId: id });
  } finally {
    await ctx.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error("오류:", e.message);
  process.exit(1);
});
