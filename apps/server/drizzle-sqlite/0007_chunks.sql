CREATE TABLE `chunk_embeddings` (
	`chunk_id` text NOT NULL,
	`model` text NOT NULL,
	`dimension` integer NOT NULL,
	`embedding` blob NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`chunk_id`, `model`),
	FOREIGN KEY (`chunk_id`) REFERENCES `chunks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`idx` integer NOT NULL,
	`content` text NOT NULL,
	`search_text` text DEFAULT '' NOT NULL,
	`start_at` integer NOT NULL,
	`end_at` integer NOT NULL,
	`heading` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chunks_document_idx_idx` ON `chunks` (`document_id`,`idx`);