# 桌面发布与更新契约

## 1. 范围与触发

适用 `apps/desktop` 的打包、GitHub Releases、更新 IPC 与跨 renderer 的保存后重启。
产品行为以 [product §5.16](../../project/product.md) 为准。更新详情是同一进程的独立本地窗口，不依赖知识库宿主。

## 2. 签名与入口

- `pnpm desktop:build`：server build → desktop build → `scripts/deploy-server.mjs` → `scripts/package.mjs`。deploy 脚本只清理固定、被 gitignore 的 `apps/desktop/server-deploy` 再执行 `pnpm --filter @mimir/server deploy --prod --node-linker hoisted` 生产依赖部署，以支持重复打包和可移植物理目录；根安装仍保持 isolated；不能接受调用方传入的清理路径。matrix build 强制原生 OS/CPU；`nativeArtifactName(process.arch)` 固定文件名架构为 Node 的 x64/arm64，仅保留 version/os/ext 宏，防止 AppImage 将 x64 重写为 x86_64；builder 始终 `publish: 'never'`。
- `finalizeResourceTree(root): Promise<{files:number, materialized:number}>`：afterPack 对完整可信 server 资源树执行；内部相对文件别名物化，目录/绝对/越界/损坏链接均使构建失败，不递归解引用依赖图。返回成功的资源树须无链接，才能压 NSIS/签名。
- `extractArchiveFile(archive, entry, extractFile)`：ASAR 3.4.1 目录遍历使用宿主 `path.sep`，所有固定 archive entry 先 native normalize；`listPackage` 是宿主路径展示，禁止匹配固定正斜杠后缀来判断依赖。`verifyPackagedUpdater(archive, extractFile)` 必须读取根 updater 的真实 manifest name/version 与非空且不越界的 main 文件；缺文件、错版本和仅外层声明均失败。
- `node apps/desktop/scripts/release-artifacts.mjs version [vX.Y.Z]`：校验 desktop/package.json 与 apps/fnos/manifest 的稳定版本完全一致，tag 必须匹配已提交版本。`validateCommittedReleaseVersion(desktopVersion, fnosManifestText, tag?)` 拒绝缺失、重复、带空白及不一致的 fnOS version。
- `stage <releaseDir> <outputDir> <target> <version> <mode>`、`aggregate <incomingDir> <outputDir> <version>`：收集并验证真实产物后生成完整发布目录；`targets` 仅含四个 Electron 目标；`releaseTargets` 为 `mac-arm64|mac-x64|win-x64|linux-x64|fnos-x64`。fnOS 固定 linux/x64/manual、文件 `mimir-VERSION-fnos-x64.fpk`，不进入 Electron YAML。
- `BASE_VERSION=X.Y.Z TARGET_VERSION=X.Y.Z node apps/desktop/scripts/update-smoke.mjs`：仅一次性 GitHub x64 Windows/Linux runner 可执行的真实升级验收；独立 `desktop-update-verify.yml` 映射同名输入。客户端不包含验收开关。
- `BASE_VERSION=X.Y.Z TARGET_VERSION=X.Y.Z MANUAL_UPDATE_EVIDENCE=<绝对目录> node apps/desktop/scripts/manual-update-smoke.mjs`：本机 mac ARM64 官方 ZIP 手动更新验收；只启动/替换 mkdtemp 下专用 app 副本和同一隔离 userData，正常窗口关闭后才替换，记录真实 CDP HTML/PNG。匿名元数据必须匹配官方 browser_download_url、正整数 asset ID 与精确官方 API asset URL；可通过该公开 API 的 octet-stream 重定向下载，仍验证响应类型、完整大小与摘要，拒绝 JSON 错误页。不打开用户系统下载目录，不声称自动安装、Gatekeeper、公证或原生通知投递。
- 手动验收可选 `MANUAL_UPDATE_DOWNLOAD_CACHE=<绝对目录>`：仅接受系统真实 tmpdir 直属、既存且无符号链接的 `mimir-official-manual-update-*` 目录；应用/userData始终另建独占root，不删除缓存。完整ZIP复用前重验大小/SHA256，残片续传仅接受官方asset API的206和精确Content-Range，最终仍重验全部字节；JSON/错误范围/短体/超长体/损坏缓存/符号链接均失败。总下载上限60分钟、无数据60秒中止，失败保留残片和诊断，不计通过。
- `.github/workflows/desktop-release.yml`：`workflow_dispatch` 仅产 artifacts；稳定 `vX.Y.Z` tag 才进入单独 `publish` job。调用 `fnos-build.yml` 复用工作流，aggregate 必须等待四桌面目标和 fnOS 全部通过。
- `DesktopUpdateApi`（shared）：工作区 `getState/open/setAppearance/onState/onPrepare/respondPrepare/onPrepareCancelled`；它没有检查、下载、安装动作。appearance 只接收 auto/light/dark 枚举，本地主题快照可通知主进程供原生菜单复用；云端详情始终跟随系统。
- `MimirUpdaterBridge`：仅专用 `preload/updater.ts` 暴露 `getState/check/download/install/setAutoDownload/onState/openRelease/returnToDocument/close`。

