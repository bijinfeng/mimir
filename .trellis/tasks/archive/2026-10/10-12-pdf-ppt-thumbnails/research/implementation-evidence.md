# 实现证据（2026-10-12）

- PDF：`packages/office/src/editors/PdfEditor.tsx` 的 `layout` 是页序真相，`goTo` 用文档 ID 关联当前页；`pdf-pages.ts` 的 `buildPdfBytes` 按来源分组 `copyPages`，同一来源页可在目标顺序中重复。`pdf-render.ts` 用模块级 `renderGeneration`，若直接同时绘制缩略图，后一次会使前一次判过期，必须先改为按画布隔离。
- PPTX：`packages/office/src/pptx.ts` 的 `PptxEditSession` 目前只有 `setText`、`save`、`commit`，`view()` 以缓存引用通知渲染。`pptx-save.ts` 仅对已脏幻灯片的 XML 做补丁；无改动条目保持原字节。`pptx-archive.ts` 的 `readPresentation()` 从 `ppt/presentation.xml` 的 `<p:sldIdLst>` 和 `ppt/_rels/presentation.xml.rels` 决定顺序。结构改动需同时更新这两处，以及新页的内容类型登记与 slide 部件。
- 现有 `title-layout.pptx` 和 `image-deck.pptx` 夹具分别含标题页、图片及 slideLayout 关系；保存测试已断言“只改文字时仅 slide XML 变化”。这些性质不能为支持新页操作而放宽。
- 参照 `.trellis/spec/project/design.md` §8.4.1，Office 工具区在画布上方，狭窄宽度下命令须可达；`.trellis/spec/office/engine/conventions.md` 禁止手改 vendor，并要求浏览器侧 OOXML 仍走有界解压。
