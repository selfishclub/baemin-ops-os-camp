import type { ManualDoc } from "../manual/manual-data";

export type RecipeMode = "HOT" | "ICE" | "UP" | "DINE" | "TOGO";

export const recipeModes: RecipeMode[] = ["ICE", "HOT", "UP", "DINE", "TOGO"];

export const recipeModeLabels: Record<RecipeMode, string> = {
  HOT: "HOT",
  ICE: "ICE",
  UP: "SIZE UP",
  DINE: "매장·플레이팅",
  TOGO: "포장",
};

export type Measure = {
  label: string;
  value: string;
};

// 단면도 색: 팔레트 id("ice", "strawberry" …) 또는 "custom"(+ color에 직접 고른 색)
export type LayerTone = string;

export type RecipeLayer = {
  label: string;
  value: string;
  tone: LayerTone;
  color?: string;
};

export type LayerPaletteEntry = {
  id: string;
  label: string;
  background: string;
  text: string;
  keywords: string[];
};

// 재료 이름에 keywords가 들어 있으면 그 색을 자동으로 추천한다. 위에 있는 항목이 먼저 맞는다.
export const layerPalette: LayerPaletteEntry[] = [
  { id: "ice", label: "얼음", background: "#dfeef5", text: "#29332c", keywords: ["얼음", "아이스", "ice"] },
  { id: "water", label: "물·탄산", background: "#e6f3f9", text: "#29332c", keywords: ["탄산", "스파클링", "소다", "토닉", "사이다", "물"] },
  { id: "tea", label: "홍차·차", background: "#c9925f", text: "#ffffff", keywords: ["홍차", "얼그레이", "밀크티", "보리차", "우롱", "아쌈", "루이보스"] },
  { id: "milk", label: "우유", background: "#f1e9d8", text: "#29332c", keywords: ["우유", "밀크", "오트", "두유", "라떼"] },
  { id: "cream", label: "크림·휘핑", background: "#fbf8f1", text: "#29332c", keywords: ["크림", "휘핑", "폼", "거품", "치즈"] },
  { id: "chocolate", label: "초코", background: "#5b3a2a", text: "#ffffff", keywords: ["초코", "초콜릿", "코코아", "카카오", "모카"] },
  { id: "coffee", label: "커피·에스프레소", background: "#9d7154", text: "#ffffff", keywords: ["에스프레소", "커피", "샷", "콜드브루", "원두", "아메리카노"] },
  { id: "caramel", label: "카라멜·흑당", background: "#c98a3c", text: "#3a2508", keywords: ["카라멜", "캐러멜", "흑당", "돌체", "토피"] },
  { id: "vanilla", label: "바닐라·연유", background: "#f3e4b8", text: "#3a2508", keywords: ["바닐라", "연유", "꿀", "허니"] },
  { id: "strawberry", label: "딸기·체리", background: "#e0525c", text: "#ffffff", keywords: ["딸기", "스트로베리", "라즈베리", "체리", "석류", "히비스커스"] },
  { id: "berry", label: "블루베리·포도", background: "#7c5db3", text: "#ffffff", keywords: ["블루베리", "포도", "베리", "자색", "타로"] },
  { id: "matcha", label: "말차·녹차", background: "#86a95c", text: "#ffffff", keywords: ["말차", "녹차", "그린티", "쑥"] },
  { id: "mint", label: "민트", background: "#a8dccb", text: "#1f4a3c", keywords: ["민트", "페퍼민트"] },
  { id: "citrus", label: "자몽·오렌지", background: "#f0925a", text: "#ffffff", keywords: ["자몽", "오렌지", "감귤", "망고", "복숭아", "당근"] },
  { id: "lemon", label: "레몬·유자", background: "#f4de6a", text: "#3a2508", keywords: ["레몬", "유자", "청포도", "파인애플", "바나나", "패션후르츠"] },
  { id: "topping", label: "토핑·기타", background: "#dcbf9e", text: "#29332c", keywords: ["토핑", "시리얼", "견과", "쿠키", "크럼블", "파우더"] },
];

