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

## 显式前台截图与阶段诊断追加复核

2026-10-20，复核当前冻结的 `previewScreenshot`、screenshot 阶段记录及新增两项回归，**未发现新的阻塞问题**。本节不撤回旧失败；按主会话提供的 run39421962037 现场，两个平台在取消守卫后截图5秒失败、尚未进入安装。旧运行未记录visibility/focus/animation状态，因此不能据此确定是遮挡、后台节流或某一种动画导致。

- `previewScreenshot` 显式外部执行 Page.bringToFront，随后只读记录 visibilityState/hidden/hasFocus 与有限动画状态，再调用未改变的只读 settleScreenshotPaint。显式前台是采集预览动作，**不再将整个外部preview称作只读或自动焦点行为证据**；真正的paint helper仍不改DOM/CSS/动画。result.limitation与每张截图 explicitForegroundPreview=true 明确标注这一点。
- 精确顺序仍为：官方实际下载/摘要通过 → 断言不存在 update.html 窗口 → 用户路径 openDetails → 显式前台截图。新增前台动作在“不自动打开详情”的断言之后，不会替产品打开或隐藏更新窗口来满足该断言。原文“Download must not open or focus”实际只检查target存在性，系统焦点仍由原有limitation注明不作证明。
- 本次diff没有修改普通退出不安装、真实dirty guard取消、真实HTTP保存等待、安装前旧字节不变、实际AppImage/NSIS替换、自动新进程拉起、版本和文档/标签/文件夹/模式保留的任何判断。前台截图不会调用安装、伪造ACK、提前释放PATCH或直接启动目标安装包。
- bring-to-front、foreground-state、paint-wait、paint-ready、capture-png、capture-html、complete各阶段写入独立 screenshot-phases.json 与result.screenshots；失败记录 failedPhase/error 并继续抛出，不能静默跳过截图后登记升级通过。
- 前台命令、状态读取及paint wait分别传外部5000ms；paint helper内部5秒、外部paint wait5秒保持。各阶段分别有上界，不能误称整个preview/PNG/HTML和文件I/O总共五秒。
- 新增回归核对前台、状态读取、paint顺序及各调用预算；前台target-close、读取/paint超时原异常向外传播，不产生paint-ready。既有无响应socket五秒、cleanup、late-response、序列化、有限动画及无限spinner测试保留。

本轮独立执行 Node22两组脚本 **23/23 pass**，三脚本oxlint、oxfmt --check、node --check与git diff --check通过。本轮没有GUI、远端操作或新截图，不把阶段诊断与单测改写成真实升级成功；新runner证据仍须目视复核。仅追加本报告，其他文件未修改。
