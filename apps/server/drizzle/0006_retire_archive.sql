-- 归档交互退役（D-065）：'archived' 不在状态枚举里了，存量行一起转回
-- 'ready'——留着会让界面拿到一个它不认识的状态（徽标渲染不出来、
-- 按状态筛选也筛不到）。与 0005_retire_inbox 同一条做法。
UPDATE "documents" SET "status" = 'ready' WHERE "status" = 'archived';
