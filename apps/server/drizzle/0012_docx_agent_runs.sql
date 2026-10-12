CREATE TABLE "docx_agent_runs" (
	"run_id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"document_id" text NOT NULL,
	"round_id" text NOT NULL,
	"message_id" text NOT NULL,
	"interrupt_ids" jsonb NOT NULL,
	"tools" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "docx_agent_runs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX "docx_agent_runs_conversation_idx" ON "docx_agent_runs" USING btree ("conversation_id", "document_id");
