-- 目录成为实体（D-068）：侧边栏要直接增删改移目录，而空目录没有文档，
-- 在「纯派生」模型里无处存在。folders 表从此是树结构的唯一真相。
CREATE TABLE "folders" (
	"path" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- 存量回填：从 documents.folder 生成全部祖先路径（mkdir -p 语义）。
-- CTE 逐段切分 `技术/前端/React` → `技术`、`技术/前端`、`技术/前端/React`。
WITH RECURSIVE split(path, rest) AS (
	SELECT ''::text, d.folder || '/' FROM documents d
	WHERE d.folder IS NOT NULL AND d.folder <> ''
	UNION ALL
	SELECT path || CASE WHEN path = '' THEN '' ELSE '/' END || substr(rest, 1, position('/' in rest) - 1),
		substr(rest, position('/' in rest) + 1)
	FROM split
	WHERE rest <> ''
)
INSERT INTO "folders" ("path")
SELECT DISTINCT path FROM split WHERE path <> ''
ON CONFLICT ("path") DO NOTHING;
