import {
  defaultRecipeContent,
  RecipeContent,
  RecipeMode,
} from "./recipe-data";
import { isManualSection } from "../manual/manual-data";

export function cloneDefaultContent(): RecipeContent {
  return structuredClone(defaultRecipeContent);
}

export function parseRecipeContent(value: unknown): RecipeContent {
  if (!value || typeof value !== "object") throw new Error("레시피 데이터 형식이 올바르지 않습니다.");
  return value as RecipeContent;
}

export function cascadeSharedStandards(content: RecipeContent): {
  content: RecipeContent;
  impactedRecipeIds: string[];
} {
  const next = structuredClone(content);
  const impactedRecipeIds: string[] = [];

  for (const recipe of next.recipes) {
    for (const standardId of recipe.standardIds ?? []) {
      if (!["hot-milk-steam", "hot-milk-steam-noncoffee"].includes(standardId)) continue;
      const standard = next.sharedStandards.find((item) => item.id === standardId);
      const regular = standard?.values.find((item) => item.label === "기본")?.value;
      const up = standard?.values.find((item) => item.label === "사이즈업")?.value;
      if (!regular) continue;
      if (!impactedRecipeIds.includes(recipe.id)) impactedRecipeIds.push(recipe.id);

      const hot = recipe.variants.HOT;
      if (hot) {
        for (const item of [...hot.quick, ...hot.layers]) {
          if (item.label.includes("우유")) item.value = regular;
        }
        hot.steps = hot.steps.map((step) =>
          step.replace(/우유\s+\S+을\s+계량해\s+스팀/g, `우유 ${regular}을 계량해 스팀`),
        );
      }
      const sizeUp = recipe.variants.UP;
      if (sizeUp && up) {
        for (const item of [...sizeUp.quick, ...sizeUp.layers]) {
          if (item.label.includes("우유")) item.value = up;
        }
        sizeUp.steps = sizeUp.steps.map((step) =>
          step.replace(/SIZE UP 스팀 우유\s+\S+을/g, `SIZE UP 스팀 우유 ${up}을`),
        );
      }
    }
  }

  for (const standard of next.sharedStandards) {
    const referenceLabel = standard.id === "hot-milk-steam"
      ? "HOT 스팀 우유"
      : standard.id === "hot-milk-steam-noncoffee" ? "논커피 HOT 스팀 우유" : null;
    if (!referenceLabel) continue;
    const regular = standard.values.find((item) => item.label === "기본")?.value;
    const up = standard.values.find((item) => item.label === "사이즈업")?.value;
    const reference = next.standards.find((item) => item.label === referenceLabel);
    if (reference && regular) reference.value = `기본 ${regular}${up ? ` · 사이즈업 ${up}` : ""}`;
  }

  return { content: next, impactedRecipeIds };
}

