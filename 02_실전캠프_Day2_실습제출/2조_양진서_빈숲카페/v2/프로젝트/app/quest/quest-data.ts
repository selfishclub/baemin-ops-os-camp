import type { Recipe, RecipeContent, RecipeMode } from "../recipes/recipe-data";
import type { ManualDoc } from "../manual/manual-data";

// 이번 주 퀘스트: 사람마다 다른 문제를 "정해진 규칙"으로 만든다 (저장하지 않아도 같은 사람·같은 주면 늘 같은 퀘스트).
// 씨앗 = 직원 ID + 주 시작일. 문제 은행은 화면에 나가지 않고, 깬 기록(quest_progress)만 창고에 남는다.
// 순수 함수만 — tests/quest-data.test.mjs 가 검사.

export type QuestKind = "quiz" | "practice" | "read" | "mission";

export type Quest = {
  id: string;
  kind: QuestKind;
  title: string;
  detail: string;
  points: number;
  href?: string;
  // quiz 만: 보기와 정답. 정답은 화면으로 보내지 않는다 (publicQuest 로 벗긴다)
  choices?: string[];
  answer?: string;
  // practice/read: 어떤 기록이 있으면 깬 것으로 치는지
  checkKey?: string;
};

export type QuestStatus = "open" | "done" | "pending" | "confirmed";

export type QuestProgressRow = {
  quest_id: string;
  status: QuestStatus;
  attempts: number;
  note: string;
  done_at: string | null;
  confirmed_at: string | null;
  confirmed_by_name?: string | null;
};

export const questPoints: Record<QuestKind, number> = { quiz: 3, practice: 3, read: 2, mission: 5 };
export const questsPerWeek = 5;

// 한국 시간 기준 이번 주 월요일 (YYYY-MM-DD)
export function weekStartSeoul(now = new Date()): string {
  const seoul = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const weekday = (seoul.getDay() + 6) % 7; // 월요일 = 0
  const monday = new Date(Date.UTC(seoul.getFullYear(), seoul.getMonth(), seoul.getDate() - weekday));
  return monday.toISOString().slice(0, 10);
}

