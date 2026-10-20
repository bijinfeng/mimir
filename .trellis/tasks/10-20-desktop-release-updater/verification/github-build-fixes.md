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

## NSIS 正常向导完成后启动

独立检查发现 `oneClick: false` 配合 `runAfterFinish: false` 会破坏用户点击“重启并更新”之后的启动路径。按 lockfile 的 app-builder-lib `26.15.3` 与 electron-updater `6.8.9` 核对：

- `out/targets/nsis/NsisTarget.js` 的 `configureDefines`：assisted 安装器在 `runAfterFinish === false` 时设置 `HIDE_RUN_AFTER_FINISH`。
- `templates/nsis/assistedInstaller.nsh`：该 define 会移除 Finish 页的 `StartApp` 和启动选项。改为 `true` 后恢复用户完成向导时的启动选项。
- `templates/nsis/installSection.nsh`：assisted 安装器只在 `${isForceRun}` 且 `${Silent}` 时从安装 section 启动。首次 smoke 使用 `/S /D=...`，不带 `--force-run`，因此该修改不会令首次静默安装提前启动和抢占单实例。
- updater 的 `BaseUpdater.quitAndInstall(false, true)` 走正常向导；`NsisUpdater.doInstall` 仅在 `isSilent` 为真时加 `/S`。正常向导需要上述 Finish 路径，不能以 `--force-run` 代替。
- `autoInstallOnAppQuit=false` 继续阻止 BaseUpdater 注册普通退出安装动作；builder 的 Finish 选项只决定已经运行的安装器完成之后是否启动程序，不会触发安装器。

最小修复只将 `apps/desktop/electron-builder.yml` 的 `nsis.runAfterFinish` 改为 `true`，保留 assisted 及现有显式更新参数。补充 native updater 回归断言普通退出安装关闭、dispose 不调用安装器；现有保存及宿主关闭顺序回归继续确认只有明确安装才调用 `(false, true)`。

`native-updater.test.ts` 与 `updater.test.ts` 的运行结果见 `nsis-finish-updater-tests.log`。未重做完整 macOS 打包；实际 NSIS Finish/真实升级由 GitHub Windows 验收完成后再记录结果。

## AppImage 架构命名统一

第二轮 Linux runner 已成功生成 AppImage，但实际文件为 `mimir-0.1.0-linux-x86_64.AppImage`；后续 smoke 按统一契约查找 `linux-x64.AppImage`，因此 spawn ENOENT。实际构建路径与失败路径见 `github-linux-smoke-failed.log`。

锁定 app-builder-lib `26.15.3` 的 `PlatformPackager.computeArtifactName` 调用 builder-util 的 `getArtifactArchName(arch, ext)`；AppImage 的 `${arch}` 会从 Node 的 `x64` 变为 `x86_64`。这是命名宏映射，不是产物 CPU 架构错误。

`scripts/package.mjs` 现在于原生 OS/CPU 校验成功后，将 `process.arch` 固定写入唯一 `artifactName` 配置，版本、系统与扩展名仍交由 builder 展开。发布汇总、workflow 和 E2E 继续严格要求统一的 `x64`/`arm64` 命名，没有同时接受两套别名。

新增行为回归调用锁定 builder 的真实 `computeArtifactName` 和宏展开：先复现 AppImage 原模板的 `x86_64`，然后验证新模板在四目标的 DMG、ZIP、NSIS EXE、AppImage 均为发布清单要求的文件名；非法架构被拒绝。`node --test apps/desktop/scripts/release-artifacts.test.mjs` 12/12 通过，日志 `artifact-native-arch-tests.log`；受影响脚本的 oxlint、oxfmt 及 `git diff --check` 通过。本机未伪装 Linux runner 或构建 Linux 安装包。
