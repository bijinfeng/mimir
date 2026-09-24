CREATE VIRTUAL TABLE `documents_fts` USING fts5(
  `search_text`,
  `doc_id` UNINDEXED,
  tokenize = 'unicode61'
)--> statement-breakpoint
CREATE TRIGGER `documents_fts_insert`
AFTER INSERT ON `documents`
BEGIN
  INSERT INTO `documents_fts` (`doc_id`, `search_text`) VALUES (new.`id`, new.`search_text`);
END--> statement-breakpoint
CREATE TRIGGER `documents_fts_update`
AFTER UPDATE OF `search_text` ON `documents`
BEGIN
  DELETE FROM `documents_fts` WHERE `doc_id` = old.`id`;
  INSERT INTO `documents_fts` (`doc_id`, `search_text`) VALUES (new.`id`, new.`search_text`);
END--> statement-breakpoint
CREATE TRIGGER `documents_fts_delete`
AFTER DELETE ON `documents`
BEGIN
  DELETE FROM `documents_fts` WHERE `doc_id` = old.`id`;
END