# 截图绘制等待独立窄审

2026-10-20，Node22.23.1。只读审查已提交 **65e9879831da3375444d19878a4c278914654fb4** 的 update-smoke-lib.mjs、update-smoke.mjs 与 tests；只新增本报告，不改脚本、生产、缓存或其他证据，不提交/远端操作。

## 最终结论：修复后独立复核通过

初审发现的外部截止问题已在当前冻结 working tree 修复，本轮重新读取实际 diff 并执行定向门后通过。该结论覆盖 65e9879 的初始 helper 与本轮尚未提交的外部超时补丁；不冒称后续已提交、发布或真实 PNG 已采集。

### 修复复核

- `Cdp.call(method, params, {timeoutMs})` 和 `evaluate(expression, {timeoutMs})` 新增显式预算，默认仍30,000ms；截图绘制等待唯一调用明确指定 **5,000ms**。因此页面计时器无法运行或socket完全无回应时，也由独立 Node timer 拒绝，不再依赖 renderer 履约。
- 超时删除对应pending并清理timer后reject；成功响应与target-close既有路径同样清理。新增send同步抛错路径先删除pending/清理timer再保留原异常reject，不留下悬挂请求。
- 迟到response按id找不到pending直接忽略；成功或错误迟到包都不能恢复已超时的请求，也不会删除其他正在等待的id。
- 新测试在完全不回应的socket上推进外部模拟时钟，4999ms仍pending、5000ms拒绝；同时证实普通调用直到30000ms才超时，旧默认语义未变。另一项覆盖成功、target-close、同步send失败的timer清理与原错误传播。
- 本轮独立重跑两组Node22测试：**21/21 pass**；三脚本oxlint、oxfmt --check通过。

绘制等待的五秒上限已补齐。该期限只约束截图前的paint settle步骤；后续Page.captureScreenshot等正常CDP调用仍沿用原默认，不把“截图渲染等待”改写为所有文件I/O均需五秒完成。

### 初审确定问题（已修复，保留发现记录）

`settleScreenshotPaint()` 内 `page.setTimeout(5000)` 只运行在 renderer 事件循环。`screenshot()` 外部 await `session.evaluate()` 沿用 `Cdp.call()` 固定 **30,000ms**；Runtime.evaluate payload 也未设置超时。renderer 处于暂停、主线程停顿或根本不响应 CDP 时，页面 timer 无法履约，实际等待会到外部30秒。因此当前代码不能严格保证规范所述的“总上限5秒”。

独立内联检查使用 SilentSocket，不发送任何响应，只临时观察外部创建的 timer：确认为30000ms，payload awaitPromise=true、timeout不存在。随后主动关闭该测试socket，断言 CdpTargetClosedError 传播且 pending 清空；没有实际等30秒、没有连接任何产品或下载运行。结果：`{"externalCDPTimeoutMs":30000,"rendererTimeoutMs":5000,"runtimeEvaluateTimeout":null,"targetClosePropagates":true,"pendingCleaned":true}`。

该初审建议已由上述补丁落实：外部 CDP 等待同样使用5000ms期限，超时删除pending与timer，迟到回复不得复活请求；既有默认保持不变，新增无回应socket回归。截图await超时后抛出，不会继续取图。

## 已通过的检查

- 只读：helper只调用 getAnimations/getComputedTiming 和 rAF/timer；不改变DOM、CSS、动画时间、播放状态，不调用 animation.cancel/finish 或产品动作。finally只取消helper自己预约的rAF与timer。
- 动画语义：有限 endTime 且 pending/running 才重置稳定帧；finished/paused不阻止，无限endTime spinner忽略。连续两个没有有限运动的rAF后才返回，覆盖DOM出现后下一帧才启动的有限入场动画。
- 序列化：函数内无外部闭包依赖，globalThis等在目标renderer解析；现有 runInNewContext 测试执行同一 toString 表达式通过，CDP awaitPromise=true。
- 异常传播：page.getAnimations/getComputedTiming抛错会使painting reject，经race/finally继续throw；页面超时同理。Cdp.evaluate明确把exceptionDetails转为异常，Cdp关闭使用有类型异常；screenshot先await helper，没有catch吞掉后继续截图。
- 本轮重跑 `node --test apps/desktop/scripts/update-smoke.test.mjs apps/desktop/scripts/manual-update-smoke.test.mjs`：**19/19 pass**。
- 三个变更脚本oxlint、oxfmt --check通过。

## 验证边界

本轮无产品GUI或新PNG采集，不用browser-like单测替代实际画面。外部截止修复已独立通过，仍需实际查看后续Windows/Linux截图，再记录守卫在真实有限动画后完整呈现。既有版本、安装、HTTP保存、关闭保护和摘要验收不应改变。
