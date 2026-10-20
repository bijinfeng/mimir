# 工作区关闭后宿主无法关闭：独立诊断与修复

2026-10-20。产品改动为 native-updater.ts / 对应测试、host-shutdown.ts / 新增对应测试、index.ts 的 closeHost 可选回调签名及转发。未改服务端、安装器或外部验收驱动，未提交/推送/发布。

## Findings (fixed)

- File: apps/desktop/src/main/native-updater.ts
- Issue: BrowserWindow 销毁不等于 Chromium Session 的连接池已关闭。真实预连接可继续占用本机 HTTP 连接，使 server.close callback 不返回并触发原有 15 秒 HostShutdown 超时。旧 catch 同时丢弃原始异常，只剩 recoveryRequired 通用提示。
- Fix: 保存握手成功且工作区仍一致后、窗口销毁前捕获其 Session；严格 await closeWorkspace 成功，随后将捕获 Session.closeAllConnections 作为 HostShutdown 的 beforeClose 回调。连接清理→HTTP/数据库关闭共用原 15 秒单门，index 只转发该可选回调。连接关闭或宿主关闭拒绝均保留 cause，并进入原 recoveryRequired，不调用安装器。保存拒绝或 beforeunload veto 时不关闭会话连接。原时间预算及失败保持规则没有放宽；超时后的迟到连接清理不再启动实际宿主关闭。独立复核指出初稿连接清理在门外，已修正并加入永不结算/迟到和累积预算回归。

## 原始现场及因果边界

真实官方 0.1.5→0.1.6 run 39423359375 Linux artifact 的 baseline-second.log 末尾显示：第二次真实 PATCH 200，随后 prepareWorkspace 进入 recoveryRequired=true，未出现安装器启动。旧 catch 没有保留原因，无法仅凭该 artifact 断言原始错误必定是超时。Windows 同轮已经越过宿主关闭并调用安装器，此处不将 Linux 现场泛化为 Windows 失败。

本机用真实 Electron 44.7.0 / Node 24.21.0、真实 server-deploy 生产宿主、临时数据目录及隐藏 BrowserWindow 复现同一路径。仅 /healthz 请求时关闭通过；加入真实 `session.preconnect({url: host.origin, numSockets: 2})` 后：

- 旧源码 native-updater 的 prepareInstall 路径：HTTP_CLOSE_CALL 有 3 个连接，HTTP close callback 不返回；15 秒后 HOST_GATE_CAUSE 明确为 `Error: 宿主关闭超时`，prepareWorkspace 包装为与现场相同的 recovery 提示，cause 被旧代码丢弃，Electron exit 3。
- 换入修复后的 native-updater / HostShutdown 源码、保持相同探针和生产宿主：窗口真实关闭后会话连接释放，HTTP close callback 于同一毫秒返回，NATIVE_HOST_CLOSE_RESOLVED，Electron exit 0。

日志为 host-close-native-before.log / host-close-native-after.log。探针 host-close-probe.cjs.txt 直接调用源码生成控制器的 prepareInstall，使用 setup surface 避免虚构保存 ACK；没有发起更新下载或安装。这是准备阶段的原生回归，不是公开版本升级成功证据。应用仍是开发态、安装能力 disabled；探针只访问私有准备回调作诊断。生成过程移除 TS 类型、相对 .js 转为 .mjs，并为 electron-updater 保留与产品 CJS 构建等效的依赖互操作，未替换业务分支。可复现生成器为 host-close-probe-generator.mjs.txt。

预连接缺陷得到直接红绿证明，且与 Linux 现场失败分支吻合；0.1.7→0.1.8 真正官方 Linux 验收仍需由主会话完成，以确认原始场景已修复。

## Findings (not fixed)

- File: apps/server/src/db/client.ts
- Issue: production 的 createSqlite/createPostgres 不把连接存入 dev 全局缓存，但 closeDb 只关闭该缓存。独立真实宿主探针在 HTTP 关闭及 closeDb resolve 后读取 Drizzle `db.$client.open`，仍为 true（host-close-db-observation.log）。因此生产 SQLite 实际关闭尚不能由 closeDb 返回证明。生产 PG 也有同一代码形状，但本次未运行 PG 关闭探针。
- Recommendation: 这是既有独立生命周期缺陷，并非本次 HTTP 超时原因；需保留生产实际连接用于关闭，并补真实 production 关闭回归。主会话已获精确证据并交由另一审查者独立修复，本代理不修改 server。它影响更新的数据库关闭合同，最终结论以另一代理的修复及验证为准。

上述独立问题随后已由 quality_check 修复并冻结，报告为 production-db-close-analysis.md。下述集成原生复验直接确认实际生产 SQLite 也已关闭，不再保留为当前未解决缺陷；原始观察日志保留作红证据。

## Verification

- Tests: 新增 2 项会话顺序/失败回归，旧实现 2 failed / 21 passed（host-close-regression-before.log）；最终 native-updater + updater + host-shutdown 聚焦 3 文件、40 项通过（host-close-regression-after.log）。
- Final tests: 连接清理补入共同时间门后，新增永不结算/迟到回归与单门累积预算回归；desktop 全包 14 文件、122 项通过（host-close-desktop-regression.log）。
- Fixture: BrowserWindow 销毁后 webContents getter 抛错，验证产品确实提前捕获 Session；deferred 会话关闭期间不得进入宿主关闭/安装，连接失败保留 cause 并阻止重试安装；原窗口 veto 回归断言不关闭连接。
- Native: 上述实际源码准备路径红 exit 3 / 绿 exit 0；预连接为 Electron 真实 API，非 HTTP Server mock。
- TypeCheck: desktop typecheck 通过。
- Lint / Format: 五个本轮源码的 oxlint、oxfmt --check 及 diff --check 通过（最终命令由本代理执行；发现的 mock 泛型/格式问题已直接修复）。
- 全仓质量门、打包及真正新版本升级由主会话继续；不得以本探针替代。

## 最终生产宿主集成复验（数据库修复冻结后）

与 quality_check 确认源码和真实驱动回归冻结后，独立执行 `pnpm --filter @mimir/server build` 和 `node apps/desktop/scripts/deploy-server.mjs`，均 exit 0，刷新真实生产构建及部署依赖。日志为 host-close-final-server-build.log / host-close-final-server-deploy.log；未编辑产品源码。

全新临时 userData/data 下运行真实 Electron 44.7.0 / Node 24.21.0，加载最新生产宿主，并用最终冻结的 native-updater / HostShutdown 源码生成探针。同样请求真实 Chromium preconnect，再执行实际更新准备回调。最终 host-close-final-native.log 明确记录：

1. `PRODUCTION_SQLITE_OPEN_BEFORE_CLOSE true`，原实际连接上的 `SELECT 1` 成功。
2. 真实工作区关闭、会话连接清理后，HTTP close callback 同毫秒返回。
3. `PRODUCTION_SQLITE_OPEN_AFTER_CLOSE false`。
4. 原已关闭连接实际查询被拒，`CLOSED_SQLITE_QUERY_REJECTED true`。
5. `NATIVE_HOST_CLOSE_RESOLVED`，真实 Electron exit 0。

最终原生脚本为 host-close-final-probe.cjs.txt。没有保留或修改任何用户数据，使用临时独立库；没有调用安装器。本结果验证生产宿主中的 Session→HTTP→实际 SQLite 关闭顺序，不代替正式公开包 0.1.7→0.1.8 的跨版本升级。原始 host-close-db-observation.log（open=true）及先前 native 红绿日志均未覆盖。
