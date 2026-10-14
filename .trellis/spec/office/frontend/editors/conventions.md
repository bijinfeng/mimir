# packages/office/src/editors —— 各格式的编辑器

`DocxEditor` / `XlsxEditor` / `PptxEditor` / `HtmlEditor` / `PdfEditor` /
`MarkdownEditor`（`src/editors/`）。markdown 的宿主方言（Tiptap 扩展配置）
在 `packages/renderer/src/editor`；外壳在 `../shell`。父层 `.trellis/spec/office/engine/index.md`
与[项目规则](../../../project/rules.md)仍然适用。

六格式工具栏通过可见分类和命令组呈现已有可执行操作；窄编辑列保留分类，命令区横向滚动，不按宽度阈值把整组移入总“更多”。用选中态、当前值、上下文工具和禁用原因表达操作条件；`footer` 用于实际输入或临时失败，不承载无选中时的教程。查找快捷键切到其输入框所在分类后再聚焦，避免分类切换导致承诺失效。保存与 Agent 始终调用同一编辑原语，工具栏重排不改原件语义。

DOCX 的首尾工作台留白应加在 `.mimir-docx-scroll > .editor-scroll` 上，并随滚动内容移动；不要用 `.page-wrap` 或 `.doc-page` 的内边距实现。前者会改变分页原点，后者会改变纸张几何。修改后要在长文档中分别滚到首页和末页，确认纸张外侧留白与页间灰带。

Markdown 正文的 `/` 菜单在 `markdown-slash.ts`。候选项先查活编辑器的
`editor.schema.nodes`，只显示宿主方言支持的节点；选中时先删 `/query`，再通过
`uiOp(editor, op)` 写入，和 Agent 的 `runOps` 共用验证与撤销语义。新增候选时须用
宿主实际方言测试「选择命令 → 节点变化 → `getMarkdown()` 读回」；没有节点或
渲染器的数学、Mermaid、WaveDrom 命令不能只加一条菜单项。

PDF 内容编辑的磁盘基线不是 `useSource.bytes`：后者始终是本次加载的原件，即使
`source.save()` 已成功写出新字节也不会替换。`PdfEditor` 须按文档与原件身份记录
最近一次成功保存的**实际字节**，在待保存插字重放后据此判断内容 dirty；页面结构
仍与 `PdfEdit.file` 比较。删除最后一段新插字若回到已保存字节，须保留该工作副本并
清除 dirty；若回到尚未保存过的加载原件，才能清空工作副本。保存期间继续编辑时，
完成写盘的旧字节仍要成为新基线，新插字只能以同一次保存生成的字节重放；异步
页面序列化期间若画布版本变化，旧保存须在写盘前拒绝。回归测试至少覆盖
「保存 → 插字 → 删除」、「页面改动保存中 → 插字 → 删除」及独立 PDF 字节读回。

---
