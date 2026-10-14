ALTER TABLE `docx_agent_runs` ADD `format` text DEFAULT 'docx' NOT NULL;--> statement-breakpoint
ALTER TABLE `docx_agent_runs` ADD `version` integer DEFAULT 0 NOT NULL;