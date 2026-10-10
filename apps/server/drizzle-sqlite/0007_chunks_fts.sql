-- chunks 的 FTS5 索引与触发器（M1-B）。
--
-- 与 documents_fts（0001_fts.sql）同一套做法：`unicode61` 按空白切词，
-- 而 search_text 是 jieba 预分词后的空格分隔词元，所以词元一一对应
-- （.trellis/spec/project/research.md §11.2）。
--
-- **为什么单独一个迁移文件而不是接着 0007_chunks.sql**：drizzle 的迁移
-- 按文件里的 breakpoint 标记切分，而触发器体里本身有分号——写进同一个
-- 文件会被切坏（这里连注释里都不能出现那个标记，否则注释被切出去，
-- 前半段变成「没有语句」的片段）。documents_fts 当初就是单独的迁移文件，
-- 这里沿用同一条理由。
CREATE VIRTUAL TABLE `chunks_fts` USING fts5(
  `search_text`,
  `chunk_id` UNINDEXED,
  tokenize = 'unicode61'
)--> statement-breakpoint
CREATE TRIGGER `chunks_fts_insert`
AFTER INSERT ON `chunks`
BEGIN
  INSERT INTO `chunks_fts` (`chunk_id`, `search_text`) VALUES (new.`id`, new.`search_text`);
END--> statement-breakpoint
CREATE TRIGGER `chunks_fts_update`
AFTER UPDATE OF `search_text` ON `chunks`
BEGIN
  DELETE FROM `chunks_fts` WHERE `chunk_id` = old.`id`;
  INSERT INTO `chunks_fts` (`chunk_id`, `search_text`) VALUES (new.`id`, new.`search_text`);
END--> statement-breakpoint
CREATE TRIGGER `chunks_fts_delete`
AFTER DELETE ON `chunks`
BEGIN
  DELETE FROM `chunks_fts` WHERE `chunk_id` = old.`id`;
END
