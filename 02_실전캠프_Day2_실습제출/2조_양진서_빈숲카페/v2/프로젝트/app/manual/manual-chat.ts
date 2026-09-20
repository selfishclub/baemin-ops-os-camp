import { normalizeQuestion, type ChatAnswer } from "../recipes/chat-engine";
import { manualLabels, type ManualDoc } from "./manual-data";

// 챗봇의 매뉴얼 쪽 "규칙 답변기". 외부 AI 없이 매뉴얼 문서·응대 카드에 적힌 내용만 답한다.
// 넘겨받은 문서(= 그 사람이 볼 수 있는 영역의 문서) 안에서만 찾는다. 없으면 null — 지어내지 않는다.

// 이 낱말만 맞아서는 그 문서라고 보지 않는다
const genericWords = new Set(["예시", "순서", "방법", "기초", "준비", "매일", "하는", "우리", "매장", "때", "전", "시", "손님", "주문", "문의"].map(normalizeQuestion));

const intentWords = {
  donts: ["하면안", "금지", "주의", "조심", "안되", "안돼", "말하면안", "하지말"],
  report: ["보고", "연락", "누구", "알려야", "말해야", "책임자", "불러", "사장님"],
  done: ["완료", "끝난", "끝내", "기준", "확인받", "혼자", "해도돼", "해도되", "범위"],
  materials: ["준비물", "필요한", "챙길"],
};

function tokens(value: string) {
  return value.split(/[\s·,/()]+/).map(normalizeQuestion).filter((token) => token.length >= 2);
}

function hasIntent(question: string, words: string[]) {
  return words.some((word) => question.includes(normalizeQuestion(word)));
}

export function findManual(docs: ManualDoc[], sectionTitles: Record<string, string>, rawQuestion: string): ManualDoc | null {
  const question = normalizeQuestion(rawQuestion);
  let best: { doc: ManualDoc; score: number } | null = null;
  for (const doc of docs) {
    const keywordHits = (doc.keywords ?? []).map(normalizeQuestion).filter((word) => word.length >= 2 && question.includes(word));
    const titleHits = tokens(doc.title).filter((token) => question.includes(token));
    const sectionHits = tokens(sectionTitles[doc.sectionId] ?? "").filter((token) => question.includes(token));
    const specific = [...keywordHits, ...titleHits, ...sectionHits].filter((token) => !genericWords.has(token));
    if (!specific.length) continue;
    const score = keywordHits.length * 3 + titleHits.length * 2 + sectionHits.length;
    if (!best || score > best.score) best = { doc, score };
  }
  return best?.doc ?? null;
}

export function answerFromManuals(docs: ManualDoc[], sectionTitles: Record<string, string>, rawQuestion: string): ChatAnswer | null {
  const doc = findManual(docs, sectionTitles, rawQuestion);
  if (!doc) return null;
  const question = normalizeQuestion(rawQuestion);
  const labels = manualLabels(doc.kind);
  const isCard = doc.kind === "response";
  const list = (title: string, items: string[], numbered = false) => (items.length ? [title, ...items.map((item, index) => (numbered ? `${index + 1}. ${item}` : `· ${item}`))] : []);

  const text: string[] = [`${sectionTitles[doc.sectionId] ?? "매뉴얼"} · ${doc.title}`];
  const wants = {
    donts: hasIntent(question, intentWords.donts),
    report: hasIntent(question, intentWords.report),
    done: hasIntent(question, intentWords.done),
    materials: !isCard && hasIntent(question, intentWords.materials),
  };
  if (wants.materials) text.push(...list(labels.materials, doc.materials));
  if (wants.done) text.push(...list(labels.doneCriteria, doc.doneCriteria));
  if (wants.donts) text.push(...list(labels.donts, doc.donts));
  if (wants.report) text.push(...list(labels.reportWhen, doc.reportWhen));
  // 콕 집어 묻지 않았으면 순서(응대 카드는 "이렇게 말해요")를 기본으로, 하면 안 되는 것 한 줄을 덧붙인다
  if (text.length === 1) {
    text.push(...list(labels.steps, doc.steps, !isCard));
    if (doc.donts[0]) text.push(`${labels.donts}: ${doc.donts[0]}`);
    if (isCard && doc.reportWhen[0]) text.push(`${labels.reportWhen}: ${doc.reportWhen[0]}`);
  }

  return { found: true, source: "rule", text, updatedAt: doc.updatedAt, manualId: doc.id, manualTitle: doc.title, href: `/manual/${doc.sectionId}?doc=${encodeURIComponent(doc.id)}` };
}
