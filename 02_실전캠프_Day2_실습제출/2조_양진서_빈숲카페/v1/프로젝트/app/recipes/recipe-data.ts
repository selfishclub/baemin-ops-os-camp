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

export type RecipeLayer = {
  label: string;
  value: string;
  tone: "ice" | "milk" | "coffee" | "cream" | "topping";
};

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
  ["demo-vanilla-latte", "테스트 바닐라라떼", "라떼", "cream"],
  ["demo-chocolate-latte", "테스트 초코라떼", "논커피", "coffee"],
  ["demo-strawberry-latte", "테스트 딸기라떼", "논커피", "topping"],
  ["demo-lemon-ade", "테스트 레몬에이드", "에이드", "ice"],
  ["demo-grapefruit-ade", "테스트 자몽에이드", "에이드", "topping"],
  ["demo-green-tea", "테스트 녹차", "티", "milk"],
  ["demo-smoothie", "테스트 스무디", "스무디", "cream"],
  ["demo-dessert", "테스트 디저트", "디저트", "topping"],
] as const satisfies ReadonlyArray<readonly [string, string, string, RecipeLayer["tone"]]>;

function demoVariant(mode: RecipeMode, accent: RecipeLayer["tone"]): RecipeVariant {
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
