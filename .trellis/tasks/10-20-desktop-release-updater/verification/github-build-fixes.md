# GitHub 原生构建修复

## 干净检出的 Office 样式缺失

2026-10-20，desktop release run `39377657202` 的已完成 mac-arm64、win-x64、linux-x64 构建均在 desktop renderer 构建失败：`UNRESOLVED_IMPORT ../generated/editor.css`，来源为 `packages/office/src/editors/DocxEditor.tsx`。原始日志保留为 `github-initial-*.log`。

根因：`packages/office/src/generated/editor.css` 为受 gitignore 保护的生成物，既有 `trim-editor-css.mjs` 只由 `sync-upstream.mjs` 在上游同步结束时调用。构建不需要重新同步上游，但必须从已提交的 vendor 样式生成该 CSS。本地存在旧生成物，因此上轮本机打包未暴露缺口。

修复：在桌面与 Web 共用的 `packages/renderer/vite-preset.ts` 内注册 `mimir:generate-office-editor-css`，于 `buildStart` 使用当前 Node 可执行文件和绝对脚本路径运行现有生成器。无 shell 拼接、无下载、无 vendor 改动；生成异常直接传播，避免静默使用旧样式。生成物继续不入 git。

验证：

- 删除本地 `packages/office/src/generated/editor.css` 并断言不存在后，执行 `pnpm --filter @mimir/desktop build`：exit 0，主进程、两个 preload、renderer 均成功；生成器报告 `1414 → 439` 条规则。日志 `desktop-clean-css-build.log`。
- `pnpm --filter @mimir/renderer exec vitest run vite-preset.test.ts`：3/3 通过；新回归使用真实 Vite 构建/真实生成器，确认产物保留 `.page-dark` 和 `.ProseMirror`；故障注入证明生成异常使整个 Vite 构建失败。日志 `desktop-css-plugin-tests.log`。
- `pnpm --filter @mimir/renderer typecheck`：exit 0。
- 两个受影响文件的 oxlint、oxfmt 检查及 `git diff --check`：exit 0。

未在本子任务重跑全仓检查或重复完整打包；GitHub 原生平台构建由主会话提交后重跑，不能以本机桌面三段构建替代。
