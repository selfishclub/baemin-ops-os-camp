import { env } from "cloudflare:workers";
import { defaultRecipeContent, RecipeContent } from "../app/recipes/recipe-data";
import {
  cascadeSharedStandards,
  parseRecipeContent,
  validateRecipeContent,
} from "../app/recipes/content-model";

const workspaceId = "main";

export type AdminActor = { id: string; email: string; role: string };

export function getRecipeDb(): D1Database | null {
  return env.DB ?? null;
}

export function getRecipeMediaBucket(): R2Bucket | null {
  return (env as unknown as { MEDIA?: R2Bucket }).MEDIA ?? null;
}

export async function ensureRecipeStore(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS recipe_workspaces (
      id TEXT PRIMARY KEY NOT NULL,
      draft_json TEXT NOT NULL,
      draft_revision INTEGER DEFAULT 1 NOT NULL,
      draft_updated_by TEXT NOT NULL,
      draft_updated_at TEXT NOT NULL,
      published_version INTEGER DEFAULT 1 NOT NULL,
      published_json TEXT NOT NULL,
      published_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS recipe_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      version INTEGER NOT NULL,
      content_json TEXT NOT NULL,
      change_reason TEXT NOT NULL,
      effective_at TEXT NOT NULL,
      published_by TEXT NOT NULL,
      published_at TEXT NOT NULL
    )`),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS recipe_versions_version_unique ON recipe_versions (version)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS recipe_admins (
      user_id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL,
      role TEXT DEFAULT 'owner' NOT NULL,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS recipe_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      action TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      actor_email TEXT NOT NULL,
      details_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_recipe_audit_created_at ON recipe_audit_log (created_at)"),
  ]);

  const now = new Date().toISOString();
  const seed = JSON.stringify(defaultRecipeContent);
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO recipe_workspaces
      (id, draft_json, draft_revision, draft_updated_by, draft_updated_at, published_version, published_json, published_at)
      VALUES (?, ?, 1, 'system-seed', ?, 1, ?, ?)`)
      .bind(workspaceId, seed, now, seed, now),
    db.prepare(`INSERT OR IGNORE INTO recipe_versions
      (version, content_json, change_reason, effective_at, published_by, published_at)
      VALUES (1, ?, '빈 템플릿 생성', ?, 'system-seed', ?)`)
      .bind(seed, now.slice(0, 10), now),
  ]);

  const untouched = await db.prepare(`SELECT published_version, draft_updated_by
    FROM recipe_workspaces WHERE id = ?`).bind(workspaceId)
    .first<{ published_version: number; draft_updated_by: string }>();
  if (Number(untouched?.published_version) === 1 && untouched?.draft_updated_by === "system-seed") {
    await db.batch([
      db.prepare(`UPDATE recipe_workspaces SET draft_json = ?, published_json = ?,
        draft_updated_at = ?, published_at = ? WHERE id = ?`)
        .bind(seed, seed, now, now, workspaceId),
      db.prepare(`UPDATE recipe_versions SET content_json = ?, change_reason = ?, effective_at = ?,
        published_at = ? WHERE version = 1 AND published_by = 'system-seed'`)
        .bind(seed, "빈 템플릿 생성", now.slice(0, 10), now),
    ]);
  }
}

function identityFrom(request: Request) {
  const id = request.headers.get("oai-authenticated-user-id");
  const email = request.headers.get("oai-authenticated-user-email");
  if (id && email) return { id, email };

  if (process.env.NODE_ENV !== "production") {
    const local = request.headers.get("x-beansoop-admin");
    if (local) return { id: `local:${local}`, email: local };
  }
  return null;
}

export async function requireRecipeAdmin(request: Request, db: D1Database): Promise<AdminActor | null> {
  const identity = identityFrom(request);
  if (!identity) return null;
  await ensureRecipeStore(db);

  const count = await db.prepare("SELECT COUNT(*) AS count FROM recipe_admins").first<{ count: number }>();
  if (Number(count?.count ?? 0) === 0) {
    await db.prepare("INSERT OR IGNORE INTO recipe_admins (user_id, email, role, created_at) VALUES (?, ?, 'owner', ?)")
      .bind(identity.id, identity.email, new Date().toISOString())
      .run();
  }

  const admin = await db.prepare("SELECT user_id, email, role FROM recipe_admins WHERE user_id = ?")
    .bind(identity.id)
    .first<{ user_id: string; email: string; role: string }>();
  return admin ? { id: admin.user_id, email: admin.email, role: admin.role } : null;
}

export async function readPublishedContent(db: D1Database | null): Promise<RecipeContent> {
  if (!db) return structuredClone(defaultRecipeContent);
  await ensureRecipeStore(db);
  const row = await db.prepare("SELECT published_json FROM recipe_workspaces WHERE id = ?")
    .bind(workspaceId)
    .first<{ published_json: string }>();
  return row ? parseRecipeContent(JSON.parse(row.published_json)) : structuredClone(defaultRecipeContent);
}

