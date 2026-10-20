# Trellis quality review

2026-10-20，检查范围：本任务的发布工作流/脚本、desktop 主进程/preload/更新窗口、共享保存握手、shared 契约与现行规范。未创建 tag、推送或发布 Release。

## Findings (fixed)

- `apps/desktop/src/main/native-updater.ts`、`updater.ts`：electron-updater 6.8.9 的 `BaseUpdater.install()` 会捕获安装启动异常并发 `error`，原 adapter 仅记录日志，关闭工作区后可能一直显示 restarting。现在只在真正启动安装器后将同步/迟到 error 转为 blocked/recoveryRequired，不能重复安装。
- `apps/desktop/src/main/index.ts`、`native-updater.ts`：安装器失败后仍保留 preparing 标志，关闭最后的详情窗口可能留下无窗口进程。恢复状态解除该标志；还有详情窗口就显示恢复说明，无任何窗口则正常退出，不重建宿主。
- `apps/desktop/src/main/native-updater.ts`：GitHubProvider 的 latest-not-found 包装码不能证明没有发布，空 feed 也不保证有该 code。仅在检查失败时用固定官方 latest API 的真实 HTTP 404 确认 unpublished；有 Release 的网络/解析失败及权限错误保持 error。
- `apps/desktop/src/main/updater.ts`：升级成功通知抛错可能阻止定时检查初始化。现在记录通知失败后仍创建检查计划；通知不可用不阻止更新入口。
- `apps/desktop/src/main/workspace-close.ts`、`index.ts`：普通关窗/菜单退出/模式切换被 beforeunload 拒绝时此前没有可见反馈。经主会话确认，增加仅“返回文档”的原生说明，不绕过 veto；更新准备中跳过，避免和更新 blocked/保存 guard 重复。
- `apps/desktop/src/renderer/update/UpdatePage.test.tsx`：同帧去重测试的第二个请求未结算；卸载前显式结束该 promise。
- `.trellis/spec/desktop/runtime/releases-updates.md`、`pitfalls.md`、`project/architecture.md`：补齐上述运行契约，并修正仍描述“先建新窗再关旧窗”的旧文字，和 WorkspaceTransition 真实关闭后替换的实现一致。
- 上述回归测试明确 mock 类型参数，保持既有 lint 规则。

## Findings (not fixed)

未保留已知的代码缺陷或待定交互判断。以下属于外部验收边界，不能用本地模拟补充为通过：四目标 GitHub runner、Windows/Linux 真实安装与跨版本更新、实际发布后的匿名资产下载、正式 macOS 签名/公证与跨版本安装、系统完成通知的真实投递。主会话和 release agent 另记本机包与 GUI 证据。

## Verification

- 聚焦回归：`pnpm --filter @mimir/desktop exec vitest run src/main/updater.test.ts src/main/native-updater.test.ts src/main/workspace-close.test.ts src/renderer/update/UpdatePage.test.tsx`，4 文件 / 50 测试通过。
- `git diff --check`：通过。
- 全仓最终 `pnpm check`：**通过，exit 0**（13:45–13:50），完整日志 `pnpm-check-final.log`。lint（原有 warnings 不改规则）、样式守卫、format、全仓 typecheck 和全部 test 链均完成。桌面端 12 文件/109 测试、renderer 85 文件/634 测试、Office 235 文件/2774 测试均通过；根 Node 测试 17 项通过，其中发布脚本行为测试 11 项。
- 保留一次中途失败记录：未改动的 Office 加密保存等待断言未及时完成（其余 2773 项通过），输出 `pnpm-check-worker-wait-failed.log`。按原规则单跑该文件 13/13 通过（`office-encryption-rerun.log`）；打包结束后 Office 整包 235 文件/2774 项通过（`office-package-rerun.log`），然后最终全仓再次全过。未调整 Office 源码、超时、并发设置或断言，不将 CPU 竞争的推测写成确定根因。
- 发布行为测试、actionlint、最终打包、真实 packaged smoke 和原生 GUI：见 release agent 与主会话的独立验收记录，不在本检查中冒领执行结果。

## 检查结论

已沿实际代码核对专用更新窗口 wc/frame/精确 file URL 校验、工作区只读 API、nonce/导航取消与保存后新改动保护、云端无 preload、保存→真实 close→宿主关闭→安装器顺序、普通退出不安装、下载完成不主动打开窗口、持久通知去重，以及 mac 双架构元数据合并与完整 draft 才公开。
