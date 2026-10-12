# DOCX 对话编辑实施追踪

更新于 2026-10-12。固定 GenOffice 版本和工具语义见 `docx-agent-inventory.md`。这里将**代码执行与测试**、**浏览器观察**、**真实供应商调用**分开记录；模型目录包含名称不算逐项验收。

证据简称：`O` = `packages/office/src/agent/docx-agent.test.ts`（真实 Office 句柄与 DOCX 保存重开）；`S` = `apps/server/src/test/docx-*.test.ts`（服务端集成或模拟供应商响应）；`C` = `packages/chat/src/ChatPanel.test.tsx` 与 `runtime/DocxInterruptBridge.test.ts`（HTTP/SSE、续轮与客户端执行）；`B` = 隔离本地浏览器会话。`O` 的读操作读取未保存画布，写操作除特别注明外均有执行及保存重开断言。真实聊天模型、Brave、图片生成和媒体服务尚无使用者测试凭据，不能记为已验收。

| 工具 | 已有执行与验证证据 | 尚待验收 |
|---|---|---|
| `get_document_context` | O：未保存画布、冻结选区 | 真实模型读取 |
| `read_blocks` | O：当前块 HTML | 真实模型读取 |
| `insert_content` | O：写入、回退、保存重开 | 浏览器模型轮 |
| `write_document` | O：草稿逐段显示、提交/丢弃、保存；S/C：分段 NDJSON 与中断 | 真实模型流 |
| `replace_blocks` | O：段落与匹配表格单元格格式继承、保存重开 | 大幅变形表格的格式映射 |
| `replace_selection` | O：冻结选区与写入 | 浏览器模型轮 |
| `apply_ops` | O：15 操作逐项执行、保存重开；无效批次原子拒绝 | 浏览器模型轮 |
| `read_revisions` | O：当前修订及筛选 | 浏览器模型轮 |
| `accept_changes` | O：修订筛选、接受、保存 | 浏览器模型轮 |
| `reject_changes` | O：AI 修订拒绝、保存 | 浏览器模型轮 |
| `read_comments` | O：读取当前批注 | 浏览器模型轮 |
| `reply_comment` | O：批注回复、保存重开 | 浏览器模型轮 |
| `resolve_comment` | O：批注解决、保存重开 | 浏览器模型轮 |
| `add_comment` | O：新增批注、重复保存重开 | 浏览器模型轮 |
| `delete_comment` | O：删除批注、保存重开 | 浏览器模型轮 |
| `insert_footnote` | O：正文引用与定义保存重开 | 浏览器模型轮 |
| `insert_endnote` | O：正文引用与定义保存重开 | 浏览器模型轮 |
| `delete_note` | O：删除引用与定义、保存重开 | 浏览器模型轮 |
| `edit_note` | O：修改注释、保存重开 | 浏览器模型轮 |
| `read_notes` | O：读取当前注释 | 浏览器模型轮 |
| `web_search` | S：Brave 请求与响应字段、错误分类（模拟 HTTP） | 真实 Brave 调用 |
| `image_search` | S：Brave 图片结果与限额错误（模拟 HTTP） | 真实 Brave 调用 |
| `analyze_media` | S：图片、视频帧、音频转录后分析，伪造类型拒绝；C：选文件桥 | 真实多模态模型调用与输入能力探测 |
| `insert_image` | O：图片媒体部件保存重开；S/C：受控下载、迟到结果拒绝 | 浏览器真实外链图片 |
| `generate_image` | O：生成结果字节插图保存；S：TanStack `generateImage()` 与记账（模拟适配器） | 真实图像模型调用 |
| `insert_chart` | O：原生图表保存重开 | 浏览器模型轮 |
| `edit_chart` | O：原生图表修改保存重开 | 浏览器模型轮 |
| `set_header_footer` | O：默认与首页页眉保存重开 | 浏览器模型轮 |
| `set_page_setup` | O：单节及多节设置、保存重开；B：真实夹具两节纸张分别为 794×1123px、1056×816px，双栏左右段落 x=362/687px | 真实模型调用；复杂表格跨分栏目测 |
| `insert_section_break` | O：连续分节、保存重开；B：真实多节夹具按节绘制纸张 | 真实模型调用 |
| `define_style` | O：样式部件保存重开 | 浏览器模型轮 |
| `list_styles` | O：读取当前样式 | 浏览器模型轮 |
| `set_watermark` | O：文字及图片水印保存重开；S/C：外链图片安全路径 | 浏览器模型轮 |
| `insert_text_box` | O：文本框保存重开 | 浏览器模型轮 |
| `insert_picture` | O：浮动图片保存重开；S/C：外链图片安全路径 | 浏览器模型轮 |
| `create_document` | S：DOCX/PDF/MD/HTML 创建、解析索引、重开、鉴权、失败清理；PDF 缺字明确拒绝 | 四格式浏览器导航和真实模型轮 |

## `apply_ops` 子操作

`O` 的 `it.each(operationCases)` 与 `DOCX_AGENT_OP_NAMES` 对齐：下面 15 项均逐项执行、保存并重新打开，确认目标 `document.xml` 发生预期变化；另有无效整批拒绝与正文不部分修改测试。

| 操作 | 证据 | 操作 | 证据 | 操作 | 证据 |
|---|---|---|---|---|---|
| `setFont` | O | `setMatchedFont` | O | `setParagraphFormat` | O |
| `setHeadingLevel` | O | `findReplace` | O | `deleteBlocks` | O |
| `moveBlocks` | O | `setList` | O | `clearList` | O |
| `setImageProperties` | O | `insertToc` | O | `setParagraphAttrs` | O |
| `setOutlineLevel` | O | `stepIndent` | O | `stepHangingIndent` | O |

`setList` 使用当前文档已有的编号定义。字体操作已验证冻结选区、range、节点类型、标题级别和文本筛选；其他非字体操作主要按块索引定位。

## 跨层与浏览器门槛

| 门槛 | 已有证据 | 待验证 |
|---|---|---|
| TanStack `outcome → resume → parentRunId` | S/C：HTTP/SSE 续轮、服务端中断只消费一次、格式错误结果不得记成功 | 真实模型工具轮、用量 |
| 同轮写工具只执行一次；停止和过期版本拒绝 | C/O：重复、异步图片、人工编辑、冻结选区、回退冲突测试 | 真实浏览器模型轮 |
| 附加结构保存 | O：修订、批注、注释、图片、图表、节、样式、水印、文本框、页眉页脚各有保存重开；B：多节纸张与双栏真实夹具显示正确 | 大型复杂文档的视觉和 OOXML 语义回归 |
| 原问答与手动保存 | B：无模型时单篇检索与引用；手动修改后 dirty、离开提示、保存刷新正文与原文件名 | 真实模型回答与工具状态 |
| 外部能力 | S：安全限制、模拟成功与错误；侧栏按配置显示“已开放” | 真实 Brave、图像与多模态服务；模型输入模态探测 |

本地浏览器使用隔离数据目录 `/tmp/mimir-docx-ui-verify-20261011`。截图 `/tmp/mimir-docx-ui-evidence.png` 显示 DOCX 侧栏、模型未就绪状态及当前文档检索结果；`/tmp/mimir-docx-multisection-page1.png`、`page2.png` 和 `/tmp/mimir-docx-two-columns.png` 记录纸张与双栏目测。截图不证明模型编辑已完成。

最终门槛：`pnpm check` 与 `pnpm build` 均通过（2026-10-12）；Office 447、Chat 49、Renderer 292、Server 主测试 267 项通过。`pnpm check` 的 4 条 `no-map-spread` 为性能提示，没有阻断检查。
