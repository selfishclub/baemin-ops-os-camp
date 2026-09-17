CREATE TABLE `recipe_admins` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'owner' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recipe_audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`action` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_email` text NOT NULL,
	`details_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recipe_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`version` integer NOT NULL,
	`content_json` text NOT NULL,
	`change_reason` text NOT NULL,
	`effective_at` text NOT NULL,
	`published_by` text NOT NULL,
	`published_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipe_versions_version_unique` ON `recipe_versions` (`version`);--> statement-breakpoint
CREATE TABLE `recipe_workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`draft_json` text NOT NULL,
	`draft_revision` integer DEFAULT 1 NOT NULL,
	`draft_updated_by` text NOT NULL,
	`draft_updated_at` text NOT NULL,
	`published_version` integer DEFAULT 1 NOT NULL,
	`published_json` text NOT NULL,
	`published_at` text NOT NULL
);
