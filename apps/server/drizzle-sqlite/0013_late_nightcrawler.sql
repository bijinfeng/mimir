CREATE TABLE `attachment_garbage` (
	`object_key` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `attachment_leases` (
	`attachment_id` text NOT NULL,
	`lease_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`attachment_id`, `lease_id`),
	FOREIGN KEY (`attachment_id`) REFERENCES `conversation_attachments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `conversation_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`kind` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`object_key` text NOT NULL,
	`extracted_text` text,
	`status` text NOT NULL,
	`error` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`bound_at` integer,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `conversation_attachments_conversation_idx` ON `conversation_attachments` (`conversation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_attachments_operation_idx` ON `conversation_attachments` (`conversation_id`,`operation_id`);--> statement-breakpoint
CREATE TABLE `message_attachments` (
	`message_id` text NOT NULL,
	`attachment_id` text NOT NULL,
	PRIMARY KEY(`message_id`, `attachment_id`),
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attachment_id`) REFERENCES `conversation_attachments`(`id`) ON UPDATE no action ON DELETE cascade
);
