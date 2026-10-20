# 桌面发布与更新契约

## 1. 范围与触发

适用 `apps/desktop` 的打包、GitHub Releases、更新 IPC 与跨 renderer 的保存后重启。
产品行为以 [product §5.16](../../project/product.md) 为准。更新详情是同一进程的独立本地窗口，不依赖知识库宿主。

## 2. 签名与入口

- `pnpm desktop:build`：server build → desktop build → `scripts/deploy-server.mjs` → `scripts/package.mjs`。deploy 脚本只清理固定、被 gitignore 的 `apps/desktop/server-deploy` 再执行生产依赖部署，以支持重复打包；不能接受调用方传入的清理路径。matrix build 强制原生 OS/CPU，builder 始终 `publish: 'never'`。
- `node apps/desktop/scripts/release-artifacts.mjs version [vX.Y.Z]`：校验 desktop/package.json 的稳定版本，tag 必须匹配已提交的桌面版本。
- `stage <releaseDir> <outputDir> <target> <version> <mode>`、`aggregate <incomingDir> <outputDir> <version>`：收集并验证真实产物后生成完整发布目录；target 是 `mac-arm64|mac-x64|win-x64|linux-x64`。
- `.github/workflows/desktop-release.yml`：`workflow_dispatch` 仅产 artifacts；稳定 `vX.Y.Z` tag 才进入单独 `publish` job。
- `DesktopUpdateApi`（shared）：工作区 `getState/open/setAppearance/onState/onPrepare/respondPrepare/onPrepareCancelled`；它没有检查、下载、安装动作。appearance 只接收 auto/light/dark 枚举，本地主题快照可通知主进程供原生菜单复用；云端详情始终跟随系统。
- `MimirUpdaterBridge`：仅专用 `preload/updater.ts` 暴露 `getState/check/download/install/setAutoDownload/onState/openRelease/returnToDocument/close`。

## 3. 数据与环境契约

`DesktopUpdateState` 是主进程快照；`status` 为 disabled/idle/checking/current/unpublished/available/downloading/preparing/downloaded/restarting/blocked/error，`capability` 为 automatic/manual/disabled。进度 `transferred/total?/percent?` 只来自真实字节事件；100% 进入 preparing，校验完成才 downloaded。错误带可用的 retry，不伪造准备完成。

固定 GitHub provider 为 `bijinfeng/mimir`，只取稳定版，禁止降级。应用不存发布 PAT、证书或可由 renderer 指定的 feed。`desktop-updates.json` 用临时文件 + rename 持久化自动下载偏好、通知版本与上次启动版本。

- `MIMIR_BUILD_PLATFORM` / `MIMIR_BUILD_ARCH`：可选构建断言，必须与 runner 的 process 平台一致。
- `MIMIR_MAC_SIGNING=adhoc`（默认）：ad-hoc 测试签名，包内 `desktopUpdateMode=manual`，产 DMG + ZIP；用户下载并替换应用。
- `MIMIR_MAC_SIGNING=signed`：必须提供 CSC_LINK/CSC_KEY_PASSWORD/CSC_NAME、APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD/APPLE_TEAM_ID；正式签名、公证及验证均成功才允许包内 automatic。afterPack 不能再用 ad-hoc 覆盖它。
- workflow 对应仓库变量 `MIMIR_MAC_SIGNING`，Secrets `MAC_CSC_LINK/MAC_CSC_KEY_PASSWORD/MAC_CSC_NAME` 与上述 APPLE_*；只在打包步骤注入。
- 发布凭据只在 publish job 使用短期 `GITHUB_TOKEN`、contents:write；其余 jobs contents:read。
- Windows x64 产 NSIS；Linux x64 产 AppImage。Linux 非 AppImage 或安装位置不可写时降为 manual。

## 4. 校验与错误矩阵

