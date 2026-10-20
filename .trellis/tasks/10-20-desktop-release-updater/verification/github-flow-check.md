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

## Windows 资源与干净 CI 修复补审

本轮生产源码范围：`deploy-server.mjs`、`after-pack.mjs`、`resource-tree.mjs`；测试/宿主准备：新资源测试、根 test 入口、Office Vitest config、CI 中文系统字体安装。独立审查未修改上述源码。

- 生产 deploy 单独使用 `--node-linker hoisted`，没有改变仓库根依赖布局或供应链策略。afterPack 完成点目录复制后检查整个 server 树；只对 canonical root 内的相对文件别名执行一次物化，拒绝目录链接、绝对/越界目标、坏链接和特殊文件。没有采用解引用依赖图、修改版本解析或默许 runner 路径残留。
- 新资源行为测试真实迁移目录、删除源树，再 require 两份嵌套依赖版本及隐藏 dist 内嵌模块；拒绝各类不可移植链接。独立运行资源+发布脚本 17/17 通过。
- Office config 在 suite collection 前同步执行已提交生成器，绝对路径与 process.execPath 不依赖 shell；失败传播，不改变 timeout、测试范围或断言。CI 安装 `fonts-noto-cjk` 是原生字体宿主准备；真实 PDF 字形覆盖拒绝、中文换行及保存断言未放松。
- 已检查实现代理 `github-ci-fixes.md` 及 Ubuntu 官方 TTC 的真实 vendor/PDFium 诊断证据；它支持字体缺失这一因果判断，不能替代新的 Ubuntu CI。
- 受影响七文件 oxlint/oxfmt check 与 CI actionlint 独立通过。`git diff --check` 通过。实现代理真实迁移 43551 文件/零链接及 SQLite/vec/Jieba/dict/Canvas 加载记录已核对，本审查未重复重型打包，亦未声称 Windows 安装通过。

最终全仓 `pnpm check` 已在无其他本机打包竞争时完成，**exit 0**；完整输出保留 `github-local-pnpm-check.log`，末行 `FINAL_EXIT_CODE=0`。未更改任何 timeout、规则或排除。

实际通过：Office 235 files/2774 tests、renderer 85/636、server 122/1365 + local 10 + fnOS 4 + SQLite backup Node 2、desktop 12/110，根 Node 29（含新增资源及发布/E2E辅助测试）。Storage 中两个需显式 S3 环境的既有 integration 用例按原配置 skipped，不是本轮新增跳过；真实 S3 另由 CI 专项执行。lint、styles、format、全部 workspace typecheck 均通过。

本报告覆盖本轮冻结的资源与 CI 修复；随后其他代理新增的 macOS manual smoke 文件不在此次独立源码审查范围。实际四平台 runner、NSIS 和官方跨版本更新仍按主会话远端验收记录判断。

## macOS manual smoke 独立补审

独立检查 `manual-update-smoke.mjs` / `.test.mjs` 与 `mac-manual-update-plan.md`：固定匿名官方稳定版及精确架构 URL、大小/SHA-256，启动/替换路径均为一次 mkdtemp 下代码拥有的 app 副本，userData 显式隔离；先正常窗口关闭并验证主进程 code 0/无 signal，再手工替换 ZIP 内 app。相同 userData 重启后验证 target 版本、manual 能力、local 模式及完整原文档，留存真实 renderer HTML/PNG。没有直接调用安装器、伪造保存响应、触碰已安装 /Applications 客户端或宣称自动更新。

补审修复：TitleBar 原 `button.click()` 改为可见/启用/中心点 hit-test 后 CDP 真实鼠标事件；下载按钮可见性断言增加启用及布局/visibility 检查。新增 helper 测试加入根 test 命令。2/2 helper 测试、受影响 mjs oxlint、三文件 oxfmt check、Node syntax、git diff check 通过。

此前完整 `pnpm check` exit 0 记录保持；本次只追加上述定向门，未重复全仓。实际官方双版本尚待发布后执行，不把脚本/辅助测试视作真实手工替换已通过。按钮未点击打开系统浏览器、Gatekeeper/quarantine/公证、原生通知焦点仍为明确限制；Node 官方 ZIP 下载只能验证手工替换分发链。