## 3. 数据与环境契约

`DesktopUpdateState` 是主进程快照；`status` 为 disabled/idle/checking/current/unpublished/available/downloading/preparing/downloaded/restarting/blocked/error，`capability` 为 automatic/manual/disabled。进度 `transferred/total?/percent?` 只来自真实字节事件；100% 进入 preparing，校验完成才 downloaded。错误带可用的 retry，不伪造准备完成。

固定 GitHub provider 为 `bijinfeng/mimir`，只取稳定版，禁止降级。应用不存发布 PAT、证书或可由 renderer 指定的 feed。`desktop-updates.json` 用临时文件 + rename 持久化自动下载偏好、通知版本与上次启动版本。

`releaseNotes` 在主进程通过 `normalizeReleaseNotes` 将 GitHub API Markdown、provider HTML 与多版本数组统一为可读纯文本，移除内部构建标记及 HTML 注释。输出只允许作为 React 文本节点显示，不得再次送入 HTML/Markdown 渲染器或外部链接打开器；官方发布入口继续使用固定验证过的 URL。

- `MIMIR_BUILD_PLATFORM` / `MIMIR_BUILD_ARCH`：可选构建断言，必须与 runner 的 process 平台一致。
- `MIMIR_MAC_SIGNING=adhoc`（默认）：ad-hoc 测试签名，包内 `desktopUpdateMode=manual`，产 DMG + ZIP；用户下载并替换应用。
- `MIMIR_MAC_SIGNING=signed`：必须提供 CSC_LINK/CSC_KEY_PASSWORD/CSC_NAME、APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD/APPLE_TEAM_ID；正式签名、公证及验证均成功才允许包内 automatic。afterPack 不能再用 ad-hoc 覆盖它。
- workflow 对应仓库变量 `MIMIR_MAC_SIGNING`，Secrets `MAC_CSC_LINK/MAC_CSC_KEY_PASSWORD/MAC_CSC_NAME` 与上述 APPLE_*；只在打包步骤注入。
- 每目标 `build-manifest.json` 声明 targetKey/platform/arch/version/updateMode 及资产 size/SHA-256/SHA-512；aggregate 对五目标身份和真实字节全部复验。`validateReleaseDirectory(dir, manifest)` 在任何远端写入前再次核对普通文件、大小及双摘要，上传后再核对 GitHub 资产摘要，最后才公开 draft。
- 发布凭据只在 publish job 使用短期 `GITHUB_TOKEN`、contents:write；其余 jobs contents:read。
- 发布只使用已存在的稳定 tag：`resolveReleaseTag(tag, readJson)` 解析远端 lightweight/annotated tag 到 commit，拒绝非法对象、循环和超过10层嵌套；创建草稿前及公开前都必须等于本次构建精确SHA。draft所有权使用相同tag及正文commit marker，不使用 `target_commitish` 元数据判定。POST /releases 省略该字段：GitHub对显式历史提交相对默认分支的workflow差异另要求workflows写权限，即使tag已存在；GITHUB_TOKEN不能获得该权限。不得通过扩大PAT权限或移动tag处理。
- Windows x64 产 assisted NSIS（`oneClick=false`、`runAfterFinish=true`）；显式更新的正常 Finish 页面保留启动应用选项。首次 `/S` 且没有 `--force-run` 不能自行启动，普通退出仍由 `autoInstallOnAppQuit=false` 禁止安装。
- Linux x64 产 AppImage。Linux 非 AppImage 或安装位置不可写时降为 manual。

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
| 生产资源含目录/junction/绝对/越界/损坏链接 | 构建失败并定位链接；不得将 runner 绝对路径带入安装包，或全图解引用掩盖循环 |
| 任一桌面 matrix 或 fnOS 构建失败、缺 FPK、版本/哈希/架构文件不符 | 停在 publish 之前 |
| 两份 latest-mac.yml | 验证同版本并合并 files，文件名唯一；不能后下载覆盖前下载 |
| 真实升级验收的版本不稳定/target不是官方latest/资产摘要不匹配/runner已有userData | 验收立即失败，不复用用户库或注入自定义feed，不使用直接安装或伪造保存ACK补成通过 |
| 已公开 tag 重跑 | 拒绝覆盖已发布 release；draft 验证完整上传后才公开 |
| 远端tag缺失、解析不合法、创建前或公开前commit不匹配 | 立即失败；后一次检查失败保留未公开draft，不更改tag |
| GitHub API拒绝请求 | 报告方法、路径、状态、经过脱敏的message/权限提示/request id；不输出Token、响应URL或任意原始body |

## 5. Good / Base / Bad

- Good：四个原生 runner 分别打包、验证 app 和 smoke；加一个 fnOS 原生 runner 验证真实 FPK 和 Socket 宿主；五目标汇总文件及 SHA 校验成功，单点 draft 上传后设为 stable latest。
- Base：没有证书的 macOS 首版支持检查和正确架构的官方手动下载；不能把 ZIP 的存在解释为自动安装可用。
- Bad：收到 downloaded 就打开模态或调用 quitAndInstall；矩阵各 job 直接发布 latest；renderer 传 URL；为了升级给云端注入安装桥。

