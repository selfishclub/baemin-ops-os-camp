import type { ManualDoc } from "../../manual/manual-data";
import type { Recipe, RecipeMode, RecipeVariant } from "../recipe-data";

// 엑셀·표 붙여넣기 가져오기의 "읽는 부분". 엑셀에서 복사한 표(탭으로 나뉨)나 CSV 글을 레시피·매뉴얼 문서로 바꾼다.
// 화면과 떨어져 있는 순수 함수라 검사(tests)에서 직접 돌려 본다. 다른 파일의 값을 불러오지 않는다 (형식만 빌린다).
// 여기서는 아무것도 저장하지 않는다 — 결과는 화면의 미리보기로 가고, 사장이 확인해야 초안에 들어간다.

export type ImportResult<T> = {
  items: T[];
  // 고치지 않아도 가져올 수는 있지만 확인이 필요한 것
  warnings: string[];
  // 읽지 못해 건너뛴 줄
  skipped: string[];
  // 알아본 열 이름 (화면에 "이렇게 읽었어요"로 보여 준다)
  columns: string[];
};

// ── 표 읽기 ─────────────────────────────────────────────

// 따옴표 안의 줄바꿈·구분자를 지키면서 글을 칸으로 나눈다. 엑셀은 칸 안에 줄바꿈이 있으면 그 칸을 "…"로 감싼다.
export function parseTable(text: string): string[][] {
  const source = text.replace(/\r\n?/g, "\n");
  const delimiter = source.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  row.push(cell);
  rows.push(row);
  return rows.map((cells) => cells.map((value) => value.trim())).filter((cells) => cells.some(Boolean));
}

const compact = (value: string) => value.toLocaleLowerCase("ko-KR").replace(/[\s·.,:;()\[\]/_\-*]+/g, "");

// 열 이름은 매장마다 다르게 적으므로 비슷한 말을 모두 받아 준다
function columnIndex(header: string[], names: string[]) {
  const wanted = names.map(compact);
  return header.findIndex((cell) => wanted.includes(compact(cell)));
}

// 한 칸에 여러 개를 적은 것 나누기: 줄바꿈, 세미콜론, "1. 2. 3." 번호
export function splitItems(value: string): string[] {
  return value
    .split(/\n|;|(?=(?:^|\s)\d{1,2}[.)]\s)/)
    .map((item) => item.replace(/^\s*(?:\d{1,2}[.)]|[-•·▪])\s*/, "").trim())
    .filter(Boolean);
}

// "우유 200ml", "바닐라 시럽: 20g", "얼음 | 가득" → 이름과 양
export function parseMeasure(value: string): { label: string; value: string } {
  const text = value.trim();
  const bySign = /^(.+?)\s*[:|=]\s*(.+)$/.exec(text);
  if (bySign) return { label: bySign[1].trim(), value: bySign[2].trim() };
  const byNumber = /^(.*?\D)\s+(\d.*)$/.exec(text);
  if (byNumber) return { label: byNumber[1].trim(), value: byNumber[2].trim() };
  // 숫자 없이 적는 양: "얼음 가득", "시나몬 약간"
  const byWord = /^(.+?)\s+(가득|꽉|적당량|적당히|약간|조금|소량|반|한\s?꼬집|한\s?스쿱|한\s?줌|토핑)$/.exec(text);
  if (byWord) return { label: byWord[1].trim(), value: byWord[2].trim() };
  return { label: text, value: "" };
}

const modeWords: Record<RecipeMode, string[]> = {
  ICE: ["ice", "아이스", "i", "차가운", "ice기본"],
  HOT: ["hot", "핫", "h", "따뜻한", "뜨거운"],
  UP: ["up", "sizeup", "사이즈업", "라지", "large", "l", "큰컵"],
  DINE: ["dine", "매장", "플레이팅", "매장플레이팅", "먹고가기"],
  TOGO: ["togo", "포장", "테이크아웃", "takeout"],
};

export function parseMode(value: string): RecipeMode | null {
  const key = compact(value);
  if (!key) return "ICE";
  for (const mode of Object.keys(modeWords) as RecipeMode[]) if (modeWords[mode].includes(key)) return mode;
  return null;
}

function slug(value: string, fallback: string) {
  const ascii = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return ascii || fallback;
}

// ── 레시피 표 ───────────────────────────────────────────

