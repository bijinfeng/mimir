# DOCX 墨迹与异步显示事务

日期：2026-10-20。对应 GitHub CI run `39385619800`；原始日志 `github-ci-fnos-first-failed.log`，Office 2774项中仅荧光笔交互用例失败，读取首笔时数组为空。

## 已证明的路径

本机Node22原15项墨迹组件测试通过，不能凭这次通过断言CI不存在问题。源码显示 `pagination.ts` 使用异步调度更新页面装饰，vendor `setPageGaps` / `LayoutBatch.commit` 会派发只有metadata、没有正文变更且 `addToHistory=false` 的PM事务。旧 `DocxInkOverlay` 将所有 `transaction` 接到与切工具相同的无条件 `cancel()`；任何该类事务落在pointerdown/up之间，都会清掉正在画的笔迹。

新增确定性回归在真实DocxEditor的pointermove之后派发非正文事务，不重画、不重试，旧代码明确得到0笔，复现同一缺失症状；两个几何变化取消用例同时通过。日志 `docx-ink-display-before.log`，exit1。原CI未记录事务元数据，无法断言那次具体是哪个显示事务；本轮修复的是已复现的真实取消路径。

## 最小修复与保护

仅改 `DocxInkOverlay.tsx` 和 `DocxEditor.ink.test.tsx`：每次手势冻结PM doc身份、实际测量的所有段落锚点/画布尺寸，以及SVG的viewport原点。编辑器事务和DOM测量遇到正文身份或上述任一几何变化时仍取消；全部未变时，非正文事务不取消当前笔迹。

控制器/工具变化、blur、捕获阶段scroll、resize、pointercancel和Escape仍保持原取消路径。pointermove仍检查冻结doc与活动状态，提交仍由原 `addDocxInk` 验证doc身份和可编辑性。真实内容变化即使随后撤销，也已使本次gesture失效；没有根据文本相同重新放行。

新增三个回归都先断言真实预览存在：

- 布局不变的显示事务后预览保留，pointerup提交完整三点荧光笔且只有一次history。
- SVG viewport原点变化、段落相对位置不变时，显示事务清掉预览；pointerup不写文档、不增history。
- 画布/段落尺寸变化时同样取消，不写文档、不增history。

既有正文midstroke写入、滚动、切工具、Escape、选择/删除/撤销/擦除、独立笔宽颜色与保存重开测试全部保留。没有将所有metadata事务无条件放行，未改上游vendor、测试重试、等待上限或断言。

## 验证

使用 **Node22.23.1**：

```sh
pnpm exec vitest run src/editors/DocxEditor.ink.test.tsx src/docx-ink.test.ts
pnpm exec tsc --noEmit
```

Office包内执行，两套件共 **31/31通过、exit0**（其中组件18项），日志 `docx-ink-display-after.log`。两TSX的oxlint、oxfmt check与git diff check通过。实际外观没有变更，本轮未新增原生浏览器/系统截图；DOM交互与原生墨迹保存证据由上述真实Editor套件提供。GitHub完整Office门仍待重跑，不能用定向31项代替全仓通过。

规范同步交主会话：墨迹取消须以冻结正文及实际画布/锚点几何为依据；纯显示事务在两者不变时可继续，滚动/缩放/写入仍使手势失效。

## 独立检查

核对实际路径：`transaction` 仅改为触发测量；测量在更新几何状态之前比较手势冻结的 PM doc 对象身份、所有段落锚点和画布宽高，以及 SVG 的 viewport left/top。任一不一致立即清除手势和预览；controller 订阅仍无条件取消，blur/scroll/resize/pointercancel/Escape 和 pointerId/active 检查均保留。提交仍经过原 `addDocxInk`/`removeDocxInk` 和原生 history/保存路径，没有新建平行文档状态。没有发现生产修复缺陷。

补强既有正文中途写入回归：先用真实 pointermove 确认预览存在，实际正文事务返回后立即确认预览已消失，再 pointerup 确认无墨迹提交。原测试仅在 pointerup 后检查，而 move 的独立 doc guard 也能使其通过，无法单独守住 transaction 的即时取消。

检查修复前失败日志，稳定布局的新增显示事务回归确实得到0笔；修复后完整两套件 **31/31通过**。本轮独立 Node22.23.1 在上述增强断言后再次运行两完整套件，仍 **31/31、exit0**，日志 `docx-ink-independent-check.log`。Office typecheck、两 TSX oxlint/oxfmt 和 git diff check 均 exit0。独立检查未重跑 Office 全包、GitHub CI 或真实浏览器像素测试；也不将确定性重现等同于已证明原 CI 那次具体触发事务。
