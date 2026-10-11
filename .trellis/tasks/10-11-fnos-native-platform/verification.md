# 验证记录（2026-10-11）

## 已通过

- `pnpm check`：全仓 lint、格式、类型检查与测试通过；包含 fnOS Socket、认证、路径、包结构与生命周期测试。`git diff --check` 通过。
- 官方 `fnpack 1.2.3`（Linux amd64）从完整 staging 生成 `mimir.fpk`，大小约 191 MB；包在 `apps/fnos/release/mimir.fpk`（Git 忽略）。SHA-256：`b95a6d9813d102da041bc2ed2cdba1e8385da783e804335948c479da72889cc8`。
- 检查 `.fpk` 外层目录与 `app.tgz`：包含 manifest、向导、生命周期脚本、Web `index.html`、服务端入口、SQLite 迁移与原生模块。
- 将 `.fpk` 解包后，在 Node 22 的 Linux x86_64 容器中实际加载 `better-sqlite3`、`sqlite-vec`、`@node-rs/jieba`；所加载的三个文件均为 x86_64 ELF，且位于部署目录内。
- 用解包后的应用和测试凭据模拟 fnOS 目录及 Unix Socket 网关：`/app/mimir/healthz` 200、页面入口 200、未登录 API 401、同源邮箱密码登录 200；模拟 HTTPS 转发的登录也返回 200，Cookie 带 `Secure` 和 `Path=/app/mimir`。测试凭据只位于临时目录，未进入包或仓库。

## 构建环境说明

工作机是 macOS arm64。Colima 提供 Linux x86_64 容器与 Node 22，但 pnpm 12.4.2 的 Rust I/O 驱动在 QEMU 中崩溃，因此未能在模拟 x86 环境直接运行完整的 `pnpm fnos:build`。这次用 pnpm 的 `--cpu=x64 --os=linux --libc=glibc` 在本机准备生产依赖；在本机构建与平台无关的 Web/服务端 JS；再用 x86_64 容器完成原生模块加载、官方 `fnpack build`、解包及启动冒烟测试。文档化的一键命令仍需在原生 Linux x86_64 环境执行一次。

## 仍需 fnOS 设备验收

提供的域名是 HTTPS 转发入口，其公共地址的 SSH 225 端口拒绝连接；已请求可直连的 SSH 主机。当前没有声称实机通过。设备上还需验证：应用中心首装与启停、桌面内嵌窗口的 HTTPS 登录及网关 `Host`/`Origin`/`X-Forwarded-Proto`、编辑/上传/下载/检索、重启和覆盖升级后的数据与密钥保留、Socket 故障提示、卸载保留选项。
