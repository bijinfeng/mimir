CREATE TABLE "feeds" (
	"url" text PRIMARY KEY NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"folder" text,
	"last_fetched_at" timestamp with time zone,
	"last_error" text,
	"item_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "feeds_folder_idx" ON "feeds" USING btree ("folder");