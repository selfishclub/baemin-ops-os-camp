import type { Recipe, RecipeContent, RecipeMode } from "./recipe-data";

// 레시피 챗봇 — 1단계: 외부 AI 없이 레시피북 데이터만으로 답하는 "규칙 답변기".
// 레시피북에 없는 내용은 지어내지 않는다. 마지막 단계에서 AI 응답 API를 붙일 때도
// 이 함수가 찾은 레시피만 근거로 넘긴다 (app/api/chat/route.ts 참고).

export type ChatAnswer = {
  found: boolean;
  text: string[];
  recipeId?: string;
  recipeName?: string;
  mode?: RecipeMode;
  updatedAt?: string;
  suggestions?: string[];
  source: "rule" | "ai";
};

const modeLabels: Record<RecipeMode, string> = { HOT: "HOT", ICE: "ICE", UP: "SIZE UP" };

const modeWords: Record<RecipeMode, string[]> = {
  HOT: ["hot", "핫", "뜨거", "따뜻", "따듯"],
  ICE: ["ice", "아이스", "차가", "시원"],
  UP: ["sizeup", "사이즈업", "라지", "큰컵", "큰사이즈", "업사이즈"],
};

const intentWords = {
  steps: ["순서", "어떻게", "만드는", "만들어", "방법", "제조", "단계"],
  measures: ["비율", "얼마", "몇", "정량", "계량", "양", "ml", "그램", "g"],
  cautions: ["주의", "틀리", "실수", "조심", "하면안"],
};

function normalize(value: string) {
  return value.toLocaleLowerCase("ko-KR").replace(/[\s·.,!?~'"“”‘’()[\]{}:;\-_/]+/g, "");
}

// 이름에서 "테스트" 같은 꾸밈말을 뺀 핵심어로도 찾는다
function nameKeys(recipe: Recipe) {
  const full = normalize(recipe.name);
  const core = normalize(recipe.name.replace(/^테스트\s*/, ""));
  return [...new Set([full, core])].filter((key) => key.length >= 2);
}

function overlap(a: string, b: string) {
  const setB = new Set(b);
  let count = 0;
  for (const ch of new Set(a)) if (setB.has(ch)) count += 1;
  return count;
}

function findRecipe(content: RecipeContent, question: string): Recipe | null {
  let best: { recipe: Recipe; length: number } | null = null;
  for (const recipe of content.recipes) {
    for (const key of nameKeys(recipe)) {
      if (question.includes(key) && (!best || key.length > best.length)) best = { recipe, length: key.length };
    }
  }
  return best?.recipe ?? null;
}

function pickMode(recipe: Recipe, question: string): RecipeMode {
  const available = (Object.keys(recipe.variants) as RecipeMode[]).filter((mode) => recipe.variants[mode]);
  for (const mode of ["UP", "HOT", "ICE"] as RecipeMode[]) {
    if (available.includes(mode) && modeWords[mode].some((word) => question.includes(word))) return mode;
  }
  return available.includes("ICE") ? "ICE" : available[0];
}

function hasIntent(question: string, words: string[]) {
  return words.some((word) => question.includes(normalize(word)));
}

export function answerFromRecipes(content: RecipeContent, rawQuestion: string): ChatAnswer {
  const question = normalize(rawQuestion);
  if (question.length < 2) {
    return { found: false, source: "rule", text: ["메뉴 이름을 넣어 물어봐 주세요. 예: “카페라떼 핫 우유 얼마야?”"] };
  }

  const recipe = findRecipe(content, question);
  if (!recipe) {
    // 재료로 찾기: "우유 들어가는 메뉴"
    const byIngredient = content.recipes.filter((item) =>
      Object.values(item.variants).some((variant) => variant?.quick.some((measure) => {
        const label = normalize(measure.label);
        return label.length >= 2 && question.includes(label);
      })),
    );
    if (byIngredient.length && hasIntent(question, ["들어가", "쓰는", "사용", "메뉴"])) {
      return {
        found: true,
        source: "rule",
        text: ["그 재료가 들어가는 메뉴예요.", ...byIngredient.slice(0, 8).map((item) => `· ${item.name}`)],
      };
    }
    const suggestions = [...content.recipes]
      .map((item) => ({ name: item.name, score: Math.max(...nameKeys(item).map((key) => overlap(key, question))) }))
      .filter((item) => item.score >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((item) => item.name);
    return {
      found: false,
      source: "rule",
      text: ["레시피북에 없는 메뉴입니다. 임의로 답하지 않아요.", suggestions.length ? "혹시 이 메뉴인가요?" : "메뉴 이름을 다시 확인해 주세요."],
      suggestions,
    };
  }

  const mode = pickMode(recipe, question);
  const variant = recipe.variants[mode]!;
  const wantsSteps = hasIntent(question, intentWords.steps);
  const wantsCautions = hasIntent(question, intentWords.cautions);
  const wantsMeasures = hasIntent(question, intentWords.measures);

  // 특정 재료를 콕 집어 물었는지: "우유 얼마야"
  const asked = variant.quick.filter((measure) => {
    const label = normalize(measure.label);
    return label.length >= 1 && question.replace(normalize(recipe.name), "").includes(label);
  });

  const text: string[] = [];
  const title = `${recipe.name} · ${modeLabels[mode]}`;
  if (asked.length && !wantsSteps && !wantsCautions) {
    text.push(title, ...asked.map((measure) => `${measure.label}: ${measure.value}`));
  } else {
    text.push(title);
    if (wantsMeasures || (!wantsSteps && !wantsCautions)) {
      text.push("정량", ...variant.quick.map((measure) => `· ${measure.label} ${measure.value}`));
    }
    if (wantsSteps || (!wantsMeasures && !wantsCautions)) {
      text.push("제조 순서", ...variant.steps.map((step, index) => `${index + 1}. ${step}`));
    }
    if (wantsCautions) {
      const cautions = [...(recipe.commonMistakes ?? []), ...(variant.cautions ?? [])];
      text.push("주의·자주 틀리는 포인트", ...(cautions.length ? cautions.map((item) => `· ${item}`) : ["· 등록된 주의사항이 없어요."]));
    }
  }
  if (!wantsCautions && recipe.commonMistakes?.length) text.push(`자주 틀리는 포인트: ${recipe.commonMistakes[0]}`);

  return { found: true, source: "rule", text, recipeId: recipe.id, recipeName: recipe.name, mode, updatedAt: recipe.updatedAt };
}
