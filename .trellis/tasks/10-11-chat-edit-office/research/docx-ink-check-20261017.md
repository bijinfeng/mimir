# DOCX 原生段落墨迹独立复核

2026-10-17。先只读检查，收到实现者明确 freeze 后独占本片修复。已再次冻结生产并交 root 统一构建和真实浏览器验收；本报告不表示全部 Office 工具已完成。

## Findings (fixed)

### 1. 设置面板 Escape 被绘图层截断

- 文件：`packages/office/src/editors/DocxInkOverlay.tsx`。
- 实际 Editor 先红复现：绘图开启后，在设置 Inspector 按 Escape，shell 原生监听器先 `stopPropagation()`，React Inspector 根本收不到事件；设置没有关闭，绘图却已退出。
- 修复：shell 绘图 Escape 避让 Inspector 和局部 popup，让最近一层处理关闭。普通正文退出绘图保留现有行为；回焦补具名折叠组和当前可见 tab 回退。
- 回归：关闭设置只关闭当前层、绘图仍开启、焦点回设置入口，不制造撤销历史。

### 2. 跨分类关闭 Inspector 后焦点丢失

- 文件：`packages/office/src/editors/DocxEditor.tsx`。
- 实际 Editor 先红复现：打开笔迹设置，切“开始”令原入口和组卸载，再 Escape 关闭，焦点无可用目的地。root 首轮真实浏览器也复现 `activeElement=body`。
- 修复：现有 Inspector trigger resolver 仍优先当前同名入口及具名折叠组；来源组已卸载时回当前选中、可见的 Ribbon tab。不强制切回绘图分类，不新增公共接口。
- 回归：绘图开/关两条跨分类路径均回“开始”tab，设置关闭且绘图状态保持。

### 3. 笔迹属性重复标签和纵向堆叠

- 文件：`packages/office/src/editors/DocxInkControls.tsx`、`docx-ink.css`。
- root 在真实1280/420首轮发现：`ToolbarLabel` 与 PropertyForm 自动字段标签重复，缺少 property group 又导致控件全部纵向堆叠。
- 修复：复用既有 `ToolbarMenuFields`（PropertyForm 中产出 `me-property-group`），分“笔”“荧光笔”两组，每组颜色和宽度双列；去掉额外标签，数字框使用 `px` suffix，保留各自唯一 aria-label。局部移除 form 重复内边距，并为本片 Ribbon/动作图文加6px间隔。
- 保留固定动作区与滚动区，没有新建共享表单原语，也未修改全局按钮样式。最终真实外观由 root 构建后确认。

### 4. 原 PNG 的内容类型声明丢失

- 文件：`packages/office/src/docx-ink-save.ts`、`docx-ink.test.ts`。
- 独立原生回归先红复现：将原墨迹 PNG 改用合法的 per-part `[Content_Types].xml` Override，正文重生成后，vendor cleanup 删了暂时无引用的类型声明；已有适配只恢复 run、关系与媒体，未恢复 Override。
- 修复：只为仍存活的原墨迹图片补回原始精确 Override，遇同 PartName 冲突明确拒绝；保留所有其他类型变更。另先红验证格式化 XML：原关系/类型只有这些声明被 cleanup 删除时，恢复完整原文，保留原有空白和条目日期，不以重排后的等价 XML 冒充原字节。
- 回归：opaque payload 段落编辑后，原 run、payload 和除正文外全部 ZIP 条目内容精确相同，重新打开仍保留墨迹。

### 5. 真实画布首次聚焦引发滚动，首笔被取消（浏览器验收补修）

- 文件：`packages/office/src/editors/DocxInkOverlay.tsx`、`DocxEditor.ink.test.tsx`。
- root 真实浏览器发现：首次 pointerdown 的裸 `focus()` 令文档滚动容器从0到24，之后异步 scroll 触发既有取消监听，丢掉首笔。另一个拖动失败经 root 使用标准 `button:'left', buttons:1` 排除为驱动问题，未据此修改捕获或事务取消策略。
- 窄修：只把画布聚焦改为 `focus({ preventScroll: true })`。用户主动滚动仍取消未完成笔迹。
- 新实际 Editor 回归模拟聚焦后的异步祖先滚动：旧实现先红（scrollTop24）；修复后scrollTop保持0、完整三点笔画入文档、单次历史。整份 ink Editor **13/13**，两目标 oxlint和三文件format通过；此最后补修后的本检查 Office tsc **exit0**。根后续 stable build/真实首笔确认独立记录。
- root 另补8行局部CSS，为双列数字框加 `flex:1;width:0;min-width:0`，suffix `flex:none`，修复100%输入框加px导致的横溢；本检查只读复核符合现有局部规则，未扩改共享样式。

### 6. 窄屏打开设置后折叠菜单覆盖 Inspector

- 文件：`packages/office/src/editors/DocxEditor.tsx`、`DocxEditor.ink.test.tsx`。
- root 的420px浏览器验收发现：绘图分类的“墨迹”折叠菜单保持展开，点击“笔迹设置”打开 Inspector 后仍遮挡其标题。新增真实 Editor 回归先红复现 `aria-expanded=true`。
- 按 root 批准的最小范围，只在 `ink-tools` 打开 Inspector 前调用既有 live group trigger 的点击切换；先冻结现有内容/上下文，菜单卸载后 Inspector 仍正常挂载和聚焦，不扩共享 Toolbar API。
- 回归用真实折叠测量和 pointerdown→mousedown→click：父菜单收起且不存在，Inspector 正常聚焦；Escape 关闭后返回仍可见的“墨迹”入口，撤销历史保持0。

