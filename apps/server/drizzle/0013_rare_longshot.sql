ALTER TABLE "docx_agent_runs" ADD COLUMN "format" text DEFAULT 'docx' NOT NULL;--> statement-breakpoint
ALTER TABLE "docx_agent_runs" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;