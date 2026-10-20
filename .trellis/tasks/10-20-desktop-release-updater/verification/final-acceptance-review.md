# 最终外部验收入口独立审查

2026-10-20，`trellis-check` 只读审查；产品脚本、workflow、其他会话的记录均未修改。本报告检查真实跨版本执行路径和 fnOS 同版本发布证据，不把脚本测试或安装包构建视为升级通过。

## Findings (fixed)

无。本轮未发现需要修复的确定代码问题，未修改产品代码。

## Findings (not fixed)

未发现确定的 harness 运行阻塞。以下是仍需实际验收的边界，不是已确认的产品缺陷：

- Windows/Linux 0.1.3 → 0.1.4 必须以真实 workflow 日志、各平台 `result.json` 和截图确认。审查时仅有 v0.1.4 attempt 1 的构建记录；Intel 构建/安装验证已经成功，失败发生在 Actions `CreateArtifact` 上传服务重试耗尽，aggregate/publish 因而跳过。重跑与公开发布、真实升级结果由主会话记录，本文不预判结果。
- macOS ARM64 手动更新脚本尚无本轮真实执行结果。它检查真实手动入口并在自有临时目录完成官方 ZIP 替换；不点击“下载 macOS 版”，所以不能证明该按钮实际打开浏览器。此限制已写入脚本结果，不能将 ZIP 下载成功改写成按钮点击或自动安装成功。
- CDP 可验证没有自动创建更新详情窗口，不能验证系统通知实际投递或系统焦点；后两项仍需原生桌面验收。macOS ad-hoc 包不能声明 Gatekeeper、公证或自动安装通过。
- fnOS Ubuntu 原生构建、包内宿主与匿名下载证据完整；fnOS 设备上的安装/升级尚无证据。实际 NAS 生命周期不由 Linux Socket smoke 替代。

## 实际代码路径核对

审查文件：`update-smoke.mjs`、`update-smoke-lib.mjs`、`update-smoke-native.ps1`、`manual-update-smoke.mjs`、`desktop-update-verify.yml`，并交叉读取产品更新按钮、文档 GET 服务及已安装 electron-updater 6.8.9 实现。

- 自动更新仅运行在一次性 GitHub Windows/Linux x64 runner，拒绝已有默认 userData；启动的真实应用移除发布 token 与 Node 覆盖变量，固定官方源并逐阶段检查 latest/精确版本/大小/digest。
- Windows 仅首次 baseline 安装使用 `/S`；目标安装由真实 updater 发起，外部 UIAutomation 操作正常 NSIS 向导。缓存 `update-info.json.fileName` 与已安装 updater 的写入/读取契约一致，实际下载文件另核对公开资产 SHA-256。
- Linux baseline 保留官方含版本文件名；updater `AppImageUpdater.doInstall()` 对含版本名使用缓存安装文件名作为目标路径，符合脚本等待 `mimir-<target>-linux-x64.AppImage` 的判据；实际目标字节需匹配官方 digest。
- 保存验收暂停真实 PATCH 请求，使用真实 dirty/save guard，先验证“继续编辑”取消安装，再次编辑并验证“保存并重启”确实等待 HTTP 完成；未注入保存成功回应。脚本要求旧进程全部更换后，再观察已安装新版及原数据。
- macOS 使用自有应用副本及隔离 userData，普通 `BrowserWindow.close()` 后要求进程正常退出；实际替换仅删除自有临时 app。文档 `getDocument()` 明确只读，不产生访问时间写回，完整记录前后比较在当前 API 契约下成立。

## fnOS 同版本发布证据

