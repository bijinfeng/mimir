# Windows NSIS 外部向导驱动诊断

2026-10-20，针对 run `39423359375` 的官方 `0.1.5 → 0.1.6` 验收。历史结果保留在 `update-015-to-016-attempt2/windows/`，仍为失败，不改写成升级成功。

## 证据与原因

Windows 已完成真实保存、宿主关闭，日志显示显式 `quitAndInstall` 已发起，原 `baseline-second` 进程正常 exit 0。NSIS 进程启动后，旧外部驱动在 8 分钟内 `actions=0`，最终 exit 1；未执行安装，不能将此阶段当作升级完成。

实际目视检查 `nsis-native-001.png`：`mimir Setup` 停在 “Choose Installation Options”，per-user 已选，说明当前已存在基线安装路径，并有可见的 `Next >` 和 `Cancel`。同刻 `nsis-native-001.json` 中 Setup 的 UIAutomation `buttons=[]`；最后快照仍停在同一页。这直接支持旧 UIA 枚举没有暴露实际存在的标准控件，而不是向导缺少可执行的下一步。没有证据支持改成静默安装或跳过向导。

## 本次修正

- 外部驱动使用 Win32 `EnumWindows` / `EnumChildWindows` 读取真实 HWND、进程 ID、可执行路径、窗口类、控件 ID、文字、可见和启用状态，截图及 JSON 保留这些字段。
- harness 将已经按官方 GitHub 资产大小和 SHA-256 校验的 updater 缓存路径传给驱动；驱动启动时再次校验该文件 SHA-256。只有该精确进程路径的可见 `#32770` / `mimir Setup` 窗口可执行动作。其他窗口、不可读路径和同名异路径进程均不能被点击。
- 仅接受该窗口内可见且启用、class `Button`、control ID `1` 且文字精确对应 Next / Install / Finish 的前进按钮，保留当前 per-user 和默认运行选项。发送点击前重新核对 HWND、PID、父窗口、控件 ID 和文字，使用有界 `BM_CLICK` 执行其正常处理函数。驱动不启动目标安装器、不传静默更新参数、不自行启动目标应用。
- 只有实际点击 Finish 且原向导窗口消失，驱动才 exit 0。完整验收继续独立要求目标安装文件替换、旧进程消失、新进程由 updater/Finish 拉起、真实版本和文档/模式保留。不会把驱动退出等同于升级成功。
- 手动验证 workflow 新增 `platform=all/windows/linux`（默认 all）。matrix.include 根据所选平台直接生成一项目标或默认两项目标，Windows 单独运行不会产生一个跳过的 Linux 验收。版本和官方 latest 约束不变。

## 本机检查与后续

使用现有临时 PowerShell 7.5.4 macOS arm64 runtime 执行 `-Action self-test`：通过官方路径/对话框身份及按钮策略、Finish 识别、原生字段和 JSON 证据序列化测试，且实际编译全部 C# Win32 interop。未在 macOS 调用 Windows API；这不能替代真正 Windows 点击验证。workflow 在真实 Windows 升级前执行同一 self-test。

Node 22 的更新及手动更新驱动共 23 项测试通过；受影响 JS 的 oxlint/oxfmt、workflow actionlint、Node 语法与 `git diff --check` 通过。实际 Win32 枚举、BM_CLICK、安装结果和自动拉起仍待下一次 GitHub Windows runner 证据，历史 run 保持失败。
