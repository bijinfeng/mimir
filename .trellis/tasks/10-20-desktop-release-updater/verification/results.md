# 实现与验收记录

日期：2026-10-20。当前分支 master。

## 远端续验状态

用户后续已授权合并、推送、GitHub 构建与正式发布、真实更新验收，并扩展 fnOS 原生包一并发布。下方“本轮只修改本地”等内容为早期轮次的历史记录，当前事实以 [github-validation.md](github-validation.md) 及 Actions 实际结果为准。

master 已合并并推送五目标发布与更新功能。v0.1.7（3f35e8a）与 v0.1.8（e3a950f）均已完成四客户端和 fnOS 原生构建、真实 smoke、聚合与公开发布，各15资产。完整 CI39428258688/39431446416 的 check/build/PG/S3 全通过。v0.1.7 FPK 匿名全量170581061字节、SHA256=47e1e0cff50d204e2dc61d153718e927ce45c616a1a75d06fe39cc575c8899b1；v0.1.8 FPK也已匿名完整下载170575967字节，SHA256=8edfcb853f3894b8b7afc9baeb61c2b47cee1c14b1015ff95cf14d9529462231，与公开digest一致。

新手动基线7已包含真实窗口销毁、Chromium Session预连接和production实际DB连接关闭修复，保留保存/veto/原15秒统一关闭预算；原生红绿探针与独立审查通过。旧3/4/5/6公开说明已提示先手动安装7或更新版，原tag和全部资产身份/字节不变。

官方7→8首轮39437731315：Windows成功，Linux在精确包替换及自动拉起之后外部关闭协调失败，原始false保留attempt1。外部harness修复经过30项定向回归、PowerShell互操作编译和独立审查，master442cd13只改验收脚本/workflow/spec，正式7/8产品不变。

同官方7→8第二轮39441421036整体success，Windows/Linux均完成官方下载/hash、完成无自动详情、普通exit0不安装、挂起实际PATCH保存保护/取消、第二次保存200后真实安装、自动新PID、一次原生正常关闭与零进程、显式重开0.1.8及完整body/title/tags/folder/local保留；三个显式launcher各exit0无signal。Linux实际先8次空枚举后映射窗口，修复后才发送一次close；Windows真实Next/Finish、Run勾选和wizardExitCode0。全部原始artifact/ZIP摘要与逐entry比对、截图和完整job日志见update-017-to-018-attempt2。主会话与独立reviewer实际目视关键PNG；精确442cd13的完整新CI39441401694全部success，包含pnpm check/build/PG/S3。后续仅证据/任务/journal提交，产品、harness、workflow及spec源树保持该已验版本。

mac ARM64实际官方0.1.3→0.1.4手动ZIP替换已成功：真实标题栏/详情与manual能力、普通退出不安装、同一文档完整记录和本地模式保留；result.success=true、正常退出无遗留。它不代表0.1.8手动实测、系统浏览器下载动作、Gatekeeper、公证、自动安装或系统通知投递通过。

fnOS原生FPK/Socket认证和匿名下载不等于fnOS设备安装升级；原生通知投递与系统焦点仍需真实桌面证据，任务保持in_progress。以下历史轮次保留原始失败和当时状态，当前结果以新增远端证据为准。

## 历史首轮记录

分支：codex/desktop-release-updater。

## 验证边界

本轮只修改、测试和提交本地实现，不推送、不创建 tag、不 dispatch 远端 Actions，也不发布实际 Release。仓库已按用户要求改为 public，并已检查匿名可访问；目前没有首个正式 Release。

本机为 macOS ARM64，未提供 Developer ID/公证凭据。因此本机产物是 ad-hoc 测试包，更新能力为 manual。模拟 Windows/Linux automatic 状态和保存保护的测试不代表真实系统安装或真实跨版本升级通过。

## 结果矩阵

| 项目 | 结果/证据 |
|---|---|
| 发布脚本行为测试 | 实现 agent 已执行 11 项，通过；最终质量门再次覆盖 |
| Actions/YAML | actionlint v1.7.12 检查 desktop-release.yml 与 ci.yml 通过；配置解析通过 |
| 全仓 pnpm check | 最终运行通过，exit 0；lint/style/format/typecheck/test 全部通过。桌面 109 项、renderer 634 项、Office 2774 项、根 Node 17 项（含发布脚本 11 项）；见 quality-check.md 与 pnpm-check-final.log |
| 桌面生产构建 | 最终 pnpm desktop:build 通过，包含 server/desktop 生产构建、生产依赖部署与打包；见 desktop-build-final.log |
| 本机 DMG/ZIP 与包内检查 | 最终修复版 DMG/ZIP 构建、verify（manual、资源、更新依赖与原生模块）和 stage/SHA 校验全部通过；见 release-validation.md |
| 真实 Electron packaged smoke | 最终修复版真实 packaged smoke A/B/C 全通过（本地资源/免登录、首启无宿主、云端无桥且无本地宿主） |
| 真实组件 HTML/截图 | verification/ui/，76 组 HTML/PNG；独立 finish reviewer: ship（组件范围），documenter 确认沿用现行系统，无需新增全局规则 |
| 原生菜单/独立窗口/焦点 | CUA 已实测首启/本地/云端菜单、独立详情、手动检查与关闭返回；native/README.md 和 AX 记录。截图接口不可用，原生截图未取得，不能冒充通过 |
| 原生完成通知 | 尚无可供真实升级的 release；逻辑测试证明去重/不主动打开窗口，不能据此宣称系统通知实测通过 |
| 四目标 GitHub runner | 未运行，需后续授权执行远端 workflow |
| Windows/Linux 安装及实际跨版本升级 | 未执行，保留外部验收项；Windows 安装后 pnpm 链接可移植性须在实际系统验证 |
| 正式 mac 签名/公证升级 | 无凭据，未执行 |

## 收尾

UI 评审由 fresh default subagent 加载 shipped impeccable_finish_reviewer 角色完成，文档审查同样加载 shipped impeccable_documenter；宿主未注册专用 agent_type，未在构建线程自评。完整报告在 ui/finish-review.md 与 ui/documentation-review.md。Trellis 全范围复核与最终质量门已通过；代码、测试、规范和验收证据作为同一功能提交。此前 Office 加密保存等待断言曾失败，原文件复测、Office 整包和最终全仓检查均通过；保留原失败及复测日志，未放宽规则。任务保持 in_progress，等待上述外部验收；提交记录见 task.json 和开发日志。

工作提交：`fef57cca565a6d73f7ea3a2bb9eb6c5c0b4e32c5`。归档日志仅移除终端 ANSI 控制码、行尾空白与末尾多余空行，保留诊断与测试结果；原始输出可从该工作提交恢复。
