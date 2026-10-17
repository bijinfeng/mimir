# PPTX 逐页生成 / 停止与保留：独立检查

2026-10-17，checker `/root/r3_bullets_independent_check`。本报告仅覆盖 `pptx-deck-progress-next-plan-20261017.md` 这一片，最终浏览器、生产构建和全仓门禁由 root 负责；不声明整个 Office 工具集已经验收。

## Findings (fixed)

- `packages/office/src/editors/PptxDeckWritingPreview.tsx`：停止和保留的 primary `ToolbarButton` 同时提供 children 文案和 label，壳组件会渲染两份文字。移除重复 children，保留 label 和原动作。真实 Editor 的 replace/append 测试各新增停止/保留精确 `textContent` 断言。
- `apps/server/src/test/pptx-deck-stream.check.test.ts`：新增三个独立边界检查，证明真实 NDJSON 流在未消费事件前不会推进生产者、取消未读流会终止被背压阻塞的生产者，以及超过 250 普通事件后无 done、产生不可恢复错误终局。此文件只 mock host，不以四字节假候选声称原生文件有效性。
- `packages/renderer/src/lib/pptx-deck-stream.test.ts`：新增逐个 UTF-8 字节拆分中文、emoji 和补充平面汉字的测试；checkpoint 数据和 recoverable 错误消息均保持完整。原测试的分块不保证跨多字节字符边界。
- `.trellis/spec/shared/contract/document-agent.md`：按 root 已授权的现有合同补同步流签名、校验顺序、预算、唯一候选、部分保留、源失效和唯一发布，不引入新产品决策。

## 核对结论

- 宿主沿当前未保存原件逐页完成原生事务、媒体/crop、save、BoundedZip 和原生 reopen/页数验证后才发 checkpoint。正常 done 仅引用最后候选；append 保持原页/主题。保留既有 native 测试及其非目录 ZIP 部件逐字节比较，不要求 serializer 重打包后的 ZIP envelope 原字节一致。
- renderer 严格 UTF-8/NDJSON/schema/身份/计划/连续页序/完整终局和尾部检查；协议破坏、截断和预算失败均不给部分保留。生产者逐事件 await，最多排队一条 wire 事件；只维护最新候选。
- Office 用独立原生会话临时预览；原件 version/dirty/history 在明确保留前不变。局部 Stop 和原始源/Agent signal 分离，后者继续阻断迟到发布。人工改稿、切源 A→B→A、丢弃、零完成和迟到成功均有真实 Editor 回归。
- 保留和完整成功沿原 host result → handle replaceFromHost → round/history 唯一发布；部分状态的 completed/missing/failedPages/notGenerated/stopped/failure 准确，Undo/Redo、保存后 native reopen、旧 round 回退和后续人工修改守卫有断言。
- Inspector 使用内部滚动和底部固定单一主动作；精确 DOM 文案已检查，实际 1280×800/420×500 视觉证据仍由 root 验收。

## Verification

使用各包直接 `node_modules/.bin`，没有安装依赖、stage、commit、vendor 修改、上传或删除测试件。

| 检查 | 命令范围 | 结果 / 日志 |
| --- | --- | --- |
| Server | `vitest run src/test/pptx-deck-stream.check.test.ts src/test/pptx-deck-progress.test.ts src/test/pptx-agent-services.test.ts` | 3 files **13/13**；`/tmp/mimir-deck-independent-server-final-20261017.log` |
| Renderer | `vitest run src/lib/pptx-deck-stream.test.ts` | 1 file **11/11**；`/tmp/mimir-deck-independent-renderer-final-20261017.log` |
| Office | `vitest run src/editors/PptxDeckWritingPreview.test.tsx src/agent/pptx-agent.test.ts src/agent/pptx-script.test.ts src/editors/PptxEditor.workspace-views.test.tsx` | 4 files **28/28**；`/tmp/mimir-deck-independent-office-final-20261017.log` |
| Lint | 16 scoped TS/TSX `oxlint` | exit0；`/tmp/mimir-deck-independent-lint-20261017.log` |
| Format | 17 scoped TS/TSX/CSS `oxfmt --check` | exit0；`/tmp/mimir-deck-independent-format-20261017.log` |
| Diff | `git diff --check` | exit0；`/tmp/mimir-deck-independent-diff-20261017.log` |
| Types | Shared / Renderer / Server `tsc --noEmit` | exit0；`/tmp/mimir-deck-independent-{packages-shared,packages-renderer,apps-server}-types-20261017.log` |
| Office types | `tsc --noEmit` | 最终 **exit0**；`/tmp/mimir-deck-independent-packages-office-types-final-20261017.log` |

## Findings (not fixed) / 验收边界

