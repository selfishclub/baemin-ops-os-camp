import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("opens the standalone Recipe OS at the root route", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /export \{ default \} from "\.\/recipes\/page"/);
});

test("ships ten clearly labeled demo recipes", async () => {
  const source = await readFile(new URL("../app/recipes/recipe-data.ts", import.meta.url), "utf8");
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
  const page = await readFile(new URL("../app/recipes/page.tsx", import.meta.url), "utf8");
  assert.match(page, /5초 안에 찾고, 같은 품질로 만드세요/);
  assert.match(page, /fetch\("\/api\/content"/);
  assert.match(page, /href="\/recipes\/admin"/);
  assert.match(page, /name: "search_recipes"/);
  assert.match(page, /일치하는 레시피가 없습니다/);
});

test("keeps durable draft, publish, history and restore flows", async () => {
  const [studio, store] = await Promise.all([
    readFile(new URL("../app/recipes/admin/studio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/recipe-store.ts", import.meta.url), "utf8"),
  ]);
  assert.match(studio, /새 메뉴/);
  assert.match(studio, /초안 저장/);
  assert.match(studio, /공식 게시/);
  assert.match(studio, /이 버전을 초안으로 불러오기/);
  assert.match(store, /recipe_versions/);
});

test("keeps image and video authoring without bundled cafe media", async () => {
  const studio = await readFile(new URL("../app/recipes/admin/studio.tsx", import.meta.url), "utf8");
  assert.match(studio, /사진 올리기/);
  assert.match(studio, /영상 주소 추가/);
  assert.match(studio, /유튜브/);
});