export const recipeColumns = {
  name: ["메뉴명", "메뉴", "메뉴이름", "이름", "품명", "name", "menu"],
  category: ["카테고리", "분류", "종류", "category"],
  mode: ["구분", "온도", "핫아이스", "hot/ice", "타입", "type", "mode", "사이즈"],
  quick: ["정량", "재료", "재료와양", "재료및정량", "레시피", "계량", "비율", "ingredients"],
  layers: ["단면도", "층", "넣는순서", "layers"],
  steps: ["제조순서", "순서", "만드는법", "만드는방법", "제조방법", "제조", "steps"],
  cautions: ["주의사항", "주의", "주의점", "cautions"],
  mistakes: ["자주틀리는포인트", "자주틀리는것", "틀리는포인트", "실수", "mistakes"],
  description: ["설명", "메뉴설명", "description"],
  customerGuide: ["고객안내", "손님안내", "안내멘트"],
  drinkingTip: ["음용팁", "마시는법", "음용법", "팁"],
} as const;

export const recipeTemplate = [
  ["메뉴명", "카테고리", "구분", "정량", "제조순서", "주의사항", "자주 틀리는 포인트"].join("\t"),
  ["예시 라떼", "라떼", "ICE", "얼음 가득; 우유 000ml; 에스프레소 0샷", "1. 컵에 얼음을 채운다; 2. 우유를 붓는다; 3. 샷을 올린다", "샷은 마지막에", "우유를 먼저 넣지 않으면 층이 섞여요"].join("\t"),
  ["예시 라떼", "라떼", "HOT", "스팀 우유 000ml; 에스프레소 0샷", "1. 샷을 받는다; 2. 스팀 우유를 붓는다", "", ""].join("\t"),
  ["예시 스콘", "베이커리", "포장", "스콘 1개; 잼 1개", "1. 스콘을 데운다; 2. 포장 상자에 담는다", "잼은 따로", ""].join("\t"),
].join("\n");

export type RecipeImportOptions = {
  // 단면도 색 자동 지정 (recipe-data 의 suggestLayerTone). 못 찾으면 null
  suggestTone: (label: string) => string | null;
  today: string;
  // 같은 이름의 기존 메뉴가 있으면 id·사진·영상을 이어받는다
  existing: Recipe[];
};

