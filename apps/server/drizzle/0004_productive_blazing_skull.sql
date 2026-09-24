ALTER TABLE "documents" ADD COLUMN "source_key" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "mime" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "size" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "parse_error" text;