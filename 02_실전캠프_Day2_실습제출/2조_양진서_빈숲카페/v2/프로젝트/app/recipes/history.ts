import type { Recipe, RecipeMode } from "./recipe-data";

// 변경 이력: 한 메뉴가 버전 사이에 무엇이 바뀌었는지(이전 값 → 지금 값) 뽑아낸다. 외부 연결 없음.

export type ChangeLine = { where: string; label: string; before: string; after: string };

const modeLabels: Record<RecipeMode, string> = { HOT: "HOT", ICE: "ICE", UP: "SIZE UP", DINE: "매장·플레이팅", TOGO: "포장" };

function listDiff(where: string, label: string, before: string[] = [], after: string[] = []): ChangeLine[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  const removed = before.filter((item) => !after.includes(item));
  const added = after.filter((item) => !before.includes(item));
  if (!removed.length && !added.length) return [{ where, label, before: "순서만 바뀜", after: `${after.length}개` }];
  return [{ where, label, before: removed.join(" / ") || "(없음)", after: added.join(" / ") || "(삭제)" }];
}

export function diffRecipe(previous: Recipe | undefined, next: Recipe): ChangeLine[] {
  if (!previous) return [{ where: "메뉴", label: "새 메뉴", before: "(없음)", after: next.name }];
  const lines: ChangeLine[] = [];
  if (previous.name !== next.name) lines.push({ where: "메뉴", label: "이름", before: previous.name, after: next.name });

  const modes = [...new Set([...Object.keys(previous.variants), ...Object.keys(next.variants)])] as RecipeMode[];
  for (const mode of modes) {
    const before = previous.variants[mode];
    const after = next.variants[mode];
    const where = modeLabels[mode];
    if (!before && after) { lines.push({ where, label: "구성", before: "(없음)", after: "새로 추가" }); continue; }
    if (before && !after) { lines.push({ where, label: "구성", before: "있음", after: "(삭제)" }); continue; }
    if (!before || !after) continue;

    const labels = [...new Set([...before.quick.map((item) => item.label), ...after.quick.map((item) => item.label)])];
    for (const label of labels) {
      const a = before.quick.find((item) => item.label === label)?.value ?? "(없음)";
      const b = after.quick.find((item) => item.label === label)?.value ?? "(삭제)";
      if (a !== b) lines.push({ where, label, before: a, after: b });
    }
    lines.push(...listDiff(where, "제조 순서", before.steps, after.steps));
    lines.push(...listDiff(where, "주의사항", before.cautions ?? [], after.cautions ?? []));
  }
  lines.push(...listDiff("메뉴", "자주 틀리는 포인트", previous.commonMistakes ?? [], next.commonMistakes ?? []));
  return lines;
}

export type RecipeHistoryEntry = { version: number; publishedAt: string; changeReason: string; publishedBy: string; changes: ChangeLine[] };

// versions: 오래된 것 → 최신 순서로 넘긴다
export function buildRecipeHistory(
  recipeId: string,
  versions: { version: number; published_at: string; change_reason: string; published_by: string; recipes: Recipe[] }[],
): RecipeHistoryEntry[] {
  const entries: RecipeHistoryEntry[] = [];
  let previous: Recipe | undefined;
  let seen = false;
  for (const item of versions) {
    const current = item.recipes.find((recipe) => recipe.id === recipeId);
    if (!current) { previous = undefined; continue; }
    const changes = seen ? diffRecipe(previous, current) : [];
    if (!seen) {
      entries.push({ version: item.version, publishedAt: item.published_at, changeReason: item.change_reason, publishedBy: item.published_by, changes: [{ where: "메뉴", label: "처음 등록", before: "(없음)", after: current.name }] });
    } else if (changes.length) {
      entries.push({ version: item.version, publishedAt: item.published_at, changeReason: item.change_reason, publishedBy: item.published_by, changes });
    }
    previous = current;
    seen = true;
  }
  return entries.reverse();
}
