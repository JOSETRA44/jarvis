CREATE TABLE IF NOT EXISTS `operators` (
	`id` text PRIMARY KEY NOT NULL,
	`platform` text NOT NULL,
	`identifier` text NOT NULL,
	`display_name` text NOT NULL,
	`permissions` text DEFAULT '["ai"]' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);

CREATE TABLE IF NOT EXISTS `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`operator_id` text NOT NULL,
	`platform` text NOT NULL,
	`pid` integer,
	`cwd` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`last_activity_at` integer NOT NULL,
	FOREIGN KEY (`operator_id`) REFERENCES `operators`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE TABLE IF NOT EXISTS `commands` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`operator_id` text NOT NULL,
	`input` text NOT NULL,
	`output` text DEFAULT '' NOT NULL,
	`exit_code` integer,
	`executed_at` integer NOT NULL,
	`duration_ms` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`operator_id`) REFERENCES `operators`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE TABLE IF NOT EXISTS `config` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