export function parseRecipeTable(text: string, options: RecipeImportOptions): ImportResult<Recipe> {
  const rows = parseTable(text);
  const result: ImportResult<Recipe> = { items: [], warnings: [], skipped: [], columns: [] };
  if (rows.length < 2) {
    result.skipped.push("첫 줄은 열 이름, 둘째 줄부터 내용이어야 해요. 두 줄 이상 붙여 넣어 주세요.");
    return result;
  }
  const header = rows[0];
  const at = Object.fromEntries((Object.keys(recipeColumns) as (keyof typeof recipeColumns)[]).map((key) => [key, columnIndex(header, [...recipeColumns[key]])])) as Record<keyof typeof recipeColumns, number>;
  if (at.name < 0) {
    result.skipped.push(`‘메뉴명’ 열을 찾지 못했어요. 첫 줄에 열 이름이 있는지 확인해 주세요. (읽은 첫 줄: ${header.join(" / ")})`);
    return result;
  }
  result.columns = (Object.keys(at) as (keyof typeof recipeColumns)[]).filter((key) => at[key] >= 0).map((key) => `${header[at[key]]} → ${recipeColumns[key][0]}`);
  const unknown = header.filter((cell, index) => cell && !Object.values(at).includes(index));
  if (unknown.length) result.warnings.push(`알아보지 못해 쓰지 않은 열: ${unknown.join(", ")}`);

  const cell = (cells: string[], key: keyof typeof recipeColumns) => (at[key] >= 0 ? cells[at[key]] ?? "" : "");
  const byName = new Map<string, Recipe>();
  let lastName = "";

  rows.slice(1).forEach((cells, index) => {
    const line = index + 2;
    // 엑셀에서 같은 메뉴의 둘째 줄부터 이름 칸을 비워 두는 경우가 많다 → 바로 윗줄 메뉴로 본다
    const name = cell(cells, "name") || lastName;
    if (!name) { result.skipped.push(`${line}번째 줄: 메뉴명이 없어 건너뜀`); return; }
    lastName = name;
    const mode = parseMode(cell(cells, "mode"));
    if (!mode) { result.skipped.push(`${line}번째 줄 (${name}): 구분 ‘${cell(cells, "mode")}’을 알아보지 못함 — HOT, ICE, 사이즈업, 매장, 포장 중 하나로 적어 주세요`); return; }

    let recipe = byName.get(name);
    if (!recipe) {
      const old = options.existing.find((item) => item.name.trim() === name);
      recipe = {
        id: old?.id ?? `menu-${slug(name, String(byName.size + 1))}-${line}`,
        name,
        category: cell(cells, "category") || old?.category || "미분류",
        description: cell(cells, "description") || old?.description || "",
        version: old?.version ?? "1.0",
        updatedAt: options.today,
        change: old ? "표에서 가져와 교체" : "표에서 가져옴",
        customerGuide: cell(cells, "customerGuide") || old?.customerGuide || "",
        drinkingTip: cell(cells, "drinkingTip") || old?.drinkingTip || "",
        commonMistakes: [],
        ...(old?.images ? { images: old.images } : {}),
        ...(old?.videos ? { videos: old.videos } : {}),
        ...(old?.promptGuideId ? { promptGuideId: old.promptGuideId } : {}),
        variants: {},
      };
      byName.set(name, recipe);
    }
    if (!recipe.category || recipe.category === "미분류") recipe.category = cell(cells, "category") || recipe.category;
    for (const item of splitItems(cell(cells, "mistakes"))) if (!recipe.commonMistakes!.includes(item)) recipe.commonMistakes!.push(item);

    const quick = splitItems(cell(cells, "quick")).map(parseMeasure);
    const layerSource = splitItems(cell(cells, "layers")).map(parseMeasure);
    const variant: RecipeVariant = {
      quick,
      // 단면도 열이 없으면 정량에 적은 순서를 그대로 "잔 아래부터 넣는 순서"로 쓴다
      layers: (layerSource.length ? layerSource : quick).map((item) => ({ ...item, tone: options.suggestTone(item.label) ?? "milk" })),
      steps: splitItems(cell(cells, "steps")),
      cautions: splitItems(cell(cells, "cautions")),
    };
    if (recipe.variants[mode]) result.warnings.push(`${line}번째 줄 (${name} · ${mode}): 같은 구분이 두 번 나와서 뒤의 줄로 바꿈`);
    if (!variant.quick.length) result.warnings.push(`${line}번째 줄 (${name} · ${mode}): 정량이 비어 있어요`);
    if (!variant.steps.length) result.warnings.push(`${line}번째 줄 (${name} · ${mode}): 제조 순서가 비어 있어요`);
    const noAmount = variant.quick.filter((item) => !item.value).map((item) => item.label);
    if (noAmount.length) result.warnings.push(`${line}번째 줄 (${name} · ${mode}): 양을 못 읽은 재료 — ${noAmount.join(", ")} (“재료 양” 또는 “재료: 양”으로 적어 주세요)`);
    recipe.variants[mode] = variant;
  });

  result.items = [...byName.values()];
  return result;
}

// ── 매뉴얼 문서 · 응대 카드 표 ─────────────────────────

export const manualColumns = {
  section: ["영역", "구역", "분류", "section"],
  kind: ["종류", "문서종류", "형식", "kind"],
  group: ["묶음", "응대묶음", "그룹", "group"],
  title: ["제목", "문서제목", "카드제목", "상황", "title"],
  summary: ["한줄설명", "설명", "요약", "summary"],
  purpose: ["목적", "왜하나요", "어떤상황인가요", "상황설명", "purpose"],
  materials: ["준비물", "미리알아둘것", "materials"],
  steps: ["순서", "이렇게말해요", "절차", "멘트", "말", "steps"],
  doneCriteria: ["완료기준", "끝난기준", "직원이혼자해도되는범위", "혼자해도되는범위", "done"],
  donts: ["하면안되는것", "금지", "이렇게는말하지않아요", "말하지않아요", "donts"],
  reportWhen: ["보고기준", "이럴땐바로보고", "책임자를부르는기준", "이럴땐책임자를불러요", "report"],
  keywords: ["챗봇낱말", "알아듣는낱말", "키워드", "keywords"],
  daily: ["매일체크", "오늘체크", "체크리스트", "daily"],
} as const;

export const manualTemplate = [
  ["영역", "종류", "묶음", "제목", "목적", "준비물", "순서", "완료 기준", "하면 안 되는 것", "보고 기준", "챗봇 낱말"].join("\t"),
  ["마감", "절차", "", "예시 마감 청소", "다음 날 바로 열 수 있게", "청소 도구", "1. 바닥을 쓴다; 2. 기기를 닦는다", "체크표가 다 채워졌다", "세척을 미루지 않는다", "기기가 이상할 때", "청소, 마감청소"].join("\t"),
  ["고객응대", "응대", "불만", "예시 음료가 늦었을 때", "음료가 늦게 나가 손님이 물어볼 때", "", "오래 기다리셨습니다, 죄송합니다; 바로 확인해 드릴게요", "사과와 예상 시간 안내", "변명부터 하지 않는다", "환불을 요청할 때", "늦게, 오래"].join("\t"),
].join("\n");

