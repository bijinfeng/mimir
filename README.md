# mimir

自托管的单用户个人知识库：写 Markdown 笔记、收集资料，并带引用地问 AI。
浏览器端连接自部署服务；桌面端可离线使用本机数据，也可连接服务端。
微信小程序端连接固定 HTTPS 实例，提供检索问答、资料阅读及有限笔记编辑；工程与配置见 [小程序说明](apps/miniapp/README.md)。
产品边界见[产品契约](.trellis/spec/project/product.md)，架构见[技术契约](.trellis/spec/project/architecture.md)。

## 快速开始

需要 pnpm。默认本地开发使用 SQLite，不需要 Docker：

```bash
pnpm install
cp .env.example .env
# 在 .env 中设置 AUTH_SECRET；建议同时设置 OWNER_EMAIL / OWNER_PASSWORD
pnpm dev
```

浏览器开发页默认在 `http://localhost:5173`，根路径为公开产品官网；点击“开始使用”进入登录与知识工作区。API 默认在 3000。
如需生产一致的 Postgres 路径，设置 `DATABASE_URL`，启动数据库后运行
`pnpm db:migrate`；详见 [部署说明](.trellis/spec/project/architecture.md)。

桌面端：

```bash
pnpm desktop:dev
```

首次启动选择“本地使用”或“连接服务器”。本地模式数据保存在 Electron 的
userData 目录，免登录但仍使用仅本机可用的令牌鉴权；云端模式直接加载服务器
页面，不同步或迁移本地数据。桌面端界面改动后需刷新窗口。打包用
`pnpm desktop:build`。

## 桌面安装与更新

