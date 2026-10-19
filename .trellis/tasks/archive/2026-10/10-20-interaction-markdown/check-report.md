# Markdown 模块独立检查

检查日期：2026-10-20。已按 `check.jsonl`、PRD/design/implement、Office frontend/engine、Renderer frontend/editor 规范审阅本轮产品 diff。检查由独立 trellis-check 执行；未修改 gallery、存档或其他模块产品。主会话完整质量门再次复现 PDF 等待超时后，按用户既有授权纳入该项测试稳定性修复。

## Findings (fixed)

- `packages/office/src/editors/MarkdownSuggestionPanel.tsx:69`：候选浮层只监听布局/滚动及候选内容 DOM，光标在同一组候选内移动且 DOM 未变时没有重测入口。增加编辑器 `selectionUpdate` 与 `update` 监听，并在卸载或换 editor/anchor 时解绑；仍保留原有 viewport clamp、flip 与内部滚动。
- `packages/office/src/editors/MarkdownSuggestionPanel.test.tsx`：扩展真实 Tiptap 实例回归，在没有候选 DOM 变更时移动光标、输入和撤销，核对坐标更新且原文可恢复。已有回归另守短窗口/scroll/resize 和只滚动候选列表。
- `packages/office/src/editors/PdfEditor.content.test.tsx:563`：原生替换用例在完整 Office 测试和根端完整 `pnpm check` 均于内置 3000ms `settle` 期限内未等到冷启动宿主完成，而单独运行通过。`settle` 增加可选预算并保留其默认 3000ms，仅本用例的原生替换等待显式用 15000ms，仍受 Office 包既有 20000ms 用例总上限限制。等待条件仍是实际 `appliedBytes` 发布且保存按钮解锁；替换后的画布字节、dirty、写盘字节及独立 PDF 重开正文断言全部保留。没有用固定 sleep 代替完成屏障，也未放宽其他用例。

## Findings (not fixed)

- 既存 `InlineToolbar.tsx` 异步改写仍在 promise 完成后按**当时**的 selection 插入（`replaceSelection` / `onRewrite(...).then(...)`），没有绑定起始文档版本/选区。此次仅加局部视觉和语义属性，未引入这一行为；主任务明确要求不扩展到改写身份语义，故不改。建议单独以可控 deferred promise 验证改写中移动选区、修改正文或换文档后的结果归属，再确定产品合同。
- 初次全仓 lint 的三个 error 位于 gallery/main.jsx 的 refs/set-state-in-effect，已交给其所属 worker；本 reviewer 没有修改 gallery。最终复跑 `pnpm lint` 已 exit 0，剩余既存 warning 未抑制。

## Verification

- **Lint：pass。** 最终 `pnpm lint` exit 0；相关产品文件定向 oxlint、`pnpm lint:styles` 均 exit 0。
- **Format：pass。** 9 个本轮产品/测试文件的 `pnpm exec oxfmt --check` 通过；相关产品 `git diff --check` 通过。
- **TypeCheck：pass。** 修复后 `pnpm --filter @mimir/office typecheck && pnpm --filter @mimir/renderer typecheck` exit 0。
- **定向测试：pass。** Office `MarkdownSuggestionPanel.test.tsx` / `markdown-controls.test.ts`：7/7；Renderer `MarkdownEditor.test.tsx` / `markdown-find-focus.test.tsx`：28/28；另 7 个 Renderer Markdown controls/save/writing/slash-image/toolbar/image/find 文件：77/77。
- **完整 Office 测试：fail。** 231 文件，2710 passed / 1 failed；上述 PDF 用例单独复跑 1 passed / 14 skipped。
- **PDF 等待预算修复后定向验证：pass。** `pnpm --filter @mimir/office exec vitest run src/editors/PdfEditor.content.test.tsx`：15/15；该文件 oxlint、oxfmt、`git diff --check` 与 Office typecheck 均通过。修复后未由 reviewer 重跑完整仓库，主会话继续执行最终 gate。
- **实际行为审阅：** link 地址 Enter 与应用按钮共享 blocked/空地址判据；独立移除动作保留。Find 的 Escape 与关闭按钮均回到 live 编辑器，回归验证正文不变、未保存。BubbleMenu 继续使用官方组件，当前 Tiptap 默认挂到 `editor.view.dom.parentElement`，因此局部 `--me-*` 主题可继承；未引入 body portal 或第二套主题。写作仅修改容器布局和 aria 状态，保存/Agent/草稿写入代码未变。
- **浏览器及前后渲染：** 本 reviewer 未另行操作浏览器，由主会话完成真实页面几何、主题、焦点和配对截图验收；本报告不以 DOM mock 替代该验收。
- **最终 `pnpm check`：** 本 reviewer 未运行，由主会话在 gallery/存档完成后执行。

