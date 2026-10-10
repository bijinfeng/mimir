# 执行计划

1. 先更新 `.trellis/spec/project/design.md` 的 Markdown 笔记契约：保留三区域，Markdown 工具栏可独立于 Office 外观。
2. 实现笔记专属头部层级与长标题收缩，保留返回、改名、问 AI、更多的行为。
3. 实现 `EditorShell` 笔记变体：单行可滚动命令区、隐藏常显组名、固定保存动作。保持全部命令与状态 DOM 可达。
4. 增加必要的契约测试；运行 `pnpm check`、`git diff --check`。
5. 在浅深主题和 1440／1100／880／600px 下截图目视检查；用鼠标和键盘验证返回、改名、格式化、菜单、保存与问 AI。
6. 对照 PRD 验收并做全范围质量审查；总结需长期保留的规范。

## 高风险文件

- `packages/office/src/shell/EditorShell.tsx`、`shell.css`：六种编辑器共用，任何变体选择器均需限定在笔记根类。
- `packages/renderer/src/components/DocumentPanel.tsx`、`document/DocumentPanel.style.ts`：笔记与文件共用头部，不能改变文件视图。
