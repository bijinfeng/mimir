CREATE TABLE "miniapp_devices" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"session_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"credential_hash" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "miniapp_operations" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"device_id" text NOT NULL,
	"request_id" text NOT NULL,
	"kind" text NOT NULL,
	"fingerprint" text NOT NULL,
	"status" text NOT NULL,
	"process_id" text NOT NULL,
	"conversation_id" text,
	"result" jsonb,
	"error" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "retrieval_scope" jsonb;--> statement-breakpoint
ALTER TABLE "miniapp_devices" ADD CONSTRAINT "miniapp_devices_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "miniapp_devices" ADD CONSTRAINT "miniapp_devices_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "miniapp_operations" ADD CONSTRAINT "miniapp_operations_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "miniapp_devices_token_idx" ON "miniapp_devices" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "miniapp_devices_owner_idx" ON "miniapp_devices" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "miniapp_operations_request_idx" ON "miniapp_operations" USING btree ("owner_id","request_id");--> statement-breakpoint
CREATE INDEX "miniapp_operations_status_idx" ON "miniapp_operations" USING btree ("status");