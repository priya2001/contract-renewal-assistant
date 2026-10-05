CREATE TABLE `history` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`version_id` text NOT NULL,
	`item_id` text,
	`action` text NOT NULL,
	`created_at` text NOT NULL,
	`before` text,
	`after` text
);
--> statement-breakpoint
CREATE INDEX `idx_history_owner_created` ON `history` (`owner`,`created_at`);--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`version_id` text NOT NULL,
	`data` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_items_version` ON `items` (`version_id`);--> statement-breakpoint
CREATE TABLE `versions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`number` integer NOT NULL,
	`title` text NOT NULL,
	`created_at` text NOT NULL,
	`mode` text NOT NULL,
	`contract_name` text NOT NULL,
	`policy_name` text,
	`sections` text NOT NULL,
	`warnings` text NOT NULL,
	`contract_key` text,
	`policy_key` text
);
--> statement-breakpoint
CREATE INDEX `idx_versions_owner` ON `versions` (`owner`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`owner` text PRIMARY KEY NOT NULL,
	`current_id` text,
	`revision` integer DEFAULT 0 NOT NULL
);
