# GitHub real-update harness independent review

2026-10-20；范围：`.github/workflows/desktop-update-verify.yml`、`apps/desktop/scripts/update-smoke{,-lib,.test}.mjs`、`update-smoke-native.ps1`、根 test 入口，以及 fresh-checkout Office CSS 生成修复。此记录是源代码审查和定向门，不是远端升级通过证明。

## 已修复

- 根 `package.json` 的 test 命令加入 `update-smoke.test.mjs`，让辅助协议回归持续进入质量门。
- 真实按钮操作改为可见、启用且中心点 hit-test 通过后由 CDP 发送鼠标事件；不使用 `button.click()` 绕过遮挡或隐藏状态。测试主动切换窗口只属于外部驱动操作，不证明通知焦点行为。
- 原脚本取消一次真实保存后，等待自动保存完成，再从干净编辑器重试；无法覆盖“保存并重启”。补充第二次真实输入并再次暂停真实 PATCH：实际点击更新重试和“保存并重启”，等待保存中，确认安装文件仍未更换，再放行真实 HTTP。升级后必须逐字匹配该 PATCH 正文、标题、标签、目录及 local 模式。
- Windows 除验证首版安装包匿名下载 SHA-256 外，还读取生产 `app-update.yml` 指定的 updater cache 与 `update-info.json`，校验真实 updater 下载缓存安装包的字节数和官方 target SHA-256；Linux 升级后 AppImage 校验 target SHA-256。
- 自动重启验证必须观察所有旧 Mimir PID 消失及全新 PID 出现；仅观察任意 Mimir 进程仍存活可能把旧进程退出阶段误算成自动重启。后续仍须重新启动已安装程序，验证 currentVersion 恰为 target 和保留文档可见。

## 产品问题（代码已修复，原生验收待执行）

`electron-builder.yml` 原配置 `oneClick:false/runAfterFinish:false` 与 `quitAndInstall(false,true)` 不能保证 Windows 完成更新后启动。锁定的 electron-builder 26.15.3 `NsisTarget.configureDefines` 对 assisted + false 定义 `HIDE_RUN_AFTER_FINISH`；`templates/nsis/assistedInstaller.nsh` 因而移除 StartApp/Run 完成页选项。`installSection.nsh` 对 assisted 安装仅在 silent 时执行 force-run；当前更新不是 silent。

实现代理已将 `runAfterFinish:true` 落地，保留 `oneClick:false` 和运行时 `quitAndInstall(false,true)`。审查者独立核对最终 diff 和锁定 builder 26.15.3 源码：assisted 分支不再定义 `HIDE_RUN_AFTER_FINISH`，完成页保留默认 Run 选项并通过 `StartApp` 启动；首次 `/S` 因无 `--force-run` 不会走 `installSection.nsh` 的 silent 启动分支。现有保存准备、真实窗口关闭、宿主关闭后安装顺序均未修改，`autoInstallOnAppQuit=false` 继续存在。

新增 native-updater 回归直接断言 `autoInstallOnAppQuit=false`，dispose 不触发安装；实现代理报告相关回归 36/36 通过，本次补审未重复重型测试。代码问题已修复；新的配置仍需远端实际向导验收，不能将旧配置构建视作修复后的证据。

## 独立通过的定向门

- `pnpm --filter @mimir/renderer exec vitest run vite-preset.test.ts`：3/3，实际 CSS 生成/可用样式与生成失败导致构建失败。
- `pnpm --filter @mimir/renderer typecheck`：exit 0。
- renderer 两文件 oxlint 与 oxfmt check：exit 0。
- E2E 三个 mjs 的 oxlint、四个源码/根 package/workflow 的 oxfmt check：exit 0。
- `node --check apps/desktop/scripts/update-smoke.mjs`：exit 0。
- `node --test apps/desktop/scripts/update-smoke.test.mjs`：6/6，稳定版本/官方资产限制、实际字节哈希、bounded polling、CDP 乱序/关闭/异常失败。
- `/tmp/mimir-actionlint/actionlint .github/workflows/desktop-update-verify.yml`（v1.7.12）：exit 0。
- `git diff --check`：exit 0。

CSS 修复使用既有生成器，在共享 Vite preset 的 buildStart 阶段、导入解析前执行；绝对脚本路径 + `process.execPath` 支持原生平台，无 shell 插值，失败立即终止构建。原作者已另外记录删除 ignored editor.css 后实际桌面构建成功；本审查独立跑上述三项定向门，未重复重型打包。

## 尚未验证 / 不能声称

- Windows/Linux workflow 真实官方双版本升级、Windows PowerShell/UIAutomation 实际交互以及 NSIS 新配置原生向导仍须远端执行；本机未模拟为成功。
- CDP 可证明文件页面与生产按钮/状态，不证明原生通知投递或系统焦点；脚本结果明确保留该限制。
- macOS ad-hoc 包仍为手动更新，不在自动安装 matrix 中。
- 本子代理依主会话要求未另跑全仓 pnpm check；远端 CI 和主会话负责最终完整门。
- 未提交、推送、创建 tag 或发布 Release；交主会话集成。

## AppImage 文件名补审（代码已修复，原生重跑待执行）

第二轮真实 Linux 日志 `github-linux-smoke-failed.log` 同时包含 builder 输出 `release/mimir-0.1.0-linux-x86_64.AppImage`、包内容校验通过和 smoke 试图启动 `linux-x64.AppImage` 的 ENOENT，根因是 builder 对 AppImage `${arch}` 的扩展名专属转换。

独立检查 `package.mjs`：在现有原生平台/架构断言之后，以 `nativeArtifactName(process.arch)` 将唯一文件名中的架构固定为 Node 的 x64/arm64；继续由 builder 解析 version/os/ext 宏，没有改二进制目标架构，也未放松 publish 前的四目标文件/哈希检查。实际 build 入口使用该 config override，修复覆盖了 smoke、stage 和公开 Release 的统一文件名契约。

独立运行 `node --test apps/desktop/scripts/release-artifacts.test.mjs` 12/12 通过；新增回归调用锁定 builder 的真实 `computeArtifactName`，复现旧 AppImage x86_64 映射，并验证修复后 mac 双架构 DMG/ZIP、Windows EXE、Linux AppImage 的实际宏展开。两个文件 oxlint/oxfmt check 和 git diff check 均通过。仅文档补审，无其他源码修改。真实 Linux AppImage 启动/升级仍需新构建远端验收。
