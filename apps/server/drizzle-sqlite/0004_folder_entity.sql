-- 目录成为实体（D-068）。与 PG 侧同一条：建表 + 从 documents.folder 回填祖先。
-- created_at 不带 SQL 默认值：与其它表一致，由应用侧 $defaultFn 提供。
CREATE TABLE `folders` (
	`path` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
WITH RECURSIVE split(path, rest) AS (
	SELECT '', folder || '/' FROM documents WHERE folder IS NOT NULL AND folder <> ''
	UNION ALL
	SELECT path || CASE WHEN path = '' THEN '' ELSE '/' END || substr(rest, 1, instr(rest, '/') - 1),
		substr(rest, instr(rest, '/') + 1)
	FROM split
	WHERE rest <> ''
)
INSERT OR IGNORE INTO `folders` (`path`) SELECT DISTINCT path FROM split WHERE path <> '';
