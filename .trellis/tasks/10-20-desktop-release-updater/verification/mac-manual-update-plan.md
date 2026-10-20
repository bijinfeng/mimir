# 官方 macOS ARM64 手动更新验收入口

2026-10-20。脚本已准备，**尚未运行真实发布版本**；主会话等待 v0.1.1/v0.1.2 发布成功后执行。只有实际运行输出 success=true 才能登记手动替换通过。

```sh
BASE_VERSION=0.1.1 TARGET_VERSION=0.1.2 \
MANUAL_UPDATE_EVIDENCE="$PWD/.trellis/tasks/10-20-desktop-release-updater/verification/mac-official-manual" \
node apps/desktop/scripts/manual-update-smoke.mjs
```

依赖：当前 macOS ARM64、Node22（全局 WebSocket/fetch）、系统自带 ditto、已有 `update-smoke-lib.mjs` CDP/hash/version helpers。不需要 pnpm install/build、Electron 开发安装或外部自动化包。

边界：所有 ZIP、应用副本与 userData 位于一次 mkdtemp 新目录，绝不访问 /Applications 或已安装 mimir。脚本删除的只有代码拥有的 `<mkdtemp>/installation/mimir.app`，保留相同临时 userData。证据写至指定路径或临时目录 evidence；成功/失败均保留自己的文件并打印位置，便于复核后主会话删除。

实际判据：匿名读取固定 bijinfeng/mimir 官方 stable 发布，校验精确 tag、架构、资产 URL、大小与 GitHub SHA-256 digest；latest 必须始终是 target。解压 baseline arm64 ZIP，外部命令行启用 loopback CDP 后启动真实包。在真实本地会话创建文件夹/中文正文笔记/标签，等待后台检查；必须 manual/currentVersion=base/version=target/autoDownload=false，不能进入 downloading/preparing/downloaded/restarting，不能自动打开详情。对可见且启用、中心点 hit-test 通过的真实 TitleBar“发现新版本”发送 CDP 鼠标事件打开 update.html；核对“下载 macOS 版”可见、没有“重启并安装”/“下载更新”和自动下载开关，归档真实 Page.captureScreenshot 与 HTML。

普通关闭调用既有 `window.mimirDesktop.window.close()`，主进程真实执行 BrowserWindow.close、beforeunload 与宿主关闭；必须自己的主进程 exit code0 且未收到信号，不使用 kill、app.exit、force-restart 或伪造保存 ACK。普通退出后 app.asar 哈希必须不变。之后外部脚本在自己的目录匿名下载并校验 target ZIP，正常退出后手工替换该 app 副本；相同 userData 重启，核对 target 当前版本、仍是 manual、原 local 模式及同一 document id 的完整记录一致，实际文档可渲染，归档 HTML/PNG，再正常关闭。

这是 **手工 ZIP 替换**，不能写成 macOS 自动安装通过。脚本不点击“下载 macOS 版”打开系统浏览器，以避免向用户默认下载目录写入 DMG；按钮与来源检查、官方 ZIP 实际下载分别记录。通过 Node 下载不模拟 Finder quarantine，不能声称 Gatekeeper/公证通过，也不声称系统通知投递或系统焦点通过。

本地检查：`node --test apps/desktop/scripts/manual-update-smoke.test.mjs` 2/2（精确官方架构资产、stable/digest、manual状态与来源/版本漂移拒绝）；oxlint、oxfmt、Node语法、git diff --check通过。本轮未运行客户端、未打包或发布。新测试已由独立审查加入根 test 命令。
