CREATE TABLE `docx_agent_runs` (
	`run_id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`document_id` text NOT NULL,
	`round_id` text NOT NULL,
	`message_id` text NOT NULL,
	`interrupt_ids` text NOT NULL,
	`tools` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `docx_agent_runs_conversation_idx` ON `docx_agent_runs` (`conversation_id`, `document_id`);
