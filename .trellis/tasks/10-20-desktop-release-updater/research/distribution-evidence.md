# 桌面发布调研证据

调研日期：2026-10-20（Asia/Shanghai）。本文件记录实际读取结果，不把建议当成已确认需求。

## Mimir

- `git remote -v`：`git@github.com:bijinfeng/mimir.git`。
- `gh repo view bijinfeng/mimir --json nameWithOwner,visibility,defaultBranchRef,url`：PRIVATE，默认分支 master。
- 后续用户明确授权将源仓库公开；已执行 `gh repo edit bijinfeng/mimir --visibility public --accept-visibility-change-consequences`，命令成功退出。R2 调整为直接通过该仓库 Releases 分发。
- 匿名验证（无 Authorization）：`GET https://api.github.com/repos/bijinfeng/mimir` 返回 HTTP 200、`private=false`、`visibility=public`，确认可见性变更已生效。
- `gh api repos/bijinfeng/mimir/releases`：空数组。
- `gh secret list --repo bijinfeng/mimir --json name` 与 `gh variable list --repo bijinfeng/mimir --json name`：均为空数组；这只证明仓库层级当前未配置，不代表用户未持有证书。未读取任何 Secret 值。
- `apps/desktop/package.json`：Electron `^44.4.5`、electron-builder `^26.15.3`，未引入 electron-updater。
- `apps/desktop/electron-builder.yml`：mac DMG、Linux AppImage、mac identity=null，无 publish 配置。
- `apps/desktop/scripts/after-pack.mjs`：拷贝服务端运行资源后，在 darwin 上执行 ad-hoc codesign；不是 Developer ID 分发签名。
- `.trellis/spec/desktop/runtime/conventions.md`：连接服务器模式不安装 preload，必须通过原生载体提供共用更新入口；原生安装重启需兼容既有宿主关闭逻辑。
- `trellis mem search '自动更新'`：仅当前会话，未发现可复用的历史决策。

## WeKnora（项目要求的参考核对）

- 官网 <https://weknora.weixin.qq.com/> 返回 HTTP 200，标题为“WeKnora — 帮你找到答案，并将知识付诸实践”。
- 最新稳定发布：`v0.8.3`，`published_at=2026-10-14T07:53:24Z`，<https://github.com/Tencent/WeKnora/releases/tag/v0.8.3>。
- 本次检查的 main 快照：`8dab7550f5069ef80877a65b52dc5483c45f7827`，commit 时间 `2026-10-20T04:28:30Z`。
- 具体文件：<https://github.com/Tencent/WeKnora/blob/8dab7550f5069ef80877a65b52dc5483c45f7827/.github/workflows/app.yml>。已读取文件；第 3 行提到 Rust archive 与 anydoc build tag，第 36/66 行包含 `cmd/desktop/build/windows/installer/project.nsi`，第 144 行运行 `go test -tags desktop ./internal/container`。
- 适用性：该证据说明 WeKnora 有与桌面构建路径关联的 CI 检查，但它的 Go/Rust 依赖与 Mimir 的 Electron/Node/pnpm 宿主不同，不能直接移植构建脚本，也不足以证明它具备可复用的 Electron 自动更新实现。本任务主技术依据应是 electron-builder/electron-updater 官方代码与文档。

## electron-builder 官方文档

- 定位并实际读取：<https://github.com/electron-userland/electron-builder/blob/master/website/docs/features/auto-update.md>（2026-10-20 master 文档，并非 Mimir 锁定版本）。
- 第 16 行：macOS 应用必须签名才能自动更新；第 23 行：Windows 支持 NSIS；第 30 行：macOS 需要 ZIP，否则不能生成 `latest-mac.yml`。
- 第 339–346 行：私有 GitHub 更新源需要使用者机器上的 GH_TOKEN，并明确说明不适合一般使用者。这支持为私有源码仓库另设分发渠道的建议。
- 文档已包含 v27 新行为；实现阶段必须核对 Mimir 26.x 对应源码，不能直接复制 v27 的安装时机或更新清单签名 API。
- 旧地址 `https://www.electron.build/auto-update.html` 和猜测的 raw markdown 地址返回 HTTP 404，现已定位上面的实际文档路径。

## 待补齐

- 分发渠道已确定为公开的源仓库 Releases；不再需要跨仓库发布权限。实际安装包和更新元数据的匿名下载路径需在首版发布时验证。

## 版本级源码核对与规划结论

- 用户确认覆盖 macOS arm64/x64、Windows x64、Linux x64；随后确认尚无 macOS Developer ID 证书与公证凭据。方案据此建议 macOS 首版 manual 更新，不把 ad-hoc 包描述成支持自动安装的正式包。
- 已尝试 GitHub `v26.15.3` ref 与该 ref 的 raw 源码，均返回 404；不能声称已读到该 tag。builder 版本证据改用本机实际安装的 `node_modules/.pnpm/app-builder-lib*/node_modules/app-builder-lib/package.json`（26.15.3）及 `out/publish/updateInfoBuilder.js`。
- 本机 `updateInfoBuilder.js:51-61`：macOS 不加架构后缀，两种架构均生成 `latest-mac.yml`；Linux x64 默认 `latest-linux.yml`。`:154-189` 将同路径任务的 files 合并，且 ZIP 优先保留旧 path/sha512。这是跨 runner 需要集中合并而非互相覆盖的直接证据。
- `pnpm view electron-updater version` 返回 6.8.9；该版发布时间 `2026-06-05T06:18:09.685Z`，符合项目最低发布年龄规则。此处仅选为候选兼容稳定版，实现安装时仍须核对解析版本与打包运行。
- 实际读取 npm mirror 发布的 `electron-updater-6.8.9.tgz`，未执行其中代码，未将其作为项目依赖安装。URL：<https://registry.npmmirror.com/electron-updater/-/electron-updater-6.8.9.tgz>；tarball SHA-256：`0b95d12dde27a0979eb8911f29559daab89580d884904dcf7b4a78b89513288b`。
- tarball `out/AppUpdater.js:109-114`：autoDownload 和 autoInstallOnAppQuit 默认为 true；必须显式关掉普通退出自动安装，才能保持用户确认安装的方案语义。
- tarball `out/BaseUpdater.js:13-21`：quitAndInstall 先调用 install，成功后才 app.quit；所以仅在现有 before-quit 中关闭数据库不够，必须在 quitAndInstall 前等待宿主关闭。
- tarball `out/providers/Provider.js:30-45`：mac 默认 `latest-mac`，Linux x64 默认 `latest-linux`；`out/MacUpdater.js:28-31,78-79` 按 arm64 文件名和本机/Rosetta 判断选包，文件名必须包含唯一架构。
- tarball `out/providers/GitHubProvider.js:92-111`：稳定版路径读取 latest tag，空发布或错误 feed 会报错。因此新仓库尚无 Release 必须成为可恢复状态，draft 在完整发布前不能成为自动更新来源。
- 上述是具体 6.8.9 发布包行为证据，不使用 master/v27 中的新 quitAndInstall 参数、安装时机选项或签名更新清单 API。
