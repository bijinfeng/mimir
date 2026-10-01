ALTER TABLE "folders" ADD COLUMN "code" text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "folders" SET "code" = upper(substr(md5("path" || random()::text), 1, 6)) WHERE "code" = '';
