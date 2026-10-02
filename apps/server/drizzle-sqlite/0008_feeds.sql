CREATE TABLE `feeds` (
	`url` text PRIMARY KEY NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`folder` text,
	`last_fetched_at` integer,
	`last_error` text,
	`item_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `feeds_folder_idx` ON `feeds` (`folder`);