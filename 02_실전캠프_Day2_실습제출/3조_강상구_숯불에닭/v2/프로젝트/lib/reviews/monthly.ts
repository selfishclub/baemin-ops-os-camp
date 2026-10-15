// 한달 분석 · 마케팅 자료 — 카페스이 리뷰 모음소의 "한달 분석"(한 줄 요약 · 칭찬 · 아쉬움·질문 · 메뉴 · 마케팅 소구점 · 이달의 손님 문장 · 회의 자료)과
// "마케팅 자료"(리뷰 속 손님 문장을 인스타 캐러셀 · 릴스 · 플레이스 소식 주제로) 틀을 우리 리뷰 자료로 낸다.
// AI를 부르지 않는다 — 규칙으로 고르고, AI에게 부탁할 문장은 복사해서 사장님이 직접 붙인다.
import type { ExportReview, ReviewPlatform } from "../export/types";
import { PLATFORM_NAME, dayOf, isComplaint, isQuestion, isUnanswered, visible } from "./stats";

export interface TopicCount {
  topic: string;
  count: number;
  examples: string[]; // 짧은 손님 문장 최대 3개
}

export interface MenuMention {
  menu: string;
  count: number;
  avgRating: number | null;
}

export interface MonthlyReport {
  month: string;
  prevMonth: string;
  count: number;
  prevCount: number;
  avgRating: number | null;
  prevAvgRating: number | null;
  answerRate: number | null;
  complaints: number;
  questions: number;
  byPlatform: { platform: ReviewPlatform; name: string; count: number }[];
  praise: TopicCount[]; // 별점 4 이상 리뷰의 주제
  regrets: TopicCount[]; // 아쉬운 리뷰의 주제
  questionList: string[]; // 손님 질문 문장
  menus: MenuMention[]; // 리뷰에 적힌 메뉴
  sentences: ExportReview[]; // 이달의 손님 문장 10
  sellingPoints: string[]; // 마케팅 소구점 — 칭찬 주제에서
  oneLine: string; // 이 달을 한 줄로
}

const short = (s: string) => s.replace(/\s+/g, " ").trim();
const isGoodSentence = (s: string) => s.length >= 12 && s.length <= 90 && !/http|\d{3}-\d{4}/.test(s);
const avg = (rs: ExportReview[]) => {
  const rated = rs.filter((r) => r.rating !== null);
  return rated.length ? Math.round((rated.reduce((a, r) => a + r.rating!, 0) / rated.length) * 100) / 100 : null;
};

function topicCounts(rs: ExportReview[]): TopicCount[] {
  const m = new Map<string, { count: number; examples: string[] }>();
  for (const r of rs) {
    for (const t of r.topics) {
      const e = m.get(t) ?? { count: 0, examples: [] };
      e.count++;
      const s = short(r.content);
      if (e.examples.length < 3 && isGoodSentence(s)) e.examples.push(s);
      m.set(t, e);
    }
  }
  return [...m].map(([topic, e]) => ({ topic, ...e })).sort((a, b) => b.count - a.count);
}

export const prevMonthOf = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};

export function monthlyReport(all: ExportReview[], month: string): MonthlyReport {
  const rs = visible(all).filter((r) => dayOf(r.date)!.startsWith(month));
  const prev = visible(all).filter((r) => dayOf(r.date)!.startsWith(prevMonthOf(month)));
  const good = rs.filter((r) => r.rating !== null && r.rating >= 4);
  const bad = rs.filter(isComplaint);
  const praise = topicCounts(good).slice(0, 8);
  const regrets = topicCounts(bad).slice(0, 6);

  const menuMap = new Map<string, ExportReview[]>();
  for (const r of rs) {
    if (!r.menu) continue;
    for (const name of r.menu.split(/,|·|\//).map((s) => s.replace(/\[.*?\]/g, "").trim()).filter(Boolean)) {
      menuMap.set(name, [...(menuMap.get(name) ?? []), r]);
    }
  }
  const menus = [...menuMap].map(([menu, list]) => ({ menu, count: list.length, avgRating: avg(list) })).sort((a, b) => b.count - a.count).slice(0, 8);

  const sentences = [...good]
    .filter((r) => isGoodSentence(short(r.content)))
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.content.length - a.content.length)
    .slice(0, 10);

  const answered = rs.filter((r) => !isUnanswered(r)).length;
  const ar = avg(rs);
  const pr = avg(prev);
  const diff = rs.length - prev.length;
  const oneLine = rs.length
    ? `${Number(month.slice(5))}월 리뷰 ${rs.length}건(지난달 ${prev.length}건${diff ? `, ${diff > 0 ? "+" : ""}${diff}` : ""})${ar !== null ? ` · 평균 ★${ar.toFixed(1)}${pr !== null && Math.abs(ar - pr) >= 0.1 ? ` (지난달 ${pr.toFixed(1)})` : ""}` : ""}${praise[0] ? ` · 가장 많이 들은 칭찬 "${praise[0].topic}"` : ""}${bad.length ? ` · 아쉬움 ${bad.length}건` : " · 아쉬운 리뷰 없음"}`
    : `${Number(month.slice(5))}월에는 리뷰가 없어요`;

  return {
    month,
    prevMonth: prevMonthOf(month),
    count: rs.length,
    prevCount: prev.length,
    avgRating: ar,
    prevAvgRating: pr,
    answerRate: rs.length ? Math.round((answered / rs.length) * 1000) / 10 : null,
    complaints: bad.length,
    questions: rs.filter(isQuestion).length,
    byPlatform: (["naver", "baemin", "coupang"] as ReviewPlatform[]).map((p) => ({ platform: p, name: PLATFORM_NAME[p], count: rs.filter((r) => r.platform === p).length })).filter((x) => x.count > 0),
    praise,
    regrets,
    questionList: rs.filter(isQuestion).map((r) => short(r.content)).slice(0, 6),
    menus,
    sentences,
    sellingPoints: praise.slice(0, 3).map((p) => `${p.topic} — 손님 ${p.count}명이 말했어요${p.examples[0] ? `: "${p.examples[0]}"` : ""}`),
    oneLine,
  };
}

