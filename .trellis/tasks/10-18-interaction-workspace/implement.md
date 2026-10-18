# 实施计划（待HTML认可后启用）

当前只做规划与原型。不得因本文件存在启动实现、不得执行 task.py start。用户认可本模块具体HTML版本后，才激活任务并依序执行。

## 1. 核对批准范围与工作区

读取 approval-ledger.json 的 workspace 版本/哈希/用户原话；刷新同一模块源码差异。保留既有form-controls主题token/spec改动、Office夹具和其他会话文件。实现仅renderer导航、最近数据hook与相关测试；产品spec只记录批准后的稳定合同。

## 2. 按风险依次实现

- nav/FolderSection.tsx：重命名对齐已验收共享表单语义，保留真实move/invalidations/followActivePath。已有创建、删除只回归。
- lib/recent-documents.ts、nav/RecentNotes.tsx：保留localStorage读取/账号隔离/容量；聚合成功项与可重试失败，区分403/404与暂时失败，401走原鉴权；UI提供加载/空/部分/全部失败与refetch。不得暴露失败标题。
- nav/menu-items.tsx、NavSidebar.tsx：只从已有API返回的数据保留当前旧会话，最多12；查询加载/重试/有缓存刷新失败反馈。导航继续runGuarded。
- nav/AccountRow.tsx、NavSidebar.style.ts、必要父props：session与config状态区分，独立设置保留；登出通过父guard回调或现有context整合，busy/error/retry，成功沿原API整页跳转；主题级联继续受控且先关子层。
- 长名、菜单触达、Portal边界与键盘回焦：复用现有AntD/Tooltip和角色token，不引入新组件体系。

## 3. 验证

有意义的边界测试：重命名IME/重复提交/失败保留/取消回焦/路径后缀；recent暂时失败vs403/404/401、部分成功和容量隔离；当前项在首12内外及未返回；未知config不露登出、本地无登出、session失败保留设置；登出前guard取消/保存失败不调用API、pending单发与失败可重试。

真实浏览器：测试账号admin@example.com / 12345678；展开/折叠、390px与低高度、浅深、Tab/ShiftTab、账户主题级联与行菜单逐层Escape、Drawer导航后关闭不抢焦点、guard取消保留Drawer、真实失败恢复。不得用原型通过代替产品通过。

跑相关renderer测试与包质量门；需要全仓检查时优先串行workspace，避免已知Office加密并行时序干扰。只有新变化/失败/未解决风险才扩大重复测试。按AGENTS每轮通过后只提交当前功能相关文件，不混入其他会话，不推送；记录commit和journal，实际完成后才归档。

## 当前原型校验

只做HTML自身lint、TypeScript、独立构建和一次合并的桌面/窄屏/浅深/关键操作QA，集中修复后至多一轮确认。不为规划-only改动跑全仓产品测试。
