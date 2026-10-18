CREATE TABLE `miniapp_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`session_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`credential_hash` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `miniapp_devices_token_idx` ON `miniapp_devices` (`token_hash`);--> statement-breakpoint
CREATE INDEX `miniapp_devices_owner_idx` ON `miniapp_devices` (`owner_id`);--> statement-breakpoint
CREATE TABLE `miniapp_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`device_id` text NOT NULL,
	`request_id` text NOT NULL,
	`kind` text NOT NULL,
	`fingerprint` text NOT NULL,
	`status` text NOT NULL,
	`process_id` text NOT NULL,
	`conversation_id` text,
	`result` text,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `miniapp_operations_request_idx` ON `miniapp_operations` (`owner_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `miniapp_operations_status_idx` ON `miniapp_operations` (`status`);--> statement-breakpoint
ALTER TABLE `conversations` ADD `retrieval_scope` text;