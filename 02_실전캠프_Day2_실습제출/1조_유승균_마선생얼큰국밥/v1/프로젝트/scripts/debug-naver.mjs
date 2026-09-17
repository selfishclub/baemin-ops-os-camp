// 네이버 리뷰 페이지 구조 진단: node scripts/debug-naver.mjs <플레이스ID> → data/debug/naver-dump.json
import fs from "node:fs";
import path from "node:path";
import { openBrowser, ROOT, sleep } from "./lib/common.mjs";

const id = process.argv[2];
if (!id) { console.error("플레이스 ID를 넘겨주세요"); process.exit(1); }
const ctx = await openBrowser("naver");
try {
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto(`https://m.place.naver.com/restaurant/${id}/review/visitor?reviewSort=recent`, { waitUntil: "domcontentloaded" });
  await sleep(3500);
  const dump = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll("li[class*='place_apply_pui']"));
    const lis = items.map(li => ({
      nick: (li.innerText || "").split("\n")[0],
      imgs: Array.from(li.querySelectorAll("img, video, [style*='background-image']")).map(el => el.outerHTML.replace(/data:image[^"']+/g, "data:...").slice(0, 300)),
      txt: (li.innerText || "").slice(0, 200).replace(/\n/g, " | "),
    }));
    return { count: items.length, body: document.body.innerText.slice(0, 2000), lis, firstHtml: items[0]?.outerHTML.replace(/data:image[^"']+/g, "data:...").slice(0, 12000) };
  });
  const out = path.join(ROOT, "data", "debug");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "naver-dump.json"), JSON.stringify(dump, null, 2), "utf8");
  console.log("저장:", path.join(out, "naver-dump.json"));
} finally {
  await ctx.close().catch(() => {});
}