export function previousWeekStart(weekStart: string): string {
  const date = new Date(`${weekStart}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 7);
  return date.toISOString().slice(0, 10);
}

// 문자열 → 32비트 씨앗 (FNV-1a)
export function seedOf(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

// 씨앗으로 정해지는 난수 (mulberry32)
export function makeRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWith<T>(items: T[], rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function parseMeasure(value: string): { amount: number; unit: string } | null {
  const match = /^(\d+(?:\.\d+)?)\s*([a-zA-Z가-힣]+)?$/.exec(value.trim());
  return match ? { amount: Number(match[1]), unit: match[2] ?? "" } : null;
}

const modeLabel: Record<string, string> = { ICE: "ICE", HOT: "HOT", UP: "사이즈업", DINE: "매장", TOGO: "포장" };

// 레시피 정량 문제 후보 전부 (순서가 정해져 있어야 씨앗이 같으면 같은 문제가 나온다)
function recipeQuizPool(content: RecipeContent, rng: () => number): Quest[] {
  const pool = content.recipes.flatMap((recipe) => Object.values(recipe.variants).flatMap((variant) => variant?.quick.map((item) => item.value) ?? []));
  const quests: Quest[] = [];
  for (const recipe of content.recipes) {
    for (const mode of Object.keys(recipe.variants) as RecipeMode[]) {
      const variant = recipe.variants[mode];
      if (!variant) continue;
      for (const item of variant.quick) {
        if (!item.label.trim() || !item.value.trim()) continue;
        const parsed = parseMeasure(item.value);
        const wrong = new Set<string>();
        for (const value of shuffleWith(pool, rng)) {
          if (value !== item.value && (!parsed || parseMeasure(value)?.unit === parsed.unit)) wrong.add(value);
          if (wrong.size >= 3) break;
        }
        if (parsed) for (const factor of [0.5, 1.5, 2, 3]) {
          if (wrong.size >= 3) break;
          const value = `${Math.round(parsed.amount * factor * 10) / 10}${parsed.unit}`;
          if (value !== item.value) wrong.add(value);
        }
        if (wrong.size < 2) continue;
        quests.push({
          id: `quiz:recipe:${recipe.id}:${mode}:${item.label}`,
          kind: "quiz",
          title: `「${recipe.name}」 ${modeLabel[mode] ?? mode} 정량 맞히기`,
          detail: `${item.label} 양은?`,
          points: questPoints.quiz,
          choices: shuffleWith([item.value, ...[...wrong].slice(0, 3)], rng),
          answer: item.value,
        });
      }
    }
  }
  return quests;
}

function manualQuizPool(docs: ManualDoc[], rng: () => number): Quest[] {
  const quests: Quest[] = [];
  const name = (doc: ManualDoc) => doc.title.replace(/^예시\s*·\s*/, "");
  for (const doc of docs) {
    for (const field of ["donts", "reportWhen"] as const) {
      const answer = doc[field][0];
      const others = shuffleWith([...new Set(docs.filter((item) => item.id !== doc.id).flatMap((item) => item[field]))].filter((item) => !doc[field].includes(item)), rng).slice(0, 3);
      if (!answer || others.length < 3) continue;
      quests.push({
        id: `quiz:manual:${doc.id}:${field}`,
        kind: "quiz",
        title: `「${name(doc)}」 매뉴얼 맞히기`,
        detail: field === "donts" ? "하면 안 된다고 적힌 것은?" : "바로 보고하거나 책임자를 불러야 하는 때는?",
        points: questPoints.quiz,
        choices: shuffleWith([answer, ...others], rng),
        answer,
      });
    }
  }
  return quests;
}

export type QuestContext = {
  userId: string;
  weekStart: string;
  content: RecipeContent;
  docs: ManualDoc[]; // 이 사람이 볼 수 있는 문서만
  practicedRecipeIds: Set<string>; // 이미 "만들어 봤음"
  readDocIds: Set<string>; // 이미 "읽었어요"
};

// 이번 주 퀘스트 5개: 레시피 문제 1 + 매뉴얼 문제 1 + 메뉴 만들어 보기 1 + 매뉴얼 읽기 1 + 적용 미션 1 (재료가 모자라면 그만큼 줄어든다)
export function buildWeeklyQuests(ctx: QuestContext): Quest[] {
  const rng = makeRng(seedOf(`${ctx.userId}|${ctx.weekStart}`));
  const quests: Quest[] = [];

  const recipeQuiz = recipeQuizPool(ctx.content, rng);
  if (recipeQuiz.length) quests.push(recipeQuiz[Math.floor(rng() * recipeQuiz.length)]);

  const manualQuiz = manualQuizPool(ctx.docs, rng);
  if (manualQuiz.length) quests.push(manualQuiz[Math.floor(rng() * manualQuiz.length)]);

  // 아직 안 만들어 본 메뉴 먼저, 다 해 봤으면 복습
  const recipes: Recipe[] = ctx.content.recipes;
  const fresh = recipes.filter((recipe) => !ctx.practicedRecipeIds.has(recipe.id));
  const practicePool = fresh.length ? fresh : recipes;
  if (practicePool.length) {
    const recipe = practicePool[Math.floor(rng() * practicePool.length)];
    const review = !fresh.length;
    quests.push({
      id: `practice:${recipe.id}`,
      kind: "practice",
      title: `「${recipe.name}」 ${review ? "다시 만들어 보기" : "만들어 보기"}`,
      detail: review ? "교육 경로에서 ‘만들어 봤음’이 이미 있어요. 이번 주에 한 번 더 만들어 보고 사장님께 확인받으면 돼요." : "레시피를 보고 만든 뒤 교육 경로에서 ‘만들어 봤음’을 누르면 자동으로 깨져요.",
      points: questPoints.practice,
      href: "/recipes/training",
      checkKey: recipe.id,
    });
  }

  const unread = ctx.docs.filter((doc) => !ctx.readDocIds.has(doc.id));
  const readPool = unread.length ? unread : ctx.docs;
  if (readPool.length) {
    const doc = readPool[Math.floor(rng() * readPool.length)];
    quests.push({
      id: `read:${doc.id}`,
      kind: "read",
      title: `「${doc.title.replace(/^예시\s*·\s*/, "")}」 읽기`,
      detail: unread.length ? "매뉴얼을 읽고 교육 경로에서 ‘읽었어요’를 누르면 자동으로 깨져요." : "이미 읽은 문서예요. 다시 한 번 읽어 두면 좋아요 (교육 경로의 ‘읽었어요’ 기록으로 깨져요).",
      points: questPoints.read,
      href: `/manual/${doc.sectionId}?doc=${encodeURIComponent(doc.id)}`,
      checkKey: `manual:${doc.id}`,
    });
  }

  quests.push({
    id: "mission",
    kind: "mission",
    title: "이번 주 매장에서 적용할 것 한 가지",
    detail: "매뉴얼이나 레시피에서 배운 것 중 이번 주에 실제로 해 볼 한 가지를 적고, 해냈으면 ‘해냈어요’를 눌러요. 사장님이 확인하면 깨져요.",
    points: questPoints.mission,
  });

  return quests.slice(0, questsPerWeek);
}

// 화면으로 보낼 때: 정답을 뺀다
export function publicQuest(quest: Quest): Omit<Quest, "answer"> {
  const { answer: _answer, ...rest } = quest;
  void _answer;
  return rest;
}

export function isCorrect(quest: Quest, choice: string) {
  return quest.kind === "quiz" && Boolean(quest.answer) && quest.answer === choice;
}

export type QuestView = Omit<Quest, "answer"> & { status: QuestStatus; attempts: number; note: string; done_at: string | null; confirmed_at: string | null; confirmed_by_name: string | null };

// 퀘스트 + 진행 기록 + 교육 기록(자동 완료)을 합쳐 화면용으로
export function mergeProgress(quests: Quest[], rows: QuestProgressRow[], done: { practicedRecipeIds: Set<string>; readDocIds: Set<string> }): QuestView[] {
  const byId = new Map(rows.map((row) => [row.quest_id, row]));
  return quests.map((quest) => {
    const row = byId.get(quest.id);
    let status: QuestStatus = row?.status ?? "open";
    if (quest.kind === "practice" && quest.checkKey && done.practicedRecipeIds.has(quest.checkKey)) status = "done";
    if (quest.kind === "read" && quest.checkKey && done.readDocIds.has(quest.checkKey.replace(/^manual:/, ""))) status = "done";
    return { ...publicQuest(quest), status, attempts: row?.attempts ?? 0, note: row?.note ?? "", done_at: row?.done_at ?? null, confirmed_at: row?.confirmed_at ?? null, confirmed_by_name: row?.confirmed_by_name ?? null };
  });
}

export function isCleared(status: QuestStatus) {
  return status === "done" || status === "confirmed";
}

export function countCleared(views: { status: QuestStatus }[]) {
  return views.filter((view) => isCleared(view.status)).length;
}
