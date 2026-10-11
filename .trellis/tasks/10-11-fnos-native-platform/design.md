# fnOS 原生包技术方案

## 边界与产物

新增独立的 `apps/fnos/` 包装层：维护 fnOS `manifest`、图标、入口、向导、权限及生命周期脚本；`pnpm fnos:build` 在 Linux x86_64 构建 Web、服务端并收集服务端生产依赖，组装 staging 目录后调用 `fnpack build`。不复用 Electron 壳，也不引入 Docker 运行时。应用包内置 Mimir 代码与 Linux x86_64 原生依赖，系统依赖仅为 `nodejs_v22`。

## 启动与数据流

1. `wizard/install` 收集所有者邮箱与密码；`install_callback` 验证输入，生成随机 `AUTH_SECRET`，以仅包用户可读的权限写入 `TRIM_PKGETC`。向导密码从环境读取、写入配置，绝不写入日志、打包 staging 或命令行。
2. `cmd/main start` 从持久配置读入变量；`DATA_DIR=$TRIM_PKGVAR/data`，`DATABASE_URL=file:$DATA_DIR/mimir.db`，`WEB_DIST=$TRIM_APPDEST/server/web/dist`，`NODE_ENV=production`，网关 Socket 位于 `$TRIM_APPDEST/app.sock`。服务端由 `nodejs_v22` 启动，不启用 Electron 的本地免登录令牌。
3. 服务端 SQLite 启动迁移并按 `OWNER_EMAIL`/`OWNER_PASSWORD` 创建或同步所有者账号。fnOS 模式下若建号失败，启动必须失败关闭；只有账号准备完成才监听网关 Socket。
4. fnOS 应用入口用 `iframe` 指向 `/app/mimir` 的统一网关。入口始终留在 fnOS 桌面窗口，HTTPS 环境由网关同源转发，避免将 HTTP 端口服务嵌入 HTTPS 页面。网关只负责 fnOS 会话门禁；服务端不信任 `X-Trim-*` 头来替代 Mimir 账号。
5. 服务端在 fnOS 模式监听 Unix Socket；请求经固定 `/app/mimir` 前缀进入。Web 构建的静态资产 base、TanStack Router basepath、API 传输、下载地址和绝对导航共用同一前缀；服务端只在 fnOS 入口剥离该前缀，原有根路径部署不变。认证适配仅在 fnOS 模式处理网关下的 baseURL、Origin、Cookie，禁止泛化为任意可信来源。
6. `cmd/main stop` 优雅终止受控进程，`status` 依据实际进程而非仅 PID 文件判断；重复调用幂等。Socket 冲突、Node 运行时缺失和配置无效写入 fnOS 可见错误日志。

## 数据、升级和回滚

`TRIM_PKGETC` 保存所有者配置和随机密钥；`TRIM_PKGVAR/data` 保存 SQLite、笔记、上传文件、头像与抓取内容。`TRIM_APPDEST` 放可替换程序文件及网关要求的临时 Socket；启动/停止时清理失效 Socket。覆盖升级保留 `etc`/`var`，启动时幂等迁移；升级脚本不覆盖既有配置，也不删除数据。卸载脚本不主动擦除用户数据。回滚代码前需要保留升级前的完整停机备份，旧代码未必能读取新 schema。

## 构建与兼容性

在 Linux x86_64、Node 22 上运行 `pnpm` 构建及 `deploy --prod`，检查 `better-sqlite3`、`sqlite-vec`、`@node-rs/jieba` 可加载；再用 `fnpack` 封装。`manifest.platform=x86`；最低 fnOS 版本以实机验证结果填写，不把文档示例当作测试结论。包内入口图标复用项目现有图标资源生成所需尺寸。

## 关键权衡

- SQLite 省去 Postgres/容器依赖，与现有桌面本地路径共用服务层；备份须保存停机后的整个数据目录和配置密钥。
- 统一网关增加了前端路径和 Socket 适配，但保证 HTTPS 下的 fnOS 桌面内嵌窗口可用。网关的 fnOS 会话门禁与 Mimir 自有账号同时生效；首版不接入 fnOS SSO 或开放 API。
- 首版只出 x86 包，避免把未验证的 ARM 原生二进制误标成跨架构。
