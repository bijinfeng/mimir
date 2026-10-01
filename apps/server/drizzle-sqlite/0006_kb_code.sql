ALTER TABLE `folders` ADD COLUMN `code` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `folders` SET `code` = upper(substr(hex(randomblob(4)), 1, 6)) WHERE `code` = '';
