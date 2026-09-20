import type { ManualDoc } from "./manual-data";

// 신입 교육 경로: "언제까지 무엇을 익히나"를 단계로 묶는다. 단계 안에는 매뉴얼 문서·응대 카드와 레시피가 섞여 들어간다.
// 직원은 문서는 "읽었어요", 메뉴는 "만들어 봤음"을 누르고, 사장이 직접 보고 "확인함"을 눌러야 끝난다 (자동 완료 없음).
// 공개용 버전이라 아래 단계는 가짜 예시다 — 기간·순서는 매장에서 정한다.

export type PathItem = { type: "manual" | "recipe"; id: string };

export type TrainingStage = {
  id: string;
  // 1일차, 1주차 …
  title: string;
  // 이 단계가 끝나면 할 수 있어야 하는 것
  goal: string;
  items: PathItem[];
};

// 체크 기록 표(training_checks.recipe_id)에 매뉴얼 문서를 적을 때 쓰는 열쇠. 레시피는 레시피 id 그대로.
export const manualCheckPrefix = "manual:";
export const checkKey = (item: PathItem) => (item.type === "manual" ? `${manualCheckPrefix}${item.id}` : item.id);

const manual = (id: string): PathItem => ({ type: "manual", id });
const recipe = (id: string): PathItem => ({ type: "recipe", id });

export const defaultTrainingPath: TrainingStage[] = [
  {
    id: "stage-day1",
    title: "예시 · 1일차",
    goal: "(예시) 매장의 기준을 알고, 손님을 맞이하고, 위생 기본을 지킨다",
    items: [manual("demo-standard-motto"), manual("demo-hygiene-daily"), manual("demo-service-greeting"), manual("demo-service-handover")],
  },
  {
    id: "stage-week1",
    title: "예시 · 1주차",
    goal: "(예시) 기본 메뉴를 기준대로 만들고, 오픈 준비를 같이 한다",
    items: [manual("demo-open-prep"), manual("demo-barista-espresso"), recipe("demo-americano"), recipe("demo-cafe-latte"), manual("demo-service-soldout"), manual("demo-service-allergy")],
  },
  {
    id: "stage-week2",
    title: "예시 · 2주차",
    goal: "(예시) 피크 시간에 한 역할을 맡고, 마감을 같이 한다",
    items: [manual("demo-middle-peak"), manual("demo-close-closing"), recipe("demo-vanilla-latte"), manual("demo-service-wrong-drink"), manual("demo-service-pay-error")],
  },
  {
    id: "stage-day30",
    title: "예시 · 30일차",
    goal: "(예시) 혼자 오픈·마감을 하고, 어려운 상황에서 책임자를 부를 기준을 안다",
    items: [manual("demo-open-cash"), manual("demo-equipment-trouble"), manual("demo-service-refund"), manual("demo-service-abuse"), manual("demo-service-injury")],
  },
];

export function getTrainingPath(content: { trainingPath?: TrainingStage[] } | null | undefined): TrainingStage[] {
  return content?.trainingPath ?? defaultTrainingPath;
}

// 매뉴얼 문서로 만드는 4지선다. 보기의 오답은 다른 문서의 같은 칸에서 가져온다 (말투가 같아서 읽어 봐야 고를 수 있게).
export type ManualQuizQuestion = { id: string; question: string; choices: string[]; answer: string };

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function buildManualQuiz(docs: ManualDoc[], count: number): ManualQuizQuestion[] {
  const questions: ManualQuizQuestion[] = [];
  const name = (doc: ManualDoc) => doc.title.replace(/^예시\s*·\s*/, "");
  for (const doc of shuffle(docs)) {
    if (questions.length >= count) break;
    // 문서마다 번갈아: '하면 안 되는 것' 또는 '보고·책임자를 부르는 기준'
    const field = questions.length % 2 === 0 ? 'donts' : 'reportWhen';
    const answer = doc[field][0];
    const others = shuffle([...new Set(docs.filter((item) => item.id !== doc.id).flatMap((item) => item[field]))].filter((item) => !doc[field].includes(item))).slice(0, 3);
    if (!answer || others.length < 3) continue;
    questions.push({
      id: 'manual-' + field + '-' + doc.id,
      question: field === 'donts' ? '‘' + name(doc) + '’에서 하면 안 된다고 적힌 것은?' : '‘' + name(doc) + '’에서 바로 보고하거나 책임자를 불러야 하는 때는?',
      choices: shuffle([answer, ...others]),
      answer,
    });
  }
  return questions;
}
