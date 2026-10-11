# 实施计划

1. 创建 `apps/fnos/` 原生包源文件：`manifest`、`config/privilege`、`config/resource`、`wizard/install`、`app/ui/config`、图标和 `cmd` 生命周期脚本。入口使用 `iframe` + 统一网关；脚本校验向导输入、持久化配置/密钥、限制文件权限，并实现 Socket 监听的幂等启停与错误报告。
2. 新增 Linux x86_64 构建与 staging 脚本及 `pnpm fnos:build`。构建 Web 和服务端、收集生产依赖和 `drizzle-sqlite`，检查原生依赖加载及前端资源，再调用 `fnpack build` 生成 `.fpk`。产物加入 `.gitignore`。
3. 增加 fnOS 固定前缀下的 Web 构建、Router、API、下载/导航路径适配；服务端仅在 fnOS 模式通过 Unix Socket 接收网关请求并映射前缀。测试静态资源、深路由、API 与鉴权路径都保持在 `/app/mimir` 下。
4. 对服务端做 fnOS 所需的最小认证适配：所有者建号失败时拒绝对外监听、网关 HTTP/HTTPS 下的 Cookie 与严格同源校验；为这些行为添加针对性测试，确认原有生产 HTTPS 与桌面本地模式不变。
5. 编写 fnOS 安装、账号、备份、升级和限制说明，更新现行部署契约。覆盖 `pnpm check` 和包结构/生命周期脚本测试。
6. 在 Linux x86_64 环境执行构建与 `fnpack` 校验；在 fnOS x86 测试设备执行首装、内嵌登录、编辑/上传/下载/检索、重启、覆盖升级、Socket 异常和卸载保留验证。若设备不可用，准确记录未验证项，不声称实机通过。

## 回滚点与检查门槛

- 第 2 步后检查 staging 中没有本机 macOS/ARM 二进制，也没有用户密码。
- 第 3 步后运行认证测试，并验证跨源请求仍被拒绝；若行为不清楚，停在该步先复现。
- 升级测试前做停机完整备份（`etc`、`var`），升级失败时先恢复数据副本再回滚程序。
- 最终执行 `pnpm check`；`fnpack` 与实机验证各自记录环境、命令和结果。