export async function readAdminWorkspace(db: D1Database) {
  await ensureRecipeStore(db);
  const [workspace, history] = await Promise.all([
    db.prepare(`SELECT draft_json, draft_revision, draft_updated_by, draft_updated_at,
      published_version, published_at FROM recipe_workspaces WHERE id = ?`)
      .bind(workspaceId)
      .first<{
        draft_json: string;
        draft_revision: number;
        draft_updated_by: string;
        draft_updated_at: string;
        published_version: number;
        published_at: string;
      }>(),
    db.prepare(`SELECT version, change_reason, effective_at, published_by, published_at
      FROM recipe_versions ORDER BY version DESC LIMIT 20`).all(),
  ]);
  if (!workspace) throw new Error("레시피 작업 공간을 찾을 수 없습니다.");
  return {
    content: parseRecipeContent(JSON.parse(workspace.draft_json)),
    revision: workspace.draft_revision,
    updatedBy: workspace.draft_updated_by,
    updatedAt: workspace.draft_updated_at,
    publishedVersion: workspace.published_version,
    publishedAt: workspace.published_at,
    history: history.results,
  };
}

export async function saveDraft(
  db: D1Database,
  actor: AdminActor,
  content: RecipeContent,
  expectedRevision: number,
) {
  const now = new Date().toISOString();
  const cascaded = cascadeSharedStandards(content);
  const result = await db.prepare(`UPDATE recipe_workspaces
    SET draft_json = ?, draft_revision = draft_revision + 1, draft_updated_by = ?, draft_updated_at = ?
    WHERE id = ? AND draft_revision = ?`)
    .bind(JSON.stringify(cascaded.content), actor.email, now, workspaceId, expectedRevision)
    .run();
  if (!result.meta.changes) return null;
  await db.prepare(`INSERT INTO recipe_audit_log
    (action, actor_id, actor_email, details_json, created_at) VALUES ('draft_saved', ?, ?, ?, ?)`)
    .bind(actor.id, actor.email, JSON.stringify({ impactedRecipeIds: cascaded.impactedRecipeIds }), now)
    .run();
  return { revision: expectedRevision + 1, updatedAt: now, content: cascaded.content };
}

export async function publishDraft(
  db: D1Database,
  actor: AdminActor,
  expectedRevision: number,
  changeReason: string,
  effectiveAt: string,
) {
  const workspace = await db.prepare("SELECT * FROM recipe_workspaces WHERE id = ?")
    .bind(workspaceId)
    .first<Record<string, string | number>>();
  if (!workspace || Number(workspace.draft_revision) !== expectedRevision) return { conflict: true as const };

  const cascaded = cascadeSharedStandards(parseRecipeContent(JSON.parse(String(workspace.draft_json))));
  const errors = validateRecipeContent(cascaded.content);
  if (!changeReason.trim()) errors.unshift("게시 변경 이유가 필요합니다.");
  if (!effectiveAt.trim()) errors.unshift("게시 시행일이 필요합니다.");
  if (errors.length) return { errors };

  const nextVersion = Number(workspace.published_version) + 1;
  const now = new Date().toISOString();
  const json = JSON.stringify(cascaded.content);
  const reservation = await db.prepare(`UPDATE recipe_workspaces SET draft_revision = draft_revision + 1
    WHERE id = ? AND draft_revision = ?`)
    .bind(workspaceId, expectedRevision)
    .run();
  if (!reservation.meta.changes) return { conflict: true as const };

  await db.batch([
    db.prepare(`INSERT INTO recipe_versions
      (version, content_json, change_reason, effective_at, published_by, published_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(nextVersion, json, changeReason.trim(), effectiveAt, actor.email, now),
    db.prepare(`UPDATE recipe_workspaces SET published_version = ?, published_json = ?, published_at = ?,
      draft_json = ?, draft_updated_by = ?, draft_updated_at = ? WHERE id = ?`)
      .bind(nextVersion, json, now, json, actor.email, now, workspaceId),
    db.prepare(`INSERT INTO recipe_audit_log
      (action, actor_id, actor_email, details_json, created_at) VALUES ('published', ?, ?, ?, ?)`)
      .bind(actor.id, actor.email, JSON.stringify({ version: nextVersion, changeReason, effectiveAt, impactedRecipeIds: cascaded.impactedRecipeIds }), now),
  ]);
  return { version: nextVersion, revision: expectedRevision + 1, publishedAt: now, content: cascaded.content };
}

export async function restoreVersionToDraft(
  db: D1Database,
  actor: AdminActor,
  version: number,
  expectedRevision: number,
) {
  const row = await db.prepare("SELECT content_json FROM recipe_versions WHERE version = ?")
    .bind(version)
    .first<{ content_json: string }>();
  if (!row) return { missing: true as const };
  const now = new Date().toISOString();
  const result = await db.prepare(`UPDATE recipe_workspaces SET draft_json = ?, draft_revision = draft_revision + 1,
    draft_updated_by = ?, draft_updated_at = ? WHERE id = ? AND draft_revision = ?`)
    .bind(row.content_json, actor.email, now, workspaceId, expectedRevision)
    .run();
  if (!result.meta.changes) return { conflict: true as const };
  await db.prepare(`INSERT INTO recipe_audit_log
    (action, actor_id, actor_email, details_json, created_at) VALUES ('version_restored_to_draft', ?, ?, ?, ?)`)
    .bind(actor.id, actor.email, JSON.stringify({ version }), now)
    .run();
  return { revision: expectedRevision + 1, content: parseRecipeContent(JSON.parse(row.content_json)), updatedAt: now };
}
