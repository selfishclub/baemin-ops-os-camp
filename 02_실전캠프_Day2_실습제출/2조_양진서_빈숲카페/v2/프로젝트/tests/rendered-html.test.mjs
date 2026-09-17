import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("opens the standalone Recipe OS at the root route", async () => {
  const source = await read("../app/page.tsx");
  assert.match(source, /export \{ default \} from "\.\/recipes\/page"/);
});

test("ships ten clearly labeled demo recipes", async () => {
  const source = await read("../app/recipes/recipe-data.ts");
  assert.match(source, /const demoMenus = \[/);
  assert.equal((source.match(/\["demo-/g) ?? []).length, 10);
  assert.match(source, /recipes: demoRecipes/);
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

test("keeps image and video authoring without bundled cafe media", async () => {
  const studio = await read("../app/recipes/admin/studio.tsx");
  assert.match(studio, /사진 올리기/);
  assert.match(studio, /영상 주소 추가/);
  assert.match(studio, /유튜브/);
});
