# GenOffice 五格式 Agent 与手动编辑能力盘点

核对日期：2026-10-13。固定版本：[`genspark-ai/genoffice@480548fd55f1be3593ee0d8e316a734751d58309`](https://github.com/genspark-ai/genoffice/tree/480548fd55f1be3593ee0d8e316a734751d58309)，与 `packages/office/vendor/UPSTREAM.json` 相同。下列数量从该 commit 的源码目录逐项读取；工具数是顶层模型工具数，操作数是各工具可能调用的编辑 DSL，不等同于 Mimir 已支持数量。临时源码副本在 `/tmp/mimir-genoffice-pinned/`，不能作为持久依赖。

| 格式 | 上游 Agent 顶层工具 | 上游编辑操作 | 关键执行依赖和 Mimir 差距 |
| --- | --- | --- | --- |
| XLSX | 13 | `workbookOperationSchema` 55 种 | [`ai/tools.ts`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/sheets/src/renderer/ai/tools.ts) 的 `propose_operations` 通过 [`workbook-dsl.ts`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/packages/xlsx-gateway/src/domain/workbook-dsl.ts) 生成变更计划，再走手动编辑的应用路径。上游还有 Univer 网格、`apps/sheets/native/xlsx-engine/` Rust 侧车和公式重算。Mimir 当前只有单格文本覆盖，公式与样式会丢失。 |
| PPTX | 17 | `pptx-ops` 文档的 71 种操作，其中 61 种由 `apply_ops` 向模型开放（按 text/element/insert/table/slide/deck 分组） | [`slides-skill.ts`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/slides/src/renderer/ai/slides-skill.ts) 提供 `apply_ops`、脚本、图表、媒体及整套生成工具；[操作指南](https://github.com/genspark-ai/genoffice/tree/480548fd55f1be3593ee0d8e316a734751d58309/packages/pptx-ops/src/prompts/ops) 列出文字、元素变换、图形、表格、动画、母版相关操作。10 种标为 `not-ai-callable`，应经专用工具或手动入口处理。Mimir 当前仅用上游编辑映射的文字部分与自有幻灯片结构编辑。 |
| Markdown | 8 | [`editor/ops.ts`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/markdown/src/renderer/editor/ops.ts) 的 15 种操作 | [`ai/tools.ts`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/markdown/src/renderer/ai/tools.ts) 直接操作活的 Tiptap 编辑器，含 frontmatter、图片和长文写作。Mimir 的 `.md` 上传导入笔记；需明确既有笔记的保存/同步语义，而不是另造原件。 |
| HTML | 6 | [`document/ops.ts`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/html/src/renderer/document/ops.ts) 的 13 种操作 | [`ai/tools.ts`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/html/src/renderer/ai/tools.ts) 以源码行与元素 SID 读取/修改，批量操作对一个基线版本原子应用；另有页面规划与生成。Mimir 已 vendor 解析映射和补丁原语，但尚未暴露为 Agent 工具或完整手动元素操作。 |
| PDF | 45 | [`shared/op-docs.ts`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/shared/op-docs.ts) 的 26 种内部操作，其中 8 种由 `apply_ops` 向模型开放 | [`ai/tools.ts`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/ai/tools.ts) 覆盖内容文字、批注、图片、表单、页面与文档；其余内部操作由专用工具或手动入口处理。真实写入有 `apps/pdf/src/main/` 的 Electron 主进程服务、字体/图片处理、OCR 和 PDFium 路径。Mimir 当前仅页面结构编辑，D-057/D-063 明确排除了文字修改；该旧决定需在本任务中更新。 |

## 顶层工具目录

- XLSX：`get_workbook_context`, `read_range`, `aggregate_range`, `load_guide`, `read_formats`, `read_sheet_features`, `read_cells`, `find_cells`, `select_range`, `trace_precedents`, `trace_dependents`, `propose_operations`, `create_document`。
- PPTX：`read_slide`, `execute_slide_script`, `web_search`, `image_search`, `generate_image`, `analyze_media`, `insert_web_image`, `replace_image`, `ask_clarification`, `plan_deck`, `regenerate_slide`, `generate_deck`, `save_style_template`, `list_style_templates`, `edit_chart`, `apply_ops`, `load_guide`。
- Markdown：`get_document_context`, `read_blocks`, `apply_ops`, `write_document`, `image_search`, `insert_image`, `generate_image`, `read_frontmatter`。
- HTML：`get_outline`, `read_source`, `apply_ops`, `ask_clarification`, `plan_page`, `write_document`。
- PDF：`read_pages`, `search_text`, `goto_page`, `markup_text`, `read_annotations`, `add_note`, `reply_note`, `edit_note`, `delete_markup`, `delete_note`, `edit_text`, `edit_block`, `move_text_block`, `insert_text`, `add_form_mark`, `list_inserted_text`, `edit_inserted_text`, `move_inserted_text`, `delete_inserted_text`, `image_search`, `generate_image`, `list_page_images`, `insert_image`, `transform_image`, `rotate_image`, `replace_image`, `flip_image`, `set_image_opacity`, `crop_image`, `remove_image_background`, `delete_image`, `list_form_fields`, `apply_ops`, `insert_blank_page`, `set_page_size`, `crop_pages`, `extract_pages`, `split_pdf`, `split_pages`, `merge_pages`, `replace_pages`, `get_outline`, `set_watermark`, `set_header_footer`, `create_document`。

## 关键语义与验证门槛

- XLSX 的 `propose_operations` 不是简单逐格写入：上游先用 Zod 校验、生成计划、应用到与手动编辑相同的网格，再读回公式结果；部分批次失败可能已提交前半段，工具会报告 `MID-BATCH`。Mimir 不能把这样的失败说成“未改动”，也不能承诺整批原子性，除非执行层真的提供。
- PPTX 操作不仅是当前 Mimir 的整段字形；上游 `pptx-ops` 71 种包括多元素排列、形状/媒体/图表、表格、动画和 deck 级操作。视觉画布与 OOXML 保存都须逐类验证。
- 不能把上游内部操作全集注册给模型：PPTX `op-docs.ts` 过滤 `not-ai-callable` / `pending`；固定版本中 71 种里 61 种可调用。PDF 26 种内部操作里 8 种可走 `apply_ops`，其他通过专用工具或仅由手动编辑器使用。
- HTML 有现成的同一 `HtmlOp` 词汇可供 Agent 和手动 UI 共用，并且上游明确按一个基线版本编译补丁；这是可直接复用的语义，宿主仍须防止预览注入内容混进原件。
- PDF 上游文字与图像相关能力有主进程依赖；仅复制 45 个工具定义或 `pdf-lib` 页面操作不能实现对齐。扫描件 OCR、字体、批注和未知 PDF 结构须按真实输入分类验证。
- `create_document`、外部搜索/生成、媒体分析、用户确认、文件选择属于跨格式或宿主服务；复用 Mimir 已有通用服务能力，按格式参数与权限接入。上游本地路径和 Electron 对话框不可直接暴露给浏览器模型工具。

## 参考分工

知识库与 Agent 工具权限参考 WeKnora `v0.8.2`，证据和适用边界见 `reference-check.md`；页面布局/视觉风格参考 Obsidian；文件编辑语义以本页固定的 GenOffice 源码为主，并用 Office 网页版与 Google Docs 复核手动交互。