/** 회의에 붙일 글 — 복사용 */
export function meetingText(r: MonthlyReport): string {
  const L: string[] = [];
  L.push(`[${r.month} 리뷰 한달 분석]`);
  L.push(r.oneLine);
  if (r.byPlatform.length) L.push(`플랫폼: ${r.byPlatform.map((p) => `${p.name} ${p.count}`).join(" · ")} · 답변률 ${r.answerRate ?? "-"}%`);
  if (r.praise.length) L.push(`칭찬: ${r.praise.map((p) => `${p.topic}(${p.count})`).join(", ")}`);
  if (r.regrets.length) L.push(`아쉬움: ${r.regrets.map((p) => `${p.topic}(${p.count})`).join(", ")}`);
  if (r.questionList.length) L.push(`질문: ${r.questionList.slice(0, 3).join(" / ")}`);
  if (r.menus.length) L.push(`메뉴 언급: ${r.menus.slice(0, 5).map((m) => `${m.menu} ${m.count}${m.avgRating !== null ? `(★${m.avgRating.toFixed(1)})` : ""}`).join(", ")}`);
  if (r.sentences.length) L.push(`손님 문장: ${r.sentences.slice(0, 3).map((s) => `"${short(s.content)}"`).join(" / ")}`);
  L.push("할 일과 담당만 정하기:");
  return L.join("\n");
}

// ── 마케팅 자료 ─────────────────────────────────────────────────────────
export type Channel = "캐러셀" | "릴스" | "플레이스 소식";

export interface MarketingIdea {
  review: ExportReview;
  sentence: string;
  theme: string; // 손님 말에서 잡은 주제
  channel: Channel; // 어디에 올리면 좋나
  why: string;
  hookPrompt: string; // AI에게 훅 카피를 부탁하는 문장 (복사용)
}

const RULES: { test: RegExp; theme: string; channel: Channel; why: string }[] = [
  { test: /재방문|또 |다시 |단골|자주 /, theme: "다시 찾는 이유", channel: "플레이스 소식", why: "단골 손님 말은 플레이스 소식에 그대로 — 처음 오는 손님이 가장 믿는 말" },
  { test: /포장|배달|빨리|빠르|따끈|따뜻/, theme: "포장·배달 경험", channel: "릴스", why: "포장을 여는 순간, 김이 오르는 장면은 짧은 영상이 어울려요" },
  { test: /양|푸짐|넉넉|많/, theme: "양·가성비", channel: "캐러셀", why: "양은 사진 한 장이 말보다 빨라요 — 세트 구성 캐러셀" },
  { test: /숯불|불향|직화|구이|바삭|육즙|촉촉/, theme: "맛의 포인트", channel: "릴스", why: "숯불·불향은 소리와 연기가 보이는 영상이 가장 셉니다" },
  { test: /친절|서비스|사장님|직원/, theme: "사람·응대", channel: "플레이스 소식", why: "응대 칭찬은 가게 이야기로 — 사장님 이야기 게시물이 반응이 좋아요" },
  { test: /회식|모임|가족|아이|단체|데이트/, theme: "이런 자리에", channel: "캐러셀", why: "용도(회식·가족)는 '이럴 때 오세요' 캐러셀로" },
];

export function marketingIdeas(all: ExportReview[], month: string, max = 6): MarketingIdea[] {
  const rs = visible(all)
    .filter((r) => dayOf(r.date)!.startsWith(month) && r.rating !== null && r.rating >= 4)
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  const out: MarketingIdea[] = [];
  const usedTheme = new Map<string, number>();
  for (const r of rs) {
    const sentence = short(r.content);
    if (!isGoodSentence(sentence)) continue;
    const rule = RULES.find((x) => x.test.test(sentence));
    const theme = rule?.theme ?? (r.menu ? `메뉴 — ${r.menu.replace(/\[.*?\]/g, "").trim().split(/,|·/)[0]}` : "손님이 좋아한 것");
    const channel: Channel = rule?.channel ?? "캐러셀";
    const n = usedTheme.get(theme) ?? 0;
    if (n >= 2) continue; // 같은 주제는 둘까지
    usedTheme.set(theme, n + 1);
    out.push({
      review: r,
      sentence,
      theme,
      channel,
      why: rule?.why ?? "메뉴 이름이 들어간 칭찬은 메뉴 소개 캐러셀의 표지 문장이 돼요",
      hookPrompt: `아래는 우리 가게 손님이 남긴 리뷰 문장이에요. 이 문장을 바탕으로 ${channel === "릴스" ? "릴스 첫 화면" : channel === "캐러셀" ? "인스타 캐러셀 첫 장" : "네이버 플레이스 소식 첫 줄"}에 쓸 훅 카피 5개를 제안해 주세요. 과장하지 말고 손님 말투를 살려 주세요.\n\n리뷰: "${sentence}"${r.menu ? `\n메뉴: ${r.menu}` : ""}\n주제: ${theme}`,
    });
    if (out.length >= max) break;
  }
  return out;
}
