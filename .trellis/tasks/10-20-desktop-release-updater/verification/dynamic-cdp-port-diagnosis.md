# Windows 安装成功后的 CDP 端口冲突

2026-10-20。只读检查 run `39426680220` / commit `d67c33125fa899e4c5595f038a88b442f7dd98f8` 的官方 Windows `0.1.5 → 0.1.6` 更新证据，下载的原始 artifact 保留在 `update-015-to-016-windows-attempt3/`。其 `result.json` 仍为 `success=false`，不改写失败结果。

## 实际已发生的行为

- 官方 updater 缓存包摘要验证、下载后普通退出不安装、真实 HTTP 保存挂起时取消安装三项继续通过。
- `nsis-update-wizard.log` 记录官方缓存路径进程的真实 `Next >`、`Finish` 两次 Win32 按钮点击，`actions=2`，完成后向导原窗口消失，`wizardExitCode=0`。目视 `nsis-native-009.png` 可见 “Completing mimir Setup”、已安装说明和勾选的 “Run mimir”；`010.png` 中原向导已关闭。
- `baseline-second` 正常 exit 0、无 signal。目标安装 exe 已发生替换，脚本于 `13:08:33.610Z` 记录新的四个进程 PID，与更新前 PID 集合完全不交。该记录发生在任何后续显式重新启动之前，实际自动拉起条件通过。
- 随后脚本通过原生正常关闭请求和 `noProcesses` 确认新应用进程消失，再显式启动安装后的应用，以核对真实版本和全文资料。这一步失败，完整资料、标签、文件夹、使用方式及最终正常退出断言没有执行，整体升级验收仍未通过。

## 已直接证明的失败原因

`upgraded.log:3-4`：新进程 `9528` 在 `13:08:35.598` 启动时输出 Windows socket `0x2740`：`Only one usage of each socket address ...`，随后 `Cannot start http server for devtools`。旧脚本每次显式启动均使用固定 CDP `127.0.0.1:19223`。最终 runner 在 `13:10:36.601Z` 报 `Timed out: CDP workspace renderer`，底层 `ECONNREFUSED 127.0.0.1:19223`。

同一个 `upgraded.log` 仍显示产品正常起本地 SQLite/HTTP、加载 renderer、认证和列表返回 200，以及 updater 的当前版本 `0.1.6` / latest `0.1.6`。因此这次直接阻塞点是外部调试监听端口绑定失败。run 没有记录冲突 socket owner，不能断言是某个残留进程、TIME_WAIT 或其他具体系统原因，也不能凭产品启动日志补记完整资料验证成功。

## 外部驱动修正及边界

每次显式 `launch` 前在 `127.0.0.1` 独占绑定一个系统分配的临时端口，验证地址/端口、释放探测 listener 后交给该次真实 Electron 启动；本次验收历史已使用的端口永不重用，系统重复分配时关闭该探测并重选，20 次仍重复则明确失败。绑定、关闭和无效地址错误均直接失败。实际进程绑定前存在其他进程抢占的普通端口交接窗口；不会吞掉真实启动/连接失败，也不会通过反复代启动产品补过。

每次显式启动的名称、PID、loopback 端口、endpoint 和时间即时保存到独立 `launches.json`，同时保留于最终 `result.json`。仅更新外部驱动的 CDP endpoint；产品自动拉起仍必须在后续显式 `launch('upgraded')` 之前由独立新旧进程检查证明。官方包摘要、保存保护、正常向导、目标字节变更、真实版本和资料/模式断言均保持原条件。

## 本机验证

- Node 22 的两个外部驱动测试文件共 26 项通过。新增真实 TCP 绑定验证非重复 loopback endpoint 且探测已释放；回归覆盖系统重复分配的重选/上限、所有探测关闭、bind/close 错误原样传播、非 loopback 和无效端口拒绝。
- 三个受影响 JS 脚本的 oxlint、oxfmt、Node 语法及 `git diff --check` 均通过。
- 本机测试不能替代 Windows/Linux 真实安装。此修正待独立审查后由主会话在官方 `0.1.7 → 0.1.8` 验收；未重跑旧 `5 → 6`，未改公开资产、产品或前次失败证据。
