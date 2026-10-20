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

## Windows NSIS 生产资源链接

第二轮 Windows runner 已完成 afterPack，随后 builder `26.15.3` 的 7za 在压缩 NSIS 输入树时，对 `resources/server/node_modules/.pnpm/*/node_modules/*` 的大量依赖链接报 `Access is denied` 并 exit 1，见 `github-windows-package-failed.log`。现有 afterPack 的 `cp(..., { verbatimSymlinks: true })` 保留链接，与旧注释“解引用”不符。Node 的 `internal/fs/cp/cp` 中 `onLink` 在此模式直接 `readlink` 后 `symlink`，不会把 Windows junction 的绝对目标改成安装目录，也不会保留原 junction 类型。原 runner 日志没有包含具体 readlink 目标，不能据此断言每个失败链接的实际目标。

修复避免依赖复制时猜测 Windows 链接类型：仅 `deploy-server.mjs` 的生产部署加 `--node-linker hoisted`，保留根安装为 isolated、lockfile 与供应链策略。pnpm 在部署阶段按依赖图生成有限的物理目录及必要版本嵌套；不采用复制时全量 dereference。afterPack 保留点目录复制，然后调用 `resource-tree.mjs` 递归检查整个 `resources/server`，包括 `dist` 内嵌依赖：只物化内部相对文件别名；目录链接、绝对/越界链接、坏链接和特殊文件使打包失败，错误包括路径。成功返回即保证宿主树没有目录或文件符号链接，不携带指向 runner 的 reparse 链接。

验证：

- pnpm `12.4.2` 独立 hoisted probe 成功；正式脚本重复生产部署 exit 0，`server-deploy/node_modules/.modules.yaml` 为 hoisted，仓库根仍为 isolated。日志 `hoisted-deploy-probe.log`、`hoisted-deploy-final.log`。
- fixture 实际复制、物化文件别名、删除源目录、迁移目录后，用 Node require 读取两份冲突依赖版本及 `dist/node_modules/.pnpm` 隐藏内容；全树无链接。绝对链接、越界链接、目录循环和坏链接均拒绝且不假报成功。新增测试纳入根 test 入口。
- 资源与发布测试合计 17/17 通过，日志 `resource-tree-release-tests.log`；受影响脚本的 lint/format 与 `git diff --check` 通过。
- 本机真实部署资源通过 afterPack 文件复制，43551 文件、零链接；迁移后 SQLite/vec、Jieba/dict、Canvas 均从迁移后的宿主目录独立加载成功（exit 0），见 `portable-host-final.log`。这只验证跨目录资源可移植性，不代表本机执行 Windows NSIS。

最终 Windows 门仍为 GitHub runner 原生 NSIS 压缩、真实安装及安装路径内 smoke；没有把 macOS 的物理目录验证当成 Windows 安装通过。第一次本机迁移验证因 `/var` 与真实 `/private/var` 的检查路径未归一化误报，原日志保留 `portable-host-path-check-failed.log`；验证脚本随后对临时根 realpath 归一化，产品路径逻辑未因该验证脚本问题调整。

## Windows ASAR 校验路径假阴性

tag run `39380282464` 的 Windows job `118487798251` 已完成 NSIS 压缩、EXE 与 blockmap，随后 `verify-package.mjs:37` 抛出 updater 缺失。日志 `github-v010-windows-failed.log` 显示外层 package.json 的版本及 updater 声明校验已通过。

锁定 `@electron/asar 3.4.1` 的具体实现：`lib/asar.js:251–252` 的 `listPackage` 调用 `Filesystem.listFiles`；`lib/filesystem.js:155–168` 在第 162 行使用宿主 `path.join(basePath, childPath)`，从 `/` 起步构造展示路径。Windows 因而返回反斜杠分隔路径，原来的 `endsWith('/electron-updater/package.json')` 即使文件存在也无法匹配。`lib/asar.js:254–260` 的 `extractFile` 则直接查找并读取 archive entry；但 `lib/filesystem.js:58–60` 的目录遍历直接 split(path.sep)，`getNode` 不会先 normalize。Windows 的 dirname 会保留输入斜杠，所以固定 archive 路径也必须先按宿主 normalize，不能只删除列表检查。

修复删除展示列表的后缀推断，`verify-package-contents.mjs` 直接读取根 `node_modules/electron-updater/package.json`，验证真实模块 name/version 为 electron-updater/6.8.9，规范化 main 中的两种分隔符并验证其仍在包目录内、入口字节实际存在且非空。所有读取（包括既有 dist/main、preload、renderer 检查）经 `extractArchiveFile` 统一转为原生分隔符后交给 ASAR。仅外层依赖声明、其他包内嵌 updater、错误版本或入口缺失均不能通过；未改客户端依赖或 builder 打包策略。

真实 ASAR fixture 回归 6/6 通过，覆盖两种输入分隔符的真实字节读取、标准及反斜杠 main、根依赖缺失、错误版本、入口缺失、两种分隔符的越界入口；已追加根 test 并保留 manual-update-smoke 等既有条目。日志 `asar-package-contents-tests.log`。本机既有真实 mac ARM64 app.asar 通过完整 `verify-package.mjs mac-arm64 0.1.0`（含 native 资源校验），见 `asar-package-local-verification.log`；受影响文件 lint/format 与 diff check 通过。

此处已确认的是原检查跨平台逻辑必然产生假阴性；Windows archive 未在失败 run 上传，不能仅凭日志推断其中代码完整。下一次 Windows runner 必须通过新的直接字节检查及真实客户端 smoke，才能确认实际产品依赖无遗漏。原 v0.1.0 tag 不移动，后续由主会话决定新版本。
