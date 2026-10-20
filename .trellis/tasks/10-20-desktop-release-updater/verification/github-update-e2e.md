# GitHub 真实跨版本升级自动验收

2026-10-20：本文件记录外部验收 harness 的实现与本地检查；**尚未执行公开版本间升级，不是升级通过证据**。实际运行结果以独立 workflow 的 job 日志及 artifact `result.json` 为准。

## 运行条件与入口

- 独立 workflow：`.github/workflows/desktop-update-verify.yml`，手动输入 `base_version` 与 `target_version`（精确稳定 X.Y.Z，无 v 前缀）。例如先公开 v0.1.0，再公开 v0.1.1，官方 latest=v0.1.1 时运行 0.1.0 → 0.1.1。
- Windows 2025 原生 x64 / Ubuntu 24.04 原生 x64 分开运行。Ubuntu 提供 Xvfb + Openbox；真实 AppImage 用 APPIMAGE_EXTRACT_AND_RUN，而非解包目录直接伪装 AppImage。
- baseline/target 必须是固定 `bijinfeng/mimir` 的匿名可访问、非 draft、非 prerelease 正式发布；运行前、安装前、结束时重复断言 latest=target。版本不一致、预发布、降级、资产来源漂移均失败。
- baseline 从固定官方 URL 匿名下载，核对 GitHub asset size 与 SHA-256 digest；客户端自己按固定官方 provider 检查/下载更新并校验元数据哈希。Linux 安装后再核对替换后的 AppImage 与 target GitHub asset digest 完全一致。
- 不修改生产代码、不新增客户端测试开关、不注入 provider、PAT、证书、直接 main-process 安装调用或 synthetic save ACK。CDP 仅通过启动命令行在 127.0.0.1 开启，读取页面状态并点击真实组件按钮。
- 仅允许 GITHUB_ACTIONS=true 的一次性 runner。由于 updater 6.8.9 的 AppImage/NSIS 重新启动不透传 --user-data-dir/CDP 参数，使用一次性 runner 的真实默认 userData，并在任何应用操作前拒绝已有目录。不给开发者现有安装运行。

## 实际执行判据

1. baseline Windows NSIS 首次安装（只有首次安装允许 /S），或启动真实 Linux AppImage；预置本地模式，使用真实本地会话经正常 HTTP API 创建中文文件夹、含正文/标签的 Markdown 笔记。
2. 等待 baseline 自动检查、官方下载及校验到 downloaded，断言 currentVersion=base、version=target、capability=automatic；断言没有自动打开 update.html 窗口。点击真实标题栏“可重启更新”打开详情，归档 HTML/PNG。
3. 点击“稍后”再点击主窗口关闭，等待所有应用进程正常退出；安装文件 SHA-256 必须不变，证明普通退出没有安装。再启动 baseline 后确认笔记正文还在。
4. 打开真实笔记编辑器，通过 CDP Input.insertText 输入改动；只通过外部 CDP Fetch 暂停该文档真实 PATCH 请求，让真实 dirty/save guard 保持待保存。点击详情“重启并安装”，必须出现真实保存守卫；点击“继续编辑”后详情进入 blocked，安装文件仍不变。归档守卫截图。
5. 放行原 HTTP 保存请求，等服务端读取到真实改动；点击详情“重试重启”。生产链路自行执行保存握手、窗口 close/beforeunload、宿主关闭和 updater 安装。
6. Windows 外部 UIAutomation 只操作 class=#32770 且标题含 mimir 的 NSIS 对话框，点击正常 Next/Install/Finish，绝不另起 target installer。Linux 等原 AppImage 被更新器换成官方 target 文件；Windows 等已安装 exe 实际变化且向导正常完成。
7. 确认 updater 自动拉起进程；通过 OS 正常窗口关闭结束此次不带 CDP 的重启，再加外部调试参数启动已安装目标版本。断言 currentVersion=target、模式仍 local、原 document id 的正文（包括保存中输入的改动）/标题/标签/文件夹完全保留，并在新版真实编辑器渲染出来。
8. 输出 result.json、匿名 release 元数据、三次启动日志、各关键阶段 HTML/PNG；最后通过真实关闭按钮正常结束。

## 本地已运行检查

- `node --test apps/desktop/scripts/update-smoke.test.mjs`：6/6 通过，覆盖稳定版本/降级限制、官方资产 URL+digest、实际文件哈希、条件等待、CDP 乱序响应/连接关闭和 renderer exception 失败传播。
- `pnpm exec oxlint apps/desktop/scripts/update-smoke*.mjs`：通过。
- `pnpm exec oxfmt --check apps/desktop/scripts/update-smoke*.mjs .github/workflows/desktop-update-verify.yml`：通过。
- `node --check apps/desktop/scripts/update-smoke.mjs`：通过。
- actionlint v1.7.12 校验独立 workflow：通过。自审发现并修复 job.env 不允许 runner context 的用法，artifact 改为默认 runner temp 路径。

## 边界与未验证项

- 新增 harness 尚未在 Windows/Linux 实机运行；UIAutomation 的正常向导自动操作、重新拉起和桌面会话可用性须由 GitHub runner 实际结果确认，不能据代码推断通过。
- CDP 可断言未创建详情窗口，但不能证明系统通知实际投递或系统焦点没有改变；这两项仍需原生桌面人工验收。
- 当前 macOS ad-hoc 包为 manual；此流程不宣称 macOS 自动安装。正式签名/公证与正式 mac 自动升级仍需对应凭据和单独验收。
- 故障清理只发送正常窗口关闭，不强杀被保存守卫阻止的应用。一次性 runner 在 job 结束回收；不以强制进程退出伪称保存或升级成功。

## 已有研究证据的适用性

复用 `research/distribution-evidence.md` 的实际来源记录：WeKnora v0.8.3、main `8dab7550f5069ef80877a65b52dc5483c45f7827` 的 `.github/workflows/app.yml` 有 Go/Rust 桌面检查，但不能作为 Electron 自动更新安装验收依据。本新增外部脚本围绕本仓固定 electron-updater 6.8.9 的真实行为，未新作广泛调研。已核对本机安装版 AppImageUpdater/NsisUpdater：重新运行参数数组为空/安装器参数 --updated --force-run，不继承原 CDP/userData 参数，因此采用一次性 runner 默认数据目录和 OS 正常关闭后重新观察的方案。
