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

// 이전 공식본과 비교해 실제로 바뀐(또는 새로 생긴) 메뉴만 골라낸다
function changedRecipes(previous: RecipeContent, next: RecipeContent) {
  const before = new Map(previous.recipes.map((recipe) => [recipe.id, JSON.stringify(recipe)]));
  return next.recipes.filter((recipe) => before.get(recipe.id) !== JSON.stringify(recipe));
}

export async function publishDraft(
  db: SupabaseClient,
  actor: AdminActor,
  expectedRevision: number,
  changeReason: string,
  effectiveAt: string,
  notifyStaff = true,
) {
  const workspace = await ensureWorkspace(db);
  if (workspace.draft_revision !== expectedRevision) return { conflict: true as const };

  const previous = parseRecipeContent(workspace.published_json);
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

  // 직원 확인이 필요한 변경이면, 바뀐 메뉴마다 알림을 남긴다 (직원이 "확인했어요"를 누르는 단위)
  const changed = notifyStaff ? changedRecipes(previous, cascaded.content) : [];
  if (changed.length) {
    const { error: noticeError } = await db.from("recipe_change_notices").insert(
      changed.map((recipe) => ({
        version: nextVersion,
        recipe_id: recipe.id,
        recipe_name: recipe.name,
        change_reason: changeReason.trim(),
        published_by: actor.email,
        created_at: now,
      })),
    );
    // 게시는 이미 끝났으므로 알림 실패로 게시를 되돌리지 않는다. 기록만 남긴다.
    if (noticeError) console.error("[publish] 바뀐 레시피 알림을 남기지 못했습니다:", noticeError.message);
  }

  await audit(db, actor, "published", { version: nextVersion, changeReason, effectiveAt, impactedRecipeIds: cascaded.impactedRecipeIds, notified: changed.map((recipe) => recipe.id) });
  return { version: nextVersion, revision: expectedRevision + 1, publishedAt: now, content: cascaded.content, notified: changed.length };
}

// ---- 바뀐 레시피 알림 · 읽음 확인 ------------------------------------------------

export type ChangeNotice = {
  id: number;
  version: number;
  recipe_id: string;
  recipe_name: string;
  change_reason: string;
  published_by: string;
  created_at: string;
};

type NoticeWithAcks = ChangeNotice & { recipe_acks: { user_id: string; acked_at: string }[] };

async function readNotices(db: SupabaseClient, limit = 60): Promise<NoticeWithAcks[]> {
  const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 60).toISOString();
  const { data, error } = await db
    .from("recipe_change_notices")
    .select("id, version, recipe_id, recipe_name, change_reason, published_by, created_at, recipe_acks(user_id, acked_at)")
    .gt("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`바뀐 레시피 목록을 읽지 못했습니다: ${error.message}`);
  return (data ?? []) as NoticeWithAcks[];
}

// 직원용: 내가 확인했는지 표시해서 준다
export async function listMyChangeNotices(db: SupabaseClient, userId: string) {
  const notices = await readNotices(db);
  const items = notices.map(({ recipe_acks, ...notice }) => ({
    ...notice,
    acked: recipe_acks.some((ack) => ack.user_id === userId),
  }));
  return { notices: items, pending: items.filter((item) => !item.acked).length };
}

export async function ackChangeNotice(db: SupabaseClient, userId: string, noticeId: number) {
  const { error } = await db
    .from("recipe_acks")
    .upsert({ notice_id: noticeId, user_id: userId }, { onConflict: "notice_id,user_id", ignoreDuplicates: true });
  if (error) throw new Error(`확인을 저장하지 못했습니다: ${error.message}`);
}

// 사장용: 알림마다 누가 확인했고 누가 안 봤는지
export async function readChangeStatus(db: SupabaseClient) {
  const [notices, staffResult] = await Promise.all([
    readNotices(db, 100),
    db.from("profiles").select("id, login_id, display_name, role, active").order("created_at", { ascending: true }),
  ]);
  if (staffResult.error) throw new Error(`직원 목록을 읽지 못했습니다: ${staffResult.error.message}`);
  const staff = staffResult.data ?? [];
  const activeStaff = staff.filter((person) => person.active);
  return {
    staff,
    notices: notices.map(({ recipe_acks, ...notice }) => {
      const ackedIds = new Set(recipe_acks.map((ack) => ack.user_id));
      return {
        ...notice,
        acked: activeStaff.filter((person) => ackedIds.has(person.id)).map((person) => ({ id: person.id, name: person.display_name || person.login_id, at: recipe_acks.find((ack) => ack.user_id === person.id)?.acked_at ?? "" })),
        pending: activeStaff.filter((person) => !ackedIds.has(person.id)).map((person) => ({ id: person.id, name: person.display_name || person.login_id })),
      };
    }),
  };
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
