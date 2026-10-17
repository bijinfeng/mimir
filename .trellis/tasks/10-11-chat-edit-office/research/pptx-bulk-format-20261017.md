# PPTX 多选详细段落与轮廓（2026-10-17）

## 参考与边界

- 主参考固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`，本次以 `/tmp/mimir-genoffice-html-git` 的 `git rev-parse HEAD` 再核对。
- `apps/slides/src/renderer/style-actions.ts:190–232`：段落样式针对真实 `selectedIds`，调用 `setElementParagraphFormat`，第一对象的 `groupId` 传给宿主。Mimir 沿既有统一对象选择，分别携带每个对象真实 group；不同父组与顶层可混合选中，不假设一个共同 group。
- `components/RibbonHomeTab.tsx:1050–1135`：编号方案、起始编号、悬挂距离、符号大小和颜色；`1200–1275`：行距百分比、段前/后自由 pt 值。`components/FormatPane.tsx:724–774, 1136–1181, 2223`：复合线、dash、端点等轮廓细节。Mimir 使用既定 320px 侧 Inspector 的紧凑分组，不复制上游弹层外观。
- WeKnora 网站本次 `curl -I --max-time 10 https://weknora.weixin.qq.com/` 返回超时（exit 28，0 bytes），未冒报站点可访问。固定 v0.8.3 commit `3e22822c1d2397be730c458c7539d0eb8c113a24` 的公开 `internal/agent/tools/definitions.go` 本次获取成功（13533 bytes）；14–27、105–150 行仍是 knowledge retrieval / web search / wiki 读写工具。这些证据适用于知识库 Agent 的工具分工，不提供 Office 段落/轮廓参数或 Ribbon 的主要模型。

## 本片实际行为

沿 `PptxSelectionControls.applyOps` 公共 API，一次构建并显式提交不超过 50 个操作。常用 / 段落 / 列表 / 轮廓四页签共享一份草稿和固定底部动作；页签跨接受版本保留，源/页变化恢复常用，版本/选择变化丢弃格式草稿。对象列表、组合成员文字显式草稿、原别名身份和保存 caret 行为保持。

- 段落：对齐、左右方向、百分比行距、pt 段前/后、相对增加/减少一级。只提交显式修改的字段；原件固定行距或百分比间距直接显示其单位，未编辑时不转换。
- 列表：none / char / number；七个固定字符与字体预设、自定义字符/字体，九个固定编号方案、起始号、符号大小百分比、颜色、悬挂 pt。未知原件编号仅显示为不可写选项。原件图片符号显示且保留，可调整已有符号的细节；本片不新增批量图片替换输入。
- 轮廓：显示/隐藏、11 个 dash、端点、连接、复合线，沿原颜色/宽度字段。每个对象独立合并原 Stroke，保留其不同 dash/cap、箭头和可表示线性渐变/alpha。复杂填充沿既有明确拒绝，必须由用户显式选择纯色才替换。

### 实际执行接缝

`setParagraphFormat` 不属于浏览器 `PPTX_EXECUTABLE_OPS`，现有 `apply_ops` 自动走 `createPptxAgentHandle → hostedOps → applyPptxOpsOnHost → native runTxn`。固定 `text-ops.ts:301–380` 已对完整非图片 patch 实现验证、组成员解析与原生写入，无需放宽模型白名单或新增动作。

现有 `manual_paragraph` 是顶层单元素的 `paraIndices` 适配，不能拿它多次调用冒充原子批量。native `landBulletImage` 不能代替 manual 图片适配已有的 PNG/JPEG CRC/严格解码/尺寸/字节校验。因此图片批量替换留待后续独立 strict batch 合同，不直接向当前 apply_ops 追加未经解码的图片输入。

原生 whole-object 命令只有在明确 glyph 命令中应用 `bulletFont`。仅改字体时，本片分别读取各对象的统一字符，保留每个对象自己的 glyph；同一对象若含不同 glyph 或非字符段落，要求用户先明确选择 glyph，不能静默统一字符。固定 API 没有绝对左右段落 margin 或写固定 pt 行距，面板不承诺这些参数。

`pptx-outline.ts` 是从旧 `PptxOutlineControls.tsx` 原样提取的纯 helper，旧组件 import/reexport 保持 API。此提取消除 selection helper 对 TSX 的依赖，允许 server 真宿主测试直接静态导入，不改原有 outline UI 或生成语义。

## 验证

- Office 定向三文件 **21/21**：selection 纯适配、组件以及旧 OutlineControls 原生与组件回归。包含当前/混合/固定值、跨页签同一草稿、非法数值、失败保留/版本清理、原件图片符号保留、复合控件禁用、逐对象字体 glyph。
- 新 server 真宿主测试 **2/2**：真实 handle→真实 `applyPptxOpsOnHost`；顶层+直接组成员混选详细段落/轮廓、原始字体/兄弟成员/箭头/渐变/其余 ZIP entry 保留，保存两次、saved undo/redo 全 ZIP entries 比对；组成员字体/编号、native 无效批次原子失败。
- Office / Server `tsc --noEmit`、目标 Oxlint / Oxfmt、样式 backtick 检查通过。独立前轮测试数不累计。
- 本片自身不宣称浏览器宽屏/420px、真实模型或 Desktop 已验；主会话做浏览器与下载闭环。用户已选择代码与浏览器验收，模型未配置，Desktop 自行验收。
- `git diff --check` 本次被其他任务文档的两个尾空行阻断（PDF/PPTX 审计记录），本片没有改那些文件。整个任务仍进行中，无提交/暂存/归档。
