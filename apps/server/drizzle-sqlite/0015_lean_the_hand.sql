ALTER TABLE `conversation_attachments` ADD `parser_version` text DEFAULT 'mimir-attachment-preparation-v1' NOT NULL;--> statement-breakpoint
ALTER TABLE `messages` ADD `model_selection` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `retrieval_scope` text;