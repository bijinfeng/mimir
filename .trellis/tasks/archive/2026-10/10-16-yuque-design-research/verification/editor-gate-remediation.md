# 编辑器质量门定向复验与同步修复

日期：2026-10-17；基线 HEAD `3fc7e2d`。用户已授权处理检查工程问题。仅定向运行，没有重跑全仓或 Office 全套，完整门由后续 checker 统一执行。

## 当前复现

此前 Office 全套跨并行源码变化，三项失败不能直接当作最新源码的产品缺陷。先在当前源码分别运行原失败用例：

| 原失败用例 | 当前结果 | 日志 |
| --- | --- | --- |
| PDF真实宿主替换原文字、保存重开 | 1通过、14未选中 | `/tmp/mimir-yuque-editor-gate-pdf-before.log` |
| PPTX本地GIF插入画布、原生媒体、保存重开 | 1通过、84未选中 | `/tmp/mimir-yuque-editor-gate-pptx-before.log` |
| DOCX来源A→B→A不能复活旧对比结果/拆分 | 1通过、9未选中 | `/tmp/mimir-yuque-editor-gate-docx-before.log` |

PDF与DOCX当前通过，未查明生产缺陷，不做推测性修改，保留其全部原断言。

## 唯一修改

`packages/office/src/editors/PptxEditor.test.tsx` 的通用 `settle` 原先最多60次×2ms后静默返回；其返回不能证明图片真实发布，GIF原生宿主/解析较慢时会在画布尚无picture节点时继续断言。

改为 `vi.waitFor` 在3000ms截止内检查真实完成条件，每轮由 React act 推进宏任务；超时必须断言失败，不再静默返回。所有原picture节点、原生媒体字节、ZIP XML、保存重开断言保持。没有修改产品实现、检查配置或其他测试。

写入前核查SHA256：

- PDF：`cb645a68661579400495b6101f2b07342e6d2fbf8cf7a7f8d1a3343b917254e3`，结束时相同。
- PPTX：`dc2fc74104407488ef7863d66ea18161bf8ebe286e5a8c6070561deda636dde3`，修改后 `8e831bbd625524defda83b4c45e2ba34eb94ed85ca45f6e89d5670240e78f59d`。
- DOCX：`2fd20595404ba9bc5707d8fa484fdd641c30230fe641e3a42ff679db363010cf`，结束时相同。

## 最终验证

- 三文件完整定向运行：3文件110项全部通过，21.73秒。日志 `/tmp/mimir-yuque-editor-gate-targeted.log`。
- `pnpm exec oxfmt --check packages/office/src/editors/PptxEditor.test.tsx`：退出0。
- `pnpm exec oxlint packages/office/src/editors/PptxEditor.test.tsx`：退出0。日志 `/tmp/mimir-yuque-editor-gate-lint.log`。
- 限定 `git diff --check`：退出0。

这证明当前三个文件的定向验证通过，不代替完整 `pnpm check`，也不声称其他并行 Office 修改已经验收。未提交，未覆盖他人工作。
