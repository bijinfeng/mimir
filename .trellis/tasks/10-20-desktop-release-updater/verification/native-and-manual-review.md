# 原生关闭与 mac 官方资产缓存独立窄审

2026-10-20。按主会话分工，只读审查其他代理的 `workspace-close.ts/.test.ts`、`manual-update-smoke.mjs/.test.mjs` 与 `native-close-*`、`final-acceptance-review.md` 证据；本轮只新增本报告。没有修改产品、下载脚本、缓存或已冻结的 release-notes 文件；没有提交、远端变更或启动第二份实际 mac 更新下载。

## 结论

未发现本轮范围内需要修复的确定问题。原生关闭修复针对真实 getter 销毁时机，未削弱保存、beforeunload veto 或超时约束；官方下载缓存与精确续传最终仍以实际字节长度、完整 SHA-256 为通过条件。脚本门与原生复现证据不能替代后续真实发布版跨版本升级。

## 原生关闭

- 代码改动仅在关闭之前捕获 `target.webContents`，注册和移除 `will-prevent-unload` 使用同一 emitter。`target.isDestroyed()` 的早返回仍在 getter 前；已经销毁的窗口不会读取无效 getter 或再次 close。
- `closed` 后继续调用 BrowserWindow getter 的旧路径与 before log 中 `finish -> target.webContents.off` 的原生 `TypeError: Object has been destroyed` 匹配；强 fixture 在 `finishClose()` 先标记 destroyed 再 emit closed，getter 随即抛错，符合已观察的 Electron 生命周期。原来的清理测试在旧实现确实失败，而不是新增一个只镜像修复的测试。
- 独立读取保留的 `/private/var/folders/92/c09xsx4s6g34djybsfgz6byc0000gn/T/mimir-close-native-U4SIeh/workspace-close.mjs`，用 Node 22 `stripTypeScriptTypes()` 处理当前仓库 TS 后进行严格字符串比较，完全一致。归档探针只创建隐藏 BrowserWindow/data URL，专用 userData；before/after 均记录 Electron **44.7.0**，结果分别为 native uncaught 与 `NATIVE_CLOSE_RESOLVED`。本轮未再次启动 GUI，避免干扰正在进行的实际 mac 验收。
- `native-close-before.log` 与 after log 仅保存 stdout，本身不记录 shell exit code；报告中的 exit 2/0 与探针明确的 `app.exit(2/0)` 分支一致。没有将该探针误写为完整产品升级成功。
- 原有 veto 立即 reject、15,000ms 未关闭 reject、native close 抛错 reject 的行为和错误路径均保留；listener/timer 在完成或拒绝后清理。没有新增 preventDefault/destroy/强制关闭。
- 核对 native-updater 调用链仍是保存确认、`await closeWorkspace`、`await closeHost`、安装；捕获关闭异常后进入阻止状态，不能越过宿主或安装顺序。其回归覆盖保存同意后仍 veto、窗口超时/抛错及云端人工保存后仍 veto。

## 官方 ZIP 缓存、续传与路径

- `macZipAsset()` 首先校验正式精确 tag、非 draft/prerelease、精确架构 ZIP 名、固定仓库 browser URL、正整数 ID、精确官方 API URL、大小与 SHA-256。下载 helper 重新校验无路径分隔符的固定 ZIP 文件名、官方 API ID/URL、正整数大小和摘要；生产调用仅来自该已验证 asset。
- 新下载使用 200，已有非空残片只接受 206 与完整精确 `Content-Range: bytes offset-(size-1)/size`；不接受忽略 Range 后返回完整文件、错 offset/total 或 JSON 错误页。不可信响应在打开追加 writer 之前失败，测试确认旧残片不变。
- 最终用磁盘文件真实长度和流式 SHA-256 校验，而非仅相信 Content-Length 或 metadata。完整缓存也重新读取并核对摘要；同长度坏文件立即失败，不会绕过 HTTP/校验直接算成功。残片追加后的坏摘要同样失败。独立补充短体、超长体两种实际字节负例均拒绝；错误 asset URL 在调用 HTTP 前拒绝。
- 复用缓存必须显式绝对路径，lstat 为真实目录且不是符号链接，realpath 后直接位于系统 tmpdir、basename 符合此前 harness 根名。ZIP 自身 lstat 必须是普通文件且不是符号链接；不存在时 wx 创建，既有合法残片才追加。测试确认静态文件符号链接被拒绝，指向的无关文件字节保持。
- 缓存目录不会递归删除；其只存下载字节。应用/userData/replacement 总是在本次新建 mkdtemp 的独立 root 下，实际替换仅删除该 root 的 `installation/mimir.app`，不能因选择了旧缓存目录而删除旧 app、用户应用或用户目录。失败保留残片和诊断，损坏缓存不会自动删用户数据。
- 一小时总体 AbortSignal 与一分钟无数据 stall 控制器覆盖 request 和 streaming pipeline，每个实际 chunk 重置 stall；超时中止流并保留已接收字节，finally 清理 timer/abort。测试分别以短时间预算触发 stalled 和 overall 两条分支，并确认 stream cancel 及残片保留。最终校验使用有限的已下载文件；不声称这些单测证明当前真实网络下载已经完成。

## 本轮独立聚焦门

环境：Node **22.23.1**。

- `node --test apps/desktop/scripts/manual-update-smoke.test.mjs apps/desktop/scripts/update-smoke.test.mjs`：**16/16 pass**。
- `pnpm --filter @mimir/desktop exec vitest run src/main/workspace-close.test.ts src/main/native-updater.test.ts src/main/updater.test.ts`：**3 files / 42 tests pass**。
- `pnpm --filter @mimir/desktop typecheck`：routes generation 与 tsc --noEmit 通过；未产生路由源码差异。
- 四个审查源码文件 oxlint、oxfmt --check、git diff --check 通过；两个 manual 脚本 `node --check` 通过。
- 独立内联负例：拒绝短体/超长体、错误来源不发 HTTP；只使用本轮专用 `mimir-review-download-*` 临时目录并清理，未读取或修改 Mac worker 的实际下载缓存。
- 原生 probe 当前源逐字比较通过；本轮不重复全仓门或 GUI/实际下载。

## 后续边界

必须手动安装含关闭修复的新基线，再对随后正式目标运行完整升级；目标包里的修复不能修好旧基线进程。Windows/Linux 真实更新、当前 mac 手动替换、系统原生通知焦点、mac 签名/Gatekeeper 与 fnOS 实机生命周期均以主会话实际证据为准。本报告不把旧失败结果改成成功，也不为理论上的本机并发攻击扩展本次临时验收工具范围。
