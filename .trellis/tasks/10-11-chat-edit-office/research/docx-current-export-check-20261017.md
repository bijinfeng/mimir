# DOCX 当前副本导出独立复核

2026-10-17；对应 `docx-current-export-plan-20261017.md`。本次仅复核 `DocxEditor.tsx`、`docx-output.ts` 和真实编辑器导出回归，未改 server、XLSX、vendor 或共享 UI。

## 结论及修复

- 当前正文 JSON、实时批注和脚注/尾注、附加保存参数沿同一个 `session.save` 管道生成原生副本。克隆保存参数，不调用 `io.save`、`markSaved`，不清 dirty 或修改历史。真实导出 ZIP 断言覆盖未保存文字、页眉、批注、脚注、尾注和主题字体；第二次编辑导出更新，撤销/重做仍可用。
- 生成前和生成后均检查未定 AI 草稿；草稿不推进文档版本，不能只检查版本。回归覆盖生成前拒绝及生成过程中新增草稿后拒绝，丢弃后可重试且原本干净状态恢复。
- 同 tick 重复触发由 handle ref 互斥；完成后验证当前 handle 身份与版本，切文档或继续编辑的迟到结果不下载。agent effect 清理会 dispose 旧 handle 并移除当前 ref，卸载沿同一路径拒绝迟到结果。
- **复现并修复**：`useParsed` 可缓存相同 Uint8Array 身份的 session；切到另一 documentId 后，旧 `exportSession` 仅按 session 比较会锁住新文档的导出按钮。先新增测试，真实失败为新文档导出按钮 `disabled=true`。改为 `{session, documentId}` 的每请求 job，完成时仅按自己的 job 对象身份清理；新文档可立即导出，旧完成不会清掉新请求 busy，也不会触发下载。
- 修复测试中 anchor mock 的隐式 `this:any` 和 `Object.fromEntries` 元组推断；未添加类型绕过。
- Blob helper 在 `finally` 延迟释放 URL；额外回归验证下载 click 抛错时 URL 仍在 1000ms 后恰好释放一次。

## 验证

- `pnpm --filter @mimir/office exec vitest run src/editors/DocxEditor.export.test.tsx src/editors/docx-save.test.ts`：**2 文件，29/29**（导出 7、原生保存 22）。
- `pnpm --filter @mimir/office typecheck`：exit 0。
- 三个目标 TS/TSX 文件 `oxlint`、`oxfmt --check`、`git diff --check`：通过。
- 未并发运行完整 Office suite 或 Web build；根会话负责生产构建、真实浏览器宽屏/420px交互与下载文件验收。本报告不替代这些证据。

## 边界

固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 的当前编辑状态另存语义及 WeKnora v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24` 能力诚实边界，沿本片计划的已记录证据；没有新增竞品能力判断。当前导出文件名为 `document-copy.docx`。真实模型未配置、Desktop 用户自验，均不在本次结论内；全仓 `pnpm check` 既有 bundled skill lint 阻断未宣称消失。
