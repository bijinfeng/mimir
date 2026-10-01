CREATE TABLE "usage_log" (
	"id" text PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"role" text NOT NULL,
	"source" text NOT NULL,
	"model" text NOT NULL,
	"provider_id" text DEFAULT '' NOT NULL,
	"base_url_host" text DEFAULT '' NOT NULL,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"total_tokens" integer,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"ok" boolean DEFAULT true NOT NULL,
	"failure_kind" text,
	"ref_id" text
);
--> statement-breakpoint
CREATE INDEX "usage_log_at_idx" ON "usage_log" USING btree ("at" DESC NULLS LAST);