## 规范同步判断

当前变更遵循既有主题、官方 BubbleMenu、真实方言与保存/Agent 契约，无需新增产品/架构契约。建议由主会话在现有 Office editors pitfalls 单点记录“caret 候选菜单不能只靠候选 DOM/尺寸监听；同候选下选择变化也须重测”这一静默坑，不写测试数或过程记录到长期规范。

## 最终局部复核

- 复核最后的插表调整：`InsertTableMenu` 显式 `panelWidth={280}`，沿既有 `ToolbarMenu` 的视口宽度限制和锚点定位，未新建布局/主题机制。行数、列数仍是可见字段标签，去掉“行/列”suffix 不损失含义；两字段的默认值、min/max、onCommit、插表命令及固定表头判据均未改变。
- `MarkdownSuggestionPanel` 最终状态保留 editor `selectionUpdate`/`update`、ResizeObserver、候选 MutationObserver、window/visualViewport scroll/resize 及对应清理；选中项仍仅改变候选列表 `scrollTop`，不使用可能带动正文的 `scrollIntoView`。此次局部修正未触碰此实现。
- 最终两个产品文件的定向 oxlint、oxfmt 与 `git diff --check` 均通过。此次 reviewer 未再次运行全仓或改写产品；主会话已运行插表等定向 34 项回归通过，并报告实际面板外宽 280px、clientWidth/scrollWidth 均 278px，无横向溢出，真实同尺寸前后原图齐备。这些浏览器测量和 34 项结果来自主会话验收，不冒充 reviewer 独立操作。
- 根端最终 `pnpm check` 正在执行；本节不提前认定其结果。

## 附件拒绝测试预算复核

- 根端最终质量门报告 `chat-attachments.test.ts` 的 `long.txt` 用例在 5050ms 超过 Vitest 默认 5 秒；不是拒绝结果断言失败。按用户既有“一并处理全仓检查工程问题”授权，reviewer 追加检查 server/backend 入口、conventions/tests 及真实 `prepareAttachmentBytes` / `runPreparationWorker` 路径。
- 仅给 `rejects invalid attachment %s without truncating` 的八个独立矩阵用例显式 15000ms 有界预算；不修改全局 timeout、生产 30 秒附件上限、解析器、HTTP/body 断言、输入边界或真实清理。仍真实等待 upload 响应，成功完成后 `await deleteConversation`；worker 的原有 `finally await worker.terminate()` 保留，没有增加 sleep 或 mock 响应。
- 在主端服务端测试共用 `data/.test` 时不启动另一进程，也不清空测试库。整文件运行须等主会话确认当前全仓 server 已结束；本节暂不宣称该测试通过。
- **修复后验证：pass。** 待主会话确认全仓进程已结束、共享测试库释放后，单独串行运行 `pnpm --filter @mimir/server exec vitest run src/test/chat-attachments.test.ts`，1 文件、29/29 通过，exit 0（10.27s）。该文件 oxlint、oxfmt、`git diff --check` 与 `@mimir/server typecheck` 均通过。此后 reviewer 不再启动 server 集成测试，最终全仓 gate 交回主会话。

## 主会话最终验收回填

最终冻结代码完整 `pnpm check` exit 0，日志与源SHA收据见 docs/visual-comparisons/2026-10-20-markdown/checks/。Office2711、Renderer591、Server常规1365/本地10/fnOS4、Desktop50及其余包/宿主脚本通过。HTML14组逐一导航确认配对图片加载、尺寸一致；74项可检索，实际组件Demo及模拟IO边界齐。此前的失败原始日志均保留，不把定向通过充当完整门。此段为主会话补记，不改独立reviewer的历史结果。
