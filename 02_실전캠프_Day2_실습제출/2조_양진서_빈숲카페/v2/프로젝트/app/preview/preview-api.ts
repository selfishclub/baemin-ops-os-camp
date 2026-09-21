"use client";

import { cascadeSharedStandards, validateRecipeContent } from "../recipes/content-model";
import { buildRecipeHistory } from "../recipes/history";
import { defaultRecipeContent, type RecipeContent } from "../recipes/recipe-data";
import { addPreviewNotices, handlePeople, hasPeopleEdits, resetPeople } from "./preview-people";
import { changedManuals, manualNoticePrefix, readableManuals, stableStringify } from "../manual/manual-data";

// 미리보기 모드: 로그인이 꺼진(둘러보기·시연) 상태에서도 관리자 편집·지침서·게시·변경 이력,
// 그리고 교육 체크·퀴즈·바뀐 레시피 확인·직원 관리(preview-people.ts)를 직접 눌러 볼 수 있게 한다.
// 서버와 데이터 창고는 건드리지 않는다 — 고친 내용은 이 브라우저(localStorage)에만 저장되고 다른 사람에게는 보이지 않는다.
// 로그인 모드에서는 이 파일이 아무 일도 하지 않고 진짜 서버로 그대로 보낸다.

const storageKey = "beansoop-preview-workspace-v1";

type PreviewVersion = { version: number; change_reason: string; effective_at: string; published_by: string; published_at: string; content: RecipeContent };
type PreviewWorkspace = {
  draft: RecipeContent;
  revision: number;
  updatedAt: string;
  publishedVersion: number;
  publishedAt: string;
  published: RecipeContent;
  versions: PreviewVersion[];
};

const actorName = "미리보기 사장";

function freshWorkspace(): PreviewWorkspace {
  const now = new Date().toISOString();
  const seed = structuredClone(defaultRecipeContent);
  return {
    draft: seed,
    revision: 1,
    updatedAt: now,
    publishedVersion: 1,
    publishedAt: now,
    published: structuredClone(seed),
    versions: [{ version: 1, change_reason: "빈 템플릿 생성", effective_at: now.slice(0, 10), published_by: "system-seed", published_at: now, content: structuredClone(seed) }],
  };
}

function load(): PreviewWorkspace {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw) return JSON.parse(raw) as PreviewWorkspace;
  } catch {
    // 저장소를 못 쓰는 브라우저면 매번 새로 시작한다
  }
  return freshWorkspace();
}

function save(workspace: PreviewWorkspace) {
  try {
    // 오래된 버전은 8개까지만 남긴다 (브라우저 저장 공간 보호)
    workspace.versions = workspace.versions.slice(-8);
    window.localStorage.setItem(storageKey, JSON.stringify(workspace));
  } catch {
    // 공간이 모자라면 저장을 건너뛴다. 화면은 계속 동작한다
  }
}

function hasWorkspaceEdits() {
  try {
    return Boolean(window.localStorage.getItem(storageKey));
  } catch {
    return false;
  }
}

export function hasPreviewEdits() {
  const hasLocks = document.cookie.split("; ").some((item) => item.startsWith("bs_preview_locks=") && item.length > "bs_preview_locks=".length);
  return hasWorkspaceEdits() || hasPeopleEdits() || hasLocks;
}

// 미리보기 잠금 쿠키 지우기 (컴포넌트 밖 헬퍼)
function clearPreviewLockCookie() {
  document.cookie = "bs_preview_locks=; path=/; max-age=0; samesite=lax";
}

