CREATE TABLE "attachment_garbage" (
	"object_key" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachment_leases" (
	"attachment_id" text NOT NULL,
	"lease_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "attachment_leases_attachment_id_lease_id_pk" PRIMARY KEY("attachment_id","lease_id")
);
--> statement-breakpoint
CREATE TABLE "conversation_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"operation_id" text NOT NULL,
	"name" text NOT NULL,
	"mime" text NOT NULL,
	"kind" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"object_key" text NOT NULL,
	"extracted_text" text,
	"status" text NOT NULL,
	"error" text,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"bound_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "message_attachments" (
	"message_id" text NOT NULL,
	"attachment_id" text NOT NULL,
	CONSTRAINT "message_attachments_message_id_attachment_id_pk" PRIMARY KEY("message_id","attachment_id")
);
--> statement-breakpoint
ALTER TABLE "attachment_leases" ADD CONSTRAINT "attachment_leases_attachment_id_conversation_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."conversation_attachments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_attachments" ADD CONSTRAINT "conversation_attachments_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_attachment_id_conversation_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."conversation_attachments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_attachments_conversation_idx" ON "conversation_attachments" USING btree ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_attachments_operation_idx" ON "conversation_attachments" USING btree ("conversation_id","operation_id");