import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultRecipeContent, RecipeContent } from "../app/recipes/recipe-data";
import {
  cascadeSharedStandards,
  parseRecipeContent,
  validateRecipeContent,
} from "../app/recipes/content-model";
import type { AdminActor } from "../app/auth";

// 데이터 창고(Supabase Postgres) 저장 층.
// 표는 supabase/schema.sql 로 만든다. 접근 권한(RLS)은 창고 쪽에서 건다:
//   재직 직원 = 읽기, 사장(owner) = 쓰기.

const workspaceId = "main";

type WorkspaceRow = {
  id: string;
  draft_json: RecipeContent;
  draft_revision: number;
  draft_updated_by: string;
  draft_updated_at: string;
  published_version: number;
  published_json: RecipeContent;
  published_at: string;
};

function nowIso() {
  return new Date().toISOString();
}

async function readWorkspace(db: SupabaseClient): Promise<WorkspaceRow | null> {
  const { data, error } = await db.from("recipe_workspaces").select("*").eq("id", workspaceId).maybeSingle();
  if (error) throw new Error(`작업 공간을 읽지 못했습니다: ${error.message}`);
  return (data as WorkspaceRow | null) ?? null;
}

// 처음 한 번, 사장이 관리 화면을 열 때 빈 템플릿(가짜 레시피)으로 작업 공간을 만든다.
async function ensureWorkspace(db: SupabaseClient): Promise<WorkspaceRow> {
  const existing = await readWorkspace(db);
  if (existing) return existing;
  const now = nowIso();
  const seed = structuredClone(defaultRecipeContent);
  const { error: wsError } = await db.from("recipe_workspaces").insert({
    id: workspaceId,
    draft_json: seed,
    draft_revision: 1,
    draft_updated_by: "system-seed",
    draft_updated_at: now,
    published_version: 1,
    published_json: seed,
    published_at: now,
  });
  if (wsError) throw new Error(`작업 공간을 만들지 못했습니다: ${wsError.message}`);
  await db.from("recipe_versions").insert({
    version: 1,
    content_json: seed,
    change_reason: "빈 템플릿 생성",
    effective_at: now.slice(0, 10),
    published_by: "system-seed",
    published_at: now,
  });
  const created = await readWorkspace(db);
  if (!created) throw new Error("작업 공간을 만든 뒤 다시 읽지 못했습니다.");
  return created;
}

async function audit(db: SupabaseClient, actor: AdminActor, action: string, details: unknown) {
  await db.from("recipe_audit_log").insert({
    action,
    actor_id: actor.id,
    actor_email: actor.email,
    details_json: details,
    created_at: nowIso(),
  });
}

export async function readPublishedContent(db: SupabaseClient | null): Promise<RecipeContent> {
  if (!db) return structuredClone(defaultRecipeContent);
  const row = await readWorkspace(db);
  return row ? parseRecipeContent(row.published_json) : structuredClone(defaultRecipeContent);
}

export async function readAdminWorkspace(db: SupabaseClient) {
  const workspace = await ensureWorkspace(db);
  const { data: history, error } = await db
    .from("recipe_versions")
    .select("version, change_reason, effective_at, published_by, published_at")
    .order("version", { ascending: false })
    .limit(20);
  if (error) throw new Error(`버전 기록을 읽지 못했습니다: ${error.message}`);
  return {
    content: parseRecipeContent(workspace.draft_json),
    revision: workspace.draft_revision,
    updatedBy: workspace.draft_updated_by,
    updatedAt: workspace.draft_updated_at,
    publishedVersion: workspace.published_version,
    publishedAt: workspace.published_at,
    history: history ?? [],
  };
}

// revision 이 맞을 때만 저장한다(다른 화면에서 먼저 고쳤으면 실패 → 409).
async function updateIfRevision(db: SupabaseClient, expectedRevision: number, patch: Record<string, unknown>) {
  const { data, error } = await db
    .from("recipe_workspaces")
    .update({ ...patch, draft_revision: expectedRevision + 1 })
    .eq("id", workspaceId)
    .eq("draft_revision", expectedRevision)
    .select("draft_revision");
  if (error) throw new Error(`저장하지 못했습니다: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

export async function saveDraft(
  db: SupabaseClient,
  actor: AdminActor,
  content: RecipeContent,
  expectedRevision: number,
) {
  await ensureWorkspace(db);
  const now = nowIso();
  const cascaded = cascadeSharedStandards(content);
  const ok = await updateIfRevision(db, expectedRevision, {
    draft_json: cascaded.content,
    draft_updated_by: actor.email,
    draft_updated_at: now,
  });
  if (!ok) return null;
  await audit(db, actor, "draft_saved", { impactedRecipeIds: cascaded.impactedRecipeIds });
  return { revision: expectedRevision + 1, updatedAt: now, content: cascaded.content };
}

export async function publishDraft(
  db: SupabaseClient,
  actor: AdminActor,
  expectedRevision: number,
  changeReason: string,
  effectiveAt: string,
) {
  const workspace = await ensureWorkspace(db);
  if (workspace.draft_revision !== expectedRevision) return { conflict: true as const };

  const cascaded = cascadeSharedStandards(parseRecipeContent(workspace.draft_json));
  const errors = validateRecipeContent(cascaded.content);
  if (!changeReason.trim()) errors.unshift("게시 변경 이유가 필요합니다.");
  if (!effectiveAt.trim()) errors.unshift("게시 시행일이 필요합니다.");
  if (errors.length) return { errors };

  const nextVersion = workspace.published_version + 1;
  const now = nowIso();
  const ok = await updateIfRevision(db, expectedRevision, {
    published_version: nextVersion,
    published_json: cascaded.content,
    published_at: now,
    draft_json: cascaded.content,
    draft_updated_by: actor.email,
    draft_updated_at: now,
  });
  if (!ok) return { conflict: true as const };

  const { error } = await db.from("recipe_versions").insert({
    version: nextVersion,
    content_json: cascaded.content,
    change_reason: changeReason.trim(),
    effective_at: effectiveAt,
    published_by: actor.email,
    published_at: now,
  });
  if (error) throw new Error(`버전 기록을 남기지 못했습니다: ${error.message}`);
  await audit(db, actor, "published", { version: nextVersion, changeReason, effectiveAt, impactedRecipeIds: cascaded.impactedRecipeIds });
  return { version: nextVersion, revision: expectedRevision + 1, publishedAt: now, content: cascaded.content };
}

export async function restoreVersionToDraft(
  db: SupabaseClient,
  actor: AdminActor,
  version: number,
  expectedRevision: number,
) {
  await ensureWorkspace(db);
  const { data: row, error } = await db.from("recipe_versions").select("content_json").eq("version", version).maybeSingle();
  if (error) throw new Error(`버전을 읽지 못했습니다: ${error.message}`);
  if (!row) return { missing: true as const };
  const now = nowIso();
  const content = parseRecipeContent(row.content_json);
  const ok = await updateIfRevision(db, expectedRevision, {
    draft_json: content,
    draft_updated_by: actor.email,
    draft_updated_at: now,
  });
  if (!ok) return { conflict: true as const };
  await audit(db, actor, "version_restored_to_draft", { version });
  return { revision: expectedRevision + 1, content, updatedAt: now };
}

export async function logImageUpload(db: SupabaseClient, actor: AdminActor, details: unknown) {
  await audit(db, actor, "image_uploaded", details);
}
