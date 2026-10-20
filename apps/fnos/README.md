# Mimir for fnOS

首版是独立的 fnOS 原生应用包，支持 x86_64。fnOS 管理安装、启停与桌面入口；Mimir 仍使用自己的邮箱密码登录。应用入口在 fnOS 桌面内嵌窗口，通过 `/app/mimir` 同源网关访问。首版不读取 fnOS 账号或共享文件，也不提供 ARM 包。

## 构建

在原生 Linux x86_64 上安装 Node 22 和 pnpm 12.4.2。下载脚本使用官方固定版本 `fnpack 1.2.3`，先校验 SHA-256 和 ELF 架构，再写入指定位置。于仓库根目录执行：

```sh
pnpm install --frozen-lockfile
node scripts/fnos-fnpack.mjs /tmp/mimir-fnpack
FNOS_FNPACK=/tmp/mimir-fnpack pnpm fnos:build
node scripts/verify-fnos.mjs <已提交版本号>
```

`FNOS_FNPACK` 必须显式指定，构建时会再次校验同一个官方二进制。工具下载地址和校验值在 `scripts/fnos-fnpack.mjs` 中维护。构建要求 `apps/fnos/manifest` 与 `apps/desktop/package.json` 的版本完全一致；修改源码并提交版本后再发布，CI 不会临时改版本。

脚本构建带 `/app/mimir/` 前缀的 Web 页面和服务端，仅在打包阶段用 `pnpm deploy --prod --node-linker hoisted` 收集生产依赖，校验资源树不依赖仓库或包缓存，实际加载 SQLite、向量扩展、Jieba 字典和 Canvas，并检查原生 ELF 为 Linux x86_64。中间目录位于 `apps/fnos/staging/`，输出为 `apps/fnos/release/mimir-<版本>-fnos-x64.fpk`，两者均不提交到 Git。

验证脚本会解包真实 `.fpk`，检查包内版本、架构和运行时声明、资源完整性，再从解包目录启动服务，以统一测试账号验证 Unix Socket 网关、HTTP/HTTPS 代理登录 Cookie 和鉴权。测试配置与数据位于忽略的验证目录中，在打包完成后创建，不进入安装包。Ubuntu 原生构建和宿主烟测不能替代 fnOS 设备安装、桌面入口或覆盖升级验收。

## GitHub Actions 分发

`.github/workflows/fnos-build.yml` 提供手动构建和可复用工作流，使用 Ubuntu 24.04 x64 / Node 22。手动运行只生成 `fnos-x64` Actions artifact。稳定版由 `desktop-release.yml` 传入同一版本，等待 fnOS 与四个客户端全部构建、解包烟测和产物校验成功后，在同一个 GitHub Release 公开发布。

fnOS `.fpk` 使用应用中心手动安装和升级，不进入 Electron 自动更新安装路径。

## 安装与数据

在 fnOS 应用中心安装 `.fpk` 时填写所有者邮箱和至少 8 位的密码。安装脚本在首次启动前将凭据及随机鉴权密钥写入 `TRIM_PKGETC/config.json`，权限为 0600。配置不会写进 `.fpk`、命令行参数或应用日志。服务启动时先完成 SQLite 迁移和所有者建号，再开放网关 Socket；打开桌面图标后仍需使用 Mimir 账号登录。

`TRIM_PKGVAR/data` 保存 SQLite 数据库、笔记、上传文件、抓取内容和头像。`TRIM_PKGETC` 保存所有者配置与鉴权密钥。应用代码和 `app.sock` 位于 `TRIM_APPDEST`。停机后备份整个 `etc` 和 `var` 目录；只备份笔记目录不能恢复账号、设置、抓取件等内容。

覆盖升级保留持久化配置与数据。升级前先停机并备份 `etc`、`var`；数据库迁移发生在新版本启动时。旧版本代码未必能读取升级后的数据库，回滚时应同时恢复升级前的完整备份。卸载脚本不主动删除用户数据；fnOS 卸载界面中的数据保留选项仍需实机确认。

## 故障与限制

应用中心会显示启动脚本写入 `TRIM_TEMP_LOGFILE` 的简短错误；服务端详细日志在 `TRIM_PKGVAR/mimir.log`。Node 22 缺失、配置错误或网关 Socket 被占用时，启动失败并提示检查对应位置。不要把日志中的私人内容公开分享。

最低 fnOS 版本、安装权限、覆盖升级和 HTTPS 内嵌窗口行为仍需在 x86 fnOS 设备上验证。当前包不包含旧 Docker/Postgres 或 Electron 数据的自动迁移。
