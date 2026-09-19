import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("opens the Beansoop OS portal at the root and keeps recipes as one section", async () => {
  const [home, sections, recipesRoute] = await Promise.all([read("../app/page.tsx"), read("../app/portal-sections.ts"), read("../app/recipes/page.tsx")]);
  assert.match(home, /빈숲 OS/);
  assert.match(home, /requireActiveViewer\("\/"\)/);
  assert.match(sections, /href: "\/recipes"/);
  assert.match(sections, /status: "soon"/);
  assert.match(recipesRoute, /requireActiveViewer\("\/recipes"\)/);
});

test("ships ten clearly labeled demo recipes", async () => {
  const source = await read("../app/recipes/recipe-data.ts");
  assert.match(source, /const demoMenus = \[/);
  assert.equal((source.match(/\["demo-/g) ?? []).length, 10);
  assert.match(source, /recipes: \[\.\.\.demoRecipes, demoBakeryRecipe\]/);
  assert.match(source, /sharedStandards: \[\]/);
  assert.match(source, /sharedGuides: \[\]/);
  assert.match(source, /value: "10g"/);
  assert.match(source, /value: "10ml"/);
  assert.doesNotMatch(source, /excel-import/);
});

test("keeps discovery and administrator entry points", async () => {
  const page = await read("../app/recipes/recipes-page.tsx");
  assert.match(page, /5초 안에 찾고, 같은 품질로 만드세요/);
  assert.match(page, /fetch\("\/api\/content"/);
  assert.match(page, /href="\/recipes\/admin"/);
  assert.match(page, /name: "search_recipes"/);
  assert.match(page, /일치하는 레시피가 없습니다/);
});

test("gates pages behind login and owner role", async () => {
  const [route, admin, auth, proxy] = await Promise.all([
    read("../app/recipes/page.tsx"),
    read("../app/recipes/admin/page.tsx"),
    read("../app/auth.ts"),
    read("../proxy.ts"),
  ]);
  assert.match(route, /requireActiveViewer/);
  assert.match(admin, /role !== "owner"/);
  assert.match(auth, /사장님 계정만 편집할 수 있습니다/);
  assert.match(proxy, /\/login/);
});

test("keeps durable draft, publish, history and restore flows", async () => {
  const [studio, store, schema] = await Promise.all([
    read("../app/recipes/admin/studio.tsx"),
    read("../db/recipe-store.ts"),
    read("../supabase/schema.sql"),
  ]);
  assert.match(studio, /새 메뉴/);
  assert.match(studio, /초안 저장/);
  assert.match(studio, /공식 게시/);
  assert.match(studio, /이 버전을 초안으로 불러오기/);
  assert.match(store, /recipe_versions/);
  assert.match(schema, /enable row level security/);
  assert.match(schema, /is_owner\(\)/);
});

test("names ingredient tones and stacks layers bottom-up", async () => {
  const [data, page] = await Promise.all([
    read("../app/recipes/recipe-data.ts"),
    read("../app/recipes/recipes-page.tsx"),
  ]);
  assert.match(data, /id: "strawberry"/);
  assert.match(data, /export function suggestLayerTone/);
  assert.match(page, /잔 아래\(1층\)부터/);
});

test("ships training checklist and quiz", async () => {
  const [page, quiz, schema] = await Promise.all([read("../app/recipes/training/training-page.tsx"), read("../app/recipes/quiz.ts"), read("../supabase/schema.sql")]);
  assert.match(page, /만들어 봤음/);
  assert.match(page, /확인함/);
  assert.match(quiz, /export function buildQuiz/);
  assert.match(schema, /training_checks/);
  assert.match(schema, /quiz_results/);
});

test("answers from recipes without any external AI and keeps the AI hook last", async () => {
  const [engine, route, history, page] = await Promise.all([
    read("../app/recipes/chat-engine.ts"),
    read("../app/api/chat/route.ts"),
    read("../app/recipes/history.ts"),
    read("../app/recipes/recipes-page.tsx"),
  ]);
  assert.match(engine, /export function answerFromRecipes/);
  assert.match(engine, /레시피북에 없는 메뉴입니다/);
  assert.doesNotMatch(engine, /fetch\(/);
  assert.match(route, /AI 연결 자리/);
  assert.match(history, /export function buildRecipeHistory/);
  assert.match(page, /<ChatPanel/);
  assert.match(page, /<HistoryPanel/);
});

test("loads a video prompt guide per kind (drink, bakery, etc)", async () => {
  const [data, page, studio] = await Promise.all([read("../app/recipes/recipe-data.ts"), read("../app/recipes/recipes-page.tsx"), read("../app/recipes/admin/studio.tsx")]);
  assert.match(data, /export const defaultPromptGuides/);
  assert.match(data, /id: "bakery"/);
  assert.match(data, /커팅·포장·매장 제공/);
  assert.match(data, /export function fillPromptGuide/);
  assert.match(page, /pickPromptGuide\(guides, recipe\)/);
  assert.match(studio, /영상 프롬프트 지침서/);
});

test("lets the owner lock or open each big menu from an admin screen", async () => {
  const [store, page, api, recipesRoute, chat] = await Promise.all([
    read("../db/portal-store.ts"),
    read("../app/manage/menus/menu-locks.tsx"),
    read("../app/api/admin/portal/route.ts"),
    read("../app/recipes/page.tsx"),
    read("../app/api/chat/route.ts"),
  ]);
  assert.match(store, /export async function checkSectionAccess/);
  assert.match(store, /LOCKED_SECTIONS/);
  assert.match(page, /메뉴 잠금 설정/);
  assert.match(api, /requireOwnerApi/);
  assert.match(recipesRoute, /checkSectionAccess\(session, "recipes"\)/);
  assert.match(chat, /lockedResponse\(\)/);
});

test("keeps image and video authoring without bundled cafe media", async () => {
  const studio = await read("../app/recipes/admin/studio.tsx");
  assert.match(studio, /사진 올리기/);
  assert.match(studio, /영상 주소 추가/);
  assert.match(studio, /유튜브/);
});