export type ManualImportOptions = {
  // 영역 제목 → id (예: "마감" → "close"). 화면에서 portal-sections 로 만들어 넘긴다
  sections: { id: string; title: string }[];
  today: string;
  existing: ManualDoc[];
};

export function parseManualTable(text: string, options: ManualImportOptions): ImportResult<ManualDoc> {
  const rows = parseTable(text);
  const result: ImportResult<ManualDoc> = { items: [], warnings: [], skipped: [], columns: [] };
  if (rows.length < 2) {
    result.skipped.push("첫 줄은 열 이름, 둘째 줄부터 내용이어야 해요. 두 줄 이상 붙여 넣어 주세요.");
    return result;
  }
  const header = rows[0];
  const at = Object.fromEntries((Object.keys(manualColumns) as (keyof typeof manualColumns)[]).map((key) => [key, columnIndex(header, [...manualColumns[key]])])) as Record<keyof typeof manualColumns, number>;
  if (at.title < 0 || at.section < 0) {
    result.skipped.push(`‘영역’과 ‘제목’ 열이 필요해요. (읽은 첫 줄: ${header.join(" / ")})`);
    return result;
  }
  result.columns = (Object.keys(at) as (keyof typeof manualColumns)[]).filter((key) => at[key] >= 0).map((key) => `${header[at[key]]} → ${manualColumns[key][0]}`);
  const unknown = header.filter((cell, index) => cell && !Object.values(at).includes(index));
  if (unknown.length) result.warnings.push(`알아보지 못해 쓰지 않은 열: ${unknown.join(", ")}`);

  const cell = (cells: string[], key: keyof typeof manualColumns) => (at[key] >= 0 ? cells[at[key]] ?? "" : "");
  const findSection = (value: string) => {
    const key = compact(value);
    return options.sections.find((section) => section.id === value.trim() || compact(section.title) === key || (key.length >= 2 && compact(section.title).includes(key)));
  };

  rows.slice(1).forEach((cells, index) => {
    const line = index + 2;
    const title = cell(cells, "title");
    if (!title) { result.skipped.push(`${line}번째 줄: 제목이 없어 건너뜀`); return; }
    const section = findSection(cell(cells, "section"));
    if (!section) { result.skipped.push(`${line}번째 줄 (${title}): 영역 ‘${cell(cells, "section")}’을 찾지 못함 — ${options.sections.map((item) => item.title).join(", ")} 중 하나로 적어 주세요`); return; }
    const kindText = compact(cell(cells, "kind"));
    const isCard = ["응대", "응대카드", "카드", "response"].includes(kindText);
    const old = options.existing.find((doc) => doc.sectionId === section.id && doc.title.trim() === title);
    const steps = splitItems(cell(cells, "steps"));
    if (!steps.length) result.warnings.push(`${line}번째 줄 (${title}): ${isCard ? "‘이렇게 말해요’" : "순서"}가 비어 있어요 — 게시 전에 채워야 해요`);
    const purpose = cell(cells, "purpose");
    result.items.push({
      id: old?.id ?? `manual-${section.id}-${slug(title, "doc")}-${line}`,
      kind: isCard ? "response" : "procedure",
      ...(cell(cells, "group") ? { group: cell(cells, "group") } : {}),
      keywords: cell(cells, "keywords").split(/[,;\n]/).map((item) => item.trim()).filter(Boolean),
      // "예", "o", "y", "1", "✓" 처럼 적으면 매일 체크하는 문서 (응대 카드는 해당 없음)
      ...(!isCard && /^(예|네|o|y|yes|1|true|v|✓|ㅇ)$/i.test(cell(cells, "daily")) ? { dailyCheck: true } : {}),
      sectionId: section.id,
      title,
      summary: cell(cells, "summary") || purpose,
      purpose,
      materials: isCard ? [] : splitItems(cell(cells, "materials")),
      steps,
      doneCriteria: splitItems(cell(cells, "doneCriteria")),
      donts: splitItems(cell(cells, "donts")),
      reportWhen: splitItems(cell(cells, "reportWhen")),
      updatedAt: options.today,
      change: old ? "표에서 가져와 교체" : "표에서 가져옴",
    });
  });
  return result;
}
