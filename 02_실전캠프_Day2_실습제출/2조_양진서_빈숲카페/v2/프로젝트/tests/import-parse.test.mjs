import assert from "node:assert/strict";
import test from "node:test";
import { manualTemplate, parseManualTable, parseMeasure, parseRecipeTable, parseTable, recipeTemplate, splitItems } from "../app/recipes/admin/import-parse.ts";

// 엑셀·표 가져오기의 읽는 부분을 실제로 돌려 본다. 아래 표는 전부 가짜 값이다.

const tone = (label) => (label.includes("얼음") ? "ice" : label.includes("우유") ? "milk" : null);
const recipeOptions = { suggestTone: tone, today: "2026.01.01", existing: [] };

test("reads an Excel paste: tabs, quoted cells with line breaks, doubled quotes", () => {
  const rows = parseTable('메뉴명\t정량\r\n가짜 라떼\t"얼음 가득\n우유 100ml"\r\n가짜 티\t"말 ""따옴표"" 포함"\r\n\r\n');
  assert.deepEqual(rows, [["메뉴명", "정량"], ["가짜 라떼", "얼음 가득\n우유 100ml"], ["가짜 티", '말 "따옴표" 포함']]);
  assert.deepEqual(parseTable("a,b\n1,2"), [["a", "b"], ["1", "2"]]);
});

test("splits items and measures the way owners actually type them", () => {
  assert.deepEqual(splitItems("1. 얼음을 채운다 2. 우유를 붓는다; 3) 샷을 올린다"), ["얼음을 채운다", "우유를 붓는다", "샷을 올린다"]);
  assert.deepEqual(parseMeasure("바닐라 시럽 20g"), { label: "바닐라 시럽", value: "20g" });
  assert.deepEqual(parseMeasure("우유: 200ml"), { label: "우유", value: "200ml" });
  assert.deepEqual(parseMeasure("얼음 가득"), { label: "얼음", value: "가득" });
  assert.deepEqual(parseMeasure("에스프레소 2샷"), { label: "에스프레소", value: "2샷" });
});

test("turns the recipe template into menus with HOT/ICE merged into one menu", () => {
  const result = parseRecipeTable(recipeTemplate, recipeOptions);
  assert.equal(result.skipped.length, 0);
  assert.deepEqual(result.items.map((recipe) => recipe.name), ["예시 라떼", "예시 스콘"]);
  const latte = result.items[0];
  assert.deepEqual(Object.keys(latte.variants).sort(), ["HOT", "ICE"]);
  assert.deepEqual(latte.variants.ICE.quick[0], { label: "얼음", value: "가득" });
  assert.equal(latte.variants.ICE.layers[0].tone, "ice");
  assert.equal(latte.variants.ICE.steps.length, 3);
  assert.deepEqual(latte.commonMistakes, ["우유를 먼저 넣지 않으면 층이 섞여요"]);
  assert.deepEqual(Object.keys(result.items[1].variants), ["TOGO"]);
});

test("accepts different column names, blank repeated names, and reports what it could not read", () => {
  const text = ["메뉴\t분류\t온도\t재료\t만드는 법\t원가", "가짜 모카\t커피\t핫\t초코 소스 00g; 우유 000ml\t1. 소스를 넣는다", "\t\t아이스\t얼음 가득; 우유 000ml\t1. 얼음을 채운다", "가짜 에이드\t에이드\t미지근\t탄산수 000ml\t1. 붓는다", "\t\t\t\t"].join("\n");
  const result = parseRecipeTable(text, recipeOptions);
  assert.deepEqual(result.items.map((recipe) => [recipe.name, Object.keys(recipe.variants).sort().join("+")]), [["가짜 모카", "HOT+ICE"]]);
  assert.match(result.skipped.join("\n"), /가짜 에이드.*미지근/);
  assert.match(result.warnings.join("\n"), /쓰지 않은 열: 원가/);
  assert.match(parseRecipeTable("이름없는표\n값", recipeOptions).skipped[0], /메뉴명/);
});

test("keeps the id, photos and videos of an existing menu with the same name", () => {
  const existing = [{ id: "keep-me", name: "예시 라떼", category: "라떼", description: "", version: "3.0", updatedAt: "", change: "", customerGuide: "", drinkingTip: "", images: [{ id: "p1", url: "/api/media?key=x", alt: "사진" }], variants: {} }];
  const latte = parseRecipeTable(recipeTemplate, { ...recipeOptions, existing }).items[0];
  assert.equal(latte.id, "keep-me");
  assert.equal(latte.images.length, 1);
  assert.equal(latte.change, "표에서 가져와 교체");
});

test("turns the manual template into a procedure document and a response card", () => {
  const sections = [{ id: "close", title: "마감" }, { id: "service", title: "고객응대 · 주문 · 결제" }];
  const result = parseManualTable(manualTemplate, { sections, today: "2026-01-01", existing: [] });
  assert.equal(result.skipped.length, 0);
  assert.deepEqual(result.items.map((doc) => [doc.sectionId, doc.kind, doc.group ?? ""]), [["close", "procedure", ""], ["service", "response", "불만"]]);
  assert.deepEqual(result.items[0].steps, ["바닥을 쓴다", "기기를 닦는다"]);
  assert.deepEqual(result.items[1].keywords, ["늦게", "오래"]);
  assert.deepEqual(result.items[1].materials, []);
  const bad = parseManualTable("영역\t제목\n주차장\t가짜 문서", { sections, today: "", existing: [] });
  assert.match(bad.skipped[0], /주차장/);
});
