# 参考核对（2026-10-12）

## 适用的主参考

- 五格式文件编辑交互沿用项目已经选定的 Office 网页版、Google Docs 与 GenOffice；用户现要求 Agent 和手动编辑都向 GenOffice 对齐，现有 Mimir 能力只是差距盘点的起点。固定的 GenOffice 源码版本见 `packages/office/vendor/UPSTREAM.json`：`480548fd55f1be3593ee0d8e316a734751d58309`。该清单仅 vendor 了 DOCX、PPTX 和 HTML 的部分引擎闭包，跳过了上游 AI 包，故上游工具不能直接视为 Mimir 已接入的能力。
- 页面布局和风格继续按项目既定的 Obsidian 参考；本任务不重设计页面。

## WeKnora 核对

- 公开站点 `https://weknora.weixin.qq.com/` 于 2026-10-12 返回 HTTP 200。公开源码 `Tencent/WeKnora` 最新 release 是 `v0.8.2`（2026-09-24）；本次核对的固定版本为该 tag，而非随时变化的主分支。
- `v0.8.2/internal/agent/tools/definitions.go` 明确列出 `search_knowledge`、`read_document`、`list_documents` 等知识库 Agent 工具，以及 `wiki_write_page`、`wiki_replace_text` 等 Wiki 写工具；这说明它可参考 Agent 工具注册与按能力限制的方式。源码：<https://github.com/Tencent/WeKnora/blob/v0.8.2/internal/agent/tools/definitions.go>。
- 上述工具没有 XLSX/PPTX/HTML/PDF/Markdown 原件画布的编辑与保存合同，故不能作为五格式文件编辑工具和 Office 工具栏的主参考。Mimir 的格式工具必须以当前画布、编辑引擎及保存重开证据为准。

## Mimir 当前编辑边界

| 格式 | 已证实的写能力 | 关键风险 |
| --- | --- | --- |
| Markdown 笔记 | 富文本/Markdown 编辑与保存 | 上传 `.md` 先导入笔记，不走 Office 原件保存 |
| HTML | CodeMirror 源码修改与预览 | 源码整体写回，要保留编码和换行 envelope |
| XLSX | 单元格内容覆盖 | 覆盖公式格会清公式；被覆盖格的样式丢失；不重算公式 |
| PPTX | 文字、整段字形、幻灯片结构 | 多 run 格式与元素锚点必须保留 |
| PDF | 页面级结构，文字层只读 | 保存整体重建；未知 Catalog 结构要拒绝写回 |

证据：`packages/office/src/editors/{MarkdownEditor,HtmlEditor,XlsxEditor,PptxEditor,PdfEditor}.tsx`、`packages/office/src/{xlsx-edit,pptx}.ts`、`.trellis/spec/project/product.md` §5.10、`.trellis/spec/project/decisions.md` D-057/D-063/D-106。

上表是 **Mimir 当前状态**，不是本任务的目标或上限。与上游对齐所需的新增引擎和宿主适配见 `genoffice-five-format-inventory.md`。