### 7. 不可编辑的复杂原墨迹被计为可编辑

- 文件：`packages/office/src/editors/DocxInkControls.tsx`、`DocxEditor.ink.test.tsx`。
- root 真实表格墨迹夹具中绘图已禁用、主状态已提示未显示，但设置仍说“1 笔可编辑墨迹”。新增含原生表格锚点、向量、图片关系和 PNG Override 的实际 Editor 夹具先红复现。
- 有禁用原因时按存活 anchor 保留项显示“N 笔原有墨迹”；正常绘图仍按可识别向量显示“N 笔可编辑墨迹”。不改变原件显示/保存或禁用合同。
- 回归核对绘图按钮禁用、Inspector 原有墨迹计数、无可编辑计数，以及主状态行的表格墨迹未显示提示。

## Findings (not fixed)

- 无本片已确认而遗留的生产缺陷。
- 类型检查时曾遇同时进行的 PDF 片 `apps/server/src/services/pdf-annotations.ts:295` 的 `Cannot find name 'op'`；本检查未修改外片。该实现者随后修复并报告 Office tsc checkpoint exit0（`/tmp/mimir-pdf-batch-mid-types.log`）。此前本检查自身 Office typecheck checkpoint 已 exit0；root 另确认包含本片最终生产冻结内容的 Web build exit0（`/tmp/mimir-docx-ink-web-20261017.log`）。保留中途失败事实，不写成全仓最终 gate 全绿。
- 最终宽屏/420、真实 Canvas PNG 像素、下载保存/history 和混合节/分栏浏览器验收交 root。本片 canvas 在组件测试中被 mock，不能代替真实光栅验证。
- 现行规范与格式矩阵由 root 统一同步；应覆盖 `inks=undefined` 原层保留、显式全层重写、opaque/共享资源禁写、复杂位置可见提示，以及 Inspector 最近层 Escape/当前可见分类回焦合同。

## 实际路径核对

- PM doc 根 attrs 保存笔迹，段落 anchor 与首笔同事务；`closeHistory` 隔离逐笔历史。重复 anchor 追加事务按旧 owner 映射清除副本；原段移动携带身份，删除隐藏、undo 恢复。保存使用最终 SaveBlock 映射并验证可靠性。
- 普通保存、当前未保存副本导出和 Agent 后保存共用 `session.save()`；Agent round 快照/恢复包含完整 PM JSON 根 attrs。没有另建绘图保存后门或独立 React 文档历史。
- 未编辑 ink 时保留 `options.inks === undefined`。正文再生成通过自有适配恢复原 run、关系、PNG 和 per-part 类型。显式修改才量化向量并生成2倍透明 PNG，交实际 vendor `SaveOptions.inks` 全层写入；不使用旧研究中的不存在字段。
- 严格 v1 payload/native run/图片几何及资源所有权检查，避免未知字段或共享图片被重写。普通未知段落只读显示原 PNG。复杂 table-owned ink 原来可能丢失 PM-only anchor，已在 freeze 前由实现者按本检查提示修复并补 no-op ZIP 回归。
- root 已批准复杂 table-owned ink 不伪造坐标：原件完整保留、绘图禁用，主状态行明确“表格内复杂墨迹暂未显示；原件完整保留，绘图已禁用”。该限制没有藏在设置深处。
- Overlay 在 doc-zoom/page-wrap 内取实际 nodeDOM 坐标，按 zoom 归一到100%，物理列边缘扣除段落 margin；处理滚动/布局重测及主指针、取消、外部文档写入、模式/缩放切换、阅读禁止。选择、Delete、逐笔擦除、清除确认均有真实 Editor 操作回归。
- 依据：固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 的 `editor/ink.ts`、`InkOverlay.tsx` 和实际 vendor `ink.ts`/`patch.ts`/`resource-cleanup.ts`。WeKnora v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24` 的既有官网/源码证据只适用能力如实门控，不作为 Office ink/Ribbon 主要依据；本次为实现独立检查，未新增竞品研究结论。

## Verification

- **Tests: pass，6文件93/93**：`pnpm --filter @mimir/office exec vitest run src/docx-ink.test.ts src/editors/DocxEditor.ink.test.tsx src/docx.test.ts src/agent/docx-agent.test.ts src/editors/DocxEditor.views.test.tsx src/editors/DocxEditor.export.test.tsx --maxWorkers=2`。
- **TypeCheck: pass**：最后两项浏览器 followup 补修后，本检查再次运行 `pnpm --filter @mimir/office typecheck`，exit0。此前并行 PDF 在途失败及修复检查点仍保留在上文。
- **Lint: pass**：9目标 TS/TSX oxlint；`DocxInkControls`/`DocxInkOverlay` antd lint 各0问题。先修正新增测试 `expect` 的多余诊断参数，最终静态为绿。
- **Format: pass**：10目标文件 oxfmt check，含本片 CSS。
- **Styles / diff: pass**：`pnpm lint:styles`、目标 tracked diff check。
- 未运行 full Office/全仓 gate 或 Web build；未上传、删除测试件、暂存、提交、归档。无关既有全仓技能脚本 lint 基线不计为通过。
- 浏览器补修后只重跑真实 Editor ink **13/13**、Office tsc和上述定向静态；未将前一轮6文件93/93伪称为补修后重跑的全量结果。
- 最后两项浏览器 followup 补修后，真实 Editor ink **15/15**、Office tsc exit0、3目标 TS/TSX oxlint、3目标 oxfmt check 和 tracked diff check 均通过。生产再次冻结交 root 统一构建和实际420菜单/Inspector复验；没有重复 full Office 或 Web build。
