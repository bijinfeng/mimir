# Bug Analysis: 原生窗口关闭后访问销毁对象阻塞升级

## 1. Root Cause Category

- D（Test Coverage Gap）与E（Implicit Assumption）：测试窗口仅用普通EventEmitter模拟，其webContents getter在销毁后仍可读取；真实Electron44的BrowserWindow关闭后，读取该getter会抛Object has been destroyed。
- closeWorkspace的closed监听器在finish中再次访问target.webContents.off，抛错后未完成准备Promise。保存HTTP已200、主窗口已关闭，但安装未执行；Linux实际出现Error窗口。

## 2. Why Fixes Failed

第一次Linux失败是独立的外部CDP关闭回包竞态，5c956f5只修该测试问题，没有宣称安装完成。其后两平台完整复验才暴露产品关闭异常，不能将两次现象混为一谈。Windows空向导log无法区分安装器未启动与按钮识别失败；native Error现场与同源码Electron探针提供了有区分度的证据。

## 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
| --- | --- | --- | --- |
| P0 | Architecture | 关闭前捕获webContents事件源，closed清理不再访问销毁窗口getter | DONE |
| P0 | Test Coverage | stub在销毁后访问getter即抛错，旧实现先红；真实Electron44同一probe修前exit2、修后exit0 | DONE |
| P0 | Verification | 未保存guard、普通退出、真实安装和拉起资料保留必须各自有实际证据 | 持续执行 |
| P1 | Documentation | releases-updates明确原生销毁边界、typed CDP关闭与纯文本说明契约 | DONE |
| P1 | Diagnostics | NSIS每30秒记录进程/窗口/按钮与桌面截图，不改变安装决策 | 已实现，待实际runner |

## 4. Systematic Expansion

仅修关闭源对象寿命，不放宽veto/timeout/保存/宿主关闭顺序。其他关闭清理路径保持主会话已有检查；不因一个getter问题全面重构窗口管理。原生对象的生命周期与普通mock不同，类型检查与快速单测不能代替一次真实窗口close。

已公开0.1.3/0.1.4的发起安装端含此缺陷，不能靠目标包修复已在运行的旧逻辑。必须手动安装新修复基线0.1.5，再发布0.1.6验证自动升级；保留旧tag/公开文件，明确旧版限制。

## 5. Knowledge Capture

- 已更新唯一归属 .trellis/spec/desktop/runtime/releases-updates.md；本项目不是Trellis生成器源码仓库，不存在src/templates/markdown/spec，无对应模板副本需要同步。
- 证据：native-close-before.log、native-close-after.log、native-close-regression-before.log、native-close-desktop-regression.log、native-close-repro.cjs.txt；两平台实际失败现场update-attempt2。
- 本地native与118项回归已通过，不能提前写成新版本完整自动升级通过；后续五目标发布及真实5→6结果单独记录。
