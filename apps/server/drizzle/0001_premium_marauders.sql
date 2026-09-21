CREATE TABLE "conversation_refs" (
	"conversation_id" text NOT NULL,
	"document_id" text NOT NULL,
	CONSTRAINT "conversation_refs_conversation_id_document_id_pk" PRIMARY KEY("conversation_id","document_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_links" (
	"from_id" text NOT NULL,
	"to_id" text NOT NULL,
	CONSTRAINT "document_links_from_id_to_id_pk" PRIMARY KEY("from_id","to_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"role" text NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"trace" jsonb,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"failure" text,
	"saved_note_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "folder" text;--> statement-breakpoint
ALTER TABLE "conversation_refs" ADD CONSTRAINT "conversation_refs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_refs" ADD CONSTRAINT "conversation_refs_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_from_id_documents_id_fk" FOREIGN KEY ("from_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_to_id_documents_id_fk" FOREIGN KEY ("to_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_updated_at_idx" ON "conversations" USING btree ("updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "document_links_to_idx" ON "document_links" USING btree ("to_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "documents_folder_idx" ON "documents" USING btree ("folder");