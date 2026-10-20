# 数据库实际连接关闭独立审查

2026-10-20。在作者最终冻结后，只读审查 `apps/server/src/db/client.ts`、新增 `src/test/db-client-close.test.ts`、全仓调用与相关规范。只写本报告，不改实现、不提交或推送。宿主 Session 关闭审查另见 `host-session-independent-review.md`。

## 结论

冻结的源码修复和真实驱动测试通过独立审查，未发现阻塞问题。原生产连接不写入开发 HMR 全局缓存，旧 closeDb 却只关闭该缓存，因而错误返回成功；模块现在持有工厂实际交给 Drizzle 的连接，生产新建和开发复用两种路径均获得正确引用。

- SQLite 的 close 同步执行；成功后才清模块引用。PG 仍 await 同一客户端的 `end({ timeout: 1 })`，保留已有参数与等待语义；此次未增加超时或改驱动配置。
- 两条路径只在全局缓存仍等于被关闭实例时清该缓存，避免删除其他实例的引用。关闭抛错/拒绝时，后续清理语句不执行，错误向调用方传播，不伪装成成功。生产不新增全局缓存。
- 成功后重复 closeDb 立即返回。源码没有关闭后重建导出的 db；本 API 属于进程收尾，调用方不应把成功关闭解释为可以继续使用同一个 db。

## 全仓调用与重复关闭/重开边界

检索包含隐藏目录及 `.mjs` 调用，排除生成产物/依赖/历史截图；实际调用点为桌面 host.ts、fnOS launch.mjs、迁移 CLI、测试 globalSetup 和迁移/本次关闭回归。

- 桌面等待 HTTP server.close 后 await closeDb；外层 HostShutdown 缓存同一次操作。index.ts 只在宿主关闭成功后置空 host，安装准备失败进入恢复状态；没有发现关闭成功后在同一进程重启该 server/db 的实际路径。
- fnOS 生产仅选择 SQLite；launch 的信号回调先关闭 HTTP、再调用 closeDb、最后退出。当前 SQLite 分支在返回 Promise 前同步完成连接关闭；该调用点不是 PG 等待验证，也不能证明 fnOS 真机停止/升级已验收。
- 迁移脚本仅在 main 收尾关闭，catch 中的重复关闭用于失败清理；migration-journal-upgrade 的两次迁移发生在关闭前。globalSetup 关闭迁移所用连接后，测试 worker 使用独立模块环境。开发 HMR 不调用 closeDb，不依赖关闭后复用旧 db。
- postgres.js 的 end 保存终止操作状态，底层连接 end 也有关闭门；桌面自身另有关闭去重。本次新增测试里的“并行重复关闭”发生在首次关闭已完成之后，不能将它描述为测试了首次 PG 关闭仍在进行时的并发。

## 测试与证据

独立执行，Node 22.23.1：

- `pnpm --filter @mimir/server exec vitest run src/test/db-client-close.test.ts`：1 文件、2 项生产/开发 SQLite 用例通过。
- `pnpm exec oxlint apps/server/src/db/client.ts apps/server/src/test/db-client-close.test.ts`：通过。
- `pnpm exec oxfmt --check apps/server/src/db/client.ts apps/server/src/test/db-client-close.test.ts`：通过。
- 对冻结源码和新增测试运行 git diff --check：无差异空白错误。

测试通过新子进程在模块加载前设置环境，不复用 Vitest 已有数据库；SQLite 使用临时文件，写读真实行，验证客户端 open=false、实际查询被拒绝、缓存清除和后续重复关闭，再用独立新连接读取原行。它证明关闭后的文件数据保留，没有声称同一导出 db 能重新打开。原驱动与 close 方法均未 mock。

独立阅读作者 `production-db-close-before.log`（生产真实 handle 仍 open，1 失败/1 通过）和 `production-db-close-after.log`（2/2 通过），以及 `production-db-close-postgres.log`（真实 PG 生产/开发 2/2）。PG 测试使用独立 mimir_test 数据库、只写 session 临时表，第二连接确认真实 backend PID 从 pg_stat_activity 消失，原客户端查询得到 CONNECTION_ENDED。该 PG 数据库由作者创建并清理，本审查未重建数据库或重复运行 PG；server 类型检查同样引用作者结果，不冒充独立重跑。

## 生产集成边界

旧 `host-close-db-observation.log` 明确记录 HTTP 关闭完成但 `PRODUCTION_SQLITE_OPEN_AFTER_CLOSE true`，是产品缺陷的原生证据，保留不改写。

已独立阅读集成代理最终 `host-close-final-native.log`、`host-close-final-probe.cjs.txt` 和 `host-close-final-server-{build,deploy}.log`，并核对部署产物 `apps/desktop/server-deploy/dist/db/client.js` 包含本次实际引用修复。server build/deploy 已完成；真实 Electron 44.7.0/Node 24.21.0 通过 startHost 设置 production 环境，使用新临时 data/userData、真实 HTTP healthz 和 Session preconnect。probe 捕获的 db.$client 与宿主导入的同一部署 client.js 对应。真实 prepareInstall/HostShutdown 路径之后，日志顺序为：

`PRODUCTION_SQLITE_OPEN_BEFORE_CLOSE true` → `HTTP_CLOSE_CALLBACK` → `PRODUCTION_SQLITE_OPEN_AFTER_CLOSE false` → `CLOSED_SQLITE_QUERY_REJECTED true` → `NATIVE_HOST_CLOSE_RESOLVED`。

因此最终生产宿主探针同时证明 HTTP 和实际 SQLite 句柄关闭；原句柄的真实 SELECT 被拒绝，未把仅 HTTP 回调完成当成全部成功。此次为审阅集成代理证据，未重复执行 probe。surface=setup 隔离宿主关闭，不调用安装器；真实 Windows/Linux 官方版本安装、重启拉起及资料/模式保留仍须实际验收。