## 6. 必需验证

- 控制器测试覆盖单操作 gate、检查节奏、偏好、通知持久去重、通知不可用时继续检查、未知大小、100% 到校验完成、失败重试、安装顺序和安装器 error 事件恢复。
- IPC 测试覆盖伪造 sender/frame、过期 requestId、导航后迟到响应、云端无桥、关闭 veto 和宿主失败/超时。
- 原生窗口关闭前捕获事件源（如 `webContents`）；`closed` 阶段清理只能使用这些预捕获引用，不能再次访问已销毁 `BrowserWindow` 的 getter。fixture 必须模拟销毁后 getter 抛错，并以真实 Electron 关闭探针补验；普通 EventEmitter stub 不足以证明原生销毁边界安全。错误不能让关闭 Promise 悬挂或放行安装。
- renderer 测试覆盖自动/手动保存、无句柄、失败、新改动、编辑器切换；保存 ACK 不等于忽略 beforeunload。
- 资源复制测试必须覆盖迁移后 require、同名嵌套依赖版本、内部文件别名物化、目录循环/绝对/越界/损坏链接拒绝；真实包原生模块和安装后 smoke 仍不可省略。
- Windows NSIS 门先 `package-resources.mjs capture <unpackedServer> <manifest.json>` 保存普通文件相对路径/大小/SHA256，真实安装后 capture 并 `verify <installedServer> <manifest.json>` 严格比对；缺失/新增/变更均失败，然后才运行既有 A/B/C smoke。禁止为通过门忽略深层文件。安装 5 分钟、卸载父进程 60 秒、整个步骤 15 分钟上界；失败上传安装器和资源/阶段证据，不上传 userData。卸载父进程返回不能证明临时子进程全部结束。
- ASAR 校验回归使用真实 archive，覆盖两种输入分隔符、正确/缺失根依赖、错版本、缺入口和越界入口；不能用列表展示路径代替真实字节验证。
- 发布脚本测试用真实 fixture 字节验证五目标 hash、缺 FPK、非法 tag、版本不一致、错架构/mode、重复条目、双架构冲突和元数据汇总；缺失或篡改 FPK 必须在远端写入前失败，上传/远端摘要失败不能公开 draft；不能只匹配 YAML 文本。
- 发布回归须覆盖省略 `target_commitish` 的真实create payload、metadata为master但commit marker/tag正确的draft恢复、错误marker拒绝、远端tag开始错或上传后移动、annotated/lightweight tag解析和安全API错误诊断。官方权限契约见 [Create a release](https://docs.github.com/en/rest/releases/releases#create-a-release)。
- fnOS 官方工具、原生模块、解包及 Socket 契约唯一归属 [architecture §8.6.1](../../project/architecture.md#861-fnos-原生包部署契约x86_64)；Ubuntu 验包不代表 fnOS 设备安装或覆盖升级已通过。
- `pnpm check`、desktop build、实际打包与 `MIMIR_SMOKE_EXECUTABLE=<绝对路径> node apps/desktop/scripts/smoke.mjs`；界面实际截图/HTML归档。
- 真实更新验收必须从官方匿名资产安装基线，驱动真实更新 UI；验证普通退出未替换安装文件、真实编辑阻止并取消安装、保存后重启安装、旧进程消失与新进程拉起、版本和原文档/模式保留。Windows 校验实际 updater 缓存安装包摘要；Linux 校验替换后的 AppImage 摘要。头部完成通知和系统焦点仍需原生桌面证据，不能用 CDP 无详情窗口替代。
- 外部 CDP 点击“稍后”或正常关闭窗口时，窗口可能早于鼠标释放应答销毁。只允许明确关闭动作的释放阶段接收有类型的 target-close，并确认该目标确实消失；普通动作、按下阶段及其他协议/renderer错误仍须失败。关闭详情后确认工作区仍可用；普通退出须记录真实应用进程 exit 0 且无 signal，不能把调试连接断开当作退出成功。
- 外部截图须只读等待有限动画结束及连续两个绘制帧稳定，总上限 5 秒，忽略无限 spinner；超时、页面异常或 target-close 必须失败，不得修改样式、取消产品动画或以 DOM 存在冒充对话框已绘制。实际 PNG 仍须目视复核。
- 本机 mac 不能代表 Windows/Linux runner 或真实跨版本更新已通过；未执行的远端验证必须明确记录。

## 7. 错误与正确示例

错误：`autoUpdater.quitAndInstall()` 后才在异步 before-quit 里关闭数据库。electron-updater 6.8.9 的安装器会先于 app.quit 启动。

正确：用户显式安装 → nonce 保存准备 → 窗口真实 close/beforeunload → await 共用 HostShutdown → quitAndInstall；任何一步失败均不执行安装器。普通退出独立走保存保护与宿主关闭。

恢复状态须解除安装准备标志；详情仍在时展示指引，所有窗口都已关闭时正常退出，不能留下无窗口的单实例进程，也不能另起宿主。
