ALTER TABLE "conversation_attachments" ADD COLUMN "parser_version" text DEFAULT 'mimir-attachment-preparation-v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "model_selection" jsonb;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "retrieval_scope" jsonb;