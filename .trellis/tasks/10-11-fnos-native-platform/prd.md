# fnOS 原生应用包

## Goal

让单用户 Mimir 以 fnOS 原生 `.fpk` 应用包交付，用户能在应用中心安装、管理和打开，并在重启与升级后保留全部实例数据。

## Background

- 用户已选择原生应用包，而非 fnOS Docker/Compose 适配；首版只支持 x86_64。
- 首版是独立应用：fnOS 管理安装和生命周期，Mimir 继续使用自身账号、数据与权限；首次安装在 fnOS 向导中设置所有者邮箱和密码。
- 现有服务端可用 SQLite 自动迁移，且同一 Node 进程可以提供 Web 静态资源。服务端包含 `better-sqlite3`、`sqlite-vec`、`@node-rs/jieba` 等原生依赖。
- fnOS 原生包有 `manifest`、应用入口、生命周期脚本与持久化 `etc`/`var` 目录；运行时可声明 `nodejs_v22` 依赖。官方依据：<https://developer.fnnas.com/docs/core-concepts/framework/>、<https://developer.fnnas.com/docs/core-concepts/runtime/>、<https://developer.fnnas.com/docs/core-concepts/manifest/>。

## Requirements

- R1. 提供可重复构建的 x86 `.fpk`：包含 Mimir Web、服务端、SQLite 迁移与 Linux x86_64 原生依赖，声明所需 fnOS Node 运行时；从应用中心完成安装、启动、停止、状态查询和打开。
- R2. 安装向导收集所有者邮箱和至少 8 位的密码；保存配置时不把密码写入包、命令行或日志。首次可访问时，所有者账号须已建立，不能出现先注册先得的窗口。
- R3. SQLite 数据库、笔记、上传文件、头像、抓取内容、鉴权密钥和实例配置放在 fnOS 持久化应用目录；应用重启和覆盖升级后保留且可继续读取。卸载时不擅自删除用户数据。
- R4. 从 fnOS 桌面入口在内嵌窗口打开 Mimir；使用 fnOS 同源网关访问，但继续要求 Mimir 自有账号登录，已有笔记、上传、检索与编辑功能可用。网关 Socket 或依赖/配置错误应明确报错。
- R5. 保持浏览器、Electron 和 Docker 现有行为与检查通过。

## Acceptance Criteria

- [ ] AC1 (R1, R4). 在 Linux x86_64 构建环境执行文档化命令生成 `.fpk`；目标 fnOS 能安装、启停、显示状态并在桌面内嵌窗口打开。
- [ ] AC2 (R2, R4). 使用安装向导提供的邮箱和密码登录成功，未授权请求仍被拒绝；首次服务可访问前账号已创建。打包产物与日志不含明文密码。
- [ ] AC3 (R3). 首次创建笔记和上传文件后，重启及覆盖升级仍可读取；同一实例的数据库与鉴权密钥保持一致。
- [ ] AC4 (R4). 网关 Socket 不可用和运行时/配置缺失时，fnOS 应用中心显示可操作的错误；`start`/`stop`/`status` 重复调用安全。
- [ ] AC5 (R5). `pnpm check` 通过；现有 Web、Electron、Docker 入口没有行为回退。
- [ ] AC6 (R4). 在 fnOS 桌面内嵌窗口完成登录、编辑、上传、下载及检索；fnOS 使用 HTTPS 时页面与 API 无混合内容或跨站 Cookie 问题。

## Out of scope

- ARM64 包、Docker 模板、fnOS 应用商店上架。
- fnOS 账号单点登录、开放 API、共享文件授权、文件管理器右键入口。统一网关仍会先校验 fnOS 登录态，但不代替 Mimir 登录。
- 从已有 Docker/Postgres 或 Electron 实例自动迁移数据。

## Deferred validation

- fnOS 最低系统版本以实际可安装和测试的版本为准，不能仅凭文档示例声明支持范围。
- 当前工作机是 macOS arm64，未安装 `fnpack` 且 Docker daemon 未运行；目标 fnOS 上的安装、升级和权限验证需要 x86_64 构建环境及 fnOS 测试设备。