export function resetPreview() {
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // 무시
  }
  resetPeople();
  clearPreviewLockCookie();
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function readBody(init?: RequestInit) {
  if (!init?.body || typeof init.body !== "string") return {} as Record<string, unknown>;
  try {
    return JSON.parse(init.body) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function handlePreview(url: string, init?: RequestInit): Promise<Response | null> {
  const method = (init?.method ?? "GET").toUpperCase();
  const path = url.split("?")[0];

  if (path === "/api/admin/content" && method === "GET") {
    const ws = load();
    return json({
      content: ws.draft,
      revision: ws.revision,
      updatedBy: actorName,
      updatedAt: ws.updatedAt,
      publishedVersion: ws.publishedVersion,
      publishedAt: ws.publishedAt,
      history: [...ws.versions].reverse().map(({ version, change_reason, effective_at, published_by, published_at }) => ({ version, change_reason, effective_at, published_by, published_at })),
      actor: { id: "preview", email: actorName, role: "owner · 미리보기" },
    });
  }

  if (path === "/api/admin/content" && method === "PUT") {
    const body = await readBody(init);
    const ws = load();
    if (!body.content || Number(body.revision) !== ws.revision) return json({ error: "다른 화면에서 먼저 수정했습니다. 최신 초안을 다시 불러와 주세요." }, 409);
    const cascaded = cascadeSharedStandards(body.content as RecipeContent);
    ws.draft = cascaded.content;
    ws.revision += 1;
    ws.updatedAt = new Date().toISOString();
    save(ws);
    return json({ revision: ws.revision, updatedAt: ws.updatedAt, content: ws.draft });
  }

  if (path === "/api/admin/publish" && method === "POST") {
    const body = await readBody(init);
    const ws = load();
    if (Number(body.revision) !== ws.revision) return json({ error: "다른 화면에서 먼저 수정했습니다. 최신 초안을 다시 불러와 주세요." }, 409);
    const cascaded = cascadeSharedStandards(ws.draft);
    const errors = validateRecipeContent(cascaded.content);
    const reason = String(body.changeReason ?? "").trim();
    const effectiveAt = String(body.effectiveAt ?? "").trim();
    if (!reason) errors.unshift("게시 변경 이유가 필요합니다.");
    if (!effectiveAt) errors.unshift("게시 시행일이 필요합니다.");
    if (errors.length) return json({ error: "게시 전 확인이 필요합니다.", errors }, 422);
    const before = new Map(ws.published.recipes.map((recipe) => [recipe.id, stableStringify(recipe)]));
    const changed = cascaded.content.recipes.filter((recipe) => before.get(recipe.id) !== stableStringify(recipe));
    // 매뉴얼 문서·응대 카드도 바뀌었으면 알림 (서버의 publishDraft 와 같은 규칙)
    const changedDocs = changedManuals(ws.published, cascaded.content);
    const notified = body.notifyStaff === false ? 0 : changed.length + changedDocs.length;
    const now = new Date().toISOString();
    ws.publishedVersion += 1;
    ws.published = structuredClone(cascaded.content);
    ws.draft = structuredClone(cascaded.content);
    ws.publishedAt = now;
    ws.updatedAt = now;
    ws.revision += 1;
    ws.versions.push({ version: ws.publishedVersion, change_reason: reason, effective_at: effectiveAt, published_by: actorName, published_at: now, content: structuredClone(cascaded.content) });
    save(ws);
    if (body.notifyStaff !== false) addPreviewNotices(ws.published.recipes, [...changed.map((recipe) => ({ id: recipe.id, name: recipe.name })), ...changedDocs.map((doc) => ({ id: `${manualNoticePrefix}${doc.id}`, name: doc.title }))], ws.publishedVersion, reason, actorName);
    return json({ version: ws.publishedVersion, revision: ws.revision, publishedAt: now, content: ws.published, notified });
  }

  if (path === "/api/admin/restore" && method === "POST") {
    const body = await readBody(init);
    const ws = load();
    const target = ws.versions.find((item) => item.version === Number(body.version));
    if (!target) return json({ error: "해당 버전을 찾을 수 없습니다. (미리보기는 최근 8개 버전만 보관해요)" }, 404);
    if (Number(body.revision) !== ws.revision) return json({ error: "다른 화면에서 먼저 수정했습니다. 최신 초안을 다시 불러와 주세요." }, 409);
    ws.draft = structuredClone(target.content);
    ws.revision += 1;
    ws.updatedAt = new Date().toISOString();
    save(ws);
    return json({ revision: ws.revision, content: ws.draft, updatedAt: ws.updatedAt });
  }

  if (path === "/api/admin/media" && method === "POST") {
    return json({ error: "미리보기에서는 사진을 올릴 수 없어요. 사진은 로그인한 뒤 데이터 창고의 비공개 파일함에 저장돼요." }, 400);
  }

  // 직원 화면: 미리보기에서 게시한 적이 있으면 그 공식본을 보여 준다
  if (path === "/api/content" && method === "GET" && hasWorkspaceEdits()) {
    return json({ content: load().published, source: "preview" });
  }

  // 운영 매뉴얼: 미리보기에서 게시한 적이 있으면 그 공식본의 문서를 보여 준다
  if (path === "/api/manuals" && method === "GET" && hasWorkspaceEdits()) {
    const section = new URL(url, window.location.origin).searchParams.get("section") ?? "";
    return json({ docs: readableManuals(load().published).filter((doc) => doc.sectionId === section), source: "preview" });
  }

  if (path === "/api/history" && method === "GET" && hasWorkspaceEdits()) {
    const recipeId = new URL(url, window.location.origin).searchParams.get("recipe") ?? "";
    const versions = load().versions.map((item) => ({ version: item.version, published_at: item.published_at, change_reason: item.change_reason, published_by: item.published_by, recipes: item.content.recipes }));
    return json({ history: buildRecipeHistory(recipeId, versions) });
  }

  // 교육 체크·퀴즈·바뀐 레시피 확인·직원 관리: 지금 공식본(미리보기에서 게시했으면 그것)의 메뉴 기준
  const published = hasWorkspaceEdits() ? load().published : defaultRecipeContent;
  return handlePeople(path, method, url, await readBody(init), published);
}

// preview=true 면 위 주소들은 브라우저 안에서 처리하고, 나머지는 서버로 보낸다. preview=false 면 항상 서버로.
export async function apiFetch(preview: boolean, url: string, init?: RequestInit): Promise<Response> {
  if (preview && typeof window !== "undefined") {
    const handled = await handlePreview(url, init);
    if (handled) return handled;
  }
  return fetch(url, init);
}
