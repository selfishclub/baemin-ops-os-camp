import type { Category, Sentiment } from "./types";

/** 카테고리별 키워드 (규칙 기반 1차 분류) */
const KEYWORDS: Record<Exclude<Category, "사진" | "불만">, RegExp> = {
  맛: /맛있|맛나|존맛|jmt|꿀맛|간이|짭|달달|매콤|얼큰|담백|고소|진하|국물|풍미|맛집|맛없|싱거|짜요|짜다|느끼|맵|칼칼|육즙|바삭|촉촉|쫄깃|부드러|깊은 맛|맛도/i,
  양: /양이|양도|양 많|양많|푸짐|넉넉|배불|배부|양 적|양이 적|양적|부족|두둑|가득|많아서|양은/,
  포장: /포장|용기|비닐|샜|흘렀|새서|뚜껑|밀봉|담아|담겨|국물이 새|터져|깔끔하게 담/,
  배달: /배달|빨리|빠르|빨라|늦|지연|도착|따뜻하게 왔|식어|식었|뜨끈하게 왔|배송|기사님|시간 맞|금방 왔|금방 와/,
  서비스: /친절|서비스|사장님|리뷰이벤트|리뷰 이벤트|메모|손편지|쪽지|챙겨|덤|정성|세심|신경/,
  가격: /가격|가성비|비싸|저렴|싸다|싸요|합리|혜자|비용|값/,
  재주문: /또 시켜|또시켜|재주문|또 주문|또주문|단골|자주 시|자주시|항상|매번|또 먹|다시 시|재구매|늘 |맨날|자주 먹|믿고|여기만|또 올|또올|번째/,
};

const NEGATIVE =
  /아쉽|아쉬|별로|실망|누락|빠졌|빠져|안 왔|안왔|안 들어|안들어|식었|식어서|불친절|최악|다시는|환불|이물|머리카락|늦게|너무 짜|싱거|불만|비추|후회|짜증|엉망|차가|미지근|덜 익|눅눅|비린|기분 나쁘|기분나쁘|실수|잘못|안 주셨|안주셨|빼먹|형편없|떨어지|너무 작|양이 작|양이 적|너무 적|적어요|맛이 없|맛없|맛이 변|짜요|짜네|퍽퍽|질겨|누린내|잡내가 나|안 시킬|안시킬|다신 안|불편/;
const POSITIVE =
  /맛있|맛나|존맛|jmt|최고|굿|좋아|좋았|좋네|만족|감사|추천|푸짐|친절|빠르|빨라|정성|훌륭|완벽|사랑|짱|대박|믿고|또 시|재주문|단골|행복|든든|해장|꿀맛|👍|😍|❤|♥|ㅎㅎ|ㅋㅋ|굳|좋습니다|좋아요|잘 먹|잘먹|맛있게|고마/i;

export interface ClassifyInput {
  review_text: string;
  order_menu?: string;
  delivery_review?: string;
  rating?: number | null;
  has_photo?: boolean;
  order_count?: number | null;
}

export interface ClassifyResult {
  categories: Category[];
  sentiment: Sentiment;
  score: number;
}

function countMatches(re: RegExp, text: string): number {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  return (text.match(g) || []).length;
}

export function classifyReview(input: ClassifyInput): ClassifyResult {
  const text = (input.review_text || "").trim();
  const categories: Category[] = [];

  for (const [cat, re] of Object.entries(KEYWORDS) as [Category, RegExp][]) {
    if (re.test(text)) categories.push(cat);
  }
  // 배민 배달만족도는 '아쉬워요'일 때만 배달 카테고리로 (기본값 '좋아요'는 정보가 없음)
  if (/아쉬워요/.test(input.delivery_review || "") && !categories.includes("배달")) categories.push("배달");
  if (input.has_photo) categories.push("사진");

  const neg = countMatches(NEGATIVE, text) + (/아쉬워요/.test(input.delivery_review || "") ? 1 : 0);
  const pos = countMatches(POSITIVE, text);
  const rating = typeof input.rating === "number" ? input.rating : null;

  let sentiment: Sentiment;
  if (rating !== null && rating <= 2) sentiment = neg > 0 || pos === 0 ? "negative" : "mixed";
  else if (neg > 0 && pos > 0) sentiment = "mixed";
  else if (neg > 0) sentiment = rating !== null && rating >= 4 ? "mixed" : "negative"; // 별점은 높은데 불만 신호만 있으면 혼합
  else if (pos > 0 || (rating !== null && rating >= 4)) sentiment = "positive";
  else sentiment = "neutral";

  if (sentiment === "negative" || sentiment === "mixed") categories.push("불만");

  // 콘텐츠 소재 가치 점수 (0~100): 구체적이고 긍정적이며 사진이 있는 리뷰가 높음
  let score = 20;
  score += (Math.min(text.length, 160) / 160) * 25; // 길이 (최대 25)
  score += Math.min(categories.filter((c) => c !== "불만" && c !== "사진").length, 4) * 5; // 구체성
  if (input.has_photo) score += 10;
  if (sentiment === "positive") score += 15;
  if (sentiment === "mixed") score += 3;
  if (sentiment === "negative") score -= 25;
  if (rating === 5) score += 8;
  if (rating !== null && rating <= 3) score -= 10;
  if (input.order_menu) score += 3;
  if (typeof input.order_count === "number" && input.order_count >= 3) score += 4;
  if (text.length < 8) score -= 15;
  score = Math.max(0, Math.min(100, Math.round(score)));

  return { categories: Array.from(new Set(categories)), sentiment, score };
}
