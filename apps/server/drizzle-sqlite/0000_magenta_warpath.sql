CREATE TABLE `conversation_refs` (
	`conversation_id` text NOT NULL,
	`document_id` text NOT NULL,
	PRIMARY KEY(`conversation_id`, `document_id`),
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `conversations_updated_at_idx` ON `conversations` (`updated_at`);--> statement-breakpoint
CREATE TABLE `document_links` (
	`from_id` text NOT NULL,
	`to_id` text NOT NULL,
	PRIMARY KEY(`from_id`, `to_id`),
	FOREIGN KEY (`from_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `document_links_to_idx` ON `document_links` (`to_id`);--> statement-breakpoint
CREATE TABLE `document_tags` (
	`document_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`document_id`, `tag_id`),
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `document_tags_tag_idx` ON `document_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'inbox' NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`excerpt` text DEFAULT '' NOT NULL,
	`search_text` text DEFAULT '' NOT NULL,
	`path` text,
	`folder` text,
	`url` text,
	`canonical_url` text,
	`content_hash` text,
	`author` text,
	`published_at` integer,
	`captured_at` integer,
	`source_key` text,
	`mime` text,
	`size` integer,
	`parse_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `documents_kind_status_idx` ON `documents` (`kind`,`status`);--> statement-breakpoint
CREATE INDEX `documents_updated_at_idx` ON `documents` (`updated_at`);--> statement-breakpoint
CREATE INDEX `documents_folder_idx` ON `documents` (`folder`);--> statement-breakpoint
CREATE UNIQUE INDEX `documents_canonical_url_idx` ON `documents` (`canonical_url`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`trace` text,
	`citations` text DEFAULT '[]' NOT NULL,
	`failure` text,
	`saved_note_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `messages_conversation_idx` ON `messages` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `settings_updated_at_idx` ON `settings` (`updated_at`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_idx` ON `tags` (`name`);--> statement-breakpoint
CREATE TABLE `usage_log` (
	`id` text PRIMARY KEY NOT NULL,
	`at` integer NOT NULL,
	`role` text NOT NULL,
	`source` text NOT NULL,
	`model` text NOT NULL,
	`provider_id` text DEFAULT '' NOT NULL,
	`base_url_host` text DEFAULT '' NOT NULL,
	`prompt_tokens` integer,
	`completion_tokens` integer,
	`total_tokens` integer,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`ok` integer DEFAULT true NOT NULL,
	`failure_kind` text,
	`ref_id` text
);
--> statement-breakpoint
CREATE INDEX `usage_log_at_idx` ON `usage_log` (`at`);--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `account_provider_account_idx` ON `account` (`provider_id`,`account_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_idx` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_idx` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);