export type RecipeMode = "HOT" | "ICE" | "UP";

export const recipeModes: RecipeMode[] = ["ICE", "HOT", "UP"];

export const recipeModeLabels: Record<RecipeMode, string> = {
  HOT: "HOT",
  ICE: "ICE",
  UP: "SIZE UP",
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
export const defaultRecipeContent: RecipeContent = {
  recipes: demoRecipes,
  sharedStandards: [],
  sharedGuides: [],
  standards: [
    { label: "테스트 계량", value: "10" },
  ],
  categories: ["전체", "커피", "라떼", "논커피", "에이드", "티", "스무디", "디저트"],
  announcement: {
    id: "demo",
    version: "10",
    title: "현재 표시되는 메뉴는 모두 테스트 데이터입니다.",
    detail: "기능 확인 후 관리자 화면에서 실제 메뉴로 교체해 주세요.",
    effectiveAt: "테스트",
    important: false,
  },
};