从[本仓库 Releases](https://github.com/bijinfeng/mimir/releases)下载匹配系统的安装包：

| 平台 | 文件 |
| --- | --- |
| macOS Apple Silicon | `mimir-版本-mac-arm64.dmg` |
| macOS Intel | `mimir-版本-mac-x64.dmg` |
| Windows x64 | `mimir-版本-win-x64.exe`（NSIS 安装器） |
| Linux x64 | `mimir-版本-linux-x64.AppImage` |
| fnOS x86_64 | `mimir-版本-fnos-x64.fpk`（原生应用包） |

fnOS 包通过系统的手动安装入口导入，后续升级也由 fnOS 应用管理完成；
FPK 与同版本客户端一起发布，不使用桌面客户端的自动更新器。

首个带更新器的版本必须手动安装。此后 Windows 安装版与可写位置的 Linux AppImage
在启动后及每 6 小时检查稳定版，默认后台下载，可在“软件更新”中关闭自动下载。
准备完成后只显示轻提示；点击标题栏、关于页或应用菜单“软件更新…”查看详情，
由用户选择“重启并安装”。普通退出不会安装；重启前先处理未保存内容并关闭本地宿主。
连接服务器时使用原生应用菜单进入更新窗口，不依赖服务器在线。

**当前没有正式 macOS 证书，默认构建是 ad-hoc 签名测试包，只支持检查版本和手动下载更新。**
下载后退出 mimir 再替换应用，保留原有本地资料；macOS 系统可能阻止打开测试包。
ZIP 同时提供给更新机制使用。Windows 当前未配置代码签名，系统可能显示信誉提示；
Linux AppImage 需要可执行权限，在只读位置运行时使用手动更新。
这些包不代表已取得 Apple 公证或 Windows 代码签名。

### 维护者发布

`.github/workflows/desktop-release.yml` 在四个原生 runner 上构建 macOS arm64/x64、
Windows x64 和 Linux x64，并对解包后的真实应用执行启动自检。
同时调用 `.github/workflows/fnos-build.yml`，在 Ubuntu x86_64 / Node 22 上构建、
校验 fnOS 原生 FPK。该复用工作流也可手动运行，仅生成 `fnos-x64` artifact。
手动运行 **Desktop release** 只产生保留 14 天的 Actions artifacts，不修改 Releases。
本地 `pnpm desktop:build` 也永远不发布。

正式发布时，先同步并提交 `apps/desktop/package.json` 和 `apps/fnos/manifest`
中的稳定版本（仅 `X.Y.Z`），按需要更新 lockfile，再推送相同的 `vX.Y.Z` 标签。
标签与这两处已提交版本必须完全一致；仓库其他包无需连带改版本。
预发布、前导零和不匹配的标签会失败。版本不能复用。
四个客户端和 fnOS 的构建及自检全部成功后，汇总作业校验每份安装包、
SHA-256、SHA-512、大小、版本、平台与架构，
合并双架构 `latest-mac.yml`。独立发布作业才获得 `contents: write`，创建 draft、
上传并核对全部资产后，一次发布为 stable/latest。客户端不包含发布 Token。
任一目标构建失败、缺失或校验不符均阻止新版本公开，包括 fnOS；
FPK 没有 Electron 更新 YAML，也不会被写入客户端的下载列表。
上传失败不会公开半成品；同 commit 的本工作流 draft 可重跑恢复，
已有公开 Release 不会被覆盖，修复需要递增版本。

默认测试构建不需要 Secrets。未来启用正式 macOS 签名与公证时，设置仓库变量
`MIMIR_MAC_SIGNING=signed`，并配置下列 Actions Secrets：

| Secret | 用途 |
| --- | --- |
| `MAC_CSC_LINK` | Developer ID Application 证书的受保护下载地址或 base64 P12 |
| `MAC_CSC_KEY_PASSWORD` | P12 密码 |
| `MAC_CSC_NAME` | Developer ID Application 签名身份名称 |
| `APPLE_ID` | Apple 开发者账号 |
| `APPLE_APP_SPECIFIC_PASSWORD` | 公证使用的 app 专用密码 |
| `APPLE_TEAM_ID` | Apple 团队 ID |

显式 signed 模式缺少配置、签名或公证失败会停止构建，不能静默退回测试包；
产物还需通过 `codesign`、`spctl` 和公证票据检查。凭据只注入打包步骤，不能写进代码或应用。
本地正式构建使用相同 `MIMIR_MAC_SIGNING=signed`，将 Secrets 对应为
`CSC_LINK`、`CSC_KEY_PASSWORD`、`CSC_NAME` 及三个 `APPLE_*` 环境变量。
当前 ad-hoc 用户仍需手动安装首个正式签名版本；启用正式自动更新前必须完成真实跨版本验证。

工作流构建及启动自检不能替代各系统的安装器、系统信任提示与真实跨版本升级验收。
首次发布后需单独验证匿名下载、NSIS 安装、AppImage 启动和用户资料保留，
Windows/Linux 的本地模拟测试不能当作对应平台已通过。
fnOS 的 Ubuntu 构建、原生模块和宿主检查也不能代替真实 fnOS 设备的安装与升级验收。

v0.1.3–v0.1.6 的自动更新准备阶段存在已知关闭缺陷。使用这些版本的用户请先手动安装
[v0.1.7 或更新版](https://github.com/bijinfeng/mimir/releases/latest)，再使用后续自动更新。
已有两个公开稳定版本、且目标版本为官方 latest 后，可执行真实升级验收（以下版本需已发布）：

```sh
gh workflow run desktop-update-verify.yml --ref master -f base_version=0.1.7 -f target_version=0.1.8
```

该工作流在一次性 Windows/Linux runner 上匿名下载旧安装包，驱动真实更新界面，
验证普通退出不安装、编辑保存保护、确认安装后的自动启动及文档和模式保留。
日志、状态和截图保存在对应 Actions artifact；它不验证 macOS 正式签名升级或系统通知投递。

完整检查运行 `pnpm check`。服务器部署参见[技术契约 §8](.trellis/spec/project/architecture.md)。

## 账号与安全

单用户实例建议设置 `OWNER_EMAIL` 和 `OWNER_PASSWORD`：服务端启动时创建
或同步所有者账号，避免首次注册窗口被他人抢先使用，也提供重置密码的路径。
两项必须同时设置；生产环境必须显式设置 `AUTH_SECRET`。
不要将自托管服务裸露在公网；部署与备份要求见[技术契约 §8](.trellis/spec/project/architecture.md)。

## 文档

AI agent 开工从 [Trellis 项目入口](.trellis/spec/project/index.md) 查找规范与历史原因。
日常修改不必逐次登记：只有现行契约改变才
更新其唯一归属文档；验证记录留在提交或 PR，不追加过程文档。

`output/` 是静态交互原型，可能保留早期形态；现行行为以 Trellis 中的
[产品](.trellis/spec/project/product.md)、[技术](.trellis/spec/project/architecture.md)和
[设计契约](.trellis/spec/project/design.md)为准。
