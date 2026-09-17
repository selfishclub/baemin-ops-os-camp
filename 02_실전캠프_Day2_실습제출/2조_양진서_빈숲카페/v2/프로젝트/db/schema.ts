import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const recipeWorkspaces = sqliteTable("recipe_workspaces", {
  id: text("id").primaryKey(),
  draftJson: text("draft_json").notNull(),
  draftRevision: integer("draft_revision").notNull().default(1),
  draftUpdatedBy: text("draft_updated_by").notNull(),
  draftUpdatedAt: text("draft_updated_at").notNull(),
  publishedVersion: integer("published_version").notNull().default(1),
  publishedJson: text("published_json").notNull(),
  publishedAt: text("published_at").notNull(),
});

export const recipeVersions = sqliteTable(
  "recipe_versions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    version: integer("version").notNull(),
    contentJson: text("content_json").notNull(),
    changeReason: text("change_reason").notNull(),
    effectiveAt: text("effective_at").notNull(),
    publishedBy: text("published_by").notNull(),
    publishedAt: text("published_at").notNull(),
  },
  (table) => [uniqueIndex("recipe_versions_version_unique").on(table.version)],
);

export const recipeAdmins = sqliteTable("recipe_admins", {
  userId: text("user_id").primaryKey(),
  email: text("email").notNull(),
  role: text("role").notNull().default("owner"),
  createdAt: text("created_at").notNull(),
});

export const recipeAuditLog = sqliteTable("recipe_audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  action: text("action").notNull(),
  actorId: text("actor_id").notNull(),
  actorEmail: text("actor_email").notNull(),
  detailsJson: text("details_json").notNull(),
  createdAt: text("created_at").notNull(),
});
