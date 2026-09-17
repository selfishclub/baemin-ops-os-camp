import type { Recipe, RecipeContent, RecipeMode } from "./recipe-data";
import { recipeModeLabels } from "./recipe-data";

// 레시피 데이터로 4지선다 문제를 만든다. 외부 API 없음.
export type QuizQuestion = {
  id: string;
  question: string;
  choices: string[];
  answer: string;
};

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function parseMeasure(value: string): { amount: number; unit: string } | null {
  const match = /^(\d+(?:\.\d+)?)\s*([a-zA-Z가-힣]+)?$/.exec(value.trim());
  if (!match) return null;
  return { amount: Number(match[1]), unit: match[2] ?? "" };
}

// 정답과 헷갈릴 만한 오답 3개: 다른 메뉴의 같은 단위 값 → 부족하면 배수로 만든 값
function distractors(answer: string, pool: string[]): string[] {
  const parsed = parseMeasure(answer);
  const candidates = new Set<string>();
  for (const value of shuffle(pool)) {
    if (value !== answer && (!parsed || parseMeasure(value)?.unit === parsed.unit)) candidates.add(value);
    if (candidates.size >= 3) break;
  }
  if (parsed) {
    for (const factor of [0.5, 1.5, 2, 3, 0.25]) {
      if (candidates.size >= 3) break;
      const amount = Math.round(parsed.amount * factor * 10) / 10;
      const value = `${amount}${parsed.unit}`;
      if (value !== answer) candidates.add(value);
    }
  }
  return [...candidates].slice(0, 3);
}

function measureQuestions(recipe: Recipe, mode: RecipeMode, pool: string[]): QuizQuestion[] {
  const variant = recipe.variants[mode];
  if (!variant) return [];
  return variant.quick
    .filter((item) => item.label.trim() && item.value.trim())
    .map((item) => {
      const wrong = distractors(item.value, pool);
      if (wrong.length < 2) return null;
      return {
        id: `${recipe.id}-${mode}-${item.label}`,
        question: `「${recipe.name}」 ${recipeModeLabels[mode]}의 ${item.label} 양은?`,
        choices: shuffle([item.value, ...wrong]),
        answer: item.value,
      };
    })
    .filter((question): question is QuizQuestion => Boolean(question));
}

function stepQuestion(recipe: Recipe, mode: RecipeMode): QuizQuestion | null {
  const steps = recipe.variants[mode]?.steps.map((step) => step.trim()).filter(Boolean) ?? [];
  if (steps.length < 3) return null;
  const index = Math.floor(Math.random() * steps.length);
  const others = shuffle(steps.filter((_, i) => i !== index)).slice(0, 3);
  return {
    id: `${recipe.id}-${mode}-step-${index}`,
    question: `「${recipe.name}」 ${recipeModeLabels[mode]} 제조 순서에서 ${index + 1}번째 단계는?`,
    choices: shuffle([steps[index], ...others]),
    answer: steps[index],
  };
}

export function buildQuiz(content: RecipeContent, count = 10): QuizQuestion[] {
  const pool = content.recipes.flatMap((recipe) =>
    Object.values(recipe.variants).flatMap((variant) => variant?.quick.map((item) => item.value) ?? []),
  );
  const questions: QuizQuestion[] = [];
  for (const recipe of content.recipes) {
    for (const mode of Object.keys(recipe.variants) as RecipeMode[]) {
      questions.push(...measureQuestions(recipe, mode, pool));
      const step = stepQuestion(recipe, mode);
      if (step) questions.push(step);
    }
  }
  // 같은 메뉴가 몰리지 않게 섞은 뒤 앞에서 자른다
  return shuffle(questions).slice(0, count);
}