export function validateRecipeContent(content: RecipeContent): string[] {
  const errors: string[] = [];
  if (!content.recipes.length) errors.push("공식 게시 전에 레시피를 한 개 이상 등록해 주세요.");
  if (!content.categories.includes("전체")) errors.push("카테고리에 ‘전체’가 필요합니다.");
  if (!content.announcement?.title.trim()) errors.push("공지 제목이 필요합니다.");
  if (!content.announcement?.effectiveAt.trim()) errors.push("공지 시행일이 필요합니다.");
  const standardIds = new Set(content.sharedStandards.map((item) => item.id));
  const guideIds = new Set(content.sharedGuides.map((item) => item.id));
  if (standardIds.size !== content.sharedStandards.length) errors.push("공통 기준 ID가 중복됩니다.");
  if (guideIds.size !== content.sharedGuides.length) errors.push("공통 가이드 ID가 중복됩니다.");
  for (const standard of content.sharedStandards) {
    if (!standard.title.trim() || standard.values.some((item) => !item.label.trim() || !item.value.trim())) {
      errors.push(`${standard.title || standard.id}: 공통 기준의 이름과 계량값을 확인해 주세요.`);
    }
  }
  for (const guide of content.sharedGuides) {
    if (!guide.title.trim() || !guide.scope.trim() || !guide.sections.length) {
      errors.push(`${guide.title || guide.id}: 공통 가이드의 이름, 적용 범위, 구역이 필요합니다.`);
    }
    if (guide.sections.some((section) => !section.title.trim() || !section.items.length || section.items.some((item) => !item.trim()))) {
      errors.push(`${guide.title || guide.id}: 공통 가이드 구역의 제목과 내용을 확인해 주세요.`);
    }
  }

  for (const exam of content.exams ?? []) {
    const prefix = `시험 ‘${exam.title || exam.id}’`;
    if (!exam.title.trim()) errors.push(`${prefix}: 단계 이름이 필요합니다.`);
    if (!(exam.writtenCount >= 1) || !(exam.passScore >= 1) || exam.passScore > exam.writtenCount) errors.push(`${prefix}: 필기 합격 기준은 1 이상, 문제 수 이하여야 합니다.`);
    if (!exam.practicalItems.some((item) => item.text.trim())) errors.push(`${prefix}: 실기 항목을 한 줄 이상 적어 주세요.`);
  }

  const manualIds = new Set<string>();
  for (const doc of content.manuals ?? []) {
    const prefix = `매뉴얼 ‘${doc.title || doc.id}’`;
    if (!doc.id.trim() || manualIds.has(doc.id)) errors.push(`${prefix}: 문서 ID가 비었거나 중복됩니다.`);
    manualIds.add(doc.id);
    if (!isManualSection(doc.sectionId)) errors.push(`${prefix}: 어느 영역의 문서인지 골라 주세요.`);
    if (!doc.title.trim()) errors.push(`${prefix}: 문서 제목이 필요합니다.`);
    if (!doc.steps.some((step) => step.trim())) errors.push(`${prefix}: 순서를 한 줄 이상 적어 주세요.`);
  }

  const ids = new Set<string>();
  const validHttpsUrl = (value: string) => {
    try { return new URL(value).protocol === "https:"; } catch { return false; }
  };
  for (const recipe of content.recipes) {
    const prefix = recipe.name || recipe.id || "이름 없는 메뉴";
    if (!recipe.id.trim()) errors.push(`${prefix}: 고유 ID가 필요합니다.`);
    if (ids.has(recipe.id)) errors.push(`${prefix}: 고유 ID가 중복됩니다.`);
    ids.add(recipe.id);
    if (!recipe.name.trim()) errors.push(`${prefix}: 메뉴명이 필요합니다.`);
    if (!recipe.category.trim()) errors.push(`${prefix}: 카테고리가 필요합니다.`);
    if (!recipe.change.trim()) errors.push(`${prefix}: 변경 이유가 필요합니다.`);
    if (!recipe.updatedAt.trim()) errors.push(`${prefix}: 시행일이 필요합니다.`);
    if (recipe.standardIds?.some((id) => !standardIds.has(id))) errors.push(`${prefix}: 존재하지 않는 공통 기준이 연결되어 있습니다.`);
    if (recipe.guideIds?.some((id) => !guideIds.has(id))) errors.push(`${prefix}: 존재하지 않는 공통 가이드가 연결되어 있습니다.`);

    const images = recipe.images ?? [];
    const imageIds = new Set(images.map((image) => image.id));
    if (images.length > 12) errors.push(`${prefix}: 사진은 최대 12장까지 등록할 수 있습니다.`);
    if (imageIds.size !== images.length) errors.push(`${prefix}: 사진 ID가 중복됩니다.`);
    for (const image of images) {
      if (!image.alt.trim()) errors.push(`${prefix}: 사진 대체 설명이 필요합니다.`);
      if (!(image.url.startsWith("/api/media?key=") || validHttpsUrl(image.url))) errors.push(`${prefix}: 사진 주소는 업로드 이미지 또는 HTTPS 주소여야 합니다.`);
    }
    const videos = recipe.videos ?? [];
    const videoIds = new Set(videos.map((video) => video.id));
    if (videos.length > 8) errors.push(`${prefix}: 영상은 최대 8개까지 등록할 수 있습니다.`);
    if (videoIds.size !== videos.length) errors.push(`${prefix}: 영상 ID가 중복됩니다.`);
    for (const video of videos) {
      if (!video.title.trim()) errors.push(`${prefix}: 영상 제목이 필요합니다.`);
      if (!validHttpsUrl(video.url)) errors.push(`${prefix}: 영상 주소는 HTTPS 주소여야 합니다.`);
      if (video.orientation && !["auto", "portrait", "landscape"].includes(video.orientation)) errors.push(`${prefix}: 영상 화면 비율 설정을 확인해 주세요.`);
    }

    const modes = Object.entries(recipe.variants) as [RecipeMode, RecipeContent["recipes"][number]["variants"][RecipeMode]][];
    if (!modes.length) errors.push(`${prefix}: 지원 옵션이 한 개 이상 필요합니다.`);
    for (const [mode, variant] of modes) {
      if (!variant) continue;
      if (!variant.quick.length) errors.push(`${prefix} ${mode}: Quick Recipe 항목이 필요합니다.`);
      if (!variant.steps.length) errors.push(`${prefix} ${mode}: 제조 단계가 필요합니다.`);
      if (variant.quick.some((item) => !item.label.trim() || !item.value.trim())) {
        errors.push(`${prefix} ${mode}: 비어 있는 Quick Recipe 항목이 있습니다.`);
      }
      if (variant.layers.some((item) => !item.label.trim() || !item.value.trim())) {
        errors.push(`${prefix} ${mode}: 비어 있는 음료 층 항목이 있습니다.`);
      }
    }
  }
  const promptGuideIds = new Set<string>();
  for (const guide of content.promptGuides ?? []) {
    if (!guide.id.trim() || promptGuideIds.has(guide.id)) errors.push(`영상 프롬프트 지침 ‘${guide.name || guide.id}’: ID가 비었거나 중복됩니다.`);
    promptGuideIds.add(guide.id);
    if (!guide.name.trim() || !guide.body.trim()) errors.push(`영상 프롬프트 지침 ‘${guide.name || guide.id}’: 이름과 내용이 필요합니다.`);
  }
  for (const recipe of content.recipes) {
    if (recipe.promptGuideId && content.promptGuides?.length && !promptGuideIds.has(recipe.promptGuideId)) errors.push(`${recipe.name}: 지정한 영상 프롬프트 지침이 없습니다.`);
  }
  return [...new Set(errors)];
}
