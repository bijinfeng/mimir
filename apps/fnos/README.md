# Mimir for fnOS

首版是独立的 fnOS 原生应用包，支持 x86_64。fnOS 管理安装、启停与桌面入口；Mimir 仍使用自己的邮箱密码登录。应用入口在 fnOS 桌面内嵌窗口，通过 `/app/mimir` 同源网关访问。首版不读取 fnOS 账号或共享文件，也不提供 ARM 包。

## 构建

在 Linux x86_64 上安装 Node 22、pnpm 12.4.2 和官方 `fnpack`，并确保 `fnpack` 在 `PATH` 中。于仓库根目录执行：

```sh
pnpm install --frozen-lockfile
pnpm fnos:build
```

也可用 `FNOS_FNPACK=/path/to/fnpack pnpm fnos:build` 指定工具路径。脚本构建前后端，用 `pnpm deploy --prod` 收集服务端依赖，检查 Linux x86_64 原生模块，最后调用 `fnpack build`。中间目录位于 `apps/fnos/staging/`，包输出位于 `apps/fnos/release/`。两者均不提交到 Git。构建机架构不匹配时脚本会直接拒绝，以免把 macOS 或 ARM 模块装进 x86 包。

## 安装与数据

在 fnOS 应用中心安装 `.fpk` 时填写所有者邮箱和至少 8 位的密码。安装脚本在首次启动前将凭据及随机鉴权密钥写入 `TRIM_PKGETC/config.json`，权限为 0600。配置不会写进 `.fpk`、命令行参数或应用日志。服务启动时先完成 SQLite 迁移和所有者建号，再开放网关 Socket；打开桌面图标后仍需使用 Mimir 账号登录。

`TRIM_PKGVAR/data` 保存 SQLite 数据库、笔记、上传文件、抓取内容和头像。`TRIM_PKGETC` 保存所有者配置与鉴权密钥。应用代码和 `app.sock` 位于 `TRIM_APPDEST`。停机后备份整个 `etc` 和 `var` 目录；只备份笔记目录不能恢复账号、设置、抓取件等内容。

覆盖升级保留持久化配置与数据。升级前先停机并备份 `etc`、`var`；数据库迁移发生在新版本启动时。旧版本代码未必能读取升级后的数据库，回滚时应同时恢复升级前的完整备份。卸载脚本不主动删除用户数据；fnOS 卸载界面中的数据保留选项仍需实机确认。

## 故障与限制

应用中心会显示启动脚本写入 `TRIM_TEMP_LOGFILE` 的简短错误；服务端详细日志在 `TRIM_PKGVAR/mimir.log`。Node 22 缺失、配置错误或网关 Socket 被占用时，启动失败并提示检查对应位置。不要把日志中的私人内容公开分享。

最低 fnOS 版本、安装权限、覆盖升级和 HTTPS 内嵌窗口行为仍需在 x86 fnOS 设备上验证。当前包不包含旧 Docker/Postgres 或 Electron 数据的自动迁移。
