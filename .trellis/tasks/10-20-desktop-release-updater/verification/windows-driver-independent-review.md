# Windows NSIS 驱动独立审查

2026-10-20。按主会话冻结通知只读审查 update-smoke-native.ps1、update-smoke.mjs、desktop-update-verify.yml 与 windows-nsis-driver-diagnosis.md。只写本报告，不修改实现/诊断/历史artifact，不提交或远端操作。Linux未冻结变更不在本报告范围。

## 最终结论：实现与聚焦门通过，真实Win32待runner

驱动本身未发现确定的边界或验收放宽。初审的单平台矩阵问题已修复并独立复核：matrix.include用fromJSON直接生成目标，无exclude。读取当前表达式中的三个JSON分支并断言，windows只含windows/windows-2025、linux只含linux/ubuntu-24.04、默认all恰含两个目标；诊断文档也已同步改成直接生成，未继续使用错误exclude描述。无需先生成未选目标后再依赖过滤。

本报告只确认实现/静态策略，不把本机self-test或矩阵检查改写为真实Windows更新已通过。

### 初审发现：include-only 矩阵再 exclude（已修复，保留记录）

当前matrix用include列出Windows/Linux，再根据platform传exclude。GitHub矩阵先对轴展开应用exclude，再处理include；include仍可加回被排除目标。这不等于“先构造两个job再过滤”，因此platform=windows/linux可能仍运行两个平台。actionlint语法通过不能证明这里的行为正确。

已向主会话报告：应直接让matrix.include用fromJSON按输入生成一条或两条完整目标对象，移除exclude；诊断文档当前关于exclude在job前过滤的表述也需要同步改正。后续复核将核对三种输入的确切输出。

## 已核对的驱动边界

- Node从已安装包app-update.yml取安全cacheDirName，再从pending/update-info.json取安全basename；完整缓存文件大小及SHA-256须匹配公开官方target asset，随后仅把此路径/摘要交给向导驱动。驱动再次读取文件核对摘要。
- 窗口必须visible、精确#32770类、mimir Setup标题、进程MainModule.FileName与官方缓存绝对路径大小写不敏感完全相等。不可读取进程路径则不可点击；同名异路径不合格。
- 控件必须在该窗口内、Button、ID1、visible/enabled；仅精确Next/Install/Finish及对应中文前进文字允许。Cancel、Back、Run、文本前缀相近内容不允许；不会更改per-user或运行应用选项。
- 点击前C#重查真实HWND/PID、root parent、控件类/ID/原文字/可见启用状态，明确前台后发送正常BM_CLICK，SendMessageTimeout为3秒；没有启动目标安装器或目标应用，也没有给目标更新传/S等旁路参数。
- 原先仅baseline首次安装的install动作仍可/S；wizard分支不执行它。实际目标安装只来自客户端quitAndInstall。Finish须被真正点击且原窗口15秒内消失，驱动才exit0；八分钟到期或点击失败为失败。
- Node仍独立检查安装文件改变、真实新进程自动出现、目标版本、原文档/标签/文件夹/模式保留，不能用Finish消失或driver exit0代替完整升级。保存/真实HTTP/旧进程判据没有改变。
- Win32实时枚举、跨进程控件文字和BM_CLICK的可用性尚需真正Windows runner；本机策略fixture/C#编译不等于已经操作原生向导。旧run继续保留失败。

## 本轮独立聚焦门

使用现有临时PowerShell7.5.4 macOS arm64 runtime，设置GITHUB_ACTIONS=true只调用self-test，**策略fixture+全C# interop实际编译通过**。此路径不调用user32原生方法，不启动安装器。自测覆盖精确路径、错误路径/null、标题/类、按钮ID、visible/enabled、caption白名单、Finish及原生字段/JSON序列化。

Node22对update-smoke.mjs语法、oxlint、oxfmt及workflow格式检查通过。actionlint不在当前shell PATH，本轮不声称独立重跑；作者已有语法证据仍不能代替待修复matrix行为。之前的23项Node helper回归已有独立通过，本次脚本diff仅新增缓存路径返回与参数传递，未为此重复全仓或下载。

最终复核没有改动任何实现或其他代理文件，未提交/远端操作。Linux审查另见独立host-session报告。
