// 가짜 "리뷰 수집기 내보내기" 파일 — 리뷰 · 순위 · 배민 정산을 시연용으로. 실제 손님·금액 아님.
// 실행: node scripts/make-sample-export.mjs  → public/sample/가짜_리뷰수집기_내보내기.json
import fs from "node:fs";
import path from "node:path";

let seed = 20260915;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const day = (n) => new Date(Date.UTC(2026, 8, 1) + n * 86_400_000).toISOString().slice(0, 10); // 2026-09-01 + n
const TODAY = "2026-10-15";

const NAMES = ["김**", "이**", "박**", "최**", "정**", "조**", "윤**", "장**", "한**", "오**"];
const GOOD = ["숯불향이 진해서 맛있어요", "양도 많고 친절해요", "닭목살구이 최고예요", "재방문 의사 있어요", "포장 깔끔하고 빨라요", "볶음밥까지 꼭 드세요"];
const BAD = ["배달이 40분 넘게 걸렸어요", "조금 짰어요", "양이 예전보다 줄었어요", "포장이 새서 아쉬웠어요"];
const QUESTION = ["포장하면 할인 되나요?", "4인 세트도 있나요?", "주차 가능한가요?"];
const MENUS = ["양념닭갈비", "소금닭갈비", "치즈닭갈비", "닭목살구이", "[너랑나랑] 2인 SET"];
const TOPICS_GOOD = ["맛·품질", "양", "친절", "재방문"];
const TOPICS_BAD = ["배달 지연", "간", "양", "포장"];

const reviews = [];
let id = 1;
for (let n = 0; n < 45; n++) {
  const platform = pick(["naver", "naver", "baemin", "baemin", "coupang"]);
  const d = day(n);
  const bad = rnd() < 0.18;
  const q = !bad && rnd() < 0.1;
  const rating = platform === "naver" && rnd() < 0.3 ? null : bad ? pick([2, 3]) : 5;
  const answered = n < 36 ? rnd() < 0.8 : rnd() < 0.3;
  const content = q ? pick(QUESTION) : bad ? pick(BAD) : pick(GOOD);
  reviews.push({
    platform, id: String(id++), rating, content, menu: platform === "naver" ? null : pick(MENUS),
    date: `${d}T${String(11 + Math.floor(rnd() * 10)).padStart(2, "0")}:12:00.000Z`, visitDate: null, author: pick(NAMES),
    reply: answered ? "소중한 리뷰 감사합니다. 또 뵐게요!" : null, replyDate: answered ? `${day(n + 1)}T09:00:00.000Z` : null,
    topics: bad ? [pick(TOPICS_BAD)] : [pick(TOPICS_GOOD)], complaintType: bad ? "서비스" : null, ownerOnly: false, imageCount: rnd() < 0.3 ? 1 : 0,
    orderCount: platform === "coupang" ? Math.ceil(rnd() * 5) : null,
    draft: answered ? null : { text: q ? "안녕하세요 손님! [여기에 답을 적어 주세요] 언제든 들러 주세요 :)" : bad ? "불편을 드려 죄송합니다. 말씀 주신 부분은 바로 점검하겠습니다. 다음엔 더 신경 쓰겠습니다." : "맛있게 드셨다니 저희도 기쁩니다! 다음에도 숯불향 가득 담아 드릴게요 :)", status: "draft", needsOwnerInput: q },
  });
}

const KEYWORDS = ["청주맛집", "율량동맛집", "청주닭갈비", "율량동닭갈비"];
const base = { 청주맛집: null, 율량동맛집: 38, 청주닭갈비: 43, 율량동닭갈비: 6 };
const history = [];
for (let n = 20; n <= 44; n++) {
  for (const k of KEYWORDS) {
    const b = base[k];
    const rank = b === null ? null : Math.max(1, b - Math.floor((n - 20) / 8) + Math.floor(rnd() * 3) - 1);
    history.push({ date: day(n), keyword: k, rank, blog: 120 + n, visitor: 290 + n * 2, save: 400 + n, total: b === null ? 50 : 50, note: n === 43 ? "읽지 못했어요: 인터넷 끊김" : null });
  }
}
const latest = {
  date: day(44),
  results: KEYWORDS.map((k) => ({
    keyword: k, total: 50,
    mine: base[k] === null ? null : { rank: base[k], name: "숯불에닭 청주율량점 (가짜)" },
    top: Array.from({ length: 10 }, (_, i) => ({ rank: i + 1, name: i + 1 === base[k] ? "숯불에닭 청주율량점 (가짜)" : `가짜 ${pick(["닭갈비", "고깃집", "국밥", "카페"])} ${i + 1}호`, blog: 50 + i * 7, visitor: 300 - i * 20, save: 200 - i * 10 })),
    adNames: ["가짜 광고가게 A"],
  })),
};

const orders = [];
for (let n = 0; n <= 44; n++) {
  const cnt = 6 + Math.floor(rnd() * 8);
  const gross = cnt * (19_000 + Math.floor(rnd() * 6_000));
  const settled = n <= 41;
  orders.push({
    date: day(n), orders: cnt, settledOrders: settled ? cnt : 0, unsettledOrders: settled ? 0 : cnt,
    gross: settled ? gross : 0, discount: settled ? Math.round(gross * 0.02) : 0, otherRevenue: 0,
    deductions: settled ? { brokerage: Math.round(gross * 0.068), payment: Math.round(gross * 0.03), delivery: cnt * 2_900, vat: Math.round(gross * 0.0128), unclassified: 0 } : { brokerage: 0, payment: 0, delivery: 0, vat: 0, unclassified: 0 },
  });
}
const settlements = [];
for (let w = 0; w < 6; w++) {
  const ps = day(w * 7), pe = day(w * 7 + 6);
  const inPeriod = orders.filter((o) => o.date >= ps && o.date <= pe);
  const net = inPeriod.reduce((a, o) => a + o.gross - o.discount - o.deductions.brokerage - o.deductions.payment - o.deductions.delivery - o.deductions.vat, 0);
  settlements.push({ giveId: `G${w + 1}`, depositDueDate: day(w * 7 + 9), status: w < 5 ? "입금완료" : "입금요청", periodStart: ps, periodEnd: pe, depositAmount: net - 38_500, adCost: 38_500, adDaily: inPeriod.map((o) => ({ date: o.date, amount: 5_500 })), adjustment: 0 });
}
const stats = {
  "2026-09": { orderAmount: 6_420_000, orderCount: 290, groups: { CPC: { cost: 165_000, orderCount: 52, orderAmount: 1_140_000 } } },
  "2026-10": { orderAmount: 3_010_000, orderCount: 136, groups: { CPC: { cost: 77_000, orderCount: 24, orderAmount: 520_000 } } },
};

const out = {
  kind: "sootdak-ledger-export", version: 1, exportedAt: `${TODAY}T08:30:00.000Z`, shop: { name: "숯불에닭 청주율량점 (가짜)" },
  reviews, rank: { shop: "숯불에닭 청주율량점 (가짜)", shopId: "0000000000", keywords: KEYWORDS, history, latest },
  baemin: { collectedAt: `${TODAY}T08:00:00.000Z`, orderRange: { start: day(0), end: day(44) }, settlements, orders, stats, unknownCodes: [] },
};
const file = path.join("public", "sample", "가짜_리뷰수집기_내보내기.json");
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(out), "utf8");
console.log(`${file}: 리뷰 ${reviews.length}건 · 순위 ${history.length}줄 · 정산 ${settlements.length}건 (${(fs.statSync(file).size / 1024).toFixed(0)}KB)`);
