import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("opens the Beansoop OS portal at the root and keeps recipes as one section", async () => {
  const [home, sections, recipesRoute] = await Promise.all([read("../app/page.tsx"), read("../app/portal-sections.ts"), read("../app/recipes/page.tsx")]);
  assert.match(home, /빈숲 OS/);
  assert.match(home, /requireActiveViewer\("\/"\)/);
  assert.match(sections, /href: "\/recipes"/);
  // 자리만 잡아 두는 "준비 중" 상태는 틀로 남아 있고(새 영역을 만들 때 씀), 지금은 모든 영역이 열려 있다
  assert.match(sections, /status: "open" \| "soon"/);
  assert.doesNotMatch(sections, /status: "soon",/);
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
  assert.match(page, /apiFetch\(demo, "\/api\/content"/);
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

test("previews owner screens in the browser only, never against real data", async () => {
  const [adapter, adminPage, menusPage, store] = await Promise.all([
    read("../app/preview/preview-api.ts"),
    read("../app/recipes/admin/page.tsx"),
    read("../app/manage/menus/page.tsx"),
    read("../db/portal-store.ts"),
  ]);
  // 미리보기는 서버가 시연·둘러보기 모드라고 판단했을 때만 켜진다
  assert.match(adminPage, /session\.mode === "demo"\) return <AdminStudio[^>]* preview/);
  assert.match(menusPage, /session\.mode === "demo"\) return <MenuLocks preview/);
  // 고친 내용은 브라우저 저장소에만, 데이터 창고로 가는 길은 없다
  assert.match(adapter, /localStorage\.setItem/);
  assert.doesNotMatch(adapter, /supabase/i);
  // 미리보기 잠금 쿠키는 데이터 창고가 없을 때(로그인 꺼짐)만 읽는다
  assert.match(store, /if \(!db\) \{\s+for \(const id of await previewLocks\(\)\)/);
});

test("switches the preview between staff and owner eyes without touching real roles", async () => {
  const [role, people, store, auth, training, changes, staff, admin] = await Promise.all([
    read("../app/preview/preview-role.ts"),
    read("../app/preview/preview-people.ts"),
    read("../db/portal-store.ts"),
    read("../app/auth.ts"),
    read("../app/recipes/training/page.tsx"),
    read("../app/recipes/changes/page.tsx"),
    read("../app/recipes/staff/page.tsx"),
    read("../app/recipes/admin/page.tsx"),
  ]);
  // 기본은 사장 눈, 쿠키가 staff 일 때만 직원 눈
  assert.match(role, /=== "staff" \? "staff" : "owner"/);
  // 로그인·권한 판단(auth.ts)은 미리보기 쿠키를 전혀 모른다
  assert.doesNotMatch(auth, /preview/i);
  // 미리보기 사장은 미리보기(쿠키) 잠금만 지나가고, 서버 설정 고정 잠금은 못 지나간다
  assert.match(store, /session\.mode === "demo" && !envLocked && \(await readPreviewRole\(\)\) === "owner"/);
  // 사장 전용 화면은 미리보기에서도 직원 눈으로는 안내문만
  for (const page of [changes, staff, admin]) assert.match(page, /OwnerOnlyNotice/);
  assert.match(training, /session\.mode === "demo"\) return <TrainingPage[^>]* preview/);
  // 가짜 사람 데이터는 브라우저 저장소에만, 데이터 창고로 가는 길은 없다
  assert.match(people, /localStorage\.setItem/);
  assert.doesNotMatch(people, /supabase|fetch\(/i);
});

test("opens the operation manual sections on one document frame with fake examples only", async () => {
  const [data, sections, page, api, chat, editor] = await Promise.all([
    read("../app/manual/manual-data.ts"),
    read("../app/portal-sections.ts"),
    read("../app/manual/[section]/page.tsx"),
    read("../app/api/manuals/route.ts"),
    read("../app/api/chat/route.ts"),
    read("../app/recipes/admin/manual-editor.tsx"),
  ]);
  // 같은 문서 틀: 목적·준비물·순서·완료 기준·하면 안 되는 것·보고 기준
  for (const field of ["purpose", "materials", "steps", "doneCriteria", "donts", "reportWhen"]) assert.match(data, new RegExp(`${field}:`));
  // 문서형 영역 8개가 열리고, 시험·공지는 아직 준비 중
  for (const id of ["standard", "open", "middle", "close", "service", "hygiene", "barista", "equipment"]) assert.match(sections, new RegExp(`id: "${id}"[^}]*status: "open", href: "/manual/${id}"`));
  assert.match(sections, /id: "exam"[^}]*status: "open", href: "\/exam"/);
  // 공개용 버전: 예시 문서는 전부 (예시)·○○ 빈 양식
  const exampleLines = data.match(/\"\(예시\)[^\"]*\"/g) ?? [];
  assert.ok(exampleLines.length > 40);
  assert.match(data, /○○/);
  // 영역 잠금은 화면·문서 API·챗봇 모두에 적용
  assert.match(page, /checkSectionAccess\(session, section\)/);
  assert.match(api, /checkSectionAccess\(session, section\)/);
  assert.match(chat, /allowed\.has\(doc\.sectionId\)/);
  assert.doesNotMatch(chat, /fetch\(|openai|anthropic/i);
  assert.match(editor, /manuals: next/);
});

test("keeps a response-card book for customer service and lets the chatbot find cards by everyday words", async () => {
  const [data, chat, screen, editor] = await Promise.all([
    read("../app/manual/manual-data.ts"),
    read("../app/manual/manual-chat.ts"),
    read("../app/manual/[section]/manual-section.tsx"),
    read("../app/recipes/admin/manual-editor.tsx"),
  ]);
  // 응대 카드 틀: 같은 칸을 응대용 이름으로
  for (const label of ["이렇게 말해요", "이렇게는 말하지 않아요", "직원이 혼자 해도 되는 범위", "이럴 땐 책임자를 불러요"]) assert.match(data, new RegExp(label));
  // 묶음 7개, 예시 카드는 전부 고객응대 영역의 가짜 예시
  for (const group of ["기본 흐름", "주문 상황", "결제", "불만", "매장 이용 안내", "어려운 상황"]) assert.match(data, new RegExp(`"${group}"`));
  assert.ok((data.match(/^  card\(/gm) ?? []).length >= 15);
  // 환불·보상처럼 판단이 필요한 기준은 적지 않고 확인 필요로 남긴다
  assert.match(data, /환불·보상을 혼자 약속하지 않는다/);
  assert.match(data, /확인 필요/);
  // 챗봇은 카드의 ‘알아듣는 낱말’로도 찾는다
  assert.match(chat, /doc\.keywords/);
  assert.match(screen, /data-kind=\{isCard \? "response" : "procedure"\}/);
  assert.match(editor, /\+ 새 응대 카드/);
});

test("bundles manuals, cards and menus into a staged training path that the owner confirms", async () => {
  const [pathData, manualData, store, api, screen, editor, schema] = await Promise.all([
    read("../app/manual/training-path.ts"),
    read("../app/manual/manual-data.ts"),
    read("../db/training-store.ts"),
    read("../app/api/training/route.ts"),
    read("../app/recipes/training/training-page.tsx"),
    read("../app/recipes/admin/path-editor.tsx"),
    read("../supabase/schema.sql"),
  ]);
  // 예시 경로의 매뉴얼 항목은 전부 실제로 있는 예시 문서를 가리킨다
  const manualIds = [...pathData.matchAll(/manual\("([^"]+)"\)/g)].map((match) => match[1]);
  assert.ok(manualIds.length >= 12);
  for (const id of manualIds) {
    const slug = id.replace(/^demo-(standard|open|middle|close|service|hygiene|barista|equipment)-/, "");
    assert.match(manualData, new RegExp(`"${slug}"`), `예시 경로의 ${id} 문서가 없습니다`);
  }
  // 문서 읽음은 기존 교육 체크 표에 manual: 열쇠로 적는다 (표 추가 없음), 사장 확인은 창고 트리거가 지킨다
  assert.match(pathData, /manualCheckPrefix = "manual:"/);
  assert.match(store, /startsWith\(manualCheckPrefix\)/);
  assert.match(schema, /recipe_id text not null/);
  assert.match(schema, /guard_training_confirm/);
  // 잠긴 영역의 문서는 직원 교육 화면에도 나가지 않는다
  assert.match(api, /allowedSections\(/);
  assert.match(screen, /읽었어요/);
  assert.match(screen, /buildManualQuiz/);
  assert.match(editor, /trainingPath: next/);
});

test("asks staff to acknowledge changed manuals the same way as changed recipes", async () => {
  const [data, store, view, listApi, ackApi, board, sections, screen] = await Promise.all([
    read("../app/manual/manual-data.ts"),
    read("../db/recipe-store.ts"),
    read("../db/notice-view.ts"),
    read("../app/api/changes/route.ts"),
    read("../app/api/changes/ack/route.ts"),
    read("../app/notices/notice-board.tsx"),
    read("../app/portal-sections.ts"),
    read("../app/manual/[section]/manual-section.tsx"),
  ]);
  // 게시할 때 실제로 바뀐 문서만 알림 (이전 공식본과 비교)
  assert.match(data, /export function changedManuals/);
  assert.match(store, /changedManuals\(previous, cascaded\.content\)/);
  assert.match(store, /manualNoticePrefix/);
  // 직원에게는 열려 있는 영역의 알림만 — 목록과 확인 응답이 같은 규칙을 쓴다
  assert.match(view, /allowedSections\(/);
  assert.match(listApi, /listVisibleNotices/);
  assert.match(ackApi, /listVisibleNotices/);
  // 확인은 사람이 직접 누른다
  assert.match(board, /확인했어요/);
  assert.match(screen, /이 문서가 바뀌었어요/);
  assert.match(sections, /id: "notice"[^}]*status: "open", href: "\/notices"/);
});

test("keeps image and video authoring without bundled cafe media", async () => {
  const studio = await read("../app/recipes/admin/studio.tsx");
  assert.match(studio, /사진 올리기/);
  assert.match(studio, /영상 주소 추가/);
  assert.match(studio, /유튜브/);
});
