// 크롤러 공통 헬퍼 (playwright-core + 사용자의 실제 크롬 사용)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function log(...args) {
  const t = new Date().toLocaleTimeString("ko-KR", { hour12: false });
  console.log(`[${t}]`, ...args);
}

/** .env.local 을 읽어 process.env 에 넣습니다 (이미 있는 값은 유지) */
export function loadEnvLocal() {
  const file = path.join(ROOT, ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

/** 명령줄 인자. 없으면 .env.local 의 STUDIO_INGEST_URL / INGEST_TOKEN 을 기본값으로 씁니다 */
export function parseArgs(argv = process.argv.slice(2)) {
  loadEnvLocal();
  const out = { ingest: process.env.STUDIO_INGEST_URL?.trim() || "", url: "", token: process.env.INGEST_TOKEN?.trim() || "", quick: false, all: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--ingest") out.ingest = argv[++i] || "";
    else if (a === "--url") out.url = argv[++i] || "";
    else if (a === "--token") out.token = argv[++i] || "";
    else if (a === "--quick") out.quick = true;
    else if (a === "--all") out.all = true; // 이미 저장된 리뷰가 나와도 끝까지 수집
  }
  return out;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 사용자의 크롬(없으면 엣지)을 전용 프로필로 띄웁니다. 로그인 상태가 프로필에 남아 다음부터는 바로 진행됩니다. */
export async function openBrowser(profileName) {
  const dir = path.join(ROOT, "data", "browser-profiles", profileName);
  fs.mkdirSync(dir, { recursive: true });
  const opts = {
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: ["--disable-blink-features=AutomationControlled", "--no-first-run", "--no-default-browser-check"],
    ignoreDefaultArgs: ["--enable-automation"],
    locale: "ko-KR",
  };
  for (const channel of ["chrome", "msedge"]) {
    try {
      const ctx = await chromium.launchPersistentContext(dir, { ...opts, channel });
      log(`브라우저 실행 (${channel})`);
      return ctx;
    } catch (e) {
      log(`${channel} 실행 실패: ${e.message.split("\n")[0]}`);
    }
  }
  throw new Error("크롬 또는 엣지를 찾지 못했습니다. 크롬을 설치해주세요.");
}

/** 페이지 안에서 predicate 가 true 가 될 때까지 기다립니다 (사용자 로그인 대기 등) */
export async function waitForPage(page, predicate, { timeoutMs = 10 * 60 * 1000, message = "", every = 1500, assist = null } = {}) {
  const started = Date.now();
  let lastMsg = 0;
  let lastAssist = 0;
  while (Date.now() - started < timeoutMs) {
    try {
      if (await page.evaluate(predicate)) return true;
    } catch {
      /* 페이지 이동 중 */
    }
    // assist: 로그인은 돼 있는데 리뷰 화면이 아닐 때, 메뉴를 대신 눌러 리뷰 화면으로 이동
    if (assist && Date.now() - lastAssist > 4000) {
      lastAssist = Date.now();
      try {
        const did = await assist(page);
        if (did) log(`메뉴 클릭: ${did}`);
      } catch { /* ignore */ }
    }
    if (message && Date.now() - lastMsg > 15000) {
      log(message);
      lastMsg = Date.now();
    }
    await sleep(every);
  }
  return false;
}

/** 페이지 안에서 텍스트가 정확히 '리뷰'(또는 '리뷰 관리') 인 메뉴/링크를 찾아 클릭. 로그인 화면이면 아무것도 하지 않음 */
export async function clickReviewMenu(page) {
  return page.evaluate(() => {
    const body = document.body?.innerText || "";
    if (/비밀번호|아이디를 입력|로그인하기|로그인$/m.test(body) && document.querySelector("input[type='password']")) return "";
    const cands = Array.from(document.querySelectorAll("a, button, [role='menuitem'], [role='button'], li, span"))
      .filter((el) => {
        const t = (el.textContent || "").replace(/\s+/g, " ").trim();
        if (!/^(리뷰|리뷰 관리|리뷰관리|리뷰 ?· ?댓글)$/.test(t)) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
    const el = cands.find((e) => e.tagName === "A" || e.tagName === "BUTTON") || cands[0];
    if (!el) return "";
    const target = el.closest("a, button, [role='menuitem']") || el;
    target.scrollIntoView({ block: "center" });
    const r = target.getBoundingClientRect();
    const opts = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      target.dispatchEvent(type.startsWith("pointer") ? new PointerEvent(type, opts) : new MouseEvent(type, opts));
    }
    return (target.textContent || "").trim().slice(0, 20);
  });
}

/** 스크롤 가능한 컨테이너를 찾아 끝까지 내리며 collect() 를 반복 호출 (페이지 컨텍스트에서 실행) */
export const AUTO_SCROLL_SNIPPET = `
  async function autoScroll(collectOnce, maxRounds, shouldStop) {
    const doc = document.scrollingElement || document.documentElement;
    const candidates = Array.from(document.querySelectorAll("div, main, section"))
      .filter(el => {
        const st = getComputedStyle(el); const r = el.getBoundingClientRect();
        return el.scrollHeight > el.clientHeight + 300 && r.height > 300 && r.width > 400 && ["auto","scroll","overlay"].includes(st.overflowY);
      })
      .sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight));
    const target = candidates[0] || doc;
    const isDoc = target === doc || target === document.body;
    const top = () => isDoc ? (scrollY || doc.scrollTop || 0) : target.scrollTop;
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    if (isDoc) window.scrollTo({ top: 0 }); else target.scrollTo({ top: 0 });
    await wait(600);
    collectOnce();
    // shouldStop(): 이미 저장된 리뷰만 계속 나오면 true 를 돌려 스크롤을 멈춥니다 (중복 수집 방지)
    let last = -1, same = 0, rounds = 0;
    for (let i = 0; i < maxRounds; i++) {
      const step = Math.max(650, Math.floor(innerHeight * 0.75));
      if (isDoc) window.scrollBy({ top: step }); else target.scrollBy({ top: step });
      await wait(700);
      rounds++;
      collectOnce();
      if (typeof shouldStop === "function" && shouldStop()) break;
      const now = top();
      if (Math.abs(now - last) < 5) same++; else same = 0;
      if (same >= 6) break;
      last = now;
    }
    return rounds;
  }
`;

/** 서버에 이미 저장된 리뷰 ID 목록 (중복 수집을 건너뛰기 위해). 서버가 없으면 빈 목록 */
export async function fetchKnownIds(ingest, token, platform) {
  if (!ingest) return new Set();
  try {
    const url = ingest.replace(/\/api\/reviews\/ingest\/?$/, "") + "/api/reviews/known?platform=" + encodeURIComponent(platform);
    const res = await fetch(url, { headers: token ? { "x-extension-token": token } : {} });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(data.ids)) return new Set();
    return new Set(data.ids);
  } catch {
    return new Set();
  }
}

/** 결과 저장 + 서버로 전송 */
export async function deliver(reviews, { platform, ingest, token, sourceUrl, storeId = "" }) {
  const dir = path.join(ROOT, "data", "crawl");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const payload = { platform_code: platform, store_id: storeId, source_url: sourceUrl, captured_at: new Date().toISOString(), reviews };
  const file = path.join(dir, `${platform}-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");
  log(`리뷰 ${reviews.length}개 → ${path.relative(ROOT, file)} 저장`);

  if (!ingest) {
    console.log(`RESULT ${JSON.stringify({ inserted: 0, updated: 0, total: reviews.length, saved: file })}`);
    return;
  }
  const res = await fetch(ingest, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { "x-extension-token": token } : {}) },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(`서버 저장 실패: ${data.message || res.status}`);
  log(`서버 저장 완료: ${data.message}`);
  console.log(`RESULT ${JSON.stringify({ inserted: data.inserted, updated: data.updated, total: data.total })}`);
}
