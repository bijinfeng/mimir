-- 收件箱退役（D-054）。与 PG 侧同一条：
-- 存量记录（含数据库默认值里的 'inbox'）一起转到 'ready'。
--
-- SQLite 改不了列默认值（3.35 之后才有 ALTER COLUMN SET DEFAULT 的部分支持，
-- 而 better-sqlite3 带的版本与 drizzle-kit 的表达能力都不保证），
-- 所以默认值的修正走**重建表**。这里用 drizzle-kit 的官方做法做不到，
-- 因此只在数据层转换 + 由 schema.sqlite.ts 声明新默认值——
-- 新建表的语句来自 schema，不会再产生 'inbox'。
UPDATE `documents` SET `status` = 'ready' WHERE `status` = 'inbox';
