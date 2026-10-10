# 执行计划

1. 将改动后的产品契约先写入 `.trellis/spec/project/product.md` 与 `design.md`，保留既有两栏工作区和编辑页三区域。
2. 修复 F1 自动保存/离开守卫并用延迟和失败测试验证。并行处理 F2、F13 的编辑入口与提示。
3. 修复 F3、F7–F9 的浮层、窄屏侧栏和卡片操作；验证焦点与背景不可操作。
4. 修复 F4–F6、F10、F12、F19 的设置和文案问题；确保草稿不进入浏览器持久存储。
5. 修复 F11 统计，覆盖 SQLite/Postgres 和软删除前后。
6. 建立 MRU 与全局命令，完成 F14–F16；保留未保存导航守卫，验证键盘选择。
7. 完成 F17 内链建议、插入、保存、跳转和反链；完成 F18 目录位置与移动撤销。
8. 对全部 F1–F19 复走报告路径，跑 `pnpm check`、`git diff --check`，检查浅深主题与 600px；按 PRD 逐项记录已验证证据。

## 分工边界

- 编辑器/守卫：`packages/office/src/editors`、`packages/renderer/src/components/NoteEditor.tsx`、`lib/unsaved.tsx`。
- 导航/知识库/搜索：`NavSidebar`、`LibraryView`、`CommandPalette`、路由与文档子组件。
- 设置与服务端计数：`settings/*`、`apps/server/src/services/chunks.ts` 及相关测试。
- 共享组件和跨模块行为改动由主会话协调，避免两个实现者同时改同一文件。

## 风险

- F1 的迟到保存可能跨越“丢弃”点击；必须通过请求延迟测试而不是仅检查弹窗文案。
- F17 必须贯通 Markdown 序列化、服务端链接抽取和应用导航，纯视觉补全不算完成。
- F14–F16 的最近记录和命令会跨路由，不能只加静态菜单项。
- 文件列表查询递归，F18 路径必须在上级与子目录都可正确相对显示。