| 条件 | 必须行为 |
|---|---|
| 无正式 release | unpublished，区别于 current；automatic provider 抛错时用固定官方 latest API 的真实 404 确认，不能把 latest-not-found 包装码直接等同于暂无版本 |
| 网络/哈希/下载失败 | 保留可重试错误，不能安装 |
| 开发模式 | disabled，不访问发布源 |
| remote cloud 页面 | 无 preload，无更新动作 IPC；原生菜单仍能打开详情 |
| 冒用窗口、子 frame、不同详情 URL | 拒绝动作；保存响应还须匹配 pending requestId 和原始 frame |
| 自动下载完成 | 每版本一次静默原生通知；不弹窗、不聚焦、不重启 |
| 普通退出 | autoInstallOnAppQuit=false；不得顺便安装 |
| 保存失败/期间有新改动/Office 无保存句柄 | 留在工作区，禁止安装；Office 引导回工具栏保存 |
| 云端页面无保存握手 | 用户先返回保存，再在更新窗口明确确认；仍尊重 beforeunload |
| 工作区关闭被拒或超时 | 阻止安装，不绕过 beforeunload |
| 普通关闭/退出/模式切换被页面拦住 | 原生提示返回文档完成保存或进行中的操作；只解释阻止原因，不绕过 veto；更新准备中由更新界面单独反馈 |
| 宿主关闭失败或超时 | 阻止安装，展示恢复指引；超时不能视为关闭成功 |
| 安装器启动通过 error 事件失败 | 工作区已关闭时进入 blocked/recoveryRequired，展示重新启动指引，不停在 restarting；不能只依赖 quitAndInstall 的同步异常 |
| 任一 matrix 失败、版本/哈希/架构文件不符 | 停在 publish 之前 |
| 两份 latest-mac.yml | 验证同版本并合并 files，文件名唯一；不能后下载覆盖前下载 |
| 已公开 tag 重跑 | 拒绝覆盖已发布 release；draft 验证完整上传后才公开 |

## 5. Good / Base / Bad

- Good：四个原生 runner 分别打包、验证 app 和 smoke；汇总文件及 SHA 校验成功，单点 draft 上传后设为 stable latest。
- Base：没有证书的 macOS 首版支持检查和正确架构的官方手动下载；不能把 ZIP 的存在解释为自动安装可用。
- Bad：收到 downloaded 就打开模态或调用 quitAndInstall；矩阵各 job 直接发布 latest；renderer 传 URL；为了升级给云端注入安装桥。

## 6. 必需验证

- 控制器测试覆盖单操作 gate、检查节奏、偏好、通知持久去重、通知不可用时继续检查、未知大小、100% 到校验完成、失败重试、安装顺序和安装器 error 事件恢复。
- IPC 测试覆盖伪造 sender/frame、过期 requestId、导航后迟到响应、云端无桥、关闭 veto 和宿主失败/超时。
- renderer 测试覆盖自动/手动保存、无句柄、失败、新改动、编辑器切换；保存 ACK 不等于忽略 beforeunload。
- 发布脚本测试用真实 fixture 字节验证 hash、缺文件、非法 tag、双架构冲突和元数据汇总；不能只匹配 YAML 文本。
- `pnpm check`、desktop build、实际打包与 `MIMIR_SMOKE_EXECUTABLE=<绝对路径> node apps/desktop/scripts/smoke.mjs`；界面实际截图/HTML归档。
- 本机 mac 不能代表 Windows/Linux runner 或真实跨版本更新已通过；未执行的远端验证必须明确记录。

## 7. 错误与正确示例

错误：`autoUpdater.quitAndInstall()` 后才在异步 before-quit 里关闭数据库。electron-updater 6.8.9 的安装器会先于 app.quit 启动。

正确：用户显式安装 → nonce 保存准备 → 窗口真实 close/beforeunload → await 共用 HostShutdown → quitAndInstall；任何一步失败均不执行安装器。普通退出独立走保存保护与宿主关闭。

恢复状态须解除安装准备标志；详情仍在时展示指引，所有窗口都已关闭时正常退出，不能留下无窗口的单实例进程，也不能另起宿主。
