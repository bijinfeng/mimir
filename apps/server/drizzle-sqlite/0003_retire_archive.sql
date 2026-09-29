-- 归档交互退役（D-065）。与 PG 侧同一条：
-- 存量行转到 'ready'，默认值不变（仍是 'ready'，无需动表结构）。
UPDATE `documents` SET `status` = 'ready' WHERE `status` = 'archived';
