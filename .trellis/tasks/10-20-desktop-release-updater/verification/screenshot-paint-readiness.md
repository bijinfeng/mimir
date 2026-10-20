# 真实更新验收截图的绘制等待

2026-10-20。仅调整外部 Windows/Linux 验收截图采集；没有改变产品、工作流、版本、保存握手或安装判据。旧截图和失败结果完整保留。

## 证据与判断边界

实际查看 `update-attempt2/windows/save-guard.png`：只见背景页面和遮罩，未见保存对话框；同一次截图后保存的 `save-guard.html` 已有 `role=dialog`、“重启更新前保存改动”“继续编辑”“保存并重启”。HTML 中 Ant Design CSS 的 zoom enter/appear 从 opacity=0、scale(0) 开始，有限时长为 motion-duration-slow=0.3s。原采集函数在 DOM 出现“继续编辑”后立即请求 Page.captureScreenshot，没有等待绘制或有限动画。

因此确认原 PNG 不能证明完整守卫已绘制，存在 DOM 与实际绘制不同步的采集窗口。旧运行没有逐帧 animation trace，不能据事后 HTML 断言该 PNG 截在某个精确动画帧。Linux 的 `save-and-restart-awaiting-http.png` 已实际查看，清楚显示保存中对话框；不是所有旧截图都缺失内容。

## 最小调整

`update-smoke.mjs` 的 screenshot 先用现有 loopback CDP 执行独立 `settleScreenshotPaint`，再采集原来的 PNG/HTML。

- 每个 requestAnimationFrame 读取 document.getAnimations，不改变样式、不结束或取消产品动画、不注入产品 hook。
- pending/running 且 computed endTime 有限的动画会重置稳定帧计数；连续两个绘制帧没有这类动画才允许采集。
- Infinity 的光标/加载转圈动画不纳入等待。
- 整体最多 5 秒；超时、页面异常和 CDP target-close 都向调用者传播，不能吞掉后继续截图。清理外部计时器与待执行帧。
- 不使用固定 sleep，不放宽可见按钮、真实 HTTP 保存、普通退出、安装文件摘要、NSIS 完成或新旧进程条件。

## 验证

Node22 脚本回归覆盖后出现的有限入场动画、pending/running/finished、无限 spinner、两个绘制帧、超时、页面错误、等待清理，以及函数序列化到隔离 browser-like 全局后执行。既有 typed CDP 关闭回归保持不变；相关两组脚本共 19 项通过。

仅做外部脚本定向检查：Node22 tests、oxlint、oxfmt、Node syntax、git diff --check。没有启动另一轮官方下载/GUI，也没有用模拟回归替代实际画面。后续官方 0.1.5 → 0.1.6 Windows/Linux runner 的新截图仍须实际查看，才能登记真实采集效果。
