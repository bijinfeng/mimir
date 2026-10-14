# 实施计划：Markdown Agent 与手动编辑

1. [ ] 从固定上游源码建立 8 工具、15 操作和手动命令的逐项矩阵，标出 Mimir 已有命令、方言差异及媒体依赖。
2. [ ] 接入笔记活画布句柄、冻结选区与版本；实现上游块操作语义，输入全量校验，失败回传实际结果。
3. [ ] 将图片/frontmatter/长文写作接入共用服务和当前笔记保存；补齐手动入口、状态、禁用原因与撤销。
4. [ ] 验证 Agent 与手动交替编辑、表格/内链/任务列表/代码块、图片、保存重开和 vault 同步；停止与版本冲突不误写。
5. [ ] 跑 `pnpm --filter @mimir/office test`、`pnpm --filter @mimir/renderer test`、`pnpm --filter @mimir/chat test`、`pnpm check`；浏览器和桌面实际核对同一笔记。

风险：Mimir 方言与上游 Markdown 序列化不完全相同；不能通过整篇字符串替换绕过 Tiptap 结构和内链。
