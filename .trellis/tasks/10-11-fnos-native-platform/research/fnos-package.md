# fnOS 原生包调研（2026-10-11）

## 官方资料

- [应用框架](https://developer.fnnas.com/docs/core-concepts/framework/)：根目录 `manifest`、`cmd`、`config`、`wizard`、`app`；安装后 `TRIM_APPDEST` 指向应用文件，`TRIM_PKGETC` 指向配置，`TRIM_PKGVAR` 指向持久化数据。`cmd/main` 处理 `start`、`stop`、`status`，`status` 未运行返回 3。
- [Manifest](https://developer.fnnas.com/docs/core-concepts/manifest/)：`platform=x86` 只声明 x86；带架构二进制时不能用 `all`；服务类应用可设置 `ctl_stop=true`、`service_port` 与 `checkport`。最低系统版本应依据实际测试。
- [运行时环境](https://developer.fnnas.com/docs/core-concepts/runtime/)：可声明 `install_dep_apps=nodejs_v22`，运行时路径 `/var/apps/nodejs_v22/target/bin`。
- [应用入口](https://developer.fnnas.com/docs/core-concepts/app-entry/)：`app/ui/config` 可注册 `iframe` 类型的 fnOS 桌面内嵌窗口。用户选择该体验。
- [统一网关](https://developer.fnnas.com/docs/core-concepts/gateway-registration/)：`gatewayPrefix=/app/mimir`、`gatewaySocket=app.sock` 通过 fnOS 同源路径转发到 `TRIM_APPDEST/app.sock`；服务端必须监听 Unix Socket，前端页面、资产、API 和路由均在此前缀下。网关先校验 fnOS 登录，但应用仍需自身鉴权。
- [用户向导](https://developer.fnnas.com/docs/core-concepts/wizard/)：`wizard/install` 的字段以同名环境变量传给生命周期脚本；敏感字段用 `password`，脚本中仍需再次校验。
- [权限](https://developer.fnnas.com/docs/core-concepts/privilege/)：普通长期运行服务应使用专用 `package` 用户；未集成用户文件访问时无需额外目录授权。
- [fnpack](https://developer.fnnas.com/docs/cli/fnpack/)：`fnpack build --directory <path>` 生成 `.fpk` 并检查基础结构。打包后仍需在 fnOS 设备上实测。

## 仓库证据与实施约束

- `apps/server/src/boot.ts` 在 SQLite 模式启动时应用迁移，然后创建所有者账号。`ensureOwnerAccount` 当前捕获失败并允许继续启动；fnOS 首装需要额外的失败关闭约束，确保向导配置失败不暴露首次注册窗口。
- `apps/server/src/auth.ts` 生产模式强制 Secure Cookie，默认 `baseURL` 来自 `SERVER_URL`，`trustedOrigins` 当前只含开发 Web 源。fnOS 网关与桌面页面同源，但前缀、HTTP/HTTPS 和 Origin 仍需实测；不能宽泛信任所有 Origin。
- `apps/web` 的 Vite 构建默认根路径，`packages/renderer` 的 Router/API 默认根路径，部分组件直接写 `/api/...`。使用 fnOS 网关前缀时，必须统一处理资源、路由、API、下载与重定向，而不是只改入口 URL。
- `apps/server/src/lib/static.ts` 支持 `WEB_DIST` 指定产物目录；`apps/server/src/env.ts` 支持 `DATA_DIR` 和 SQLite 路径；`apps/server/src/db/migrate.ts` 相对服务端目录寻找 `drizzle-sqlite`。
- `apps/server/package.json` 包含 `better-sqlite3`、`sqlite-vec`、`@node-rs/jieba` 原生依赖；必须在 Linux x86_64 环境收集生产依赖并做加载检查。`apps/desktop/scripts/after-pack.mjs` 已有服务端 deploy 产物复制先例。
- 规划机为 macOS arm64；本机未安装 `fnpack`，Docker daemon 未运行。静态检查可在本机完成，Linux x86_64 打包及 fnOS 实机验收另需对应环境。

## 待验证的技术细节

- `fnpack` 对向导端口占位符、图标格式和脚本执行位的实际校验，以最终工具运行结果为准。
- Better Auth 在 fnOS 网关前缀及 HTTP/HTTPS 下的登录 Cookie / Origin 行为，需要运行时测试后确定最小服务端适配。
