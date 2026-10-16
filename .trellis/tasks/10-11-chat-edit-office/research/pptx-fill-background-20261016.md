# PPTX 形状填充与背景补全（2026-10-16）

## 范围与证据

固定主参考 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`：

- `apps/slides/src/renderer/components/Ribbon.tsx` ShapeFillMenu：无填充、纯色、浅/深两行 × 向下/向右/对角/径向四方向渐变，共八种渐变预设，以及 paper/canvas/wood/marble/granite/denim/cork/parchment 八张 PNG 纹理。
- `apps/slides/src/renderer/components/FormatBackgroundPane.tsx`：双色渐变方向、原图片拉伸/平铺、隐藏背景图形、应用全部和重置。上游背景编辑只提供 from/to 两端点，不能把此能力表述为任意原有复杂背景的保真复制。
- `packages/pptx-ops/src/ops/core-ops.ts` setFill：现有原生多色标、角度（1/60000°）与 circle/rect/shape 路径渐变。`packages/pptx-engine/src/generate.ts` patchGradFillXml 保留未改的原路径焦点、tileRect、scaled 及扩展节点。
- `packages/pptx-ops/src/ops/slide-ops.ts` setBackground：既有 solid/gradient/image/reset/graphics；多页用一个 atomic apply_ops，沿原有宿主版本、字节重开和历史路径。
- 八 PNG 均在固定 checkout 的 `apps/slides/src/renderer/assets/textures/`；根 LICENSE 为 Apache-2.0，无单独纹理例外声明。通过资源清单进入 vendor，测试固定原图 SHA-256 与原生嵌入字节，无重画/近似纹理。

WeKnora：沿用已记录 v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24`；本次固定 commit README 实际下载成功，43–53 行说明 document understanding、retrieval、RAG/Agent/Wiki，181–187 行说明浏览器/MCP/检索工具。它适用 Mimir 知识库与 Agent 工具组织，不提供 Office 形状/背景填充语义，因此本片不以其 Markdown 编辑器为模型。站点 HEAD 15 秒超时（curl 28），未写成访问成功。

## 改动

- `PptxFillControls.tsx`：独立形状/背景 Inspector 内容，分组字段、当前值和草稿预览、固定底部主动作、色标/角度、八渐变预设、八原图纹理、现有图片拉伸/平铺及背景 all/reset/graphics。
- `pptx-fill-presets.ts`：纯数据/预览/原生操作构造；`pptx-fill-controls.css`：320px Inspector 内布局，四列预览和内部滚动。沿既有产品字体、theme tokens 和 shell 控件。
- Editor 集成由 views implementer 持有；形状面板 body key 使用 active+持久对象 ID，背景使用 active，version 只清草稿；组件自带 CSS 和固定动作，不再嵌长表单。
- `sync-upstream.mjs --asset <manifest.assets.from>`：可重复精确同步一个或多个已列单文件，强制 checkout commit 匹配；字节读取/比较/写入，不重算闭包、不清理 vendor、不重写清单或时间戳。八张 PNG 已逐项窄同步，随后相同参数 `--check` exit 0。

## 竞态与保护

草稿源版本变化即永久清空，避免 undo 回环复活旧输入；同版本刷新保留草稿。纹理 fetch 前捕获活性 token，版本/页/目标变化或卸载均使旧 token 失效，fetch 后重验才调 applyOps。同步 pending ref 防止重复点击。父层另保留会话/active/version 检查。应用期间主动作和表单禁用；主动作主标题只显示一次。

已有多色标、非标准端点、自定义路径焦点/tileRect 等复杂原背景不会在打开面板时改写；原样应用全部禁用并说明原因。用户先显式点“改为双色渐变”或明确选新填充，看到草稿预览后可应用。**复杂原背景保真复制尚未实现，不能将此片标记为全工具完成。** 原有 pattern 背景复制也未开放。

## 验证（实现代理）

- `pnpm --filter @mimir/office exec vitest run src/editors/PptxFillControls.test.tsx`：8/8。含实际 UI→native transaction→save/reopen、形状 none/solid/alpha/三色标矩形渐变，背景 radial/all/graphics/reset，undo/redo 当前值与同源刷新，八原图逐个 native tile/PNG 内容/原件未改主题母版版式部件，两次保存 ZIP 条目内容相同，原图片切换模式与复用 mediaPath 应用全部，非法颜色和失败保留草稿，以及延迟 fetch 后 version/unmount 不提交。
- Office tsc 本片完成后通过一次；最终重跑被并行新增 `PptxEditor.workspace-views.test.tsx:215/216` rasterizeInk spyOn 类型错误阻断，已通知 owner。填充新增文件无 TS 诊断。
- 目标 Oxlint、Oxfmt、Antd lint（0 issues）、样式模板检测、目标 `git diff --check` 通过。
- 曾误用 `pnpm --filter @mimir/office test -- ...`，导致全 Office 运行，出现已有 chart/table 并发异步失败后已停止。最终验证使用 exec vitest 精确文件；不把该误跑称全量通过。
- Web/420px 真实截图、Escape/focus、实际下载/刷新由根会话与独立 checker 接续，本片组件/原生测试不替代实机证据。整仓 pnpm check 的既有其他失败也未由此片消除。

## 真实浏览器发现后的宿主链路修复

根会话真实“形状木纹→应用”发现原组件测试直接 runTxn 跳过了 Agent guard：setImageFill 被模型白名单拒绝。此前 UI/native 回归不能证明实际应用可用，现由以下完整路径取代该间接证据。

新增严格 `pptxManualFillSchema` 和手动 `manual_fill` action，沿 Editor→runManualTool→活句柄→hostApply→applyPptxOpsOnHost→独立 pptx-manual-fill adapter。模型 registry 和通用 apply_ops 白名单未放宽。texture 只允许固定八ID+原PNG SHA-256匹配；current 只由宿主解析当前形状/背景已有image fill，客户端不传任意mediaPath。背景all按实际页集合一次atomic txn，单版本/单历史。仍保原纹理fetch之后的source/target/version/unmount守卫、句柄lifetime signal和宿主前后signal校验。

最终针对性验证：`pnpm --filter @mimir/office exec vitest run src/editors/PptxFillControls.test.tsx src/editors/PptxEditor.fill-host.test.tsx` 11/11；新真实Editor测试连接实际applyPptxOpsOnHost（仅文档鉴权查询mock为固定PPTX记录、无关模型service不可调用），逐个8形状纹理→current拉伸/平铺→background木纹all→current拉伸/all→单次撤销，核版本、native media字节、两次保存ZIP条目一致与未改theme/master/layout。另证实通用模型setImageFill仍被拒绝、伪造SHA/越界页/取消/额外mediaPath字段均拒绝。旧已替换纹理被引擎清理，最终仅保留当前形状羊皮纸及背景木纹两个原PNG部件。

Office/server tsc、目标Oxlint/Oxfmt、样式/diff通过；真实浏览器重新验收与Web/Server build由根会话接续。仅此手动填充链路已修，复杂原背景复制限制不扩、整体工具目标继续。