export const customToneId = "custom";

export function findLayerPalette(tone: LayerTone) {
  return layerPalette.find((entry) => entry.id === tone) ?? null;
}

export function suggestLayerTone(label: string): LayerTone | null {
  const text = label.replace(/\s+/g, "").toLowerCase();
  if (!text) return null;
  for (const entry of layerPalette) {
    if (entry.keywords.some((keyword) => text.includes(keyword.toLowerCase()))) return entry.id;
  }
  return null;
}

function isDarkColor(hex: string) {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return false;
  const value = parseInt(match[1], 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 < 150;
}

// 화면에 칠할 색. 팔레트에 없는 옛 데이터는 우유색으로.
export function layerColors(layer: Pick<RecipeLayer, "tone" | "color">): { background: string; text: string } {
  if (layer.tone === customToneId && layer.color) {
    return { background: layer.color, text: isDarkColor(layer.color) ? "#ffffff" : "#29332c" };
  }
  const entry = findLayerPalette(layer.tone) ?? findLayerPalette("milk")!;
  return { background: entry.background, text: entry.text };
}

export type RecipeVariant = {
  quick: Measure[];
  layers: RecipeLayer[];
  steps: string[];
  cautions?: string[];
};

export type RecipeImage = {
  id: string;
  url: string;
  alt: string;
  caption?: string;
};

export type RecipeVideo = {
  id: string;
  title: string;
  url: string;
  description?: string;
  orientation?: "auto" | "portrait" | "landscape";
};

export type Recipe = {
  id: string;
  name: string;
  category: string;
  description: string;
  version: string;
  updatedAt: string;
  change: string;
  featured?: boolean;
  customerGuide: string;
  drinkingTip: string;
  // 자주 틀리는 포인트: 실제로 발견한 실수를 적어 두면 모든 직원이 본다
  commonMistakes?: string[];
  // 영상 프롬프트 지침을 메뉴별로 따로 지정할 때 (비우면 카테고리로 자동)
  promptGuideId?: string;
  standardIds?: string[];
  guideIds?: string[];
  sourceRef?: string;
  reviewNotes?: string[];
  images?: RecipeImage[];
  videos?: RecipeVideo[];
  variants: Partial<Record<RecipeMode, RecipeVariant>>;
};

export type SharedStandard = {
  id: string;
  title: string;
  summary: string;
  version: string;
  updatedAt: string;
  values: Measure[];
};

export type SharedGuide = {
  id: string;
  title: string;
  scope: string;
  version: string;
  updatedAt: string;
  sections: { title: string; items: string[] }[];
  serviceScript?: string;
  futureMemo?: string;
};

export type RecipeAnnouncement = {
  id: string;
  version: string;
  title: string;
  detail: string;
  effectiveAt: string;
  important: boolean;
};

export type RecipeContent = {
  recipes: Recipe[];
  sharedStandards: SharedStandard[];
  sharedGuides: SharedGuide[];
  standards: Measure[];
  categories: string[];
  // 영상 프롬프트 지침서 (없으면 기본 지침서를 쓴다)
  promptGuides?: PromptGuide[];
  // 운영 매뉴얼 문서 (없으면 예시 문서를 쓴다) — 레시피와 같은 초안·게시·버전 흐름을 탄다
  manuals?: ManualDoc[];
  announcement: RecipeAnnouncement;
};

const demoMenus = [
  ["demo-americano", "테스트 아메리카노", "커피", "coffee"],
  ["demo-cafe-latte", "테스트 카페라떼", "라떼", "milk"],
  ["demo-vanilla-latte", "테스트 바닐라라떼", "라떼", "vanilla"],
  ["demo-chocolate-latte", "테스트 초코라떼", "논커피", "chocolate"],
  ["demo-strawberry-latte", "테스트 딸기라떼", "논커피", "strawberry"],
  ["demo-lemon-ade", "테스트 레몬에이드", "에이드", "lemon"],
  ["demo-grapefruit-ade", "테스트 자몽에이드", "에이드", "citrus"],
  ["demo-green-tea", "테스트 녹차", "티", "matcha"],
  ["demo-smoothie", "테스트 스무디", "스무디", "berry"],
  ["demo-dessert", "테스트 디저트", "디저트", "topping"],
] as const satisfies ReadonlyArray<readonly [string, string, string, LayerTone]>;

function demoVariant(mode: RecipeMode, accent: LayerTone): RecipeVariant {
  return {
    quick: [
      { label: "베이스", value: "10g" },
      { label: "액체", value: "10ml" },
      { label: "토핑", value: "10g" },
    ],
    layers: [
      { label: "베이스", value: "10g", tone: accent },
      { label: "액체", value: "10ml", tone: mode === "ICE" ? "ice" : "milk" },
      { label: "토핑", value: "10g", tone: "topping" },
    ],
    steps: [
      "베이스 10g을 계량한다.",
      "액체 10ml를 넣고 충분히 섞는다.",
      "토핑 10g을 올려 완성한다.",
    ],
    cautions: [
      "모든 수치는 기능 확인용 임시 값입니다.",
      "실제 판매 전 관리자 화면에서 공식 레시피로 교체합니다.",
    ],
  };
}

const demoRecipes: Recipe[] = demoMenus.map(([id, name, category, accent], index) => ({
  id,
  name,
  category,
  description: "검색과 상세 화면을 확인하기 위한 임시 테스트 메뉴입니다.",
  version: "10",
  updatedAt: "테스트",
  change: "기능 확인용 임시 데이터",
  featured: index < 3,
  customerGuide: "실제 판매 메뉴가 아닌 화면 확인용 테스트 항목입니다.",
  drinkingTip: "관리자 화면에서 실제 안내 문구로 교체해 주세요.",
  commonMistakes: ["(예시) 토핑을 액체보다 먼저 넣으면 안 돼요", "(예시) 계량 없이 눈대중으로 붓지 않기"],
  sourceRef: "테스트 데이터",
  reviewNotes: ["배포 전 실제 메뉴 정보로 교체"],
  images: [],
  videos: [],
  variants: {
    ICE: demoVariant("ICE", accent),
    HOT: demoVariant("HOT", accent),
    UP: demoVariant("UP", accent),
  },
}));

// 실제 매장 정보가 아닌 기능 확인용 임시 데이터만 포함합니다.
// 시연용 가짜 베이커리 메뉴: 굽는 법이 아니라 커팅·포장·매장 제공(플레이팅) 기준을 적는다
const demoBakeryRecipe: Recipe = {
  id: "demo-scone",
  name: "테스트 스콘",
  category: "베이커리",
  description: "커팅·포장·플레이팅 화면을 확인하기 위한 임시 테스트 메뉴입니다.",
  version: "10",
  updatedAt: "테스트",
  change: "기능 확인용 임시 데이터",
  customerGuide: "실제 판매 메뉴가 아닌 화면 확인용 테스트 항목입니다.",
  drinkingTip: "관리자 화면에서 실제 안내 문구로 교체해 주세요.",
  commonMistakes: ["(예시) 맨손으로 집지 않기 — 집게·장갑 사용", "(예시) 포장 스티커를 접히는 선 위에 붙이지 않기"],
  sourceRef: "테스트 데이터",
  reviewNotes: ["배포 전 실제 메뉴 정보로 교체"],
  images: [],
  videos: [],
  variants: {
    DINE: {
      quick: [
        { label: "커팅", value: "2등분" },
        { label: "접시", value: "소 접시 1" },
        { label: "곁들임", value: "잼 10g" },
      ],
      layers: [],
      steps: ["집게로 스콘을 도마에 올린다.", "빵칼로 가운데를 2등분한다.", "소 접시 가운데에 단면이 보이게 놓고 잼 10g을 오른쪽에 둔다.", "포크와 냅킨을 접시 왼쪽에 세팅해 나간다."],
      cautions: ["모든 수치는 기능 확인용 임시 값입니다."],
    },
    TOGO: {
      quick: [
        { label: "커팅", value: "자르지 않음" },
        { label: "포장재", value: "유산지 1 + 봉투 소" },
        { label: "동봉", value: "잼 10g, 냅킨 1" },
      ],
      layers: [],
      steps: ["유산지로 스콘을 감싼다.", "봉투 소에 넣고 입구를 한 번 접는다.", "접은 부분 가운데에 스티커를 붙인다.", "잼과 냅킨을 함께 넣어 건넨다."],
      cautions: ["모든 수치는 기능 확인용 임시 값입니다."],
    },
  },
};

export const defaultRecipeContent: RecipeContent = {
  recipes: [...demoRecipes, demoBakeryRecipe],
  sharedStandards: [],
  sharedGuides: [],
  standards: [
    { label: "테스트 계량", value: "10" },
  ],
  categories: ["전체", "커피", "라떼", "논커피", "에이드", "티", "스무디", "디저트", "베이커리"],
  announcement: {
    id: "demo",
    version: "10",
    title: "현재 표시되는 메뉴는 모두 테스트 데이터입니다.",
    detail: "기능 확인 후 관리자 화면에서 실제 메뉴로 교체해 주세요.",
    effectiveAt: "테스트",
    important: false,
  },
};

// ---- 영상 프롬프트 지침서 -------------------------------------------------------
// 종류(음료·베이커리·기타)마다 다른 문장 틀. 관리자 화면 "영상 프롬프트 지침" 탭에서 고친다.
// {자리표시}는 버튼을 누를 때 그 레시피 내용으로 바뀐다. 외부 API 없음.
// 나중에 AI를 붙이면 이 지침서가 그대로 AI에게 주는 지시문이 된다.

export type PromptGuide = {
  id: string;
  name: string;
  // 이 카테고리의 메뉴에 자동으로 쓰인다
  categories: string[];
  body: string;
};

export const promptPlaceholders = ["{메뉴명}", "{구분}", "{카테고리}", "{정량}", "{제조순서}", "{주의사항}", "{자주틀리는포인트}", "{손님안내}"];

export const defaultPromptGuides: PromptGuide[] = [
  {
    id: "drink",
    name: "음료",
    categories: ["커피", "라떼", "논커피", "에이드", "티", "스무디"],
    body: [
      "빈숲카페 직원 교육용 음료 제조 영상을 만들어 주세요.",
      "메뉴: {메뉴명} ({구분})",
      "정량: {정량}",
      "제조 순서:",
      "{제조순서}",
      "주의사항: {주의사항}",
      "자주 틀리는 포인트(영상에서 '이렇게 하면 안 됨'으로 짧게 보여 주기): {자주틀리는포인트}",
      "화면 구성: 세로 9:16, 60초 이내. 단계마다 정량을 자막으로 크게 보여 주고, 바리스타의 손과 컵을 클로즈업합니다. 잔 아래부터 층이 쌓이는 모습이 보이게 옆에서 찍습니다. 마지막에 완성된 컵을 3초간 보여 줍니다.",
      "말투: 신입 직원에게 설명하듯 짧고 친절하게. 레시피에 없는 재료나 순서는 추가하지 않습니다.",
    ].join("\n"),
  },
  {
    id: "bakery",
    name: "베이커리 (커팅·포장·플레이팅)",
    categories: ["베이커리", "디저트"],
    body: [
      "빈숲카페 직원 교육용 베이커리 '커팅·포장·매장 제공' 영상을 만들어 주세요. 굽는 과정은 다루지 않습니다.",
      "메뉴: {메뉴명} ({구분})",
      "규격·수량: {정량}",
      "작업 순서:",
      "{제조순서}",
      "주의사항: {주의사항}",
      "자주 틀리는 포인트(영상에서 '이렇게 하면 안 됨'으로 짧게 보여 주기): {자주틀리는포인트}",
      "화면 구성: 세로 9:16, 60초 이내.",
      "- 커팅: 도마를 위에서 내려다보는 각도. 조각 수와 크기를 자막으로 크게, 칼을 넣는 위치와 방향을 선으로 표시합니다. 단면이 깔끔하게 나온 완성 컷을 2초간.",
      "- 포장: 포장재 종류를 먼저 나란히 보여 주고, 감싸기·접기·스티커 위치를 손 클로즈업으로 순서대로. 동봉하는 것(냅킨·잼·포크)을 마지막에 한 번 더 보여 줍니다.",
      "- 매장 제공(플레이팅): 접시 위 위치, 곁들임 위치, 커트러리·냅킨 세팅을 손님 자리에서 보이는 방향으로 찍고 완성 컷을 3초간.",
      "위생: 집게나 장갑을 쓰는 장면을 반드시 넣습니다.",
      "말투: 신입 직원에게 설명하듯 짧고 친절하게. 적혀 있지 않은 규격이나 순서는 추가하지 않습니다.",
    ].join("\n"),
  },
  {
    id: "etc",
    name: "기타 (시럽·소스·준비 작업 등)",
    categories: [],
    body: [
      "빈숲카페 직원 교육용 작업 영상을 만들어 주세요.",
      "항목: {메뉴명} ({구분}) · 분류: {카테고리}",
      "분량·규격: {정량}",
      "작업 순서:",
      "{제조순서}",
      "주의사항: {주의사항}",
      "자주 틀리는 포인트: {자주틀리는포인트}",
      "화면 구성: 세로 9:16, 60초 이내. 준비물을 먼저 나란히 보여 주고, 단계마다 분량을 자막으로. 마지막에 보관 용기·라벨(만든 날짜) 붙이는 장면을 넣습니다.",
      "말투: 신입 직원에게 설명하듯 짧고 친절하게. 적혀 있지 않은 내용은 추가하지 않습니다.",
    ].join("\n"),
  },
];

export function getPromptGuides(content: Pick<RecipeContent, "promptGuides">): PromptGuide[] {
  return content.promptGuides?.length ? content.promptGuides : defaultPromptGuides;
}

// 메뉴에 지정된 지침 → 카테고리가 맞는 지침 → "기타" → 첫 번째
export function pickPromptGuide(guides: PromptGuide[], recipe: Pick<Recipe, "promptGuideId" | "category">): PromptGuide {
  return guides.find((guide) => guide.id === recipe.promptGuideId)
    ?? guides.find((guide) => guide.categories.includes(recipe.category))
    ?? guides.find((guide) => guide.id === "etc")
    ?? guides[0]
    ?? defaultPromptGuides[0];
}

// 지침서의 {자리표시}를 레시피 내용으로 채운다. 정량·순서가 모두 비면 null (만들지 않는다).
export function fillPromptGuide(guide: PromptGuide, recipe: Recipe, mode: RecipeMode, variant: RecipeVariant): string | null {
  const measures = [...variant.quick, ...variant.layers]
    .filter((item) => item.label.trim() && item.value.trim())
    .map((item) => `${item.label} ${item.value}`)
    .filter((text, index, all) => all.indexOf(text) === index);
  const steps = variant.steps.map((step) => step.trim()).filter(Boolean);
  if (measures.length === 0 && steps.length === 0) return null;
  const cautions = (variant.cautions ?? []).map((item) => item.trim()).filter(Boolean);
  const mistakes = (recipe.commonMistakes ?? []).map((item) => item.trim()).filter(Boolean);
  const values: Record<string, string> = {
    "{메뉴명}": recipe.name,
    "{구분}": recipeModeLabels[mode],
    "{카테고리}": recipe.category,
    "{정량}": measures.join(", ") || "(없음)",
    "{제조순서}": steps.map((step, index) => `${index + 1}. ${step}`).join("\n") || "(없음)",
    "{주의사항}": cautions.join(" / ") || "(없음)",
    "{자주틀리는포인트}": mistakes.join(" / ") || "(없음)",
    "{손님안내}": recipe.customerGuide?.trim() || "(없음)",
  };
  let text = guide.body;
  for (const [key, value] of Object.entries(values)) text = text.split(key).join(value);
  return text;
}
