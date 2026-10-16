# PPTX 主题、段落范围与形状绘制整合复核

2026-10-17。Trellis checker 独立复核本批主题图库、原生段落范围和画布形状绘制。限本批代码与 shared → agent handle → host 的实际接缝，不代表 PPTX 或全部编辑器工具已完备。

## 依据

- GenOffice 固定 `480548fd55f1be3593ee0d8e316a734751d58309`，本地 `/tmp/mimir-genoffice-html-git`。主题依据 `apps/slides/src/renderer/themes.ts` 八套十二色及 Latin 字体、`components/Ribbon.tsx:2051–2079` 可见缩略、`style-actions.ts:288–310` 原生 applyTheme。`theme-apply.ts:47–72` 写 clrScheme 名称、保留 theme 根名称与 East Asian/cs 字体，Mimir metadata 须优先读 clrScheme 名称。
- GenOffice 形状绘制按屏幕 3px 点击阈值、渲染坐标默认 96×96（连接线96×0）、Shift 正方/45°、左/上拖动 flipH/V。Mimir 在缩放后转换到原生 EMU，不能用未缩放 client delta 直接保存。
- WeKnora v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24`，固定公开源码 `/tmp/mimir-pptx-weknora-definitions.go`。其 search_knowledge/read_document/list_documents、wiki/sandbox 工具不提供 Office 主题/段落原生保存/形状绘制合同，不作为 Office Ribbon 主参考。官方站点本会话既有 HEAD 访问10秒超时，未将其记作成功。具体工具栏研究沿本任务主题、形状、段落研究记录。

## 审查与局部修复

1. `PptxDeckControls.tsx` 主题主按钮同时显示组件 label 与子文案，造成重复。checker 将子节点改为 Palette 图标，保留单一“应用整份主题”；测试检查实际 textContent。
2. 同文件主题色板更新后，自定义色弹层仍显示旧 customValue。checker 同步当前槽位色值，并增加点色板再打开自定义输入的真实交互断言。
3. 同文件两个 antd Select 仅依赖 fieldset disabled；div 入口不会被原生 fieldset 禁用。checker 显式 disabled={busy}，pending 测试验证 `.ant-select-disabled`。checker 同样修复形状分类入口并新增 pending 测试；段落所有者已将本段全部 Select 显式 disabled={locked} 并补断言。
4. `PptxShapeInsertCanvas` 以 disabled 作为失效边界；Editor 原传 manualBusy 会在自己的提交启动时令 disabled=true，从而 abort 自己的请求。已报告 root，由 root 修正为排除本形状自身 busy，并增加真实 Editor 慢宿主回归。
5. 段落组件内按目标/版本/范围清草稿，但 Inspector 外层若也按版本重挂会重置当前 tab；root 已将段落面板外 key 按目标稳定。成功操作引发旧组件 cleanup.abort 后，不能再用旧 signal 阻止已接受操作的选区重绑；root 以接受结果、同目标及原版本+1为条件保留范围，并增加连续两次 Beta 段落操作的保存/撤销/重做回归。
6. Gallery Button 同时使用 type 和 variant 不符合本项目单一路径约定，形状所有者结束后由 checker 改为 color+variant，保留选中态与布局。

## 已核对的合同

- 主题点击只改草稿，固定 footer 明确提交；按全部十二色及两个字体识别当前/自定义，多个不同原件主题不误标统一主题；原件变化后 A→B→undo(A) 不复活草稿。
- 段落端点只收持久对象ID、唯一原生段落索引及 strict 格式。图片符号限 PNG/JPEG、512KiB、400万像素并严格解码；原生 XML、relationship ID、任意 DSL 不从客户端接收。只改符号字体时保留各段自己的字符；重复相同图片复用现有关系，不徒增媒体。
- 形状端点只收固定109个图库类型、受限整数 EMU、有效长宽和连接线 flip；普通形状不接受 flip 或退化尺寸。预览不写文件，pointerup 一次提交；缩放、逆向、水平/垂直线、Shift、第二指针、blur、Escape、源/版本失效均有专项。
- 两个动作经过既有鉴权文档格式、ZIP边界预检、版本与取消门控；私有服务原生保存后只给一个版本/历史入口。动作仅供手动工具，不注册模型目录，`apply_ops` 仍限50条。未修改 vendor。
- 原生保真测试逐个 ZIP entry 比较无关部件；段落测试保留原 run、field、未知 pPr/rPr/endParaRPr、tabLst/extLst，并经过两次保存。主题允许上游原生 applyTheme 必需的 theme/slide 部件修改，不声称只改 theme XML。

## 实跑门禁

- `PptxThemeControls.test.tsx` 修后 7/7。
- 第一批联合 Office 4文件30/30：ThemeControls、ShapeGallery、ShapeInsertCanvas、pptx-paragraph-range。
- Server 3文件18/18：manual-shape、manual-paragraph、pptx-agent-route，含strict输入拒绝/401及不直接写原件。
- Office、server、shared `typecheck` 本轮全部通过；`pnpm lint:styles` 通过。
- 三个主要控件 antd lint 均0问题。主题及形状第一轮目标 Oxlint/Oxfmt 通过。
- 冻结后 Office 段落UI、真实Editor选区/绘制、extended-tools、agent 共4文件43/43。Gallery补修后 Gallery16+真实Editor2再次合跑18/18；最终段落UI5+range3、server段落4均再次通过。去重统计11文件92项（Office74、server18），各轮均通过。
- 最后冻结后的 Office/server/shared 三包 tsc 全部通过；目标19个TS文件 Oxlint通过、24文件Oxfmt通过，最新变更6文件再次lint/format通过；三个控件Antd lint零问题，最新图库/段落再次通过。`git diff --check` 通过。没有将已知全仓技能lint阻断记为本批全仓通过。
- root 已同步 `shared/contract/document-agent.md` 的两个手动动作合同，以及 `office/frontend/editors/pitfalls.md` 的选区持久ID/接受成功后cleanup与形状自取消接缝。

## 验收边界

checker 未操控真实浏览器；宽屏/420px、键盘回焦、分层 Escape、下载及实际视觉效果由 root 统一验收。组件或原生保存测试不代替实机。用户已指定 Desktop 自验、先做代码与浏览器；测试账号未配置模型供应商，本批不声称真实模型工具已验。未提交或归档任务。
