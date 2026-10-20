# 保存取消后截图超时诊断

2026-10-20，针对 GitHub run `39421962037` 的官方 Windows/Linux `0.1.5 → 0.1.6` 实际升级验收。历史失败证据保留在 `update-015-to-016-attempt1/`，本次不改写其结果。

## 已观察到的事实

- 两个平台的 `result.json` 均为 `success=false`，错误为 `CDP timeout: Runtime.evaluate`。仅有三项已通过：官方下载完成且未自行打开详情、普通 UI 退出未安装、真实 HTTP 保存挂起时出现保护且“继续编辑”取消安装。
- Linux runner 日志记录取消保护检查通过于 `2026-10-20T12:25:46.8412631Z`，报错于 `2026-10-20T12:25:52.5307795Z`，间隔约 `5.69` 秒。应用日志随后已有真实文档 PATCH 200 和 GET 200，没有 `retry-after-save.png`。
- 此处脚本先放行保存 HTTP、确认文档持久化，再对详情窗口执行 `retry-after-save` 截图。截图绘制等待使用独立的 5 秒 CDP deadline，其余 HTTP evaluate 默认 30 秒。时间线强烈指向该截图等待，而非保存失败。
- 实际目视检查 Linux `save-guard.png`：保护弹窗正文、真实文档标题、“继续编辑”和“保存并重启”均清楚可见，前一次前台保护截图已正常绘制。

## 判断及修正

取消保护交互会把工作区留在前台；旧截图函数直接在详情窗口等待 requestAnimationFrame，没有先显式切换目标。后台或被遮挡的 renderer 可能暂停动画帧；这与当前时序一致。旧 run 没有 visibility/动画阶段记录，因此不能将遮挡判作已被直接证明的唯一根因。

本次仅改外部验收驱动：截图预览先调用 `Page.bringToFront`，再记录 `visibilityState`、`hidden`、`hasFocus` 和有限动画状态，然后继续原有只读绘制稳定等待。每个阶段均写入 `screenshot-phases.json` 并输出带截图名称的日志；失败保留原始错误及失败阶段。有限动画、连续两帧、5 秒绘制 deadline、协议异常和 target-close 失败条件不变，不修改产品样式或动画。

此操作明确是验收脚本主动切换焦点。脚本的“下载完成未自动打开详情”断言仍发生在手动打开详情和首次截图之前；预览截图不能证明系统通知投递或自动焦点行为。脚本在结果 limitations 和每张截图 `explicitForegroundPreview=true` 中记录该边界。

真实保存、安装器、官方目标摘要、旧进程退出、新进程自动拉起以及资料/模式保留的条件均未改动。本次失败尚未进入第二次真实编辑和安装，不能记为完整升级通过；修正后仍需 Windows/Linux runner 重新执行。

## 本机验证

- Node 22：`update-smoke.test.mjs` 与 `manual-update-smoke.test.mjs` 共 23 项通过，覆盖显式 foreground 顺序、前台观测和绘制阶段错误透传，以及原有 deadline/target-close/绘制稳定条件。
- 三个修改脚本的 oxlint、oxfmt、Node 22 语法检查及 `git diff --check` 全部 exit 0。检查仅覆盖此次外部驱动修正；远端完整升级结果必须由新 run 的独立证据确认。