- 本片未发现其他需要修改的生产问题。首轮 Office types 被并行 bullets fixture 缺字段阻断；已通知其 owner 补齐，最终独立复跑通过，没有跨归属修改。
- 无已配置 provider；受控模型、真实 native/HTTP/parser/Editor 证据不代表真实供应商生成质量通过。Desktop 和 DOCX 新密码按用户指示自验。
- root 继续生产浏览器/全门；本检查不以 DOM 几何或 mock 数据替代视觉验收，也不将此前 bullets native 保存正确等同画布显示正确。
- 依据固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 计划和实施报告；WeKnora 复用已核缓存 v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24`（官网 SHA256 `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe`，definitions SHA256 `3aae03dc09c5c5261e71df3e9ee4fba9ad457cf632c817e4ea7ae1312f5bcae0`），只适用能力门控，不作为 Office 工具栏参照；本片未重新请求网站。

## 冻结与进程

对 owner 冻结表 `/tmp/mimir-pptx-deck-production-test-freeze-20261017.sha256` 校验：只有预期三文件改变（primary 文案修复、其真实 Editor 断言、renderer UTF-8 测试），其余 13 项完全一致。包含独立新增 server 测试和 shared 合同的最终快照：`/tmp/mimir-pptx-deck-independent-freeze-20261017.sha256`。

所有本人 Server/Office/Renderer 测试及四包类型检查进程均 exit0，Server runner 已释放给 root；无在途服务或安装进程。最终 18 项冻结校验全部一致，本片代码、类型、scoped 静态和测试检查通过；实际生产浏览器及全仓门禁继续由 root 执行。

## root 浏览器发现后的回焦修复（17:23 后续冻结）

root 的真实 Editor 浏览器发现：触发按钮在 `execute()` 外层 finally 才解除 busy/disabled；Preview cleanup 当时同步 focus 会失败并留在 Body。原测试的“查找和替换”按钮始终可用，故不足以覆盖这条时序。本报告先前 PASS 的范围保留，不能用它覆盖这个浏览器新发现。

按 root 明确授权只改 `PptxDeckWritingPreview.tsx` cleanup：当焦点仍属于旧面板/Body、原触发目标仍 connected 时尝试恢复；目标 `:disabled` 或祖先 `aria-disabled=true` 时等待实际 DOM 属性变更。MutationObserver 最多保留 1 秒；恢复一次后 disconnect，用户主动 focus 别处或目标移除也立即释放，不抢焦点。检索 Office/Renderer/Chat 后无可复用通用异步 restoreFocus helper；不新建公共接口。

真实 Editor 新增两条回归：保持原触发按钮 disabled，Escape 丢弃完整两页草稿，`execute` 已结算而外层 finally 用受控 Promise 继续忙碌；解除忙碌才回焦一次。另一条在解除前主动聚焦其他操作，之后不被抢焦点。两条均同时断言零 version/history/save/dirty。没有用延长固定等待掩盖时序。

- Office 四文件 **30/30，exit0**：`/tmp/mimir-pptx-deck-focus-independent-tests-20261017.log`。
- Office `tsc --noEmit`、两文件 scoped oxlint / oxfmt check、git diff check 全部 **exit0**：`/tmp/mimir-pptx-deck-focus-independent-{types,lint,format,diff}-20261017.log`。
- 新生产 SHA256 `f17bbf2bed032734b48d849cdcfff8af0377b6b8595b9d56aadcf3db935144bb`；测试 SHA256 `af277ae7bc7f0d6dbc50f334d27709149d54c82b32208826fe29ae2b53f4e136`。
- 本次两项快照 `/tmp/mimir-pptx-deck-focus-independent-freeze-20261017.sha256` 取代旧 18 项表中的这两项；其余文件未修改，所有本人进程均已退出。root 继续新构建实际宽/窄浏览器及稳定源码全仓门禁，本节不提前记为浏览器通过。

## 第二次真实浏览器发现：触发器 mount 前已失焦

root 新一轮真实浏览器依旧回到 Body；原因不同于已捕获按钮仍 disabled：调用方在 Preview mount 前禁用按钮，浏览器立即 blur，面板 effect 捕获的已经是 Body。前节只证明捕获到真实按钮后的等待路径，不能作为完整回焦通过。

root 明确授权后，只新增当前 PptxEditor 已有 `canvasRef` 的内部 prop。Preview 捕获 activeElement 为 body/html 时使用该编辑器自身“幻灯片对象画布”作为返回目标，不全页查询首个按钮；真实触发器存在时保留原返回目标。cleanup 仍要求焦点属于旧面板或 Body，用户主动 focus 别处则不恢复/不等待。canvas 已有 tabIndex=0，无新增全局焦点基础设施。

新增真实 Editor 两例：生成前触发器 disabled 且 activeElement 已为 Body，Escape 丢弃后只回画布一次；同批用户主动移到其他按钮则不抢焦点。happy-dom 不模拟浏览器禁用时自动 blur，测试显式先 blur 再 disabled 复现最终 DOM 状态，并检查初始 Body，不谎称 happy-dom 自身证明该浏览器语义。两例均保留 version=0、无 undo/save/dirty。

- PPTX 四文件32项与 DOCX 四文件41项同次独立运行：**8文件73/73，exit0**，`/tmp/mimir-focus-docx-independent-tests-20261017.log`。
- Office tsc、6文件 scoped lint/format、diff check 均 exit0；日志 `/tmp/mimir-focus-docx-independent-{types,lint,format-final,diff-final}-20261017.log`。
- 最新3文件快照 `/tmp/mimir-pptx-deck-focus-final-independent-freeze-20261017.sha256`（Preview、Preview test、PptxEditor）取代前节两文件快照。本人 runner 均退出，生产冻结；root 继续实际浏览器回画布及最终原样门禁。当前未提前将浏览器回焦记绿。

### 最后真实 CUA 复验回传

root 随后实际浏览器操作：开始按钮禁用后显示两页草稿，Escape丢弃，结果 `ok=false/changed=false/version=0`；下一次独立读取 DOM 的 activeElement 为 `DIV`、aria-label“幻灯片对象画布”、tabindex0，确实回到该 Editor 显式 fallback 的画布。已闭合前述 Body 失败；本checker没有重复操作浏览器。root 当前1764项源码快照冻结后运行新Web build和原样全门，日志 `/tmp/mimir-all-tools-final-pnpm-check2-20261017.log`，不能据运行中提前记全仓通过。
