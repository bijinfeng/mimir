-- 收件箱退役（D-054）：新内容直接落 ready，不再有「待整理」这个中间态。
-- 存量数据里 status='inbox' 的记录要一起转过来——那个值已不在枚举里，
-- 留着会让界面拿到一个它不认识的状态（徽标渲染不出来、按状态筛选也筛不到）。
UPDATE "documents" SET "status" = 'ready' WHERE "status" = 'inbox';--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "status" SET DEFAULT 'ready';