- 正式发布 run [39397577723](https://github.com/bijinfeng/mimir/actions/runs/39397577723)，commit `c402ec5b8817764f14a68ef782049c9e42520a8e`：四客户端、`fnos / build`、aggregate 和 publish 全部成功；独立读取 job `118544247237` 的实际日志，确认固定官方 fnpack 1.2.3 / SHA-256 `54b97fa7b70968c4d05c79840f5daeff508957d0bb2062fdb0376d00d9615c93`。
- 该正式 job 日志明确输出 `verified FPK 0.1.3, 29759 portable files, native modules, real Unix Socket HTTP/HTTPS auth; no fnOS device installation claimed`，并两次成功加载 4 个包内 Linux x86_64 原生模块。较早的 `github-fnos-native-success.log` 是 0.1.1 测试运行，不能单独作为 0.1.3 的证据；本轮已补查正式 job。
- `public-v0.1.3-release.json` 为非 draft、非 prerelease 的 [v0.1.3](https://github.com/bijinfeng/mimir/releases/tag/v0.1.3)，含 15 个资产（七个安装包/FPK、三个 YAML、五个 blockmap）。FPK 资产 ID `658881928`，名称 `mimir-0.1.3-fnos-x64.fpk`，与客户端同一正式版本。
- 独立读取匿名预下载的 `/private/tmp/mimir-public-fpk-baseline.AVcmXO/mimir-0.1.3-fnos-x64.fpk`，实际大小 **170577623 bytes**，实际 SHA-256 **63fc06369b2419af3ce433809680787c97af1bd6688a336320b845e83b236117**；与公开 GitHub asset digest 及 `public-v0.1.3-fpk.json` 完全一致。直接打开 tar 读取 manifest，确认 `appname=mimir`、`version=0.1.3`、`platform=x86`、`install_dep_apps=nodejs_v22`。

## Verification

- Lint：pass；本轮 Node 22 下 oxlint 检查两个 smoke 及其 helper/tests，oxfmt 检查六个脚本/workflow 文件通过。
- TypeCheck：pass；复核既有最终完整 Node 22 `pnpm check` 日志 `FINAL_EXIT_CODE=0`，并确认同代码 `127d4b7af8d483521fea8e3ea3c9454a57535fc1` 的真实 GitHub CI [39397745471](https://github.com/bijinfeng/mimir/actions/runs/39397745471) 中 `pnpm check`、build、PostgreSQL 测试及 S3 smoke 均成功。本轮未修改类型化产品代码，未重复全仓门禁。
- Tests：pass；本轮 Node 22 重跑 `node --test apps/desktop/scripts/update-smoke.test.mjs apps/desktop/scripts/manual-update-smoke.test.mjs`，**8/8** 通过。
- 真实跨版本升级：本报告不登记通过，等待主会话实际运行及独立平台结果。

未发现确定代码问题，lint/type-check 证据通过；全流程完成状态仍须由上述未完成的实际验收决定。

## 首次真实升级执行后的关闭竞态修复

随后 v0.1.4 已正式发布，主会话触发真实升级 run [39408870875](https://github.com/bijinfeng/mimir/actions/runs/39408870875)。Linux job `118581416085` 失败；原始 artifact 完整保存在 `update-attempt1/linux/`，`result.json.success=false` 保留，不修改为成功。

确定问题位于外部 harness：10:35:30.841Z 成功记录官方下载/校验且未自动开详情；随后点击详情“稍后”，25ms 后 `Input.dispatchMouseEvent` 的 mouseReleased 尚未应答，窗口关闭触发 CDP target closed。真实 HTML 中按钮连接 `api.close()`，preload 使用同步发送关闭 IPC，主进程销毁详情窗口；这条路径允许 CDP 目标先于输入应答消失。清理时 `native-windows.txt` 仍存在主窗口 PID 3296；应用日志无崩溃证据，只有无 DBus 会话的通知告警。首次运行没有执行到实际安装，不宣称已完成升级。

本轮修复：

- `update-smoke-lib.mjs` 新增有类型的 `CdpTargetClosedError` 与实际鼠标点击 helper。仅明确指定关闭动作的 **mouseReleased** 可接受此类型异常，且必须另行确认对应 target 消失。普通点击断线、按下阶段断线、协议错误（即使消息同名）、renderer 异常和窗口未消失一律失败；已断开 session 的后续命令立即拒绝。
- `update-smoke.mjs` 仅“稍后”和主窗口“关闭”采用关闭确认；关闭详情后还要求主窗口正常响应、更新仍 downloaded。完整退出额外要求自行启动的应用进程 exit code 0、signal=null，并在结果记录真实进程退出，避免把应用崩溃当正常关闭。
- `update-smoke.test.mjs` 新增真实模拟 socket 销毁时序的回归，覆盖关闭回包竞态、实际消失确认失败、正常应答仍需消失确认，以及普通点击/按下/协议错误不得误放行。Node 22 **9/9** 通过；oxfmt、Node 语法、git diff --check 通过。完整 lint 无 error（既有警告保留）；桌面 routes:generate + tsc --noEmit 通过。

产品安装包与更新器未改动，不修改任何已公开 tag/资产。修复后需要以新 master SHA 重新 dispatch 完整验收，原 run 的 rerun 会继续使用旧 harness SHA，不能作为本次修复验证。
